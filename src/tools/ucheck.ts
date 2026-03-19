import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import type { AppContext } from "../mcp/app-context.js";
import { getUcheckCourseAttendance } from "../ucheck/services.js";
import { requireCredentials } from "./credentials.js";

const attendanceSummarySchema = {
  attendedCount: z.number().int(),
  tardyCount: z.number().int(),
  earlyLeaveCount: z.number().int(),
  absentCount: z.number().int()
};

const lectureSchema = {
  lectureNo: z.number().int(),
  lectureYear: z.number().int(),
  lectureTerm: z.number().int(),
  courseCode: z.string(),
  courseTitle: z.string(),
  classCode: z.string().optional(),
  professor: z.string().optional(),
  department: z.string().optional(),
  scheduleSummary: z.string().optional()
};

const attendanceSessionSchema = {
  week: z.number().int(),
  classNo: z.number().int(),
  sessionLabel: z.string(),
  date: z.string().optional(),
  dateLabel: z.string().optional(),
  timeRange: z.string().optional(),
  classroom: z.string().optional(),
  isPast: z.boolean(),
  statusCode: z.string().optional(),
  statusLabel: z.string().optional(),
  attendAt: z.string().optional(),
  leaveAt: z.string().optional()
};

function formatAttendanceText(
  result: Awaited<ReturnType<typeof getUcheckCourseAttendance>>
): string {
  const summary = [
    `출석 ${result.summary.attendedCount}`,
    `지각 ${result.summary.tardyCount}`,
    `조퇴 ${result.summary.earlyLeaveCount}`,
    `결석 ${result.summary.absentCount}`
  ].join(" | ");

  return [
    `${result.course.courseTitle} 출결현황`,
    `${result.course.courseCode}${result.course.classCode ? `-${result.course.classCode}` : ""} | lectureNo ${result.course.lectureNo}`,
    summary,
    `회차 ${result.totalSessions}개, 진행된 회차 ${result.completedSessions}개`,
    ...result.sessions.map((session) => {
      const meta = [
        session.sessionLabel,
        session.dateLabel,
        session.timeRange,
        session.classroom,
        session.statusLabel ?? (session.isPast ? "기록 없음" : "예정"),
        session.attendAt ? `출석시간 ${session.attendAt}` : undefined,
        session.leaveAt ? `퇴실시간 ${session.leaveAt}` : undefined
      ]
        .filter(Boolean)
        .join(" | ");

      return `- ${meta}`;
    })
  ].join("\n");
}

export function registerUcheckTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_ucheck_get_course_attendance",
    {
      title: "UCheck 과목별 출석현황 조회",
      description:
        "명지대 UCheck에서 특정 과목의 출석/지각/조퇴/결석 요약과 회차별 출결현황을 조회합니다.",
      inputSchema: {
        course: z
          .string()
          .optional()
          .describe("강의명, 과목코드, 또는 lectureNo 문자열입니다. 예: 시스템클라우드보안, JEJ02473, 57201"),
        lectureNo: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("UCheck lecture_no 입니다. course 와 동시에 사용할 수 없습니다."),
        year: z
          .number()
          .int()
          .optional()
          .describe("조회할 연도입니다. 생략하면 UCheck 기본 학기를 사용합니다."),
        term: z
          .number()
          .int()
          .optional()
          .describe("조회할 학기 값입니다. 생략하면 UCheck 기본 학기를 사용합니다.")
      },
      outputSchema: {
        studentNo: z.string().optional(),
        studentName: z.string(),
        resolvedBy: z.enum([
          "lecture-no",
          "course-title",
          "course-code",
          "course-search"
        ]),
        course: z.object(lectureSchema),
        summary: z.object(attendanceSummarySchema),
        totalSessions: z.number().int(),
        completedSessions: z.number().int(),
        sessions: z.array(z.object(attendanceSessionSchema))
      }
    },
    async ({ course, lectureNo, year, term }) => {
      const credentials = await requireCredentials(context);
      const client = context.createUcheckClient();
      const result = await getUcheckCourseAttendance(client, credentials, {
        ...(course?.trim() ? { course } : {}),
        ...(lectureNo !== undefined ? { lectureNo } : {}),
        ...(year !== undefined ? { year } : {}),
        ...(term !== undefined ? { term } : {})
      });

      return {
        content: [
          {
            type: "text",
            text: formatAttendanceText(result)
          }
        ],
        structuredContent: {
          ...(result.studentNo ? { studentNo: result.studentNo } : {}),
          studentName: result.studentName,
          resolvedBy: result.resolvedBy,
          course: result.course,
          summary: result.summary,
          totalSessions: result.totalSessions,
          completedSessions: result.completedSessions,
          sessions: result.sessions
        }
      };
    }
  );
}
