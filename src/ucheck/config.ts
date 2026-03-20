import path from "node:path";

import {
  buildAppStorageDirs,
  resolveDefaultAppDataDir
} from "../shared/storage-paths.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36";

export interface UcheckRuntimeConfig {
  appDataDir: string;
  sessionFile: string;
  mainHtmlFile: string;
  userAgent: string;
}

export interface UcheckRuntimeConfigOverrides {
  appDataDir?: string | undefined;
  sessionFile?: string | undefined;
  mainHtmlFile?: string | undefined;
  userAgent?: string | undefined;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveUcheckRuntimeConfig(
  overrides: UcheckRuntimeConfigOverrides = {}
): UcheckRuntimeConfig {
  const appDataDir = path.resolve(
    clean(overrides.appDataDir) ??
      clean(process.env.MJU_UCHECK_APP_DIR) ??
      resolveDefaultAppDataDir(clean(process.env.MJU_LMS_APP_DIR))
  );
  const storageDirs = buildAppStorageDirs(appDataDir);

  return {
    appDataDir,
    sessionFile: path.resolve(
      clean(overrides.sessionFile) ??
        clean(process.env.MJU_UCHECK_SESSION_FILE) ??
        path.join(storageDirs.stateDir, "ucheck-session.json")
    ),
    mainHtmlFile: path.resolve(
      clean(overrides.mainHtmlFile) ??
        clean(process.env.MJU_UCHECK_MAIN_HTML_FILE) ??
        path.join(storageDirs.snapshotDir, "ucheck-main.html")
    ),
    userAgent:
      clean(overrides.userAgent) ??
      clean(process.env.MJU_UCHECK_USER_AGENT) ??
      clean(process.env.MJU_LMS_USER_AGENT) ??
      DEFAULT_USER_AGENT
  };
}
