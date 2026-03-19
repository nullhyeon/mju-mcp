import fs from "node:fs/promises";
import path from "node:path";

import { load } from "cheerio";
import got, { type Response } from "got";
import { CookieJar } from "tough-cookie";

import type { DecodedResponse, SsoForm } from "../lms/types.js";
import { decodeHtml } from "../lms/encoding.js";
import { SessionStore } from "../lms/session-store.js";
import {
  encryptPasswordForSso,
  encryptSessionKeyForSso,
  genSsoKeyMaterial
} from "../lms/sso-crypto.js";
import { looksLoggedIn } from "./auth-heuristics.js";
import { UCHECK_MAIN_URL } from "./constants.js";
import type { UcheckRuntimeConfig } from "./config.js";

interface RequestOptions {
  headers?: Record<string, string>;
  followRedirect?: boolean;
}

function toDecodedResponse(response: Response<Buffer>): DecodedResponse {
  return {
    statusCode: response.statusCode,
    url: response.url,
    text: decodeHtml(response.rawBody, response.headers),
    rawBody: response.rawBody,
    headers: response.headers
  };
}

export class MjuUcheckClient {
  private cookieJar = new CookieJar();

  private http;

  private readonly sessionStore: SessionStore;

  constructor(private readonly config: UcheckRuntimeConfig) {
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

  async getPage(
    url: string | URL,
    options: RequestOptions = {}
  ): Promise<DecodedResponse> {
    const response = await this.http.get(url.toString(), {
      responseType: "buffer",
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.followRedirect !== undefined
        ? { followRedirect: options.followRedirect }
        : {})
    });
    return toDecodedResponse(response);
  }

  async postForm(
    url: string | URL,
    form: Record<string, string>,
    options: RequestOptions = {}
  ): Promise<DecodedResponse> {
    const response = await this.http.post(url.toString(), {
      responseType: "buffer",
      form,
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.followRedirect !== undefined
        ? { followRedirect: options.followRedirect }
        : {})
    });
    return toDecodedResponse(response);
  }

  async postJson(
    url: string | URL,
    payload: unknown,
    options: RequestOptions = {}
  ): Promise<DecodedResponse> {
    const response = await this.http.post(url.toString(), {
      responseType: "buffer",
      json: payload,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(options.headers ?? {})
      },
      ...(options.followRedirect !== undefined
        ? { followRedirect: options.followRedirect }
        : {})
    });
    return toDecodedResponse(response);
  }

  async fetchMainPage(): Promise<DecodedResponse> {
    return this.getPage(UCHECK_MAIN_URL);
  }

  async saveMainHtml(html: string): Promise<void> {
    await fs.mkdir(path.dirname(this.config.mainHtmlFile), { recursive: true });
    await fs.writeFile(this.config.mainHtmlFile, html, "utf8");
  }

  private extractSsoForm(response: DecodedResponse): SsoForm {
    const $ = load(response.text);
    const action = $("#signin-form").attr("action")?.replace(/&amp;/g, "&");
    const cRt = $('input[name="c_r_t"]').attr("value");
    const publicKey = $("#public-key").attr("value");

    if (!action || !cRt || !publicKey) {
      throw new Error("UCheck SSO 로그인 폼을 파싱하지 못했습니다.");
    }

    return {
      action,
      c_r_t: cRt,
      publicKey
    };
  }

  async login(userId: string, password: string): Promise<DecodedResponse> {
    const entryResponse = await this.getPage(UCHECK_MAIN_URL, {
      followRedirect: true
    });
    const ssoForm = this.extractSsoForm(entryResponse);
    const { keyStr, key, iv } = genSsoKeyMaterial();
    const encsymka = encryptSessionKeyForSso(
      `${keyStr},${Date.now()}`,
      ssoForm.publicKey
    );
    const pwEnc = encryptPasswordForSso(password.trim(), key, iv);
    const loginUrl = new URL(ssoForm.action, entryResponse.url).toString();

    await this.postForm(
      loginUrl,
      {
        user_id: userId,
        pw: "",
        user_id_enc: "",
        pw_enc: pwEnc,
        encsymka,
        c_r_t: ssoForm.c_r_t
      },
      { followRedirect: true }
    );

    return this.fetchMainPage();
  }

  async ensureAuthenticated(
    userId: string,
    password: string,
    options: { preferSavedSession?: boolean } = {}
  ): Promise<{ mainResponse: DecodedResponse; usedSavedSession: boolean }> {
    if (
      options.preferSavedSession !== false &&
      (await this.restoreSavedSession())
    ) {
      const mainFromSavedSession = await this.fetchMainPage();
      if (looksLoggedIn(mainFromSavedSession)) {
        return {
          mainResponse: mainFromSavedSession,
          usedSavedSession: true
        };
      }

      await this.clearSavedSession();
    }

    const mainResponse = await this.login(userId, password);
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
}
