import { randomUUID } from "node:crypto";

import { AuthManager } from "../auth/auth-manager.js";
import type { ResolvedLmsCredentials } from "../auth/types.js";
import {
  resolveLmsRuntimeConfig,
  type LmsRuntimeConfig
} from "../lms/config.js";
import { MjuLmsSsoClient } from "../lms/sso-client.js";
import { resolveMsiRuntimeConfig, type MsiRuntimeConfig } from "../msi/config.js";
import { MjuMsiClient } from "../msi/client.js";
import {
  resolveUcheckRuntimeConfig,
  type UcheckRuntimeConfig
} from "../ucheck/config.js";
import { MjuUcheckClient } from "../ucheck/client.js";

export interface LastCourseContext {
  kjkey: string;
  courseTitle?: string | undefined;
  courseCode?: string | undefined;
  year?: number | undefined;
  term?: number | undefined;
  termLabel?: string | undefined;
  updatedAt: string;
}

export interface PendingWriteApproval {
  token: string;
  action: string;
  fingerprint: string;
  expiresAt: string;
  createdAt: string;
}

interface SessionState {
  lastCourse?: LastCourseContext;
  pendingWriteApprovals: Map<string, PendingWriteApproval>;
}

export interface AppContext {
  lmsConfig: LmsRuntimeConfig;
  msiConfig: MsiRuntimeConfig;
  ucheckConfig: UcheckRuntimeConfig;
  authManager: AuthManager;
  createLmsClient(): MjuLmsSsoClient;
  createMsiClient(): MjuMsiClient;
  createUcheckClient(): MjuUcheckClient;
  getCredentials(): Promise<ResolvedLmsCredentials>;
  getLastCourseContext(sessionId?: string): LastCourseContext | undefined;
  setLastCourseContext(
    sessionId: string | undefined,
    course: Omit<LastCourseContext, "updatedAt">
  ): LastCourseContext;
  issueWriteApproval(
    sessionId: string | undefined,
    approval: {
      action: string;
      fingerprint: string;
      ttlMs?: number;
    }
  ): PendingWriteApproval;
  consumeWriteApproval(
    sessionId: string | undefined,
    token: string,
    expected: {
      action: string;
      fingerprint: string;
    }
  ): PendingWriteApproval;
}

export function createAppContext(
  lmsConfig: LmsRuntimeConfig = resolveLmsRuntimeConfig(),
  msiConfig: MsiRuntimeConfig = resolveMsiRuntimeConfig({
    appDataDir: lmsConfig.appDataDir,
    userAgent: lmsConfig.userAgent
  }),
  ucheckConfig: UcheckRuntimeConfig = resolveUcheckRuntimeConfig({
    appDataDir: lmsConfig.appDataDir,
    userAgent: lmsConfig.userAgent
  })
): AppContext {
  const authManager = new AuthManager(lmsConfig);
  const sessionStates = new Map<string, SessionState>();

  function getSessionKey(sessionId?: string): string {
    const trimmed = sessionId?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : "__default__";
  }

  function getSessionState(sessionId?: string): SessionState {
    const key = getSessionKey(sessionId);
    let state = sessionStates.get(key);
    if (!state) {
      state = {
        pendingWriteApprovals: new Map<string, PendingWriteApproval>()
      };
      sessionStates.set(key, state);
    }

    const now = Date.now();
    for (const [token, approval] of state.pendingWriteApprovals.entries()) {
      if (Date.parse(approval.expiresAt) <= now) {
        state.pendingWriteApprovals.delete(token);
      }
    }

    return state;
  }

  return {
    lmsConfig,
    msiConfig,
    ucheckConfig,
    authManager,
    createLmsClient() {
      return new MjuLmsSsoClient(lmsConfig);
    },
    createMsiClient() {
      return new MjuMsiClient(msiConfig);
    },
    createUcheckClient() {
      return new MjuUcheckClient(ucheckConfig);
    },
    getCredentials() {
      return authManager.resolveCredentials();
    },
    getLastCourseContext(sessionId) {
      return getSessionState(sessionId).lastCourse;
    },
    setLastCourseContext(sessionId, course) {
      const state = getSessionState(sessionId);
      const nextCourse: LastCourseContext = {
        ...course,
        updatedAt: new Date().toISOString()
      };
      state.lastCourse = nextCourse;
      return nextCourse;
    },
    issueWriteApproval(sessionId, approval) {
      const state = getSessionState(sessionId);
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(
        Date.now() + (approval.ttlMs ?? 5 * 60 * 1000)
      ).toISOString();
      const pendingApproval: PendingWriteApproval = {
        token: randomUUID(),
        action: approval.action,
        fingerprint: approval.fingerprint,
        createdAt,
        expiresAt
      };
      state.pendingWriteApprovals.set(
        pendingApproval.token,
        pendingApproval
      );
      return pendingApproval;
    },
    consumeWriteApproval(sessionId, token, expected) {
      const state = getSessionState(sessionId);
      const approval = state.pendingWriteApprovals.get(token);
      if (!approval) {
        throw new Error(
          "유효한 승인 토큰을 찾지 못했습니다. 다시 미리보기 호출부터 진행해주세요."
        );
      }

      state.pendingWriteApprovals.delete(token);

      if (Date.parse(approval.expiresAt) <= Date.now()) {
        throw new Error(
          "승인 토큰이 만료되었습니다. 다시 미리보기 호출부터 진행해주세요."
        );
      }

      if (approval.action !== expected.action) {
        throw new Error("승인 토큰의 작업 종류가 일치하지 않습니다.");
      }

      if (approval.fingerprint !== expected.fingerprint) {
        throw new Error(
          "승인 토큰 발급 후 입력이 변경되었습니다. 다시 미리보기 호출부터 진행해주세요."
        );
      }

      return approval;
    }
  };
}
