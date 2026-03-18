import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { getCourseNotice, listCourseNotices } from "../lms/notices.js";
import type { GetNoticeOptions, ListNoticesOptions } from "../lms/notices.js";
import type {
  LmsAttachment,
  NoticeDetailResult,
  NoticeListResult
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

const noticeSummarySchema = {
  articleId: z.number().int(),
  title: z.string(),
  previewText: z.string(),
  postedAt: z.string().optional(),
  viewCount: z.number().int().optional(),
  isUnread: z.boolean(),
  isExpired: z.boolean()
};

function formatAttachments(attachments: LmsAttachment[]): string[] {
  if (attachments.length === 0) {
    return ["첨부파일: 없음"];
  }

  const lines = [`첨부파일 ${attachments.length}개`];
  for (const attachment of attachments) {
    const detail = [attachment.name];
    if (attachment.sizeLabel) {
      detail.push(attachment.sizeLabel);
    }
    if (attachment.fileType) {
      detail.push(attachment.fileType);
    }
    lines.push(`- ${detail.join(" | ")}`);
  }

  return lines;
}

function formatNoticeListText(result: NoticeListResult): string {
  const courseLabel = result.courseTitle
    ? `${result.courseTitle} (${result.kjkey})`
    : result.kjkey;

  if (result.total === 0) {
    return `${courseLabel} 강의에는 조회 조건에 맞는 공지가 없습니다.`;
  }

  const lines = [
    `${courseLabel} 공지 ${result.total}건`,
    `현재 페이지: ${result.page}/${result.totalPages || 1}`,
    `페이지 크기: ${result.pageSize}`
  ];

  if (result.search) {
    lines.push(`검색어: ${result.search}`);
  }

  for (const notice of result.notices) {
    const meta = [
      notice.postedAt ?? "게시일 미확인",
      notice.viewCount !== undefined ? `조회 ${notice.viewCount}` : undefined,
      notice.isUnread ? "안읽음" : undefined,
      notice.isExpired ? "만료" : undefined
    ].filter(Boolean);

    lines.push(`- [${notice.articleId}] ${notice.title}`);
    if (notice.previewText) {
      lines.push(`  ${notice.previewText}`);
    }
    if (meta.length > 0) {
      lines.push(`  ${meta.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

function formatNoticeDetailText(result: NoticeDetailResult): string {
  const courseLabel = result.courseTitle
    ? `${result.courseTitle} (${result.kjkey})`
    : result.kjkey;
  const lines = [
    `[${result.articleId}] ${result.title}`,
    `강의: ${courseLabel}`
  ];

  if (result.author) {
    lines.push(`작성자: ${result.author}`);
  }
  if (result.postedAt) {
    lines.push(`게시일: ${result.postedAt}`);
  }
  if (result.expireAt) {
    lines.push(`만료일: ${result.expireAt}`);
  }
  if (result.viewCount !== undefined) {
    lines.push(`조회수: ${result.viewCount}`);
  }

  lines.push(...formatAttachments(result.attachments));

  if (result.bodyText) {
    lines.push("");
    lines.push(result.bodyText);
  }

  return lines.join("\n");
}

export function registerNoticeTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_lms_list_notices",
    {
      title: "공지 목록 조회",
      description:
        "특정 강의의 공지 목록을 페이지 단위로 조회합니다. 강의 식별자는 KJKEY를 사용합니다.",
      inputSchema: {
        kjkey: z.string().describe("조회할 강의의 KJKEY 입니다."),
        page: z.number().int().positive().optional().describe("조회할 페이지 번호입니다. 기본값은 1입니다."),
        pageSize: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("페이지당 가져올 공지 수입니다. 기본값은 8입니다."),
        search: z.string().optional().describe("공지 제목/본문 검색어입니다.")
      },
      outputSchema: {
        kjkey: z.string(),
        courseTitle: z.string().optional(),
        search: z.string(),
        page: z.number().int(),
        pageSize: z.number().int(),
        start: z.number().int(),
        total: z.number().int(),
        totalPages: z.number().int(),
        notices: z.array(z.object(noticeSummarySchema))
      }
    },
    async ({ kjkey, page, pageSize, search }, _extra) => {
      const { userId, password } = await requireCredentials(context);
      const client = context.createLmsClient();
      const options: ListNoticesOptions = {
        userId,
        password,
        kjkey,
        ...(page !== undefined ? { page } : {}),
        ...(pageSize !== undefined ? { pageSize } : {}),
        ...(search !== undefined ? { search } : {})
      };
      const result = await listCourseNotices(client, options);

      return {
        content: [
          {
            type: "text",
            text: formatNoticeListText(result)
          }
        ],
        structuredContent: result as NoticeListResult & Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "mju_lms_get_notice",
    {
      title: "공지 상세 조회",
      description:
        "특정 강의의 공지 상세 본문과 첨부파일 목록을 조회합니다. 강의 식별자는 KJKEY를 사용합니다.",
      inputSchema: {
        kjkey: z.string().describe("조회할 강의의 KJKEY 입니다."),
        articleId: z.number().int().describe("조회할 공지의 ARTL_NUM 입니다.")
      },
      outputSchema: {
        kjkey: z.string(),
        courseTitle: z.string().optional(),
        articleId: z.number().int(),
        title: z.string(),
        author: z.string().optional(),
        postedAt: z.string().optional(),
        expireAt: z.string().optional(),
        viewCount: z.number().int().optional(),
        bodyHtml: z.string(),
        bodyText: z.string(),
        contentSeq: z.string().optional(),
        attachments: z.array(z.object(attachmentSchema))
      }
    },
    async ({ kjkey, articleId }, _extra) => {
      const { userId, password } = await requireCredentials(context);
      const client = context.createLmsClient();
      const options: GetNoticeOptions = {
        userId,
        password,
        kjkey,
        articleId
      };
      const result = await getCourseNotice(client, options);

      return {
        content: [
          {
            type: "text",
            text: formatNoticeDetailText(result)
          }
        ],
        structuredContent: result as NoticeDetailResult & Record<string, unknown>
      };
    }
  );
}
