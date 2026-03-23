import { parseArgs } from "node:util";

import { resolveLmsRuntimeConfig } from "../lms/config.js";
import { MjuLmsSsoClient } from "../lms/sso-client.js";

const USAGE = [
  "Usage:",
  "  npm run login:sso -- --id YOUR_ID --password YOUR_PASSWORD",
  "  npm run login:sso -- --fresh-login --id YOUR_ID --password YOUR_PASSWORD",
  "",
  "Flags:",
  "  --id              LMS user id",
  "  --password        LMS password",
  "  --save-session    Override session json output path",
  "  --save-main-html  Override main html snapshot path",
  "  --save-courses    Override course candidate json path",
  "  --fresh-login     Skip saved session reuse and force a new SSO login",
  "  --help            Show this message"
].join("\n");

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "fresh-login": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      id: { type: "string" },
      password: { type: "string" },
      "save-session": { type: "string" },
      "save-main-html": { type: "string" },
      "save-courses": { type: "string" }
    }
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const config = resolveLmsRuntimeConfig({
    userId: values.id,
    password: values.password,
    sessionFile: values["save-session"],
    mainHtmlFile: values["save-main-html"],
    coursesFile: values["save-courses"]
  });

  if (!config.userId || !config.password) {
    throw new Error(
      "Missing LMS credentials. Provide --id/--password.\n\n" +
        USAGE
    );
  }

  const client = new MjuLmsSsoClient(config);
  const result = await client.authenticateAndSnapshot(config.userId, config.password, {
    preferSavedSession: !values["fresh-login"]
  });

  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.loggedIn ? 0 : 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
