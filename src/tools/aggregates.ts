import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { getCourseAssignment, listCourseAssignments } from "../lms/assignments.js";
import { listRegularTakenCourses } from "../lms/courses.js";
import { listCourseMaterials } from "../lms/materials.js";
import { listCourseNotices } from "../lms/notices.js";
import { getCourseOnlineWeek, listCourseOnlineWeeks } from "../lms/online.js";
import type {
  AssignmentSummary,
  MaterialSummary,
  NoticeSummary,
  OnlineWeekSummary
} from "../lms/types.js";
import type { AppContext } from "../mcp/app-context.js";
import {
  courseReferenceInputSchemaShape,
  rememberCourseContext,
  resolveCourseReference,
  type ToolSessionExtra
} from "./course-resolver.js";
import { requireCredentials } from "./credentials.js";

const DEFAULT_DUE_DAYS = 7;
const DEFAULT_DIGEST_LIMIT = 5;
const NOTICE_PAGE_SIZE = 50;
const MAX_NOTICE_PAGES = 20;

type Credentials = Awaited<ReturnType<typeof requireCredentials>>;
type LmsClient = ReturnType<AppContext["createLmsClient"]>;

interface ScopedCourse {
  kjkey: string;
  courseTitle?: string;
  courseCode?: string;
  year?: number;
  term?: number;
  termLabel?: string;
}

interface CourseScopeResult {
  mode: "single" | "all-courses";
  courses: ScopedCourse[];
}

interface AggregateAssignmentItem {
  kjkey: string;
  courseTitle?: string;
  rtSeq: number;
  title: string;
  week?: number;
  weekLabel?: string;
  statusLabel?: string;
  statusText?: string;
  isSubmitted: boolean;
}

interface DueAssignmentItem extends AggregateAssignmentItem {
  dueAt: string;
  dueAtIso: string;
  hoursUntilDue: number;
}

interface AggregateNoticeItem {
  kjkey: string;
  courseTitle?: string;
  articleId: number;
  title: string;
  previewText: string;
  postedAt?: string;
  viewCount?: number;
  isUnread: boolean;
  isExpired: boolean;
}

interface AggregateOnlineWeekItem {
  kjkey: string;
  courseTitle?: string;
  lectureWeeks: number;
  title: string;
  week?: number;
  weekLabel?: string;
  statusLabel?: string;
  statusText?: string;
  totalItems: number;
  incompleteItems: number;
}

const materialSummarySchema = {
  articleId: z.number().int(),
  title: z.string(),
  week: z.number().int().optional(),
  weekLabel: z.string().optional(),
  attachmentCount: z.number().int().optional()
};

const aggregateAssignmentSchema = {
  kjkey: z.string(),
  courseTitle: z.string().optional(),
  rtSeq: z.number().int(),
  title: z.string(),
  week: z.number().int().optional(),
  weekLabel: z.string().optional(),
  statusLabel: z.string().optional(),
  statusText: z.string().optional(),
  isSubmitted: z.boolean()
};

const dueAssignmentSchema = {
  ...aggregateAssignmentSchema,
  dueAt: z.string(),
  dueAtIso: z.string(),
  hoursUntilDue: z.number()
};

const aggregateNoticeSchema = {
  kjkey: z.string(),
  courseTitle: z.string().optional(),
  articleId: z.number().int(),
  title: z.string(),
  previewText: z.string(),
  postedAt: z.string().optional(),
  viewCount: z.number().int().optional(),
  isUnread: z.boolean(),
  isExpired: z.boolean()
};

const aggregateOnlineWeekSchema = {
  kjkey: z.string(),
  courseTitle: z.string().optional(),
  lectureWeeks: z.number().int(),
  title: z.string(),
  week: z.number().int().optional(),
  weekLabel: z.string().optional(),
  statusLabel: z.string().optional(),
  statusText: z.string().optional(),
  totalItems: z.number().int(),
  incompleteItems: z.number().int()
};

function ensureCourseScopeInputs(params: {
  course?: string;
  kjkey?: string;
  allCourses?: boolean;
}): void {
  if (params.allCourses && (params.course?.trim() || params.kjkey?.trim())) {
    throw new Error("allCourses=true 일 때는 course 또는 kjkey 를 함께 사용할 수 없습니다.");
  }
}

function compareCourseTerm(left: { year?: number; term?: number }, right: { year?: number; term?: number }): number {
  const leftYear = left.year ?? 0;
  const rightYear = right.year ?? 0;
  if (leftYear !== rightYear) {
    return leftYear - rightYear;
  }

  const leftTerm = left.term ?? 0;
  const rightTerm = right.term ?? 0;
  return leftTerm - rightTerm;
}

async function resolveCourseScope(
  context: AppContext,
  extra: ToolSessionExtra,
  client: LmsClient,
  credentials: Credentials,
  params: {
    course?: string;
    kjkey?: string;
    allCourses?: boolean;
  }
): Promise<CourseScopeResult> {
  ensureCourseScopeInputs(params);

  if (params.allCourses) {
    const result = await listRegularTakenCourses(client, {
      userId: credentials.userId,
      password: credentials.password,
      allTerms: true
    });
    const latestCourse = result.courses.reduce<ScopedCourse | undefined>((latest, course) => {
      if (!latest || compareCourseTerm(course, latest) > 0) {
        return {
          kjkey: course.kjkey,
          courseTitle: course.title,
          courseCode: course.courseCode,
          year: course.year,
          term: course.term,
          termLabel: course.termLabel
        };
      }

      return latest;
    }, undefined);
    const latestCourses = latestCourse
      ? result.courses.filter(
          (course) =>
            course.year === latestCourse.year && course.term === latestCourse.term
        )
      : [];

    return {
      mode: "all-courses",
      courses: latestCourses.map((course) => ({
        kjkey: course.kjkey,
        courseTitle: course.title,
        courseCode: course.courseCode,
        year: course.year,
        term: course.term,
        termLabel: course.termLabel
      }))
    };
  }

  const resolvedCourse = await resolveCourseReference(
    context,
    extra,
    client,
    credentials,
    {
      ...(params.course !== undefined ? { course: params.course } : {}),
      ...(params.kjkey !== undefined ? { kjkey: params.kjkey } : {})
    }
  );

  return {
    mode: "single",
    courses: [
      {
        kjkey: resolvedCourse.kjkey,
        ...(resolvedCourse.courseTitle
          ? { courseTitle: resolvedCourse.courseTitle }
          : {}),
        ...(resolvedCourse.courseCode ? { courseCode: resolvedCourse.courseCode } : {}),
        ...(resolvedCourse.year !== undefined ? { year: resolvedCourse.year } : {}),
        ...(resolvedCourse.term !== undefined ? { term: resolvedCourse.term } : {}),
        ...(resolvedCourse.termLabel
          ? { termLabel: resolvedCourse.termLabel }
          : {})
      }
    ]
  };
}

function rememberSingleScope(
  context: AppContext,
  extra: ToolSessionExtra,
  scope: CourseScopeResult,
  fallback?: {
    courseTitle?: string;
    courseCode?: string;
    year?: number;
    term?: number;
    termLabel?: string;
  }
): void {
  if (scope.mode !== "single" || scope.courses.length === 0) {
    return;
  }

  const course = scope.courses[0]!;
  rememberCourseContext(context, extra, {
    kjkey: course.kjkey,
    ...(fallback?.courseTitle ?? course.courseTitle
      ? { courseTitle: fallback?.courseTitle ?? course.courseTitle }
      : {}),
    ...(fallback?.courseCode ?? course.courseCode
      ? { courseCode: fallback?.courseCode ?? course.courseCode }
      : {}),
    ...(fallback?.year ?? course.year) !== undefined
      ? { year: fallback?.year ?? course.year }
      : {},
    ...(fallback?.term ?? course.term) !== undefined
      ? { term: fallback?.term ?? course.term }
      : {},
    ...(fallback?.termLabel ?? course.termLabel
      ? { termLabel: fallback?.termLabel ?? course.termLabel }
      : {})
  });
}

function parseKoreanDateTime(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(
    /(\d{4})\.(\d{2})\.(\d{2}).*?(오전|오후)\s*(\d{1,2}):(\d{2})/
  );
  if (!match) {
    return undefined;
  }

  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const day = Number.parseInt(match[3] ?? "", 10);
  const meridiem = match[4];
  const rawHour = Number.parseInt(match[5] ?? "", 10);
  const minute = Number.parseInt(match[6] ?? "", 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(rawHour) ||
    Number.isNaN(minute)
  ) {
    return undefined;
  }

  let hour = rawHour % 12;
  if (meridiem === "오후") {
    hour += 12;
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function parseEnglishDateTime(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(
    /(?:[A-Za-z]{3},\s+)?([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i
  );
  if (!match) {
    return undefined;
  }

  const monthName = (match[1] ?? "").toLowerCase();
  const monthMap: Record<string, number> = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sep: 8,
    sept: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11
  };
  const month = monthMap[monthName];
  const day = Number.parseInt(match[2] ?? "", 10);
  const year = Number.parseInt(
    match[3] ?? `${new Date().getFullYear()}`,
    10
  );
  const rawHour = Number.parseInt(match[4] ?? "", 10);
  const minute = Number.parseInt(match[5] ?? "", 10);
  const meridiem = (match[6] ?? "").toUpperCase();

  if (
    month === undefined ||
    Number.isNaN(day) ||
    Number.isNaN(year) ||
    Number.isNaN(rawHour) ||
    Number.isNaN(minute)
  ) {
    return undefined;
  }

  let hour = rawHour % 12;
  if (meridiem === "PM") {
    hour += 12;
  }

  return new Date(year, month, day, hour, minute, 0, 0);
}

function parseDueDateTime(value: string | undefined): Date | undefined {
  return parseKoreanDateTime(value) ?? parseEnglishDateTime(value);
}

function hoursUntil(target: Date, base: Date): number {
  return Math.round(((target.getTime() - base.getTime()) / (60 * 60 * 1000)) * 10) / 10;
}

function isIncompleteOnlineWeek(items: { progressPercent?: number }[]): boolean {
  if (items.length === 0) {
    return true;
  }

  return items.some((item) => (item.progressPercent ?? 0) < 100);
}

function toAggregateAssignment(
  course: ScopedCourse,
  assignment: AssignmentSummary,
  courseTitleOverride?: string
): AggregateAssignmentItem {
  return {
    kjkey: course.kjkey,
    ...(courseTitleOverride ?? course.courseTitle
      ? { courseTitle: courseTitleOverride ?? course.courseTitle }
      : {}),
    rtSeq: assignment.rtSeq,
    title: assignment.title,
    ...(assignment.week !== undefined ? { week: assignment.week } : {}),
    ...(assignment.weekLabel ? { weekLabel: assignment.weekLabel } : {}),
    ...(assignment.statusLabel ? { statusLabel: assignment.statusLabel } : {}),
    ...(assignment.statusText ? { statusText: assignment.statusText } : {}),
    isSubmitted: assignment.isSubmitted
  };
}

function toAggregateNotice(
  course: ScopedCourse,
  notice: NoticeSummary,
  courseTitleOverride?: string
): AggregateNoticeItem {
  return {
    kjkey: course.kjkey,
    ...(courseTitleOverride ?? course.courseTitle
      ? { courseTitle: courseTitleOverride ?? course.courseTitle }
      : {}),
    articleId: notice.articleId,
    title: notice.title,
    previewText: notice.previewText,
    ...(notice.postedAt ? { postedAt: notice.postedAt } : {}),
    ...(notice.viewCount !== undefined ? { viewCount: notice.viewCount } : {}),
    isUnread: notice.isUnread,
    isExpired: notice.isExpired
  };
}

function toAggregateOnlineWeek(
  course: ScopedCourse,
  week: OnlineWeekSummary,
  totalItems: number,
  incompleteItems: number,
  courseTitleOverride?: string
): AggregateOnlineWeekItem {
  return {
    kjkey: course.kjkey,
    ...(courseTitleOverride ?? course.courseTitle
      ? { courseTitle: courseTitleOverride ?? course.courseTitle }
      : {}),
    lectureWeeks: week.lectureWeeks,
    title: week.title,
    ...(week.week !== undefined ? { week: week.week } : {}),
    ...(week.weekLabel ? { weekLabel: week.weekLabel } : {}),
    ...(week.statusLabel ? { statusLabel: week.statusLabel } : {}),
    ...(week.statusText ? { statusText: week.statusText } : {}),
    totalItems,
    incompleteItems
  };
}

async function listAllNoticesForCourse(
  client: LmsClient,
  credentials: Credentials,
  course: ScopedCourse
): Promise<{ courseTitle?: string; notices: NoticeSummary[] }> {
  const notices: NoticeSummary[] = [];
  const seen = new Set<number>();
  let discoveredCourseTitle: string | undefined;

  for (let page = 1; page <= MAX_NOTICE_PAGES; page += 1) {
    const result = await listCourseNotices(client, {
      userId: credentials.userId,
      password: credentials.password,
      kjkey: course.kjkey,
      page,
      pageSize: NOTICE_PAGE_SIZE
    });

    discoveredCourseTitle = result.courseTitle ?? discoveredCourseTitle;
    const newItems = result.notices.filter((notice) => {
      if (seen.has(notice.articleId)) {
        return false;
      }
      seen.add(notice.articleId);
      return true;
    });

    notices.push(...newItems);

    if (result.notices.length < NOTICE_PAGE_SIZE || newItems.length === 0) {
      break;
    }
  }

  return {
    ...(discoveredCourseTitle ? { courseTitle: discoveredCourseTitle } : {}),
    notices
  };
}

async function collectUnsubmittedAssignments(
  client: LmsClient,
  credentials: Credentials,
  courses: ScopedCourse[]
): Promise<AggregateAssignmentItem[]> {
  const aggregated: AggregateAssignmentItem[] = [];

  for (const course of courses) {
    const result = await listCourseAssignments(client, {
      userId: credentials.userId,
      password: credentials.password,
      kjkey: course.kjkey
    });

    aggregated.push(
      ...result.assignments
        .filter((assignment) => assignment.isSubmitted === false)
        .map((assignment) =>
          toAggregateAssignment(course, assignment, result.courseTitle)
        )
    );
  }

  return aggregated;
}

async function collectUnreadNotices(
  client: LmsClient,
  credentials: Credentials,
  courses: ScopedCourse[]
): Promise<AggregateNoticeItem[]> {
  const aggregated: AggregateNoticeItem[] = [];

  for (const course of courses) {
    const result = await listAllNoticesForCourse(client, credentials, course);
    aggregated.push(
      ...result.notices
        .filter((notice) => notice.isUnread)
        .map((notice) => toAggregateNotice(course, notice, result.courseTitle))
    );
  }

  return aggregated;
}

async function collectIncompleteOnlineWeeks(
  client: LmsClient,
  credentials: Credentials,
  courses: ScopedCourse[]
): Promise<AggregateOnlineWeekItem[]> {
  const aggregated: AggregateOnlineWeekItem[] = [];

  for (const course of courses) {
    const result = await listCourseOnlineWeeks(client, {
      userId: credentials.userId,
      password: credentials.password,
      kjkey: course.kjkey
    });

    for (const week of result.weeks) {
      const detail = await getCourseOnlineWeek(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: course.kjkey,
        lectureWeeks: week.lectureWeeks
      });
      const incomplete = isIncompleteOnlineWeek(detail.items);
      if (!incomplete) {
        continue;
      }

      const incompleteItems = detail.items.filter(
        (item) => (item.progressPercent ?? 0) < 100
      ).length;
      aggregated.push(
        toAggregateOnlineWeek(
          course,
          week,
          detail.items.length,
          incompleteItems,
          detail.courseTitle ?? result.courseTitle
        )
      );
    }
  }

  return aggregated;
}

async function collectDueAssignments(
  client: LmsClient,
  credentials: Credentials,
  courses: ScopedCourse[],
  options: {
    days: number;
    includeSubmitted: boolean;
  }
): Promise<DueAssignmentItem[]> {
  const now = new Date();
  const deadline = new Date(now.getTime() + options.days * 24 * 60 * 60 * 1000);
  const aggregated: DueAssignmentItem[] = [];

  for (const course of courses) {
    const result = await listCourseAssignments(client, {
      userId: credentials.userId,
      password: credentials.password,
      kjkey: course.kjkey
    });

    const candidates = result.assignments.filter(
      (assignment) => options.includeSubmitted || assignment.isSubmitted === false
    );

    for (const assignment of candidates) {
      const detail = await getCourseAssignment(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: course.kjkey,
        rtSeq: assignment.rtSeq
      });
      const dueDate = parseDueDateTime(detail.dueAt);
      if (!detail.dueAt || !dueDate) {
        continue;
      }
      if (dueDate < now || dueDate > deadline) {
        continue;
      }

      aggregated.push({
        ...toAggregateAssignment(course, assignment, detail.courseTitle ?? result.courseTitle),
        dueAt: detail.dueAt,
        dueAtIso: dueDate.toISOString(),
        hoursUntilDue: hoursUntil(dueDate, now)
      });
    }
  }

  return aggregated.sort((left, right) => left.dueAtIso.localeCompare(right.dueAtIso));
}

function formatDigestSectionTitle(
  label: string,
  total: number,
  shown: number
): string {
  if (total > shown) {
    return `${label} ${total}건 (상위 ${shown}건 표시)`;
  }

  return `${label} ${total}건`;
}

function formatMaterialItems(
  items: MaterialSummary[],
  emptyText: string
): string[] {
  if (items.length === 0) {
    return [emptyText];
  }

  return items.map((item) => {
    const meta = [
      item.weekLabel,
      item.attachmentCount !== undefined ? `첨부 ${item.attachmentCount}개` : undefined
    ].filter(Boolean);
    return `- [${item.articleId}] ${item.title}${meta.length > 0 ? ` | ${meta.join(" | ")}` : ""}`;
  });
}

function formatAssignmentItems(
  items: AggregateAssignmentItem[],
  emptyText: string
): string[] {
  if (items.length === 0) {
    return [emptyText];
  }

  return items.map((item) => {
    const meta = [
      item.courseTitle,
      item.weekLabel,
      item.statusLabel && item.statusText
        ? `${item.statusLabel} ${item.statusText}`
        : item.statusText
    ].filter(Boolean);
    const suffix = meta.length > 0 ? ` | ${meta.join(" | ")}` : "";
    return `- [${item.rtSeq}] ${item.title}${suffix}`;
  });
}

function formatDueAssignmentItems(
  items: DueAssignmentItem[],
  emptyText: string
): string[] {
  if (items.length === 0) {
    return [emptyText];
  }

  return items.map((item) => {
    const meta = [
      item.courseTitle,
      item.weekLabel,
      item.dueAt,
      `약 ${item.hoursUntilDue}시간 남음`,
      item.isSubmitted ? "제출됨" : "미제출"
    ].filter(Boolean);
    return `- [${item.rtSeq}] ${item.title} | ${meta.join(" | ")}`;
  });
}

function formatNoticeItems(
  items: AggregateNoticeItem[],
  emptyText: string
): string[] {
  if (items.length === 0) {
    return [emptyText];
  }

  return items.map((item) => {
    const meta = [
      item.courseTitle,
      item.postedAt,
      item.viewCount !== undefined ? `조회 ${item.viewCount}` : undefined,
      item.isUnread ? "안읽음" : undefined
    ].filter(Boolean);
    return `- [${item.articleId}] ${item.title}${meta.length > 0 ? ` | ${meta.join(" | ")}` : ""}`;
  });
}

function formatOnlineWeekItems(
  items: AggregateOnlineWeekItem[],
  emptyText: string
): string[] {
  if (items.length === 0) {
    return [emptyText];
  }

  return items.map((item) => {
    const meta = [
      item.courseTitle,
      item.weekLabel,
      item.statusLabel && item.statusText
        ? `${item.statusLabel} ${item.statusText}`
        : item.statusText,
      item.totalItems > 0 ? `${item.incompleteItems}/${item.totalItems}개 미완료` : "학습 아이템 확인 필요"
    ].filter(Boolean);
    return `- [${item.lectureWeeks}] ${item.title} | ${meta.join(" | ")}`;
  });
}

function formatUnsubmittedAssignmentsText(items: AggregateAssignmentItem[]): string {
  return [
    `미제출 과제 ${items.length}건`,
    ...formatAssignmentItems(items, "미제출 과제가 없습니다.")
  ].join("\n");
}

function formatDueAssignmentsText(items: DueAssignmentItem[], days: number): string {
  return [
    `${days}일 이내 마감 과제 ${items.length}건`,
    ...formatDueAssignmentItems(items, "조건에 맞는 마감 임박 과제가 없습니다.")
  ].join("\n");
}

function formatUnreadNoticesText(items: AggregateNoticeItem[]): string {
  return [
    `안읽은 공지 ${items.length}건`,
    ...formatNoticeItems(items, "안읽은 공지가 없습니다.")
  ].join("\n");
}

function formatIncompleteOnlineWeeksText(items: AggregateOnlineWeekItem[]): string {
  return [
    `미수강 온라인 학습 ${items.length}건`,
    ...formatOnlineWeekItems(items, "미수강 온라인 학습이 없습니다.")
  ].join("\n");
}

function formatActionItemsText(result: {
  unsubmittedAssignments: AggregateAssignmentItem[];
  dueAssignments: DueAssignmentItem[];
  unreadNotices: AggregateNoticeItem[];
  incompleteOnlineWeeks: AggregateOnlineWeekItem[];
  dueWindowDays: number;
}): string {
  return [
    "지금 확인할 항목",
    "",
    `미제출 과제 ${result.unsubmittedAssignments.length}건`,
    ...formatAssignmentItems(
      result.unsubmittedAssignments,
      "미제출 과제가 없습니다."
    ),
    "",
    `${result.dueWindowDays}일 이내 마감 과제 ${result.dueAssignments.length}건`,
    ...formatDueAssignmentItems(
      result.dueAssignments,
      "마감 임박 과제가 없습니다."
    ),
    "",
    `안읽은 공지 ${result.unreadNotices.length}건`,
    ...formatNoticeItems(result.unreadNotices, "안읽은 공지가 없습니다."),
    "",
    `미수강 온라인 학습 ${result.incompleteOnlineWeeks.length}건`,
    ...formatOnlineWeekItems(
      result.incompleteOnlineWeeks,
      "미수강 온라인 학습이 없습니다."
    )
  ].join("\n");
}

function formatCourseDigestText(result: {
  courseTitle?: string;
  kjkey: string;
  counts: {
    unreadNotices: number;
    materials: number;
    unsubmittedAssignments: number;
    dueAssignments: number;
    incompleteOnlineWeeks: number;
  };
  unreadNotices: AggregateNoticeItem[];
  materials: MaterialSummary[];
  unsubmittedAssignments: AggregateAssignmentItem[];
  dueAssignments: DueAssignmentItem[];
  incompleteOnlineWeeks: AggregateOnlineWeekItem[];
  days: number;
}): string {
  const courseLabel = result.courseTitle
    ? `${result.courseTitle} (${result.kjkey})`
    : result.kjkey;

  return [
    `${courseLabel} 강의 요약`,
    "",
    formatDigestSectionTitle(
      "안읽은 공지",
      result.counts.unreadNotices,
      result.unreadNotices.length
    ),
    ...formatNoticeItems(result.unreadNotices, "안읽은 공지가 없습니다."),
    "",
    formatDigestSectionTitle(
      "최근 자료",
      result.counts.materials,
      result.materials.length
    ),
    ...formatMaterialItems(result.materials, "조회 가능한 자료가 없습니다."),
    "",
    formatDigestSectionTitle(
      "미제출 과제",
      result.counts.unsubmittedAssignments,
      result.unsubmittedAssignments.length
    ),
    ...formatAssignmentItems(
      result.unsubmittedAssignments,
      "미제출 과제가 없습니다."
    ),
    "",
    formatDigestSectionTitle(
      `${result.days}일 이내 마감 과제`,
      result.counts.dueAssignments,
      result.dueAssignments.length
    ),
    ...formatDueAssignmentItems(
      result.dueAssignments,
      "조건에 맞는 마감 임박 과제가 없습니다."
    ),
    "",
    formatDigestSectionTitle(
      "미수강 온라인 학습",
      result.counts.incompleteOnlineWeeks,
      result.incompleteOnlineWeeks.length
    ),
    ...formatOnlineWeekItems(
      result.incompleteOnlineWeeks,
      "미수강 온라인 학습이 없습니다."
    )
  ].join("\n");
}

export function registerAggregateTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_lms_get_course_digest",
    {
      title: "강의 종합 요약",
      description:
        "특정 강의의 안읽은 공지, 최근 자료, 미제출 과제, 마감 임박 과제, 미수강 온라인 학습을 한 번에 요약합니다.",
      inputSchema: {
        ...courseReferenceInputSchemaShape,
        days: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("지금부터 며칠 이내 마감 과제를 digest에 포함할지 지정합니다. 기본값은 7입니다."),
        limit: z
          .number()
          .int()
          .positive()
          .max(20)
          .optional()
          .describe("각 섹션에 표시할 최대 항목 수입니다. 기본값은 5입니다.")
      },
      outputSchema: {
        kjkey: z.string(),
        courseTitle: z.string().optional(),
        courseCode: z.string().optional(),
        year: z.number().int().optional(),
        term: z.number().int().optional(),
        termLabel: z.string().optional(),
        days: z.number().int(),
        limit: z.number().int(),
        counts: z.object({
          unreadNotices: z.number().int(),
          materials: z.number().int(),
          unsubmittedAssignments: z.number().int(),
          dueAssignments: z.number().int(),
          incompleteOnlineWeeks: z.number().int()
        }),
        unreadNotices: z.array(z.object(aggregateNoticeSchema)),
        materials: z.array(z.object(materialSummarySchema)),
        unsubmittedAssignments: z.array(z.object(aggregateAssignmentSchema)),
        dueAssignments: z.array(z.object(dueAssignmentSchema)),
        incompleteOnlineWeeks: z.array(z.object(aggregateOnlineWeekSchema))
      }
    },
    async ({ course, kjkey, days, limit }, extra) => {
      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const scope = await resolveCourseScope(context, extra, client, credentials, {
        ...(course !== undefined ? { course } : {}),
        ...(kjkey !== undefined ? { kjkey } : {})
      });
      const selectedCourse = scope.courses[0];
      if (!selectedCourse) {
        throw new Error("digest 대상 강의를 찾지 못했습니다.");
      }

      const digestDays = days ?? DEFAULT_DUE_DAYS;
      const digestLimit = limit ?? DEFAULT_DIGEST_LIMIT;
      const assignmentsResult = await listCourseAssignments(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: selectedCourse.kjkey
      });
      const allUnreadNotices = await collectUnreadNotices(client, credentials, [
        selectedCourse
      ]);
      const materialsResult = await listCourseMaterials(client, {
        userId: credentials.userId,
        password: credentials.password,
        kjkey: selectedCourse.kjkey
      });
      const dueAssignments = await collectDueAssignments(
        client,
        credentials,
        [selectedCourse],
        {
          days: digestDays,
          includeSubmitted: false
        }
      );
      const incompleteOnlineWeeks = await collectIncompleteOnlineWeeks(
        client,
        credentials,
        [selectedCourse]
      );

      const unsubmittedAssignments = assignmentsResult.assignments
        .filter((assignment) => assignment.isSubmitted === false)
        .map((assignment) =>
          toAggregateAssignment(
            selectedCourse,
            assignment,
            assignmentsResult.courseTitle
          )
        );
      const displayedUnreadNotices = allUnreadNotices.slice(0, digestLimit);
      const displayedMaterials = materialsResult.materials.slice(0, digestLimit);
      const displayedUnsubmittedAssignments = unsubmittedAssignments.slice(
        0,
        digestLimit
      );
      const displayedDueAssignments = dueAssignments.slice(0, digestLimit);
      const displayedIncompleteOnlineWeeks = incompleteOnlineWeeks.slice(
        0,
        digestLimit
      );
      const courseTitle =
        assignmentsResult.courseTitle ??
        materialsResult.courseTitle ??
        displayedUnreadNotices[0]?.courseTitle ??
        displayedDueAssignments[0]?.courseTitle ??
        displayedIncompleteOnlineWeeks[0]?.courseTitle ??
        selectedCourse.courseTitle;

      rememberSingleScope(context, extra, scope, {
        ...(courseTitle ? { courseTitle } : {}),
        ...(selectedCourse.courseCode ? { courseCode: selectedCourse.courseCode } : {}),
        ...(selectedCourse.year !== undefined ? { year: selectedCourse.year } : {}),
        ...(selectedCourse.term !== undefined ? { term: selectedCourse.term } : {}),
        ...(selectedCourse.termLabel ? { termLabel: selectedCourse.termLabel } : {})
      });

      return {
        content: [
          {
            type: "text",
            text: formatCourseDigestText({
              ...(courseTitle ? { courseTitle } : {}),
              kjkey: selectedCourse.kjkey,
              counts: {
                unreadNotices: allUnreadNotices.length,
                materials: materialsResult.materials.length,
                unsubmittedAssignments: unsubmittedAssignments.length,
                dueAssignments: dueAssignments.length,
                incompleteOnlineWeeks: incompleteOnlineWeeks.length
              },
              unreadNotices: displayedUnreadNotices,
              materials: displayedMaterials,
              unsubmittedAssignments: displayedUnsubmittedAssignments,
              dueAssignments: displayedDueAssignments,
              incompleteOnlineWeeks: displayedIncompleteOnlineWeeks,
              days: digestDays
            })
          }
        ],
        structuredContent: {
          kjkey: selectedCourse.kjkey,
          ...(courseTitle ? { courseTitle } : {}),
          ...(selectedCourse.courseCode ? { courseCode: selectedCourse.courseCode } : {}),
          ...(selectedCourse.year !== undefined ? { year: selectedCourse.year } : {}),
          ...(selectedCourse.term !== undefined ? { term: selectedCourse.term } : {}),
          ...(selectedCourse.termLabel ? { termLabel: selectedCourse.termLabel } : {}),
          days: digestDays,
          limit: digestLimit,
          counts: {
            unreadNotices: allUnreadNotices.length,
            materials: materialsResult.materials.length,
            unsubmittedAssignments: unsubmittedAssignments.length,
            dueAssignments: dueAssignments.length,
            incompleteOnlineWeeks: incompleteOnlineWeeks.length
          },
          unreadNotices: displayedUnreadNotices,
          materials: displayedMaterials,
          unsubmittedAssignments: displayedUnsubmittedAssignments,
          dueAssignments: displayedDueAssignments,
          incompleteOnlineWeeks: displayedIncompleteOnlineWeeks
        }
      };
    }
  );

  server.registerTool(
    "mju_lms_get_unsubmitted_assignments",
    {
      title: "미제출 과제 모아보기",
      description:
        "특정 강의 또는 최신 학기 전체 강의에서 미제출 과제만 모아서 보여줍니다.",
      inputSchema: {
        ...courseReferenceInputSchemaShape,
        allCourses: z
          .boolean()
          .optional()
          .describe("true면 최신 학기 전체 강의에서 찾습니다.")
      },
      outputSchema: {
        scope: z.enum(["single", "all-courses"]),
        count: z.number().int(),
        assignments: z.array(z.object(aggregateAssignmentSchema))
      }
    },
    async ({ course, kjkey, allCourses }, extra) => {
      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const scope = await resolveCourseScope(context, extra, client, credentials, {
        ...(course !== undefined ? { course } : {}),
        ...(kjkey !== undefined ? { kjkey } : {}),
        ...(allCourses !== undefined ? { allCourses } : {})
      });
      const assignments = await collectUnsubmittedAssignments(
        client,
        credentials,
        scope.courses
      );
      rememberSingleScope(context, extra, scope);

      return {
        content: [
          {
            type: "text",
            text: formatUnsubmittedAssignmentsText(assignments)
          }
        ],
        structuredContent: {
          scope: scope.mode,
          count: assignments.length,
          assignments
        }
      };
    }
  );

  server.registerTool(
    "mju_lms_get_due_assignments",
    {
      title: "마감 임박 과제 모아보기",
      description:
        "특정 강의 또는 최신 학기 전체 강의에서 지정한 일수 이내 마감 과제를 마감일 순으로 보여줍니다.",
      inputSchema: {
        ...courseReferenceInputSchemaShape,
        days: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("지금부터 며칠 이내 마감 과제를 볼지 지정합니다. 기본값은 7입니다."),
        allCourses: z
          .boolean()
          .optional()
          .describe("true면 최신 학기 전체 강의에서 찾습니다."),
        includeSubmitted: z
          .boolean()
          .optional()
          .describe("true면 이미 제출한 과제도 함께 포함합니다.")
      },
      outputSchema: {
        scope: z.enum(["single", "all-courses"]),
        days: z.number().int(),
        includeSubmitted: z.boolean(),
        count: z.number().int(),
        assignments: z.array(z.object(dueAssignmentSchema))
      }
    },
    async ({ course, kjkey, days, allCourses, includeSubmitted }, extra) => {
      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const scope = await resolveCourseScope(context, extra, client, credentials, {
        ...(course !== undefined ? { course } : {}),
        ...(kjkey !== undefined ? { kjkey } : {}),
        ...(allCourses !== undefined ? { allCourses } : {})
      });
      const effectiveDays = days ?? DEFAULT_DUE_DAYS;
      const effectiveIncludeSubmitted = includeSubmitted ?? false;
      const assignments = await collectDueAssignments(client, credentials, scope.courses, {
        days: effectiveDays,
        includeSubmitted: effectiveIncludeSubmitted
      });
      rememberSingleScope(context, extra, scope);

      return {
        content: [
          {
            type: "text",
            text: formatDueAssignmentsText(assignments, effectiveDays)
          }
        ],
        structuredContent: {
          scope: scope.mode,
          days: effectiveDays,
          includeSubmitted: effectiveIncludeSubmitted,
          count: assignments.length,
          assignments
        }
      };
    }
  );

  server.registerTool(
    "mju_lms_get_action_items",
    {
      title: "지금 해야 할 일 모아보기",
      description:
        "미제출 과제, 마감 임박 과제, 안읽은 공지, 미수강 온라인 학습만 모아서 보여줍니다.",
      inputSchema: {
        ...courseReferenceInputSchemaShape,
        allCourses: z
          .boolean()
          .optional()
          .describe("true면 최신 학기 전체 강의에서 찾습니다.")
      },
      outputSchema: {
        scope: z.enum(["single", "all-courses"]),
        dueWindowDays: z.number().int(),
        counts: z.object({
          unsubmittedAssignments: z.number().int(),
          dueAssignments: z.number().int(),
          unreadNotices: z.number().int(),
          incompleteOnlineWeeks: z.number().int()
        }),
        unsubmittedAssignments: z.array(z.object(aggregateAssignmentSchema)),
        dueAssignments: z.array(z.object(dueAssignmentSchema)),
        unreadNotices: z.array(z.object(aggregateNoticeSchema)),
        incompleteOnlineWeeks: z.array(z.object(aggregateOnlineWeekSchema))
      }
    },
    async ({ course, kjkey, allCourses }, extra) => {
      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const scope = await resolveCourseScope(context, extra, client, credentials, {
        ...(course !== undefined ? { course } : {}),
        ...(kjkey !== undefined ? { kjkey } : {}),
        ...(allCourses !== undefined ? { allCourses } : {})
      });

      const unsubmittedAssignments = await collectUnsubmittedAssignments(
        client,
        credentials,
        scope.courses
      );
      const dueAssignments = await collectDueAssignments(
        client,
        credentials,
        scope.courses,
        {
          days: DEFAULT_DUE_DAYS,
          includeSubmitted: false
        }
      );
      const unreadNotices = await collectUnreadNotices(
        client,
        credentials,
        scope.courses
      );
      const incompleteOnlineWeeks = await collectIncompleteOnlineWeeks(
        client,
        credentials,
        scope.courses
      );
      rememberSingleScope(context, extra, scope);

      return {
        content: [
          {
            type: "text",
            text: formatActionItemsText({
              unsubmittedAssignments,
              dueAssignments,
              unreadNotices,
              incompleteOnlineWeeks,
              dueWindowDays: DEFAULT_DUE_DAYS
            })
          }
        ],
        structuredContent: {
          scope: scope.mode,
          dueWindowDays: DEFAULT_DUE_DAYS,
          counts: {
            unsubmittedAssignments: unsubmittedAssignments.length,
            dueAssignments: dueAssignments.length,
            unreadNotices: unreadNotices.length,
            incompleteOnlineWeeks: incompleteOnlineWeeks.length
          },
          unsubmittedAssignments,
          dueAssignments,
          unreadNotices,
          incompleteOnlineWeeks
        }
      };
    }
  );

  server.registerTool(
    "mju_lms_get_unread_notices",
    {
      title: "안읽은 공지 모아보기",
      description:
        "특정 강의 또는 최신 학기 전체 강의에서 안읽은 공지만 모아서 보여줍니다.",
      inputSchema: {
        ...courseReferenceInputSchemaShape,
        allCourses: z
          .boolean()
          .optional()
          .describe("true면 최신 학기 전체 강의에서 찾습니다.")
      },
      outputSchema: {
        scope: z.enum(["single", "all-courses"]),
        count: z.number().int(),
        notices: z.array(z.object(aggregateNoticeSchema))
      }
    },
    async ({ course, kjkey, allCourses }, extra) => {
      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const scope = await resolveCourseScope(context, extra, client, credentials, {
        ...(course !== undefined ? { course } : {}),
        ...(kjkey !== undefined ? { kjkey } : {}),
        ...(allCourses !== undefined ? { allCourses } : {})
      });
      const notices = await collectUnreadNotices(client, credentials, scope.courses);
      rememberSingleScope(context, extra, scope);

      return {
        content: [
          {
            type: "text",
            text: formatUnreadNoticesText(notices)
          }
        ],
        structuredContent: {
          scope: scope.mode,
          count: notices.length,
          notices
        }
      };
    }
  );

  server.registerTool(
    "mju_lms_get_incomplete_online_weeks",
    {
      title: "미수강 온라인 학습 모아보기",
      description:
        "특정 강의 또는 최신 학기 전체 강의에서 아직 100% 완료되지 않은 온라인 학습만 모아서 보여줍니다.",
      inputSchema: {
        ...courseReferenceInputSchemaShape,
        allCourses: z
          .boolean()
          .optional()
          .describe("true면 최신 학기 전체 강의에서 찾습니다.")
      },
      outputSchema: {
        scope: z.enum(["single", "all-courses"]),
        count: z.number().int(),
        weeks: z.array(z.object(aggregateOnlineWeekSchema))
      }
    },
    async ({ course, kjkey, allCourses }, extra) => {
      const credentials = await requireCredentials(context);
      const client = context.createLmsClient();
      const scope = await resolveCourseScope(context, extra, client, credentials, {
        ...(course !== undefined ? { course } : {}),
        ...(kjkey !== undefined ? { kjkey } : {}),
        ...(allCourses !== undefined ? { allCourses } : {})
      });
      const weeks = await collectIncompleteOnlineWeeks(client, credentials, scope.courses);
      rememberSingleScope(context, extra, scope);

      return {
        content: [
          {
            type: "text",
            text: formatIncompleteOnlineWeeksText(weeks)
          }
        ],
        structuredContent: {
          scope: scope.mode,
          count: weeks.length,
          weeks
        }
      };
    }
  );
}
