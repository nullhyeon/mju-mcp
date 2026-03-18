import fs from "node:fs/promises";
import path from "node:path";

import { load } from "cheerio";

import { getCourseAssignment, listCourseAssignments } from "./assignments.js";
import { enterStudentClassroom } from "./classroom.js";
import {
  FILE_UPLOAD_LIMIT_MESSAGE_URL,
  FILE_UPLOAD_LIMIT_SIZE_URL,
  LMS_BASE,
  STUDENT_REPORT_VIEW_URL
} from "./constants.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type {
  AssignmentSubmitCheckResult,
  AssignmentSubmitDraftFileCheck,
  AssignmentSubmitPopupSpec
} from "./types.js";

export interface CheckAssignmentSubmissionOptions {
  userId: string;
  password: string;
  kjkey: string;
  rtSeq: number;
  text?: string;
  localFiles?: string[];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toAbsoluteUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return new URL(trimmed, LMS_BASE).toString();
}

function parseLooseJson<T>(value: string): T | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    return undefined;
  }
}

function parseSizeToBytes(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/);
  if (!match) {
    return undefined;
  }

  const amount = Number.parseFloat(match[1] ?? "");
  const unit = match[2];
  if (Number.isNaN(amount) || !unit) {
    return undefined;
  }

  const powerMap: Record<string, number> = {
    B: 0,
    KB: 1,
    MB: 2,
    GB: 3,
    TB: 4
  };
  const power = powerMap[unit];
  if (power === undefined) {
    return undefined;
  }

  return Math.round(amount * 1024 ** power);
}

function measureProvidedText(value: string | undefined): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 0;
  }

  if (!/[<>]/.test(trimmed)) {
    return normalizeText(trimmed).length;
  }

  return normalizeText(load(`<div>${trimmed}</div>`).text()).length;
}

function parseSubmitButton(html: string): {
  hasSubmitButton: boolean;
  submitButtonLabel?: string;
  submitPopupUrl?: string;
} {
  const $ = load(html);
  let result:
    | { hasSubmitButton: true; submitButtonLabel?: string; submitPopupUrl: string }
    | undefined;

  $("button,a,input[type='button'],input[type='submit']").each((_, element) => {
    const item = $(element);
    const onclickValue = item.attr("onclick")?.trim();
    const matchedPopupUrl = onclickValue?.match(/openReportSubmitPop\('([^']+)'\)/)?.[1];
    if (!matchedPopupUrl) {
      return;
    }

    const label =
      normalizeText(item.text()) ||
      normalizeText(item.attr("value") ?? "") ||
      undefined;
    result = {
      hasSubmitButton: true,
      submitPopupUrl: toAbsoluteUrl(matchedPopupUrl) ?? matchedPopupUrl,
      ...(label ? { submitButtonLabel: label } : {})
    };
    return false;
  });

  if (result) {
    return result;
  }

  return {
    hasSubmitButton: false
  };
}

function parseSubmitPopupSpec(
  html: string,
  popupUrl: string,
  submitButtonLabel: string | undefined
): AssignmentSubmitPopupSpec {
  const $ = load(html);
  const textFieldName =
    $("#TXT").attr("name")?.trim() || $("#TXT").attr("id")?.trim() || undefined;
  const requiresTextInput =
    /내용을 입력하세요\./.test(html) ||
    (textFieldName !== undefined && /function\s+inputCheck\s*\(/.test(html));
  const hasFilePicker =
    $("#pickfiles, #pickfiles2").length > 0 ||
    /efile_upload_multiple2\.acl/.test(html);
  const uploadUrl = toAbsoluteUrl(
    html.match(/url\s*:\s*['"]([^'"]*efile_upload_multiple2\.acl[^'"]*)['"]/)?.[1]
  );
  const uploadPath =
    html.match(/['"]path['"]\s*:\s*['"]([^'"]+)['"]/)?.[1]?.trim() || undefined;
  const uploadPfStFlag =
    html.match(/['"]pf_st_flag['"]\s*:\s*['"]([^'"]+)['"]/)?.[1]?.trim() ||
    undefined;
  const submitUrl = toAbsoluteUrl(
    html.match(/url\s*:\s*['"]([^'"]*report_insert\.acl[^'"]*)['"]/)?.[1]
  );

  return {
    submitPopupUrl: popupUrl,
    ...(submitButtonLabel ? { submitButtonLabel } : {}),
    requiresTextInput,
    ...(textFieldName ? { textFieldName } : {}),
    hasFilePicker,
    ...(uploadUrl ? { uploadUrl } : {}),
    ...(uploadPath ? { uploadPath } : {}),
    ...(uploadPfStFlag ? { uploadPfStFlag } : {}),
    ...(submitUrl ? { submitUrl } : {})
  };
}

async function fetchUploadLimits(
  client: MjuLmsSsoClient,
  popupSpec: AssignmentSubmitPopupSpec
): Promise<{
  uploadLimitMessage?: string;
  maxFileSizeLabel?: string;
  maxFileSizeBytes?: number;
}> {
  if (!popupSpec.uploadPath) {
    return {};
  }

  const messageResponse = await client.postForm(FILE_UPLOAD_LIMIT_MESSAGE_URL, {
    PATH: popupSpec.uploadPath,
    encoding: "utf-8"
  });
  const sizeResponse = await client.postForm(FILE_UPLOAD_LIMIT_SIZE_URL, {
    path: popupSpec.uploadPath
  });

  const messagePayload = parseLooseJson<{ MESSAGE?: string }>(messageResponse.text);
  const sizePayload = parseLooseJson<{ fileLimitSize?: string }>(sizeResponse.text);
  const maxFileSizeLabel = sizePayload?.fileLimitSize?.trim() || undefined;

  const maxFileSizeBytes = maxFileSizeLabel
    ? parseSizeToBytes(maxFileSizeLabel)
    : undefined;

  return {
    ...(messagePayload?.MESSAGE?.trim()
      ? { uploadLimitMessage: messagePayload.MESSAGE.trim() }
      : {}),
    ...(maxFileSizeLabel ? { maxFileSizeLabel } : {}),
    ...(maxFileSizeBytes !== undefined ? { maxFileSizeBytes } : {})
  };
}

async function inspectLocalFiles(
  filePaths: string[],
  maxFileSizeBytes: number | undefined
): Promise<AssignmentSubmitDraftFileCheck[]> {
  const results: AssignmentSubmitDraftFileCheck[] = [];

  for (const filePath of filePaths) {
    const resolvedPath = path.resolve(filePath);
    const fileName = path.basename(resolvedPath);

    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        results.push({
          path: resolvedPath,
          fileName,
          exists: false,
          blockingReason: "일반 파일이 아닙니다."
        });
        continue;
      }

      const fileCheck: AssignmentSubmitDraftFileCheck = {
        path: resolvedPath,
        fileName,
        exists: true,
        sizeBytes: stats.size
      };

      if (maxFileSizeBytes !== undefined) {
        fileCheck.withinMaxFileSize = stats.size <= maxFileSizeBytes;
        if (!fileCheck.withinMaxFileSize) {
          fileCheck.blockingReason =
            "서버 최대 첨부 용량을 초과했습니다.";
        }
      }

      results.push(fileCheck);
    } catch {
      results.push({
        path: resolvedPath,
        fileName,
        exists: false,
        blockingReason: "파일을 찾지 못했습니다."
      });
    }
  }

  return results;
}

export async function checkAssignmentSubmission(
  client: MjuLmsSsoClient,
  options: CheckAssignmentSubmissionOptions
): Promise<AssignmentSubmitCheckResult> {
  const localFilesInput = options.localFiles ?? [];

  await client.ensureAuthenticated(options.userId, options.password);
  await enterStudentClassroom(client, options.kjkey);

  const assignmentList = await listCourseAssignments(client, {
    userId: options.userId,
    password: options.password,
    kjkey: options.kjkey
  });
  const assignmentDetail = await getCourseAssignment(client, {
    userId: options.userId,
    password: options.password,
    kjkey: options.kjkey,
    rtSeq: options.rtSeq
  });
  const detailPage = await client.getPage(
    `${STUDENT_REPORT_VIEW_URL}?RT_SEQ=${options.rtSeq}`
  );

  const summary = assignmentList.assignments.find(
    (assignment) => assignment.rtSeq === options.rtSeq
  );
  const submitButton = parseSubmitButton(detailPage.text);

  let popupSpec: AssignmentSubmitPopupSpec | undefined;
  let popupLimits: Awaited<ReturnType<typeof fetchUploadLimits>> = {};

  if (submitButton.submitPopupUrl) {
    const popupResponse = await client.getPage(submitButton.submitPopupUrl);
    popupSpec = parseSubmitPopupSpec(
      popupResponse.text,
      submitButton.submitPopupUrl,
      submitButton.submitButtonLabel
    );
    popupLimits = await fetchUploadLimits(client, popupSpec);
  }

  const providedTextLength = measureProvidedText(options.text);
  const localFiles = await inspectLocalFiles(
    localFilesInput,
    popupLimits.maxFileSizeBytes
  );

  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  if (!submitButton.hasSubmitButton || !submitButton.submitPopupUrl) {
    blockingReasons.push("과제 상세에서 제출하기 버튼을 찾지 못했습니다.");
  }

  if (popupSpec?.requiresTextInput && providedTextLength === 0) {
    blockingReasons.push("제출 본문 텍스트가 비어 있습니다.");
  }

  if (popupSpec?.hasFilePicker && !popupSpec.uploadUrl) {
    blockingReasons.push("파일 업로드 엔드포인트를 확인하지 못했습니다.");
  }

  if (popupSpec && !popupSpec.submitUrl) {
    blockingReasons.push("최종 제출 엔드포인트를 확인하지 못했습니다.");
  }

  for (const file of localFiles) {
    if (file.blockingReason) {
      blockingReasons.push(`${file.fileName}: ${file.blockingReason}`);
    }
  }

  if (
    summary?.statusLabel &&
    submitButton.hasSubmitButton &&
    (summary.statusLabel.includes("마감") ||
      summary.statusLabel.toLowerCase().includes("deadline") ||
      summary.statusText?.includes("만료"))
  ) {
    warnings.push(
      `과제 목록 상태는 ${summary.statusLabel}${summary.statusText ? ` / ${summary.statusText}` : ""} 로 보이지만, 상세 화면에는 제출 버튼이 노출됩니다. 실제 제출 가능 여부는 버튼 기준으로 다시 확인해야 합니다.`
    );
  }

  if (assignmentDetail.submission) {
    warnings.push(
      `이미 제출된 과제로 보입니다${assignmentDetail.submission.status ? ` (${assignmentDetail.submission.status})` : ""}. 실제 제출 단계에서 수정 제출 가능 여부를 다시 확인해야 합니다.`
    );
  }

  if (popupSpec?.hasFilePicker && localFiles.length === 0) {
    warnings.push("현재 검증 입력에는 첨부파일이 없습니다.");
  }

  if (!popupLimits.maxFileSizeLabel && popupSpec?.hasFilePicker) {
    warnings.push("서버 첨부 용량 제한을 확인하지 못했습니다.");
  }

  return {
    kjkey: options.kjkey,
    rtSeq: options.rtSeq,
    title: assignmentDetail.title,
    ...(assignmentDetail.courseTitle
      ? { courseTitle: assignmentDetail.courseTitle }
      : {}),
    ...(assignmentDetail.submissionFormat
      ? { submissionFormat: assignmentDetail.submissionFormat }
      : {}),
    ...(assignmentDetail.dueAt ? { dueAt: assignmentDetail.dueAt } : {}),
    ...(summary?.statusLabel ? { summaryStatusLabel: summary.statusLabel } : {}),
    ...(summary?.statusText ? { summaryStatusText: summary.statusText } : {}),
    alreadySubmitted: assignmentDetail.submission !== undefined,
    ...(assignmentDetail.submission?.status
      ? { existingSubmissionStatus: assignmentDetail.submission.status }
      : {}),
    hasSubmitButton: submitButton.hasSubmitButton,
    ...(submitButton.submitButtonLabel
      ? { submitButtonLabel: submitButton.submitButtonLabel }
      : {}),
    ...(submitButton.submitPopupUrl
      ? { submitPopupUrl: submitButton.submitPopupUrl }
      : {}),
    requiresTextInput: popupSpec?.requiresTextInput ?? false,
    ...(popupSpec?.textFieldName ? { textFieldName: popupSpec.textFieldName } : {}),
    hasFilePicker: popupSpec?.hasFilePicker ?? false,
    ...(popupSpec?.uploadUrl ? { uploadUrl: popupSpec.uploadUrl } : {}),
    ...(popupSpec?.uploadPath ? { uploadPath: popupSpec.uploadPath } : {}),
    ...(popupSpec?.uploadPfStFlag
      ? { uploadPfStFlag: popupSpec.uploadPfStFlag }
      : {}),
    ...(popupSpec?.submitUrl ? { submitUrl: popupSpec.submitUrl } : {}),
    ...(popupLimits.uploadLimitMessage
      ? { uploadLimitMessage: popupLimits.uploadLimitMessage }
      : {}),
    ...(popupLimits.maxFileSizeLabel
      ? { maxFileSizeLabel: popupLimits.maxFileSizeLabel }
      : {}),
    ...(popupLimits.maxFileSizeBytes !== undefined
      ? { maxFileSizeBytes: popupLimits.maxFileSizeBytes }
      : {}),
    providedTextLength,
    providedTextSatisfiesRequirement:
      !(popupSpec?.requiresTextInput ?? false) || providedTextLength > 0,
    localFiles,
    canProceed: blockingReasons.length === 0,
    blockingReasons,
    warnings
  };
}
