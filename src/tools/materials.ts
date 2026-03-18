import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import {
  getCourseMaterial,
  listCourseMaterials
} from "../lms/materials.js";
import type {
  GetMaterialOptions,
  ListMaterialsOptions
} from "../lms/materials.js";
import type {
  MaterialDetailResult,
  MaterialListResult
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

const qnaTargetSchema = {
  menuId: z.string(),
  articleId: z.number().int(),
  subArticleId: z.string().optional()
};

const materialSummarySchema = {
  articleId: z.number().int(),
  title: z.string(),
  week: z.number().int().optional(),
  weekLabel: z.string().optional(),
  attachmentCount: z.number().int().optional()
};

function formatMaterialListText(result: MaterialListResult): string {
  const courseLabel = result.courseTitle
    ? `${result.courseTitle} (${result.kjkey})`
    : result.kjkey;

  if (result.materials.length === 0) {
    if (result.week !== undefined) {
      return `${courseLabel} 강의의 ${result.week}주차에는 조회 가능한 자료가 없습니다.`;
    }

    return `${courseLabel} 강의에는 조회 가능한 자료가 없습니다.`;
  }

  const lines = [`${courseLabel} 자료 ${result.materials.length}건`];
  if (result.week !== undefined) {
    lines.push(`주차 필터: ${result.week}`);
  }

  for (const material of result.materials) {
    const meta = [
      material.weekLabel,
      material.attachmentCount !== undefined
        ? `첨부 ${material.attachmentCount}개`
        : undefined
    ].filter(Boolean);

    lines.push(`- [${material.articleId}] ${material.title}`);
    if (meta.length > 0) {
      lines.push(`  ${meta.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

function formatMaterialDetailText(result: MaterialDetailResult): string {
  const courseLabel = result.courseTitle
    ? `${result.courseTitle} (${result.kjkey})`
    : result.kjkey;
  const lines = [
    `[${result.articleId}] ${result.title}`,
    `강의: ${courseLabel}`
  ];

  if (result.openAt) {
    lines.push(`공개일: ${result.openAt}`);
  }
  if (result.author) {
    lines.push(`작성자: ${result.author}`);
  }
  if (result.viewCount !== undefined) {
    lines.push(`조회수: ${result.viewCount}`);
  }

  lines.push(`첨부파일: ${result.attachments.length}개`);
  for (const attachment of result.attachments) {
    const detail = [attachment.name];
    if (attachment.sizeLabel) {
      detail.push(attachment.sizeLabel);
    }
    lines.push(`- ${detail.join(" | ")}`);
  }

  if (result.bodyText) {
    lines.push("");
    lines.push(result.bodyText);
  }

  return lines.join("\n");
}

export function registerMaterialTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_lms_list_materials",
    {
      title: "자료 목록 조회",
      description:
        "특정 강의의 자료 활동 목록을 조회합니다. 강의 식별자는 KJKEY를 사용합니다.",
      inputSchema: {
        kjkey: z.string().describe("조회할 강의의 KJKEY 입니다."),
        week: z.number().int().positive().optional().describe("특정 주차만 보고 싶을 때 사용하는 필터입니다.")
      },
      outputSchema: {
        kjkey: z.string(),
        courseTitle: z.string().optional(),
        week: z.number().int().optional(),
        materials: z.array(z.object(materialSummarySchema))
      }
    },
    async ({ kjkey, week }, _extra) => {
      const { userId, password } = await requireCredentials(context);
      const client = context.createLmsClient();
      const options: ListMaterialsOptions = {
        userId,
        password,
        kjkey,
        ...(week !== undefined ? { week } : {})
      };
      const result = await listCourseMaterials(client, options);

      return {
        content: [
          {
            type: "text",
            text: formatMaterialListText(result)
          }
        ],
        structuredContent: result as MaterialListResult & Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "mju_lms_get_material",
    {
      title: "자료 상세 조회",
      description:
        "특정 강의의 자료 활동 상세 본문과 첨부를 조회합니다. 강의 식별자는 KJKEY를 사용합니다.",
      inputSchema: {
        kjkey: z.string().describe("조회할 강의의 KJKEY 입니다."),
        articleId: z.number().int().describe("조회할 자료의 ARTL_NUM 입니다.")
      },
      outputSchema: {
        kjkey: z.string(),
        courseTitle: z.string().optional(),
        articleId: z.number().int(),
        title: z.string(),
        openAt: z.string().optional(),
        author: z.string().optional(),
        viewCount: z.number().int().optional(),
        bodyHtml: z.string(),
        bodyText: z.string(),
        contentSeq: z.string().optional(),
        attachments: z.array(z.object(attachmentSchema)),
        qnaTarget: z.object(qnaTargetSchema).optional()
      }
    },
    async ({ kjkey, articleId }, _extra) => {
      const { userId, password } = await requireCredentials(context);
      const client = context.createLmsClient();
      const options: GetMaterialOptions = {
        userId,
        password,
        kjkey,
        articleId
      };
      const result = await getCourseMaterial(client, options);

      return {
        content: [
          {
            type: "text",
            text: formatMaterialDetailText(result)
          }
        ],
        structuredContent: result as MaterialDetailResult & Record<string, unknown>
      };
    }
  );
}
