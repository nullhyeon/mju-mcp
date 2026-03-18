import os from "node:os";
import path from "node:path";

export interface AppStoragePaths {
  rootDir: string;
  stateDir: string;
  snapshotDir: string;
  profileFile: string;
  sessionFile: string;
  mainHtmlFile: string;
  coursesFile: string;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveDefaultAppDataDir(
  override: string | undefined = process.env.MJU_LMS_APP_DIR
): string {
  const explicit = clean(override);
  if (explicit) {
    return path.resolve(explicit);
  }

  if (process.platform === "win32") {
    const localAppData = clean(process.env.LOCALAPPDATA);
    if (localAppData) {
      return path.resolve(localAppData, "myongji-lms-mcp");
    }
  }

  return path.resolve(os.homedir(), ".myongji-lms-mcp");
}

export function buildAppStoragePaths(rootDir: string): AppStoragePaths {
  const resolvedRoot = path.resolve(rootDir);
  const stateDir = path.join(resolvedRoot, "state");
  const snapshotDir = path.join(resolvedRoot, "snapshots");

  return {
    rootDir: resolvedRoot,
    stateDir,
    snapshotDir,
    profileFile: path.join(stateDir, "profile.json"),
    sessionFile: path.join(stateDir, "session.json"),
    mainHtmlFile: path.join(snapshotDir, "main.html"),
    coursesFile: path.join(snapshotDir, "courses.json")
  };
}
