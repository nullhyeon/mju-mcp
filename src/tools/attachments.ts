import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import {
  downloadAssignmentAttachments,
  downloadAssignmentAttachment,
  downloadMaterialAttachments,
  downloadMaterialAttachment,
  downloadNoticeAttachments,
  downloadNoticeAttachment
} from "../lms/attachment-downloads.js";
import type { BulkDownloadedAttachmentResult } from "../lms/attachment-downloads.js";
import type { AppContext } from "../mcp/app-context.js";
import {
  courseReferenceInputSchemaShape,
  rememberCourseContext,
  resolveCourseReference
} from "./course-resolver.js";
import { requireCredentials } from "./credentials.js";

const downloadedFileSchema = {
  fileName: z.string(),
  savedPath: z.string(),
  finalUrl: z.string(),
  sourceUrl: z.string(),
  byteLength: z.number().int(),
  statusCode: z.number().int(),
  contentType: z.string().optional(),
  contentDisposition: z.string().optional()
};

const bulkDownloadedItemSchema = {
  articleId: z.number().int().optional(),
  rtSeq: z.number().int().optional(),
  title: z.string(),
  attachmentKind: z.enum(["prompt", "submission"]).optional(),
  attachmentCount: z.number().int(),
  downloadedCount: z.number().int(),
  savedDir: z.string(),
  files: z.array(z.object(downloadedFileSchema))
};

function formatDownloadText(result: {
  fileName: string;
  savedPath: string;
  byteLength: number;
  statusCode: number;
  contentType?: string;
}): string {
  const lines = [
    `다운로드 완료: ${result.fileName}`,
    `저장 경로: ${result.savedPath}`,
    `크기: ${result.byteLength} bytes`,
    `응답 코드: ${result.statusCode}`
  ];

  if (result.contentType) {
    lines.push(`형식: ${result.contentType}`);
  }

  return lines.join("\n");
}

function normalizeTargetIds(options: {
  singular: number | undefined;
  plural: number[] | undefined;
  label: string;
}): number[] {
  const raw = [
    ...(options.singular !== undefined ? [options.singular] : []),
    ...(options.plural ?? [])
  ];
  const seen = new Set<number>();
  const result: number[] = [];

  for (const value of raw) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${options.label} 값은 1 이상의 정수여야 합니다.`);
    }

    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

function resolveBulkDownloadTargets(params: {
  kind: "notice" | "material" | "assignment";
  articleId: number | undefined;
  articleIds: number[] | undefined;
  rtSeq: number | undefined;
  rtSeqs: number[] | undefined;
  attachmentKind: "prompt" | "submission" | undefined;
}): { articleIds?: number[]; rtSeqs?: number[] } {
  if (params.kind === "assignment") {
    if (params.articleId !== undefined || (params.articleIds?.length ?? 0) > 0) {
      throw new Error("과제 bulk 다운로드에는 articleId/articleIds 를 사용할 수 없습니다.");
    }

    const rtSeqs = normalizeTargetIds({
      singular: params.rtSeq,
      plural: params.rtSeqs,
      label: "rtSeq"
    });
    if (rtSeqs.length === 0) {
      throw new Error("과제 bulk 다운로드에는 rtSeq 또는 rtSeqs 가 필요합니다.");
    }

    return { rtSeqs };
  }

  if (params.attachmentKind) {
    throw new Error("attachmentKind 는 assignment bulk 다운로드에서만 사용할 수 있습니다.");
  }
  if (params.rtSeq !== undefined || (params.rtSeqs?.length ?? 0) > 0) {
    throw new Error("공지/자료 bulk 다운로드에는 rtSeq/rtSeqs 를 사용할 수 없습니다.");
  }

  const articleIds = normalizeTargetIds({
    singular: params.articleId,
    plural: params.articleIds,
    label: "articleId"
  });
  if (articleIds.length === 0) {
    throw new Error("공지/자료 bulk 다운로드에는 articleId 또는 articleIds 가 필요합니다.");
  }

  return { articleIds };
}

function formatBulkDownloadText(result: BulkDownloadedAttachmentResult): string {
  const lines = [
    `첨부 bulk 다운로드 완료`,
    `대상 종류: ${result.kind}`,
    `항목 수: ${result.itemCount}`,
    `다운로드 파일 수: ${result.fileCount}`
  ];

  if (result.attachmentKind) {
    lines.push(`과제 첨부 종류: ${result.attachmentKind}`);
  }
  if (result.warnings.length > 0) {
    lines.push(`경고 ${result.warnings.length}건`);
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  for (const item of result.items) {
    const itemId = item.articleId ?? item.rtSeq;
    const label = item.articleId !== undefined ? "articleId" : "rtSeq";
    lines.push(
      `- [${label} ${itemId ?? "?"}] ${item.title} | 첨부 ${item.attachmentCount}개 | 저장 ${item.downloadedCount}개`
    );
    lines.push(`  저장 경로: ${item.savedDir}`);
    for (const file of item.files) {
      lines.push(`  * ${file.fileName} (${file.byteLength} bytes)`);
    }
  }

  return lines.join("\n");
}

export function registerAttachmentTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_lms_download_attachment",
    {
      title: "첨부파일 로컬 다운로드",
      description:
        "공지, 자료, 과제 첨부파일을 로컬 디렉터리에 저장합니다. assignment는 prompt/submission 첨부를 모두 지원하며, course 또는 kjkey 를 생략하면 같은 세션의 마지막 강의를 사용합니다.",
      inputSchema: {
        kind: z
          .enum(["notice", "material", "assignment"])
          .describe("다운로드 대상 종류입니다."),
        ...courseReferenceInputSchemaShape,
        articleId: z
          .number()
          .int()
          .optional()
          .describe("공지/자료의 ARTL_NUM 입니다."),
        rtSeq: z
          .number()
          .int()
          .optional()
          .describe("과제의 RT_SEQ 입니다."),
        attachmentIndex: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe("0부터 시작하는 첨부 인덱스입니다. 기본값은 0입니다."),
        attachmentKind: z
          .enum(["prompt", "submission"])
          .optional()
          .describe("assignment일 때 첨부 종류입니다. 기본값은 prompt입니다."),
        outputDir: z
          .string()
          .optional()
          .describe("기본 다운로드 경로 대신 사용할 로컬 디렉터리입니다.")
      },
      outputSchema: {
        fileName: z.string(),
        savedPath: z.string(),
        finalUrl: z.string(),
        sourceUrl: z.string(),
        byteLength: z.number().int(),
        statusCode: z.number().int(),
        contentType: z.string().optional(),
        contentDisposition: z.string().optional()
      }
    },
    async ({
      kind,
      course,
      kjkey,
      articleId,
      rtSeq,
      attachmentIndex,
      attachmentKind,
      outputDir
    }, extra) => {
      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const resolvedCourse = await resolveCourseReference(
        context,
        extra,
        client,
        credentials,
        { course, kjkey }
      );

      let result;
      switch (kind) {
        case "notice":
          if (articleId === undefined) {
            throw new Error("공지 첨부 다운로드에는 articleId 가 필요합니다.");
          }
          result = await downloadNoticeAttachment(client, context.lmsConfig, {
            userId: credentials.userId,
            password: credentials.password,
            kjkey: resolvedCourse.kjkey,
            articleId,
            ...(attachmentIndex !== undefined ? { attachmentIndex } : {}),
            ...(outputDir ? { outputDir } : {})
          });
          break;
        case "material":
          if (articleId === undefined) {
            throw new Error("자료 첨부 다운로드에는 articleId 가 필요합니다.");
          }
          result = await downloadMaterialAttachment(client, context.lmsConfig, {
            userId: credentials.userId,
            password: credentials.password,
            kjkey: resolvedCourse.kjkey,
            articleId,
            ...(attachmentIndex !== undefined ? { attachmentIndex } : {}),
            ...(outputDir ? { outputDir } : {})
          });
          break;
        case "assignment":
          if (rtSeq === undefined) {
            throw new Error("과제 첨부 다운로드에는 rtSeq 가 필요합니다.");
          }
          result = await downloadAssignmentAttachment(client, context.lmsConfig, {
            userId: credentials.userId,
            password: credentials.password,
            kjkey: resolvedCourse.kjkey,
            rtSeq,
            ...(attachmentIndex !== undefined ? { attachmentIndex } : {}),
            ...(attachmentKind ? { attachmentKind } : {}),
            ...(outputDir ? { outputDir } : {})
          });
          break;
      }
      rememberCourseContext(context, extra, {
        kjkey: resolvedCourse.kjkey,
        courseTitle: resolvedCourse.courseTitle,
        courseCode: resolvedCourse.courseCode,
        year: resolvedCourse.year,
        term: resolvedCourse.term,
        termLabel: resolvedCourse.termLabel
      });

      return {
        content: [
          {
            type: "text",
            text: formatDownloadText(result)
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "mju_lms_download_attachments_bulk",
    {
      title: "첨부파일 일괄 다운로드",
      description:
        "공지, 자료, 과제의 첨부파일을 여러 항목 기준으로 한 번에 로컬 다운로드합니다. notice/material 는 articleId/articleIds, assignment 는 rtSeq/rtSeqs 를 사용합니다.",
      inputSchema: {
        kind: z
          .enum(["notice", "material", "assignment"])
          .describe("다운로드 대상 종류입니다."),
        ...courseReferenceInputSchemaShape,
        articleId: z
          .number()
          .int()
          .optional()
          .describe("공지/자료 단일 항목의 ARTL_NUM 입니다."),
        articleIds: z
          .array(z.number().int().positive())
          .optional()
          .describe("공지/자료 여러 항목의 ARTL_NUM 목록입니다."),
        rtSeq: z
          .number()
          .int()
          .optional()
          .describe("과제 단일 항목의 RT_SEQ 입니다."),
        rtSeqs: z
          .array(z.number().int().positive())
          .optional()
          .describe("과제 여러 항목의 RT_SEQ 목록입니다."),
        attachmentKind: z
          .enum(["prompt", "submission"])
          .optional()
          .describe("assignment일 때 첨부 종류입니다. 기본값은 prompt입니다."),
        outputDir: z
          .string()
          .optional()
          .describe("기본 다운로드 경로 대신 사용할 로컬 디렉터리입니다.")
      },
      outputSchema: {
        kind: z.enum(["notice", "material", "assignment"]),
        kjkey: z.string(),
        courseTitle: z.string().optional(),
        attachmentKind: z.enum(["prompt", "submission"]).optional(),
        itemCount: z.number().int(),
        fileCount: z.number().int(),
        warnings: z.array(z.string()),
        items: z.array(z.object(bulkDownloadedItemSchema))
      }
    },
    async (
      {
        kind,
        course,
        kjkey,
        articleId,
        articleIds,
        rtSeq,
        rtSeqs,
        attachmentKind,
        outputDir
      },
      extra
    ) => {
      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const resolvedCourse = await resolveCourseReference(
        context,
        extra,
        client,
        credentials,
        { course, kjkey }
      );
      const targets = resolveBulkDownloadTargets({
        kind,
        articleId,
        articleIds,
        rtSeq,
        rtSeqs,
        attachmentKind
      });

      let result: BulkDownloadedAttachmentResult;
      switch (kind) {
        case "notice":
          result = await downloadNoticeAttachments(client, context.lmsConfig, {
            userId: credentials.userId,
            password: credentials.password,
            kjkey: resolvedCourse.kjkey,
            articleIds: targets.articleIds ?? [],
            ...(outputDir ? { outputDir } : {})
          });
          break;
        case "material":
          result = await downloadMaterialAttachments(client, context.lmsConfig, {
            userId: credentials.userId,
            password: credentials.password,
            kjkey: resolvedCourse.kjkey,
            articleIds: targets.articleIds ?? [],
            ...(outputDir ? { outputDir } : {})
          });
          break;
        case "assignment":
          result = await downloadAssignmentAttachments(client, context.lmsConfig, {
            userId: credentials.userId,
            password: credentials.password,
            kjkey: resolvedCourse.kjkey,
            rtSeqs: targets.rtSeqs ?? [],
            ...(attachmentKind ? { attachmentKind } : {}),
            ...(outputDir ? { outputDir } : {})
          });
          break;
      }

      rememberCourseContext(context, extra, {
        kjkey: resolvedCourse.kjkey,
        courseTitle: resolvedCourse.courseTitle,
        courseCode: resolvedCourse.courseCode,
        year: resolvedCourse.year,
        term: resolvedCourse.term,
        termLabel: resolvedCourse.termLabel
      });

      return {
        content: [
          {
            type: "text",
            text: formatBulkDownloadText(result)
          }
        ],
        structuredContent: {
          ...result,
          ...(resolvedCourse.courseTitle ? { courseTitle: resolvedCourse.courseTitle } : {})
        } as Record<string, unknown>
      };
    }
  );
}
