import { load } from "cheerio";

import { parseActivityListItems } from "./activity-list.js";
import {
  STUDENT_ACTIVITY_LIST_URL,
  STUDENT_REPORT_VIEW_URL
} from "./constants.js";
import {
  extractAttachmentRequestParams,
  fetchAttachments
} from "./attachments.js";
import { enterStudentClassroom } from "./classroom.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type {
  AssignmentDetailResult,
  AssignmentListResult,
  AssignmentSubmissionInfo,
  AssignmentSummary,
  AttachmentRequestParams
} from "./types.js";

export interface ListAssignmentsOptions {
  userId: string;
  password: string;
  kjkey: string;
  week?: number;
}

export interface GetAssignmentOptions {
  userId: string;
  password: string;
  kjkey: string;
  rtSeq: number;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return parsed;
}

export function parseAssignmentListHtml(
  html: string,
  options: { week?: number } = {}
): AssignmentSummary[] {
  return parseActivityListItems(html)
    .filter((item) => item.menuId === "report")
    .filter((item) => options.week === undefined || item.week === options.week)
    .map((item) => ({
      rtSeq: item.activityId,
      title: item.title,
      isSubmitted: item.hasIndicator,
      ...(item.week !== undefined ? { week: item.week } : {}),
      ...(item.weekLabel ? { weekLabel: item.weekLabel } : {}),
      ...(item.statusLabel ? { statusLabel: item.statusLabel } : {}),
      ...(item.statusText ? { statusText: item.statusText } : {})
    }));
}

function parseDetailMetaMap(html: string): Map<string, string> {
  const $ = load(html);
  const meta = new Map<string, string>();

  $("table.bbsview tr").each((_, element) => {
    const row = $(element);
    const label = normalizeText(row.find("th").first().text());
    const value = normalizeText(row.find("td").first().text());

    if (label && value) {
      meta.set(label, value);
    }
  });

  return meta;
}

function parseAssignmentBody(html: string): {
  title: string;
  bodyHtml: string;
  bodyText: string;
} {
  const $ = load(html);
  const title = normalizeText($(".view_title").first().text());
  const bodyNode = $("td.textviewer").first();

  return {
    title,
    bodyHtml: bodyNode.html()?.trim() ?? "",
    bodyText: normalizeText(bodyNode.text())
  };
}

function extractSubmissionAttachmentRequest(
  html: string,
  fallbackParams: AttachmentRequestParams | undefined
): AttachmentRequestParams | undefined {
  const contentSeqMatches = Array.from(
    html.matchAll(/content_seq\s*=\s*"([^"]+)"/g)
  )
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
  const contentSeq = contentSeqMatches.at(-1);

  const requestMatch = html.match(
    /url:\s*"\/ilos\/co\/efile_list\.acl"[\s\S]*?ud\s*:\s*"([^"]+)"[\s\S]*?ky\s*:\s*"([^"]+)"[\s\S]*?pf_st_flag\s*:\s*"([^"]+)"[\s\S]*?CONTENT_SEQ\s*:\s*content_seq[\s\S]*?TURNITIN_SEQ\s*:\s*"([^"]*)"/
  );

  const userId = requestMatch?.[1]?.trim() || fallbackParams?.userId;
  const kjkey = requestMatch?.[2]?.trim() || fallbackParams?.kjkey;
  const pfStFlag = requestMatch?.[3]?.trim() || fallbackParams?.pfStFlag;
  const turnitinSeq = requestMatch?.[4]?.trim();

  if (!contentSeq || !userId || !kjkey || !pfStFlag) {
    return undefined;
  }

  return {
    userId,
    kjkey,
    pfStFlag,
    contentSeq,
    ...(turnitinSeq ? { turnitinSeq } : {})
  };
}

function parseSubmissionInfo(
  html: string,
  submissionContentSeq: string | undefined,
  attachments: AssignmentSubmissionInfo["attachments"]
): AssignmentSubmissionInfo | undefined {
  const $ = load(html);
  const submitForm = $("#submit_form");
  if (submitForm.length === 0) {
    return undefined;
  }

  const status = normalizeText(submitForm.find(".submit_info_box .txt").first().text()) || undefined;
  const submittedAt =
    normalizeText(submitForm.find(".submit_info_box .date").first().text()) || undefined;
  const text =
    normalizeText(submitForm.find(".inner_content_wrap .content").first().text()) || undefined;
  const placeholderText =
    normalizeText(submitForm.find(".inner_content_wrap > span").first().text()) ||
    undefined;

  if (
    placeholderText === "제출된 내역이 없습니다." &&
    !status &&
    !submittedAt &&
    !text &&
    attachments.length === 0
  ) {
    return undefined;
  }

  if (!status && !submittedAt && !text && attachments.length === 0 && !submissionContentSeq) {
    return undefined;
  }

  return {
    attachments,
    ...(status ? { status } : {}),
    ...(submittedAt ? { submittedAt } : {}),
    ...(text ? { text } : {}),
    ...(submissionContentSeq ? { contentSeq: submissionContentSeq } : {})
  };
}

export async function listCourseAssignments(
  client: MjuLmsSsoClient,
  options: ListAssignmentsOptions
): Promise<AssignmentListResult> {
  await client.ensureAuthenticated(options.userId, options.password);
  const classroom = await enterStudentClassroom(client, options.kjkey);
  const response = await client.postForm(STUDENT_ACTIVITY_LIST_URL, {
    MENU_ID: "",
    ARTL_NUM: "",
    encoding: "utf-8"
  });

  const assignments = parseAssignmentListHtml(response.text, {
    ...(options.week !== undefined ? { week: options.week } : {})
  });
  const courseTitle = classroom.courseTitle;

  return {
    kjkey: options.kjkey,
    assignments,
    ...(courseTitle ? { courseTitle } : {}),
    ...(options.week !== undefined ? { week: options.week } : {})
  };
}

export async function getCourseAssignment(
  client: MjuLmsSsoClient,
  options: GetAssignmentOptions
): Promise<AssignmentDetailResult> {
  await client.ensureAuthenticated(options.userId, options.password);
  const classroom = await enterStudentClassroom(client, options.kjkey);
  const response = await client.getPage(
    `${STUDENT_REPORT_VIEW_URL}?RT_SEQ=${options.rtSeq}`
  );

  const meta = parseDetailMetaMap(response.text);
  const body = parseAssignmentBody(response.text);
  if (!body.title) {
    throw new Error(`과제 상세를 읽지 못했습니다. rtSeq=${options.rtSeq}`);
  }

  const promptAttachmentRequest = extractAttachmentRequestParams(response.text);
  const submissionAttachmentRequest = extractSubmissionAttachmentRequest(
    response.text,
    promptAttachmentRequest
  );

  const attachments = promptAttachmentRequest
    ? await fetchAttachments(client, promptAttachmentRequest)
    : [];
  const submissionAttachments = submissionAttachmentRequest
    ? await fetchAttachments(client, submissionAttachmentRequest)
    : [];
  const submission = parseSubmissionInfo(
    response.text,
    submissionAttachmentRequest?.contentSeq,
    submissionAttachments
  );
  const courseTitle = classroom.courseTitle;
  const submissionMethod = meta.get("제출방식");
  const submissionFormat = meta.get("제출형태");
  const openAt = meta.get("공개일");
  const dueAt = meta.get("마감일");
  const points = meta.get("배점");
  const scoreVisibility = meta.get("점수공개");
  const contentSeq = promptAttachmentRequest?.contentSeq;

  return {
    kjkey: options.kjkey,
    rtSeq: options.rtSeq,
    title: body.title,
    bodyHtml: body.bodyHtml,
    bodyText: body.bodyText,
    attachments,
    ...(courseTitle ? { courseTitle } : {}),
    ...(submissionMethod ? { submissionMethod } : {}),
    ...(submissionFormat ? { submissionFormat } : {}),
    ...(openAt ? { openAt } : {}),
    ...(dueAt ? { dueAt } : {}),
    ...(points ? { points } : {}),
    ...(scoreVisibility ? { scoreVisibility } : {}),
    ...(contentSeq ? { contentSeq } : {}),
    ...(submission ? { submission } : {})
  };
}
