export interface StoredAuthProfile {
  userId: string;
  authMode: "windows-credential-manager";
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface ResolvedLmsCredentials {
  userId: string;
  password: string;
  source: "env" | "os-store";
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
  passwordStored: boolean;
  sessionFileExists: boolean;
  envUserIdSet: boolean;
  envPasswordSet: boolean;
  envCredentialsReady: boolean;
  envCredentialsPartial: boolean;
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
