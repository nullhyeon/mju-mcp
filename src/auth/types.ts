export type StoredAuthMode =
  | "windows-credential-manager"
  | "macos-keychain";

export interface StoredAuthProfile {
  userId: string;
  authMode: StoredAuthMode;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface ResolvedLmsCredentials {
  userId: string;
  password: string;
  source: "os-store";
}

export interface LoginStoreResult {
  profile: StoredAuthProfile;
  profileFile: string;
  credentialTarget: string;
  sessionFile: string;
}

export interface AuthStatus {
  appDataDir: string;
  profileFile: string;
  sessionFile: string;
  credentialServiceName: string;
  credentialTarget?: string;
  profileExists: boolean;
  storedUserId?: string;
  authMode?: StoredAuthMode;
  passwordStored: boolean;
  sessionFileExists: boolean;
}

export interface LogoutResult {
  sessionFile: string;
  deletedSession: boolean;
}

export interface ForgetResult extends LogoutResult {
  profileFile: string;
  deletedProfile: boolean;
  deletedPassword: boolean;
  forgottenUserId?: string;
}
