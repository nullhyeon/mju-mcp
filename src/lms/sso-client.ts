import fs from "node:fs/promises";
import path from "node:path";

import { load } from "cheerio";
import got, { type Response } from "got";
import { CookieJar } from "tough-cookie";

import type { LmsRuntimeConfig } from "../config.js";
import { looksLoggedIn } from "./auth-heuristics.js";
import { MAIN_URL, SSO_BASE, SSO_ENTRY } from "./constants.js";
import { extractCourseCandidates } from "./course-links.js";
import { decodeHtml } from "./encoding.js";
import { SessionStore } from "./session-store.js";
import {
  encryptPasswordForSso,
  encryptSessionKeyForSso,
  genSsoKeyMaterial
} from "./sso-crypto.js";
import type {
  CourseCandidate,
  DecodedResponse,
  LoginSnapshotResult,
  SsoForm
} from "./types.js";

function toDecodedResponse(response: Response<Buffer>): DecodedResponse {
  return {
    statusCode: response.statusCode,
    url: response.url,
    text: decodeHtml(response.rawBody, response.headers),
    rawBody: response.rawBody,
    headers: response.headers
  };
}

export type FormPayloadValue = string | number | boolean;

export class MjuLmsSsoClient {
  private cookieJar = new CookieJar();

  private http;

  private readonly sessionStore: SessionStore;

  constructor(private readonly config: LmsRuntimeConfig) {
    this.sessionStore = new SessionStore(config.sessionFile);
    this.http = this.buildHttpClient();
  }

  private buildHttpClient() {
    return got.extend({
      cookieJar: this.cookieJar,
      followRedirect: true,
      throwHttpErrors: false,
      retry: { limit: 0 },
      headers: {
        "user-agent": this.config.userAgent
      },
      responseType: "buffer"
    });
  }

  private resetHttpState(): void {
    this.cookieJar = new CookieJar();
    this.http = this.buildHttpClient();
  }

  async restoreSavedSession(): Promise<boolean> {
    const restored = await this.sessionStore.load();
    if (!restored) {
      return false;
    }

    this.cookieJar = restored;
    this.http = this.buildHttpClient();
    return true;
  }

  async clearSavedSession(): Promise<boolean> {
    this.resetHttpState();
    return this.sessionStore.remove();
  }

  async getSsoForm(): Promise<SsoForm> {
    const response = await this.http.get(SSO_ENTRY);
    const decoded = toDecodedResponse(response);
    const $ = load(decoded.text);

    const action = $("#signin-form").attr("action")?.replace(/&amp;/g, "&");
    const cRt = $('input[name="c_r_t"]').attr("value");
    const publicKey = $("#public-key").attr("value");

    if (!action || !cRt || !publicKey) {
      throw new Error("Failed to extract SSO form fields.");
    }

    return {
      action,
      c_r_t: cRt,
      publicKey
    };
  }

  async loginSso(userId: string, password: string): Promise<DecodedResponse> {
    const form = await this.getSsoForm();
    const { keyStr, key, iv } = genSsoKeyMaterial();
    const encsymka = encryptSessionKeyForSso(
      `${keyStr},${Date.now()}`,
      form.publicKey
    );
    const pwEnc = encryptPasswordForSso(password.trim(), key, iv);

    const response = await this.http.post(new URL(form.action, SSO_BASE).toString(), {
      responseType: "buffer",
      form: {
        user_id: userId,
        pw: "",
        user_id_enc: "",
        pw_enc: pwEnc,
        encsymka,
        c_r_t: form.c_r_t
      }
    });

    return toDecodedResponse(response);
  }

  async getPage(url: string | URL): Promise<DecodedResponse> {
    const response = await this.http.get(url.toString(), {
      responseType: "buffer"
    });
    return toDecodedResponse(response);
  }

  async postForm(
    url: string | URL,
    form: Record<string, FormPayloadValue>
  ): Promise<DecodedResponse> {
    const response = await this.http.post(url.toString(), {
      responseType: "buffer",
      form
    });
    return toDecodedResponse(response);
  }

  async fetchMainPage(): Promise<DecodedResponse> {
    return this.getPage(MAIN_URL);
  }

  async saveMainHtml(html: string): Promise<void> {
    await fs.mkdir(path.dirname(this.config.mainHtmlFile), { recursive: true });
    await fs.writeFile(this.config.mainHtmlFile, html, "utf8");
  }

  async saveCourseCandidates(courses: CourseCandidate[]): Promise<void> {
    await fs.mkdir(path.dirname(this.config.coursesFile), { recursive: true });
    await fs.writeFile(
      this.config.coursesFile,
      JSON.stringify(courses, null, 2),
      "utf8"
    );
  }

  async ensureAuthenticated(
    userId: string,
    password: string,
    options: { preferSavedSession?: boolean } = {}
  ): Promise<{ mainResponse: DecodedResponse; usedSavedSession: boolean }> {
    if (options.preferSavedSession !== false && (await this.restoreSavedSession())) {
      const mainFromSavedSession = await this.fetchMainPage();
      if (looksLoggedIn(mainFromSavedSession)) {
        return {
          mainResponse: mainFromSavedSession,
          usedSavedSession: true
        };
      }

      await this.clearSavedSession();
    }

    await this.loginSso(userId, password);
    const mainResponse = await this.fetchMainPage();
    if (looksLoggedIn(mainResponse)) {
      await this.sessionStore.save(this.cookieJar);
    } else {
      await this.clearSavedSession();
    }

    return {
      mainResponse,
      usedSavedSession: false
    };
  }

  async authenticateAndSnapshot(
    userId: string,
    password: string,
    options: { preferSavedSession?: boolean } = {}
  ): Promise<LoginSnapshotResult> {
    const { mainResponse, usedSavedSession } = await this.ensureAuthenticated(
      userId,
      password,
      options
    );
    const loggedIn = looksLoggedIn(mainResponse);
    const courseCandidates = extractCourseCandidates(mainResponse.text);

    await this.saveMainHtml(mainResponse.text);
    await this.saveCourseCandidates(courseCandidates);

    if (loggedIn) {
      await this.sessionStore.save(this.cookieJar);
    } else {
      await this.clearSavedSession();
    }

    const serializedJar = this.cookieJar.serializeSync();

    return {
      loggedIn,
      usedSavedSession,
      mainFinalUrl: mainResponse.url,
      cookieCount: serializedJar?.cookies?.length ?? 0,
      courseCandidatesCount: courseCandidates.length,
      sessionPath: this.config.sessionFile,
      mainHtmlPath: this.config.mainHtmlFile,
      coursesPath: this.config.coursesFile
    };
  }
}
