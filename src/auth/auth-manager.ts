import fs from "node:fs/promises";

import type { LmsRuntimeConfig } from "../lms/config.js";
import type { LoginSnapshotResult } from "../lms/types.js";
import { MjuLmsSsoClient } from "../lms/sso-client.js";
import { buildCredentialTarget, type PasswordVault } from "./password-vault.js";
import { AuthProfileStore } from "./profile-store.js";
import type {
  AuthStatus,
  ForgetResult,
  LoginStoreResult,
  LogoutResult,
  ResolvedLmsCredentials,
  StoredAuthProfile
} from "./types.js";
import { WindowsCredentialVault } from "./windows-credential-vault.js";

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export interface AuthManagerDependencies {
  passwordVault?: PasswordVault;
  clientFactory?: () => MjuLmsSsoClient;
}

export interface StoredLoginResult extends LoginStoreResult {
  snapshot: LoginSnapshotResult;
}

class UnsupportedPasswordVault implements PasswordVault {
  async savePassword(): Promise<void> {
    throw new Error(
      "저장 로그인은 현재 Windows Credential Manager 기반으로만 지원됩니다."
    );
  }

  async getPassword(): Promise<string | null> {
    throw new Error(
      "저장된 비밀번호 읽기는 현재 Windows Credential Manager 기반으로만 지원됩니다."
    );
  }

  async deletePassword(): Promise<boolean> {
    return false;
  }

  async hasPassword(): Promise<boolean> {
    return false;
  }
}

function createDefaultPasswordVault(): PasswordVault {
  if (process.platform === "win32") {
    return new WindowsCredentialVault();
  }

  return new UnsupportedPasswordVault();
}

export class AuthManager {
  private readonly profileStore: AuthProfileStore;

  private readonly passwordVault: PasswordVault;

  private readonly clientFactory: () => MjuLmsSsoClient;

  constructor(
    private readonly config: LmsRuntimeConfig,
    dependencies: AuthManagerDependencies = {}
  ) {
    this.profileStore = new AuthProfileStore(config.profileFile);
    this.passwordVault =
      dependencies.passwordVault ?? createDefaultPasswordVault();
    this.clientFactory =
      dependencies.clientFactory ?? (() => new MjuLmsSsoClient(config));
  }

  async resolveCredentials(): Promise<ResolvedLmsCredentials> {
    const explicitUserId = clean(this.config.userId);
    const explicitPassword = clean(this.config.password);
    const hasExplicitUserId = Boolean(explicitUserId);
    const hasExplicitPassword = Boolean(explicitPassword);

    if (hasExplicitUserId || hasExplicitPassword) {
      if (!explicitUserId || !explicitPassword) {
        throw new Error(
          "환경 변수 인증정보는 MJU_LMS_USER_ID 와 MJU_LMS_PASSWORD 를 함께 설정해야 합니다."
        );
      }

      return {
        userId: explicitUserId,
        password: explicitPassword,
        source: "env"
      };
    }

    const profile = await this.profileStore.load();
    if (!profile) {
      throw new Error(
        "저장된 로그인 정보가 없습니다. `npm run auth:login -- --id YOUR_ID --password YOUR_PASSWORD` 로 먼저 로그인해주세요."
      );
    }

    const password = await this.passwordVault.getPassword(
      this.getCredentialTarget(profile.userId)
    );
    if (password === null) {
      throw new Error(
        "저장된 비밀번호를 읽지 못했습니다. `npm run auth:login -- --id YOUR_ID --password YOUR_PASSWORD` 로 다시 로그인해주세요."
      );
    }

    return {
      userId: profile.userId,
      password,
      source: "os-store"
    };
  }

  async loginAndStore(userId: string, password: string): Promise<StoredLoginResult> {
    const normalizedUserId = clean(userId);
    const normalizedPassword = clean(password);

    if (!normalizedUserId || !normalizedPassword) {
      throw new Error("아이디와 비밀번호를 모두 제공해야 합니다.");
    }

    const existingProfile = await this.profileStore.load();
    const snapshot = await this.clientFactory().authenticateAndSnapshot(
      normalizedUserId,
      normalizedPassword,
      { preferSavedSession: false }
    );

    if (!snapshot.loggedIn) {
      throw new Error("SSO 로그인에 실패했습니다. 아이디/비밀번호를 다시 확인해주세요.");
    }

    if (existingProfile && existingProfile.userId !== normalizedUserId) {
      await this.passwordVault.deletePassword(
        this.getCredentialTarget(existingProfile.userId)
      );
    }

    await this.passwordVault.savePassword(
      this.getCredentialTarget(normalizedUserId),
      normalizedUserId,
      normalizedPassword
    );

    const now = new Date().toISOString();
    const profile: StoredAuthProfile = {
      userId: normalizedUserId,
      authMode: "windows-credential-manager",
      createdAt:
        existingProfile?.userId === normalizedUserId
          ? existingProfile.createdAt
          : now,
      updatedAt: now,
      lastLoginAt: now
    };

    await this.profileStore.save(profile);

    return {
      snapshot,
      profile,
      profileFile: this.config.profileFile,
      credentialTarget: this.getCredentialTarget(normalizedUserId),
      sessionFile: this.config.sessionFile
    };
  }

  async status(): Promise<AuthStatus> {
    const profile = await this.profileStore.load();
    const sessionFileExists = await fileExists(this.config.sessionFile);
    const envUserId = clean(this.config.userId);
    const envPassword = clean(this.config.password);

    const credentialTarget = profile
      ? this.getCredentialTarget(profile.userId)
      : undefined;

    return {
      appDataDir: this.config.appDataDir,
      profileFile: this.config.profileFile,
      sessionFile: this.config.sessionFile,
      credentialServiceName: this.config.credentialServiceName,
      ...(credentialTarget ? { credentialTarget } : {}),
      profileExists: profile !== null,
      ...(profile ? { storedUserId: profile.userId } : {}),
      passwordStored:
        credentialTarget !== undefined
          ? await this.passwordVault.hasPassword(credentialTarget)
          : false,
      sessionFileExists,
      envUserIdSet: Boolean(envUserId),
      envPasswordSet: Boolean(envPassword),
      envCredentialsReady: Boolean(envUserId && envPassword),
      envCredentialsPartial: Boolean(envUserId) !== Boolean(envPassword)
    };
  }

  async logout(): Promise<LogoutResult> {
    const deletedSession = await this.clientFactory().clearSavedSession();

    return {
      sessionFile: this.config.sessionFile,
      deletedSession
    };
  }

  async forget(): Promise<ForgetResult> {
    const profile = await this.profileStore.load();
    const logoutResult = await this.logout();
    const deletedProfile = await this.profileStore.clear();
    const deletedPassword = profile
      ? await this.passwordVault.deletePassword(
          this.getCredentialTarget(profile.userId)
        )
      : false;

    return {
      ...logoutResult,
      profileFile: this.config.profileFile,
      deletedProfile,
      deletedPassword,
      ...(profile ? { forgottenUserId: profile.userId } : {})
    };
  }

  getCredentialTarget(userId: string): string {
    return buildCredentialTarget(this.config.credentialServiceName, userId);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}
