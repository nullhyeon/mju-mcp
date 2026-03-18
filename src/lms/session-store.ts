import fs from "node:fs/promises";
import path from "node:path";

import { CookieJar } from "tough-cookie";

interface PersistedSessionPayload {
  savedAt: string;
  cookies: ReturnType<CookieJar["serializeSync"]>;
}

export class SessionStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<CookieJar | null> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const payload = JSON.parse(raw) as PersistedSessionPayload;
      if (!payload.cookies) {
        return null;
      }
      return CookieJar.deserializeSync(payload.cookies);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async save(cookieJar: CookieJar): Promise<void> {
    const payload: PersistedSessionPayload = {
      savedAt: new Date().toISOString(),
      cookies: cookieJar.serializeSync()
    };

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  async remove(): Promise<boolean> {
    try {
      await fs.rm(this.filePath);
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }

      throw error;
    }
  }
}
