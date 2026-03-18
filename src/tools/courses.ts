import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { listRegularTakenCourses } from "../lms/courses.js";
import type { AppContext } from "../mcp/app-context.js";
import type { ListCoursesOptions } from "../lms/courses.js";
import type { CourseListResult } from "../lms/types.js";

const courseTermSchema = {
  order: z.number(),
  year: z.number(),
  term: z.number(),
  key: z.string(),
  sourceLabel: z.string().optional()
};

const courseSchema = {
  kjkey: z.string(),
  title: z.string(),
  courseCode: z.string(),
  professor: z.string(),
  year: z.number(),
  term: z.number(),
  termLabel: z.string(),
  classroomLabel: z.string(),
  enterPath: z.string(),
  coverImageUrl: z.string().optional()
};

function formatCourseListText(
  result: Awaited<ReturnType<typeof listRegularTakenCourses>>
): string {
  if (result.selectedTerms.length === 0) {
    return "조건에 맞는 학기를 찾지 못했습니다.";
  }

  if (result.courses.length === 0) {
    return "조건에 맞는 수강과목이 없습니다.";
  }

  const lines = [
    `총 ${result.courses.length}개 수강과목`,
    `조회 학기: ${result.selectedTerms.map((term) => term.key).join(", ")}`
  ];

  for (const course of result.courses) {
    lines.push(
      `- ${course.termLabel} | ${course.title} | ${course.courseCode} | ${course.professor} | ${course.kjkey}`
    );
  }

  return lines.join("\n");
}

export function registerCourseTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_lms_list_courses",
    {
      title: "강의 목록 조회",
      description:
        "명지대 LMS의 정규 수강과목 목록을 조회합니다. 기본값은 최신 학기입니다.",
      inputSchema: {
        year: z.number().int().optional().describe("조회할 학년도입니다. 예: 2025"),
        term: z.number().int().optional().describe("조회할 학기 코드입니다. 예: 1 또는 3"),
        search: z.string().optional().describe("과목명, 과목코드, 교수명 검색어입니다."),
        allTerms: z
          .boolean()
          .optional()
          .describe("true면 최신 학기만이 아니라 발견된 모든 학기를 조회합니다.")
      },
      outputSchema: {
        mode: z.literal("taken"),
        search: z.string(),
        requested: z.object({
          year: z.number().optional(),
          term: z.number().optional(),
          allTerms: z.boolean()
        }),
        availableTerms: z.array(z.object(courseTermSchema)),
        selectedTerms: z.array(z.object(courseTermSchema)),
        courses: z.array(z.object(courseSchema))
      }
    },
    async ({ year, term, search, allTerms }, _extra) => {
      const { userId, password } = context.lmsConfig;
      if (!userId || !password) {
        throw new Error(
          "LMS 계정 정보가 없습니다. tool 호출 전에 MJU_LMS_USER_ID 와 MJU_LMS_PASSWORD 를 설정해주세요."
        );
      }

      const client = context.createLmsClient();
      const options: ListCoursesOptions = {
        userId,
        password,
        ...(year !== undefined ? { year } : {}),
        ...(term !== undefined ? { term } : {}),
        ...(search !== undefined ? { search } : {}),
        ...(allTerms !== undefined ? { allTerms } : {})
      };
      const result = await listRegularTakenCourses(client, options);

      return {
        content: [
          {
            type: "text",
            text: formatCourseListText(result)
          }
        ],
        structuredContent: result as CourseListResult & Record<string, unknown>
      };
    }
  );
}
