import type { ResolvedLmsCredentials } from "../auth/types.js";
import type { MjuUcheckClient } from "./client.js";
import {
  UCHECK_ACCOUNT_INFO_URL,
  UCHECK_ATTENDANCE_ITEMS_URL,
  UCHECK_ATTENDANCE_LOGS_URL,
  UCHECK_LECTURE_LIST_URL
} from "./constants.js";
import type {
  UcheckAccountInfo,
  UcheckAttendanceSession,
  UcheckAttendanceSummary,
  UcheckCourseAttendanceResult,
  UcheckLectureSummary,
  UcheckYearTerm
} from "./types.js";

interface UcheckEnvelope<T> {
  result_code?: string;
  message?: string;
  data?: T;
}

interface UcheckAccountInfoRaw {
  account_id?: string;
  account_role?: string;
  name?: string;
  student_no?: string;
  base_yearterm?: {
    lecture_year?: number;
    lecture_term?: number;
  };
  yearterms?: Array<{
    lecture_year?: number;
    lecture_term?: number;
  }>;
}

interface UcheckLectureRaw {
  lecture_no?: number;
  lecture_year?: number;
  lecture_term?: number;
  curriculum_cd?: string;
  curriculum_nm?: string;
  curdetail_cd?: string;
  teacher_nm?: string;
  dept_nm?: string;
  total_lecture_time?: string;
}

interface UcheckAttendanceStudentRaw {
  student_no?: string;
  student_nm?: string;
  lecture_no?: number;
  atd_time?: number;
  ltn_time?: number;
  lev_time?: number;
  asc_time?: number;
}

interface UcheckAttendanceLectureRaw {
  lecture_week?: number;
  class_no?: number;
  s_class_no?: number;
  lecture_date?: string;
  start_time?: string;
  end_time?: string;
  past_yn?: string;
}

interface UcheckAttendanceLogRaw {
  lecture_week?: number;
  class_no?: number;
  student_no?: string;
  attend_type?: string;
  attend_date?: string;
  out_date?: string | null;
}

interface UcheckAttendanceItemsRaw {
  student?: UcheckAttendanceStudentRaw[];
  lecture?: UcheckAttendanceLectureRaw[];
}

interface ResolveLectureOptions {
  lectureNo?: number | undefined;
  course?: string | undefined;
  year?: number | undefined;
  term?: number | undefined;
}

interface ResolvedLectureSelection {
  lecture: UcheckLectureSummary;
  resolvedBy: UcheckCourseAttendanceResult["resolvedBy"];
}

interface ParsedScheduleSegment {
  dayLabel?: string | undefined;
  timeRange?: string | undefined;
  classroom?: string | undefined;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  "1": "출석",
  "2": "지각",
  "3": "조퇴",
  "4": "결석",
  "5": "휴강",
  "8": "출석(인정)",
  "9": "결석(인정)"
};

function cleanText(value: string | undefined | null): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : undefined;
}

function cleanMultilineText(value: string | undefined | null): string | undefined {
  const normalized = value
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  return normalized ? normalized : undefined;
}

function normalizeLookupValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\[\](){}\-_.]/g, "");
}

function parseJsonEnvelope<T>(text: string, label: string): T {
  let parsed: UcheckEnvelope<T>;
  try {
    parsed = JSON.parse(text) as UcheckEnvelope<T>;
  } catch {
    throw new Error(`${label} 응답을 JSON으로 해석하지 못했습니다.`);
  }

  if (parsed.result_code !== "success" || parsed.data === undefined) {
    throw new Error(
      `${label} 요청에 실패했습니다.${parsed.message ? ` (${parsed.message})` : ""}`
    );
  }

  return parsed.data;
}

function formatDate(value: string | undefined): string | undefined {
  if (!value || !/^\d{8}$/.test(value)) {
    return undefined;
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function formatDateLabel(value: string | undefined): string | undefined {
  if (!value || !/^\d{8}$/.test(value)) {
    return undefined;
  }

  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(4, 6), 10);
  const day = Number.parseInt(value.slice(6, 8), 10);
  const weekday = DAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];

  return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6, 8)}(${weekday})`;
}

function formatTimeRange(
  startTime: string | undefined,
  endTime: string | undefined
): string | undefined {
  if (!startTime || !endTime || !/^\d{4}$/.test(startTime) || !/^\d{4}$/.test(endTime)) {
    return undefined;
  }

  return `${startTime.slice(0, 2)}:${startTime.slice(2, 4)}~${endTime.slice(0, 2)}:${endTime.slice(2, 4)}`;
}

function formatDateTimeTime(value: string | undefined | null): string | undefined {
  if (!value || !/^\d{14}$/.test(value)) {
    return undefined;
  }

  return `${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}`;
}

function parseInteger(value: number | string | undefined | null): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function parseScheduleSummary(value: string | undefined): ParsedScheduleSegment[] {
  const normalized = value?.trim();
  if (!normalized) {
    return [];
  }

  const dayMap: Record<string, string> = {
    monday: "월",
    tuesday: "화",
    wednesday: "수",
    thursday: "목",
    friday: "금",
    saturday: "토",
    sunday: "일"
  };

  return normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawDay, rawTimeRange, rawClassroom] = line.split("/");
      const dayLabel = rawDay
        ? dayMap[rawDay.trim().toLowerCase()] ?? cleanText(rawDay)
        : undefined;

      return {
        ...(dayLabel ? { dayLabel } : {}),
        ...(cleanText(rawTimeRange) ? { timeRange: cleanText(rawTimeRange) } : {}),
        ...(cleanText(rawClassroom) ? { classroom: cleanText(rawClassroom) } : {})
      };
    });
}

function matchScheduleSegment(
  lecture: UcheckLectureSummary,
  timeRange: string | undefined,
  dateValue: string | undefined
): ParsedScheduleSegment | undefined {
  const segments = parseScheduleSummary(lecture.scheduleSummary);
  if (segments.length === 0) {
    return undefined;
  }

  if (!dateValue || !/^\d{8}$/.test(dateValue)) {
    return segments.length === 1 ? segments[0] : undefined;
  }

  const year = Number.parseInt(dateValue.slice(0, 4), 10);
  const month = Number.parseInt(dateValue.slice(4, 6), 10);
  const day = Number.parseInt(dateValue.slice(6, 8), 10);
  const dayLabel = DAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const exactMatch = segments.find(
    (segment) =>
      segment.dayLabel === dayLabel &&
      (!timeRange || !segment.timeRange || segment.timeRange === timeRange)
  );

  if (exactMatch) {
    return exactMatch;
  }

  const dayOnlyMatch = segments.find((segment) => segment.dayLabel === dayLabel);
  return dayOnlyMatch ?? (segments.length === 1 ? segments[0] : undefined);
}

async function ensureAuthenticated(
  client: MjuUcheckClient,
  credentials: ResolvedLmsCredentials
): Promise<void> {
  const { mainResponse } = await client.ensureAuthenticated(
    credentials.userId,
    credentials.password
  );
  await client.saveMainHtml(mainResponse.text);
}

export async function getUcheckAccountInfo(
  client: MjuUcheckClient,
  credentials: ResolvedLmsCredentials
): Promise<UcheckAccountInfo> {
  await ensureAuthenticated(client, credentials);
  const response = await client.postForm(UCHECK_ACCOUNT_INFO_URL, {});
  const raw = parseJsonEnvelope<UcheckAccountInfoRaw>(
    response.text,
    "UCheck 계정 정보"
  );
  const lectureYear = raw.base_yearterm?.lecture_year;
  const lectureTerm = raw.base_yearterm?.lecture_term;

  if (!raw.account_id || !raw.name || lectureYear === undefined || lectureTerm === undefined) {
    throw new Error("UCheck 계정 정보 응답에 필수 필드가 없습니다.");
  }

  const availableYearTerms: UcheckYearTerm[] =
    raw.yearterms
      ?.map((yearterm) => ({
        lectureYear: parseInteger(yearterm.lecture_year),
        lectureTerm: parseInteger(yearterm.lecture_term)
      }))
      .filter(
        (yearterm) => yearterm.lectureYear > 0 && yearterm.lectureTerm > 0
      ) ?? [];

  return {
    accountId: raw.account_id,
    accountRole: raw.account_role ?? "",
    name: raw.name,
    ...(raw.student_no ? { studentNo: raw.student_no } : {}),
    baseYearTerm: {
      lectureYear,
      lectureTerm
    },
    availableYearTerms
  };
}

export async function listUcheckLectures(
  client: MjuUcheckClient,
  credentials: ResolvedLmsCredentials,
  year: number,
  term: number
): Promise<UcheckLectureSummary[]> {
  await ensureAuthenticated(client, credentials);
  const response = await client.postJson(UCHECK_LECTURE_LIST_URL, {
    lecture_year: year,
    lecture_term: term
  });
  const rows = parseJsonEnvelope<UcheckLectureRaw[]>(
    response.text,
    "UCheck 강의 목록"
  );

  return rows
    .map((row) => {
      const lectureNo = parseInteger(row.lecture_no);
      const lectureYear = parseInteger(row.lecture_year);
      const lectureTerm = parseInteger(row.lecture_term);
      const courseCode = cleanText(row.curriculum_cd);
      const courseTitle = cleanText(row.curriculum_nm);

      if (
        lectureNo <= 0 ||
        lectureYear <= 0 ||
        lectureTerm <= 0 ||
        !courseCode ||
        !courseTitle
      ) {
        return undefined;
      }

      return {
        lectureNo,
        lectureYear,
        lectureTerm,
        courseCode,
        courseTitle,
        ...(cleanText(row.curdetail_cd) ? { classCode: cleanText(row.curdetail_cd) } : {}),
        ...(cleanText(row.teacher_nm) ? { professor: cleanText(row.teacher_nm) } : {}),
        ...(cleanText(row.dept_nm) ? { department: cleanText(row.dept_nm) } : {}),
        ...(cleanMultilineText(row.total_lecture_time)
          ? { scheduleSummary: cleanMultilineText(row.total_lecture_time) }
          : {})
      } satisfies UcheckLectureSummary;
    })
    .filter((lecture): lecture is UcheckLectureSummary => lecture !== undefined);
}

function resolveLectureFromList(
  lectures: UcheckLectureSummary[],
  options: ResolveLectureOptions
): ResolvedLectureSelection {
  const lectureNo = options.lectureNo;
  const courseQuery = options.course?.trim();

  if (lectureNo !== undefined && courseQuery) {
    throw new Error("lectureNo 와 course 는 동시에 사용할 수 없습니다.");
  }

  if (lectureNo !== undefined) {
    const lecture = lectures.find((item) => item.lectureNo === lectureNo);
    if (!lecture) {
      throw new Error(`lectureNo ${lectureNo} 에 해당하는 UCheck 강의를 찾지 못했습니다.`);
    }

    return {
      lecture,
      resolvedBy: "lecture-no"
    };
  }

  if (!courseQuery) {
    throw new Error("course 또는 lectureNo 중 하나는 반드시 제공해야 합니다.");
  }

  const normalizedQuery = normalizeLookupValue(courseQuery);
  const numericLectureNo =
    /^\d+$/.test(courseQuery) ? Number.parseInt(courseQuery, 10) : undefined;
  if (numericLectureNo !== undefined) {
    const lecture = lectures.find((item) => item.lectureNo === numericLectureNo);
    if (lecture) {
      return {
        lecture,
        resolvedBy: "lecture-no"
      };
    }
  }

  const exactTitleMatches = lectures.filter(
    (lecture) => normalizeLookupValue(lecture.courseTitle) === normalizedQuery
  );
  if (exactTitleMatches.length === 1) {
    return {
      lecture: exactTitleMatches[0]!,
      resolvedBy: "course-title"
    };
  }
  if (exactTitleMatches.length > 1) {
    throw new Error(
      `강의명 "${courseQuery}" 에 해당하는 UCheck 강의가 여러 개 있습니다. lectureNo 를 직접 지정해주세요.`
    );
  }

  const exactCodeMatches = lectures.filter(
    (lecture) => normalizeLookupValue(lecture.courseCode) === normalizedQuery
  );
  if (exactCodeMatches.length === 1) {
    return {
      lecture: exactCodeMatches[0]!,
      resolvedBy: "course-code"
    };
  }
  if (exactCodeMatches.length > 1) {
    throw new Error(
      `과목코드 "${courseQuery}" 에 해당하는 UCheck 강의가 여러 개 있습니다. lectureNo 를 직접 지정해주세요.`
    );
  }

  const fuzzyMatches = lectures.filter((lecture) => {
    const title = normalizeLookupValue(lecture.courseTitle);
    const code = normalizeLookupValue(lecture.courseCode);
    const professor = normalizeLookupValue(lecture.professor ?? "");
    return (
      title.includes(normalizedQuery) ||
      code.includes(normalizedQuery) ||
      professor.includes(normalizedQuery)
    );
  });

  if (fuzzyMatches.length === 1) {
    return {
      lecture: fuzzyMatches[0]!,
      resolvedBy: "course-search"
    };
  }

  if (fuzzyMatches.length > 1) {
    const candidates = fuzzyMatches
      .slice(0, 5)
      .map(
        (lecture) =>
          `- ${lecture.courseTitle} | ${lecture.courseCode} | ${lecture.professor ?? "교수명 없음"} | ${lecture.lectureNo}`
      )
      .join("\n");

    throw new Error(
      [
        `강의 식별자 "${courseQuery}" 로 여러 UCheck 강의가 검색되었습니다.`,
        "lectureNo 를 직접 지정하거나 더 구체적으로 입력해주세요.",
        "",
        candidates
      ].join("\n")
    );
  }

  throw new Error(`강의 식별자 "${courseQuery}" 에 해당하는 UCheck 강의를 찾지 못했습니다.`);
}

export async function getUcheckCourseAttendance(
  client: MjuUcheckClient,
  credentials: ResolvedLmsCredentials,
  options: ResolveLectureOptions
): Promise<UcheckCourseAttendanceResult> {
  const accountInfo = await getUcheckAccountInfo(client, credentials);
  const year = options.year ?? accountInfo.baseYearTerm.lectureYear;
  const term = options.term ?? accountInfo.baseYearTerm.lectureTerm;
  const lectures = await listUcheckLectures(client, credentials, year, term);
  const resolved = resolveLectureFromList(lectures, options);
  const itemsResponse = await client.postJson(UCHECK_ATTENDANCE_ITEMS_URL, {
    lecture_no: resolved.lecture.lectureNo
  });
  const logsResponse = await client.postJson(UCHECK_ATTENDANCE_LOGS_URL, {
    lecture_no: resolved.lecture.lectureNo
  });
  const items = parseJsonEnvelope<UcheckAttendanceItemsRaw>(
    itemsResponse.text,
    "UCheck 출결 회차 목록"
  );
  const logs = parseJsonEnvelope<UcheckAttendanceLogRaw[]>(
    logsResponse.text,
    "UCheck 출결 로그"
  );

  const studentNo = accountInfo.studentNo ?? credentials.userId;
  const myStudent = items.student?.find((row) => row.student_no === studentNo);

  if (!myStudent) {
    throw new Error(
      `강의 ${resolved.lecture.courseTitle} (${resolved.lecture.lectureNo}) 에서 본인 학번 ${studentNo} 출결 요약을 찾지 못했습니다.`
    );
  }

  const summary: UcheckAttendanceSummary = {
    attendedCount: parseInteger(myStudent.atd_time),
    tardyCount: parseInteger(myStudent.ltn_time),
    earlyLeaveCount: parseInteger(myStudent.lev_time),
    absentCount: parseInteger(myStudent.asc_time)
  };

  const myLogs = logs.filter((row) => row.student_no === studentNo);
  const logsBySession = new Map<string, UcheckAttendanceLogRaw>();
  for (const row of myLogs) {
    const week = parseInteger(row.lecture_week);
    const classNo = parseInteger(row.class_no);
    logsBySession.set(`${week}:${classNo}`, row);
  }

  const sessions: UcheckAttendanceSession[] =
    items.lecture?.map((row) => {
      const week = parseInteger(row.lecture_week);
      const classNo = parseInteger(row.class_no);
      const subClassNo = parseInteger(row.s_class_no) || classNo;
      const key = `${week}:${classNo}`;
      const log = logsBySession.get(key);
      const timeRange = formatTimeRange(row.start_time, row.end_time);
      const scheduleSegment = matchScheduleSegment(
        resolved.lecture,
        timeRange,
        row.lecture_date
      );
      const statusCode = cleanText(log?.attend_type);

      return {
        week,
        classNo,
        sessionLabel: `${week}-${subClassNo}`,
        ...(formatDate(row.lecture_date) ? { date: formatDate(row.lecture_date) } : {}),
        ...(formatDateLabel(row.lecture_date)
          ? { dateLabel: formatDateLabel(row.lecture_date) }
          : {}),
        ...(timeRange ? { timeRange } : {}),
        ...(scheduleSegment?.classroom ? { classroom: scheduleSegment.classroom } : {}),
        isPast: row.past_yn === "Y",
        ...(statusCode ? { statusCode } : {}),
        ...(statusCode && ATTENDANCE_STATUS_LABELS[statusCode]
          ? { statusLabel: ATTENDANCE_STATUS_LABELS[statusCode] }
          : {}),
        ...(formatDateTimeTime(log?.attend_date)
          ? { attendAt: formatDateTimeTime(log?.attend_date) }
          : {}),
        ...(formatDateTimeTime(log?.out_date)
          ? { leaveAt: formatDateTimeTime(log?.out_date) }
          : {})
      };
    }) ?? [];

  return {
    ...(accountInfo.studentNo ? { studentNo: accountInfo.studentNo } : {}),
    studentName: myStudent.student_nm ?? accountInfo.name,
    resolvedBy: resolved.resolvedBy,
    course: resolved.lecture,
    summary,
    totalSessions: sessions.length,
    completedSessions: sessions.filter((session) => session.isPast).length,
    sessions
  };
}
