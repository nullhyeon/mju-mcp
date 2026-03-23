import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import type { AppContext } from "../mcp/app-context.js";

function formatAuthStatusText(result: {
  profileExists: boolean;
  storedUserId?: string;
  authMode?: string;
  passwordStored: boolean;
  sessionFileExists: boolean;
}): string {
  const lines = [
    `저장 로그인 정보: ${result.profileExists ? "있음" : "없음"}`,
    `저장 비밀번호: ${result.passwordStored ? "있음" : "없음"}`,
    `저장 세션: ${result.sessionFileExists ? "있음" : "없음"}`
  ];

  if (result.storedUserId) {
    lines.splice(1, 0, `저장된 아이디: ${result.storedUserId}`);
  }

  if (result.authMode) {
    lines.splice(2, 0, `저장 방식: ${result.authMode}`);
  }

  return lines.join("\n");
}

function formatAuthLoginText(result: {
  profile: { userId: string };
  snapshot: {
    loggedIn: boolean;
    usedSavedSession: boolean;
    mainFinalUrl: string;
    cookieCount: number;
  };
}): string {
  return [
    `저장 로그인 완료: ${result.profile.userId}`,
    `로그인 성공: ${result.snapshot.loggedIn ? "예" : "아니오"}`,
    `저장 세션 재사용: ${result.snapshot.usedSavedSession ? "예" : "아니오"}`,
    `최종 URL: ${result.snapshot.mainFinalUrl}`,
    `쿠키 수: ${result.snapshot.cookieCount}`
  ].join("\n");
}

function formatAuthMutationText(
  title: string,
  result: Record<string, unknown>
): string {
  return `${title}\n${JSON.stringify(result, null, 2)}`;
}

export function registerAuthTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_lms_login_sso",
    {
      title: "SSO 로그인 점검",
      description:
        "아이디와 비밀번호로 SSO 로그인을 직접 점검하고, 세션/메인 HTML/강의 후보 스냅샷을 남깁니다. 저장 로그인 생성과는 별개입니다.",
      inputSchema: {
        userId: z.string().describe("명지대 LMS 아이디입니다."),
        password: z.string().describe("명지대 LMS 비밀번호입니다."),
        freshLogin: z
          .boolean()
          .optional()
          .describe("true면 저장 세션 재사용을 건너뛰고 새 로그인만 시도합니다.")
      },
      outputSchema: {
        loggedIn: z.boolean(),
        usedSavedSession: z.boolean(),
        mainFinalUrl: z.string(),
        cookieCount: z.number().int(),
        courseCandidatesCount: z.number().int(),
        sessionPath: z.string(),
        mainHtmlPath: z.string(),
        coursesPath: z.string()
      }
    },
    async ({ userId, password, freshLogin }) => {
      const client = context.createLmsClient();
      const result = await client.authenticateAndSnapshot(userId, password, {
        preferSavedSession: freshLogin !== true
      });

      return {
        content: [
          {
            type: "text",
            text: [
              `SSO 로그인 성공: ${result.loggedIn ? "예" : "아니오"}`,
              `저장 세션 재사용: ${result.usedSavedSession ? "예" : "아니오"}`,
              `최종 URL: ${result.mainFinalUrl}`,
              `쿠키 수: ${result.cookieCount}`,
              `강의 후보 수: ${result.courseCandidatesCount}`
            ].join("\n")
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "mju_lms_auth_status",
    {
      title: "저장 로그인 상태 조회",
      description:
        "저장된 명지대 LMS 로그인 정보, 비밀번호 보관 여부, 세션 파일 존재 여부를 조회합니다.",
      inputSchema: {},
      outputSchema: {
        appDataDir: z.string(),
        profileFile: z.string(),
        sessionFile: z.string(),
        credentialServiceName: z.string(),
        credentialTarget: z.string().optional(),
        profileExists: z.boolean(),
        storedUserId: z.string().optional(),
        authMode: z
          .enum(["windows-credential-manager", "macos-keychain"])
          .optional(),
        passwordStored: z.boolean(),
        sessionFileExists: z.boolean()
      }
    },
    async () => {
      const result = await context.authManager.status();
      return {
        content: [
          {
            type: "text",
            text: formatAuthStatusText(result)
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "mju_lms_auth_login",
    {
      title: "저장 로그인 생성",
      description:
        "아이디와 비밀번호로 SSO 로그인 후, 아이디는 프로필에 저장하고 비밀번호는 현재 OS의 보안 저장소(Windows Credential Manager 또는 macOS Keychain)에 저장합니다.",
      inputSchema: {
        userId: z.string().describe("명지대 LMS 아이디입니다."),
        password: z.string().describe("명지대 LMS 비밀번호입니다.")
      },
      outputSchema: {
        snapshot: z.object({
          loggedIn: z.boolean(),
          usedSavedSession: z.boolean(),
          mainFinalUrl: z.string(),
          cookieCount: z.number().int(),
          courseCandidatesCount: z.number().int(),
          sessionPath: z.string(),
          mainHtmlPath: z.string(),
          coursesPath: z.string()
        }),
        profile: z.object({
          userId: z.string(),
          authMode: z.enum(["windows-credential-manager", "macos-keychain"]),
          createdAt: z.string(),
          updatedAt: z.string(),
          lastLoginAt: z.string()
        }),
        profileFile: z.string(),
        credentialTarget: z.string(),
        sessionFile: z.string()
      }
    },
    async ({ userId, password }) => {
      const result = await context.authManager.loginAndStore(userId, password);
      return {
        content: [
          {
            type: "text",
            text: formatAuthLoginText(result)
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "mju_lms_auth_logout",
    {
      title: "저장 세션 삭제",
      description:
        "저장된 LMS 세션 파일만 삭제합니다. 저장된 아이디/비밀번호는 유지됩니다.",
      inputSchema: {},
      outputSchema: {
        sessionFile: z.string(),
        deletedSession: z.boolean()
      }
    },
    async () => {
      const result = await context.authManager.logout();
      return {
        content: [
          {
            type: "text",
            text: formatAuthMutationText(
              "저장 세션 삭제 결과",
              result as unknown as Record<string, unknown>
            )
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "mju_lms_auth_forget",
    {
      title: "저장 로그인 전체 삭제",
      description:
        "저장된 프로필, 세션, 비밀번호를 모두 삭제합니다. 다음 사용 시 다시 로그인해야 합니다.",
      inputSchema: {},
      outputSchema: {
        sessionFile: z.string(),
        deletedSession: z.boolean(),
        profileFile: z.string(),
        deletedProfile: z.boolean(),
        deletedPassword: z.boolean(),
        forgottenUserId: z.string().optional()
      }
    },
    async () => {
      const result = await context.authManager.forget();
      return {
        content: [
          {
            type: "text",
            text: formatAuthMutationText(
              "저장 로그인 전체 삭제 결과",
              result as unknown as Record<string, unknown>
            )
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );
}
