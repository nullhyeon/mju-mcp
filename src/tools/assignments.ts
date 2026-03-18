import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import {
  getCourseAssignment,
  listCourseAssignments
} from "../lms/assignments.js";
import type {
  GetAssignmentOptions,
  ListAssignmentsOptions
} from "../lms/assignments.js";
import type {
  AssignmentDetailResult,
  AssignmentListResult
} from "../lms/types.js";
import type { AppContext } from "../mcp/app-context.js";
import { requireCredentials } from "./credentials.js";

const attachmentSchema = {
  name: z.string(),
  downloadUrl: z.string(),
  previewUrl: z.string().optional(),
  sizeLabel: z.string().optional(),
  fileType: z.string().optional()
};

const assignmentSummarySchema = {
  rtSeq: z.number().int(),
  title: z.string(),
  week: z.number().int().optional(),
  weekLabel: z.string().optional(),
  statusLabel: z.string().optional(),
  statusText: z.string().optional(),
  isSubmitted: z.boolean()
};

const assignmentSubmissionSchema = {
  status: z.string().optional(),
  submittedAt: z.string().optional(),
  text: z.string().optional(),
  contentSeq: z.string().optional(),
  attachments: z.array(z.object(attachmentSchema))
};

function formatAssignmentListText(result: AssignmentListResult): string {
  const courseLabel = result.courseTitle
    ? `${result.courseTitle} (${result.kjkey})`
    : result.kjkey;

  if (result.assignments.length === 0) {
    if (result.week !== undefined) {
      return `${courseLabel} 강의의 ${result.week}주차에는 조회 가능한 과제가 없습니다.`;
    }

    return `${courseLabel} 강의에는 조회 가능한 과제가 없습니다.`;
  }

  const lines = [`${courseLabel} 과제 ${result.assignments.length}건`];
  if (result.week !== undefined) {
    lines.push(`주차 필터: ${result.week}`);
  }

  for (const assignment of result.assignments) {
    const meta = [
      assignment.weekLabel,
      assignment.statusLabel && assignment.statusText
        ? `${assignment.statusLabel} ${assignment.statusText}`
        : assignment.statusText,
      assignment.isSubmitted ? "제출 흔적 있음" : undefined
    ].filter(Boolean);

    lines.push(`- [${assignment.rtSeq}] ${assignment.title}`);
    if (meta.length > 0) {
      lines.push(`  ${meta.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

function formatAssignmentDetailText(result: AssignmentDetailResult): string {
  const courseLabel = result.courseTitle
    ? `${result.courseTitle} (${result.kjkey})`
    : result.kjkey;
  const lines = [
    `[${result.rtSeq}] ${result.title}`,
    `강의: ${courseLabel}`
  ];

  if (result.submissionMethod) {
    lines.push(`제출방식: ${result.submissionMethod}`);
  }
  if (result.submissionFormat) {
    lines.push(`제출형태: ${result.submissionFormat}`);
  }
  if (result.openAt) {
    lines.push(`공개일: ${result.openAt}`);
  }
  if (result.dueAt) {
    lines.push(`마감일: ${result.dueAt}`);
  }
  if (result.points) {
    lines.push(`배점: ${result.points}`);
  }
  if (result.scoreVisibility) {
    lines.push(`점수공개: ${result.scoreVisibility}`);
  }

  lines.push(`과제 첨부: ${result.attachments.length}개`);
  for (const attachment of result.attachments) {
    const detail = [attachment.name];
    if (attachment.sizeLabel) {
      detail.push(attachment.sizeLabel);
    }
    lines.push(`- ${detail.join(" | ")}`);
  }

  if (result.submission) {
    lines.push("");
    lines.push("제출정보");
    if (result.submission.status) {
      lines.push(`상태: ${result.submission.status}`);
    }
    if (result.submission.submittedAt) {
      lines.push(`제출일: ${result.submission.submittedAt}`);
    }
    lines.push(`제출 첨부: ${result.submission.attachments.length}개`);
    if (result.submission.text) {
      lines.push(result.submission.text);
    }
  }

  if (result.bodyText) {
    lines.push("");
    lines.push(result.bodyText);
  }

  return lines.join("\n");
}

export function registerAssignmentTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_lms_list_assignments",
    {
      title: "과제 목록 조회",
      description:
        "특정 강의의 과제 목록을 조회합니다. 강의 식별자는 KJKEY를 사용합니다.",
      inputSchema: {
        kjkey: z.string().describe("조회할 강의의 KJKEY 입니다."),
        week: z.number().int().positive().optional().describe("특정 주차만 보고 싶을 때 사용하는 필터입니다.")
      },
      outputSchema: {
        kjkey: z.string(),
        courseTitle: z.string().optional(),
        week: z.number().int().optional(),
        assignments: z.array(z.object(assignmentSummarySchema))
      }
    },
    async ({ kjkey, week }, _extra) => {
      const { userId, password } = await requireCredentials(context);
      const client = context.createLmsClient();
      const options: ListAssignmentsOptions = {
        userId,
        password,
        kjkey,
        ...(week !== undefined ? { week } : {})
      };
      const result = await listCourseAssignments(client, options);

      return {
        content: [
          {
            type: "text",
            text: formatAssignmentListText(result)
          }
        ],
        structuredContent: result as AssignmentListResult & Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "mju_lms_get_assignment",
    {
      title: "과제 상세 조회",
      description:
        "특정 강의의 과제 상세 본문, 첨부, 제출 요약을 조회합니다. 강의 식별자는 KJKEY를 사용합니다.",
      inputSchema: {
        kjkey: z.string().describe("조회할 강의의 KJKEY 입니다."),
        rtSeq: z.number().int().describe("조회할 과제의 RT_SEQ 입니다.")
      },
      outputSchema: {
        kjkey: z.string(),
        courseTitle: z.string().optional(),
        rtSeq: z.number().int(),
        title: z.string(),
        submissionMethod: z.string().optional(),
        submissionFormat: z.string().optional(),
        openAt: z.string().optional(),
        dueAt: z.string().optional(),
        points: z.string().optional(),
        scoreVisibility: z.string().optional(),
        bodyHtml: z.string(),
        bodyText: z.string(),
        contentSeq: z.string().optional(),
        attachments: z.array(z.object(attachmentSchema)),
        submission: z.object(assignmentSubmissionSchema).optional()
      }
    },
    async ({ kjkey, rtSeq }, _extra) => {
      const { userId, password } = await requireCredentials(context);
      const client = context.createLmsClient();
      const options: GetAssignmentOptions = {
        userId,
        password,
        kjkey,
        rtSeq
      };
      const result = await getCourseAssignment(client, options);

      return {
        content: [
          {
            type: "text",
            text: formatAssignmentDetailText(result)
          }
        ],
        structuredContent: result as AssignmentDetailResult & Record<string, unknown>
      };
    }
  );
}
