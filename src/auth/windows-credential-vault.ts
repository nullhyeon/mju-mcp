import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { PasswordVault } from "./password-vault.js";

const execFileAsync = promisify(execFile);

const POWERSHELL_CREDENTIAL_HELPER = String.raw`
$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class CodexCredMan {
    public const int CRED_TYPE_GENERIC = 1;
    public const int CRED_PERSIST_LOCAL_MACHINE = 2;

    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite([In] ref CREDENTIAL userCredential, [In] UInt32 flags);

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredDelete(string target, int type, int flags);

    [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]
    public static extern void CredFree([In] IntPtr cred);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public UInt32 Flags;
        public UInt32 Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }
}
"@

$target = $env:CODEX_VAULT_TARGET
$action = $env:CODEX_VAULT_ACTION

if ([string]::IsNullOrWhiteSpace($target)) {
    throw "Missing CODEX_VAULT_TARGET."
}

switch ($action) {
    "get" {
        $credentialPtr = [IntPtr]::Zero
        if (-not [CodexCredMan]::CredRead($target, [CodexCredMan]::CRED_TYPE_GENERIC, 0, [ref]$credentialPtr)) {
            $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            if ($errorCode -eq 1168) {
                Write-Output '{"found":false}'
                exit 0
            }

            throw "CredRead failed with Win32 error $errorCode."
        }

        try {
            $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
                $credentialPtr,
                [type][CodexCredMan+CREDENTIAL]
            )
            $secret = ""
            if ($credential.CredentialBlob -ne [IntPtr]::Zero -and $credential.CredentialBlobSize -gt 0) {
                $secret = [Runtime.InteropServices.Marshal]::PtrToStringUni(
                    $credential.CredentialBlob,
                    [int]($credential.CredentialBlobSize / 2)
                )
            }

            @{
                found = $true
                userName = $credential.UserName
                secret = $secret
            } | ConvertTo-Json -Compress
        } finally {
            [CodexCredMan]::CredFree($credentialPtr)
        }
    }

    "save" {
        $userName = $env:CODEX_VAULT_USERNAME
        $secret = $env:CODEX_VAULT_SECRET

        if ([string]::IsNullOrWhiteSpace($userName)) {
            throw "Missing CODEX_VAULT_USERNAME."
        }

        if ($null -eq $secret) {
            throw "Missing CODEX_VAULT_SECRET."
        }

        $blob = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($secret)
        try {
            $credential = New-Object CodexCredMan+CREDENTIAL
            $credential.Type = [CodexCredMan]::CRED_TYPE_GENERIC
            $credential.TargetName = $target
            $credential.CredentialBlobSize = [Text.Encoding]::Unicode.GetByteCount($secret)
            $credential.CredentialBlob = $blob
            $credential.Persist = [CodexCredMan]::CRED_PERSIST_LOCAL_MACHINE
            $credential.UserName = $userName

            if (-not [CodexCredMan]::CredWrite([ref]$credential, 0)) {
                $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
                throw "CredWrite failed with Win32 error $errorCode."
            }
        } finally {
            if ($blob -ne [IntPtr]::Zero) {
                [Runtime.InteropServices.Marshal]::ZeroFreeCoTaskMemUnicode($blob)
            }
        }
    }

    "delete" {
        if (-not [CodexCredMan]::CredDelete($target, [CodexCredMan]::CRED_TYPE_GENERIC, 0)) {
            $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            if ($errorCode -eq 1168) {
                Write-Output '{"deleted":false}'
                exit 0
            }

            throw "CredDelete failed with Win32 error $errorCode."
        }

        Write-Output '{"deleted":true}'
    }

    default {
        throw "Unsupported CODEX_VAULT_ACTION: $action"
    }
}
`;

interface PowerShellCredentialReadResult {
  found?: boolean;
  userName?: string;
  secret?: string;
}

interface PowerShellCredentialDeleteResult {
  deleted?: boolean;
}

export class WindowsCredentialVault implements PasswordVault {
  readonly authMode = "windows-credential-manager" as const;

  constructor() {
    if (process.platform !== "win32") {
      throw new Error("Windows Credential Manager is only available on Windows.");
    }
  }

  async savePassword(
    targetName: string,
    userName: string,
    password: string
  ): Promise<void> {
    await this.runPowerShell({
      CODEX_VAULT_ACTION: "save",
      CODEX_VAULT_TARGET: targetName,
      CODEX_VAULT_USERNAME: userName,
      CODEX_VAULT_SECRET: password
    });
  }

  async getPassword(targetName: string): Promise<string | null> {
    const output = await this.runPowerShell({
      CODEX_VAULT_ACTION: "get",
      CODEX_VAULT_TARGET: targetName
    });

    const result = JSON.parse(output) as PowerShellCredentialReadResult;
    if (!result.found) {
      return null;
    }

    return result.secret ?? "";
  }

  async deletePassword(targetName: string): Promise<boolean> {
    const output = await this.runPowerShell({
      CODEX_VAULT_ACTION: "delete",
      CODEX_VAULT_TARGET: targetName
    });

    const result = JSON.parse(output) as PowerShellCredentialDeleteResult;
    return result.deleted ?? false;
  }

  async hasPassword(targetName: string): Promise<boolean> {
    return (await this.getPassword(targetName)) !== null;
  }

  private async runPowerShell(
    envOverrides: Record<string, string>
  ): Promise<string> {
    const { stdout, stderr } = await execFileAsync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        POWERSHELL_CREDENTIAL_HELPER
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          ...envOverrides
        },
        maxBuffer: 1024 * 1024
      }
    );

    const output = stdout.trim();
    if (!output && stderr.trim()) {
      throw new Error(stderr.trim());
    }

    return output;
  }
}
