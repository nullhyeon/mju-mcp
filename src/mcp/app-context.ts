import { AuthManager } from "../auth/auth-manager.js";
import type { ResolvedLmsCredentials } from "../auth/types.js";
import { resolveLmsRuntimeConfig, type LmsRuntimeConfig } from "../config.js";
import { MjuLmsSsoClient } from "../lms/sso-client.js";

export interface AppContext {
  lmsConfig: LmsRuntimeConfig;
  authManager: AuthManager;
  createLmsClient(): MjuLmsSsoClient;
  getCredentials(): Promise<ResolvedLmsCredentials>;
}

export function createAppContext(
  lmsConfig: LmsRuntimeConfig = resolveLmsRuntimeConfig()
): AppContext {
  const authManager = new AuthManager(lmsConfig);

  return {
    lmsConfig,
    authManager,
    createLmsClient() {
      return new MjuLmsSsoClient(lmsConfig);
    },
    getCredentials() {
      return authManager.resolveCredentials();
    }
  };
}
