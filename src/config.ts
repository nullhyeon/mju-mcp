import path from "node:path";

import {
  buildAppStoragePaths,
  resolveDefaultAppDataDir
} from "./auth/paths.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36";

export interface LmsRuntimeConfig {
  appDataDir: string;
  userId: string | undefined;
  password: string | undefined;
  profileFile: string;
  sessionFile: string;
  mainHtmlFile: string;
  coursesFile: string;
  credentialServiceName: string;
  userAgent: string;
}

export interface LmsRuntimeConfigOverrides {
  appDataDir?: string | undefined;
  userId?: string | undefined;
  password?: string | undefined;
  profileFile?: string | undefined;
  sessionFile?: string | undefined;
  mainHtmlFile?: string | undefined;
  coursesFile?: string | undefined;
  credentialServiceName?: string | undefined;
  userAgent?: string | undefined;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanPathValue(value: string | undefined): string | undefined {
  return clean(value);
}

export function resolveLmsRuntimeConfig(
  overrides: LmsRuntimeConfigOverrides = {}
): LmsRuntimeConfig {
  const appDataDir = path.resolve(
    cleanPathValue(overrides.appDataDir) ?? resolveDefaultAppDataDir()
  );
  const storagePaths = buildAppStoragePaths(appDataDir);

  return {
    appDataDir,
    userId: clean(overrides.userId ?? process.env.MJU_LMS_USER_ID),
    password: clean(overrides.password ?? process.env.MJU_LMS_PASSWORD),
    profileFile: path.resolve(
      cleanPathValue(overrides.profileFile) ??
        cleanPathValue(process.env.MJU_LMS_PROFILE_FILE) ??
        storagePaths.profileFile
    ),
    sessionFile: path.resolve(
      cleanPathValue(overrides.sessionFile) ??
        cleanPathValue(process.env.MJU_LMS_SESSION_FILE) ??
        storagePaths.sessionFile
    ),
    mainHtmlFile: path.resolve(
      cleanPathValue(overrides.mainHtmlFile) ??
        cleanPathValue(process.env.MJU_LMS_MAIN_HTML_FILE) ??
        storagePaths.mainHtmlFile
    ),
    coursesFile: path.resolve(
      cleanPathValue(overrides.coursesFile) ??
        cleanPathValue(process.env.MJU_LMS_COURSES_FILE) ??
        storagePaths.coursesFile
    ),
    credentialServiceName:
      clean(
        overrides.credentialServiceName ??
          process.env.MJU_LMS_CREDENTIAL_SERVICE_NAME
      ) ?? "myongji-lms-mcp",
    userAgent:
      clean(overrides.userAgent ?? process.env.MJU_LMS_USER_AGENT) ??
      DEFAULT_USER_AGENT
  };
}
