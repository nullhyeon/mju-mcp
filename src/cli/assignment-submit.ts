import fs from "node:fs/promises";
import { parseArgs } from "node:util";

import { resolveLmsRuntimeConfig } from "../lms/config.js";
import {
  checkAssignmentSubmission,
  deleteAssignment,
  submitAssignment
} from "../lms/assignment-submit.js";
import { createAppContext } from "../mcp/app-context.js";
import { requireCredentials } from "../tools/credentials.js";

const USAGE = [
  "Usage:",
  "  npm run assignment:submit:check -- --kjkey KJKEY --rt-seq 1234567",
  "  npm run assignment:submit:check -- --kjkey KJKEY --rt-seq 1234567 --text \"draft text\"",
  "  npm run assignment:submit:check -- --kjkey KJKEY --rt-seq 1234567 --text-file .\\draft.html --file .\\report.pdf",
  "  npm run assignment:submit -- --kjkey KJKEY --rt-seq 1234567 --text-file .\\draft.html --file .\\report.pdf --confirm",
  "  npm run assignment:delete -- --kjkey KJKEY --rt-seq 1234567 --confirm",
  "",
  "Shared flags:",
  "  --app-dir                 Override local app data directory",
  "  --service-name            Override Windows Credential Manager service name",
  "  --profile-file            Override profile json output path",
  "  --session-file            Override session json output path",
  "",
  "Check flags:",
  "  --kjkey                   KJKEY",
  "  --rt-seq                  RT_SEQ",
  "  --text                    Draft text/html to validate",
  "  --text-file               Local text/html file to validate",
  "  --file                    Local attachment path (repeatable)",
  "  --confirm                 Required for the actual submit/delete commands",
  "  --help                    Show this message"
].join("\n");

type CommandName = "check" | "submit" | "delete" | "help";

function parseCommandName(raw: string | undefined): CommandName {
  switch (raw) {
    case "check":
    case "submit":
    case "delete":
      return raw;
    default:
      return "help";
  }
}

function parsePositiveInt(value: string | undefined, label: string): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`${label} 는 0 이상의 정수여야 합니다.`);
  }

  return parsed;
}

async function resolveDraftText(
  inlineText: string | undefined,
  textFile: string | undefined
): Promise<string | undefined> {
  const text = inlineText?.trim();
  const filePath = textFile?.trim();

  if (text && filePath) {
    throw new Error("--text 와 --text-file 은 동시에 사용할 수 없습니다.");
  }

  if (filePath) {
    return fs.readFile(filePath, "utf8");
  }

  return text || undefined;
}

async function main(): Promise<void> {
  const [rawCommand, ...restArgs] = process.argv.slice(2);
  const command = parseCommandName(rawCommand);
  const { values } = parseArgs({
    args: restArgs,
    options: {
      "app-dir": { type: "string" },
      confirm: { type: "boolean", default: false },
      file: { type: "string", multiple: true },
      help: { type: "boolean", short: "h", default: false },
      kjkey: { type: "string" },
      "profile-file": { type: "string" },
      "rt-seq": { type: "string" },
      "service-name": { type: "string" },
      "session-file": { type: "string" },
      text: { type: "string" },
      "text-file": { type: "string" }
    }
  });

  if (values.help || command === "help") {
    console.log(USAGE);
    return;
  }

  const kjkey = values.kjkey?.trim();
  if (!kjkey) {
    throw new Error(`--kjkey 는 필수입니다.\n\n${USAGE}`);
  }

  const rtSeq = parsePositiveInt(values["rt-seq"], "rt-seq");
  const draftText = await resolveDraftText(values.text, values["text-file"]);
  const localFiles = (values.file ?? []).map((filePath) => filePath.trim()).filter(Boolean);

  const config = resolveLmsRuntimeConfig({
    appDataDir: values["app-dir"],
    credentialServiceName: values["service-name"],
    profileFile: values["profile-file"],
    sessionFile: values["session-file"]
  });
  const context = createAppContext(config);
  const credentials = await requireCredentials(context);
  const client = context.createLmsClient();

  switch (command) {
    case "check":
      console.log(
        JSON.stringify(
          await checkAssignmentSubmission(client, {
            userId: credentials.userId,
            password: credentials.password,
            kjkey,
            rtSeq,
            ...(draftText ? { text: draftText } : {}),
            ...(localFiles.length > 0 ? { localFiles } : {})
          }),
          null,
          2
        )
      );
      return;
    case "submit":
      console.log(
        JSON.stringify(
          await submitAssignment(client, {
            userId: credentials.userId,
            password: credentials.password,
            kjkey,
            rtSeq,
            confirm: values.confirm,
            ...(draftText ? { text: draftText } : {}),
            ...(localFiles.length > 0 ? { localFiles } : {})
          }),
          null,
          2
        )
      );
      return;
    case "delete":
      console.log(
        JSON.stringify(
          await deleteAssignment(client, {
            userId: credentials.userId,
            password: credentials.password,
            kjkey,
            rtSeq,
            confirm: values.confirm
          }),
          null,
          2
        )
      );
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
