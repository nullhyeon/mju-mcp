import os from "node:os";
import path from "node:path";

export interface AppStorageDirs {
  rootDir: string;
  stateDir: string;
  snapshotDir: string;
  downloadsDir: string;
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
      return path.resolve(localAppData, "mju-mcp");
    }
  }

  return path.resolve(os.homedir(), ".mju-mcp");
}

export function buildAppStorageDirs(rootDir: string): AppStorageDirs {
  const resolvedRoot = path.resolve(rootDir);

  return {
    rootDir: resolvedRoot,
    stateDir: path.join(resolvedRoot, "state"),
    snapshotDir: path.join(resolvedRoot, "snapshots"),
    downloadsDir: path.join(resolvedRoot, "downloads")
  };
}
