import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContext } from "../mcp/app-context.js";
import { registerAggregateTools } from "./aggregates.js";
import { registerAssignmentActionTools } from "./assignment-actions.js";
import { registerAssignmentTools } from "./assignments.js";
import { registerAttachmentTools } from "./attachments.js";
import { registerAuthTools } from "./auth.js";
import { registerCourseTools } from "./courses.js";
import { registerMaterialTools } from "./materials.js";
import { registerMsiTools } from "./msi.js";
import { registerNoticeTools } from "./notices.js";
import { registerOnlineTools } from "./online.js";
import { registerUcheckTools } from "./ucheck.js";

export function registerMjuLmsTools(
  server: McpServer,
  context: AppContext
): void {
  registerAggregateTools(server, context);
  registerAssignmentActionTools(server, context);
  registerAssignmentTools(server, context);
  registerAttachmentTools(server, context);
  registerAuthTools(server, context);
  registerCourseTools(server, context);
  registerMaterialTools(server, context);
  registerMsiTools(server, context);
  registerNoticeTools(server, context);
  registerOnlineTools(server, context);
  registerUcheckTools(server, context);
}
