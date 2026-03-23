import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { PasswordVault } from "./password-vault.js";

const execFileAsync = promisify(execFile);

function isKeychainItemNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("could not be found in the keychain") ||
    message.includes("item could not be found")
  );
}

export class MacOsKeychainVault implements PasswordVault {
  readonly authMode = "macos-keychain" as const;

  constructor() {
    if (process.platform !== "darwin") {
      throw new Error("macOS Keychain is only available on macOS.");
    }
  }

  async savePassword(
    targetName: string,
    userName: string,
    password: string
  ): Promise<void> {
    await execFileAsync(
      "security",
      [
        "add-generic-password",
        "-a",
        userName,
        "-s",
        targetName,
        "-w",
        password,
        "-U"
      ],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      }
    );
  }

  async getPassword(targetName: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        "security",
        ["find-generic-password", "-s", targetName, "-w"],
        {
          encoding: "utf8",
          maxBuffer: 1024 * 1024
        }
      );
      return stdout.trimEnd();
    } catch (error: unknown) {
      if (isKeychainItemNotFound(error)) {
        return null;
      }

      throw error;
    }
  }

  async deletePassword(targetName: string): Promise<boolean> {
    try {
      await execFileAsync(
        "security",
        ["delete-generic-password", "-s", targetName],
        {
          encoding: "utf8",
          maxBuffer: 1024 * 1024
        }
      );
      return true;
    } catch (error: unknown) {
      if (isKeychainItemNotFound(error)) {
        return false;
      }

      throw error;
    }
  }

  async hasPassword(targetName: string): Promise<boolean> {
    return (await this.getPassword(targetName)) !== null;
  }
}
