import { parseArgs } from "node:util";

import { AuthManager } from "../auth/auth-manager.js";
import { resolveLmsRuntimeConfig } from "../lms/config.js";

const USAGE = [
  "Usage:",
  "  npm run auth:login -- --id YOUR_ID --password YOUR_PASSWORD",
  "  npm run auth:status",
  "  npm run auth:logout",
  "  npm run auth:forget",
  "",
  "Shared flags:",
  "  --app-dir                 Override local app data directory",
  "  --service-name            Override Windows Credential Manager service name",
  "  --profile-file            Override profile json output path",
  "  --session-file            Override session json output path",
  "",
  "Login flags:",
  "  --id                      LMS user id",
  "  --password                LMS password"
].join("\n");

type CommandName = "login" | "status" | "logout" | "forget" | "help";

function parseCommandName(raw: string | undefined): CommandName {
  switch (raw) {
    case "login":
    case "status":
    case "logout":
    case "forget":
      return raw;
    default:
      return "help";
  }
}

async function main(): Promise<void> {
  const [rawCommand, ...restArgs] = process.argv.slice(2);
  const command = parseCommandName(rawCommand);
  const { values } = parseArgs({
    args: restArgs,
    options: {
      "app-dir": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
      id: { type: "string" },
      password: { type: "string" },
      "profile-file": { type: "string" },
      "service-name": { type: "string" },
      "session-file": { type: "string" }
    }
  });

  if (values.help || command === "help") {
    console.log(USAGE);
    return;
  }

  const config = resolveLmsRuntimeConfig({
    appDataDir: values["app-dir"],
    credentialServiceName: values["service-name"],
    profileFile: values["profile-file"],
    sessionFile: values["session-file"],
    userId: values.id,
    password: values.password
  });
  const authManager = new AuthManager(config);

  switch (command) {
    case "login":
      console.log(
        JSON.stringify(
          await authManager.loginAndStore(config.userId ?? "", config.password ?? ""),
          null,
          2
        )
      );
      return;
    case "status":
      console.log(JSON.stringify(await authManager.status(), null, 2));
      return;
    case "logout":
      console.log(JSON.stringify(await authManager.logout(), null, 2));
      return;
    case "forget":
      console.log(JSON.stringify(await authManager.forget(), null, 2));
      return;
    default:
      console.log(USAGE);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
