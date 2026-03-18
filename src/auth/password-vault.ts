export interface PasswordVault {
  savePassword(targetName: string, userName: string, password: string): Promise<void>;
  getPassword(targetName: string): Promise<string | null>;
  deletePassword(targetName: string): Promise<boolean>;
  hasPassword(targetName: string): Promise<boolean>;
}

export function buildCredentialTarget(
  serviceName: string,
  userId: string
): string {
  return `${serviceName}:${userId}`;
}
