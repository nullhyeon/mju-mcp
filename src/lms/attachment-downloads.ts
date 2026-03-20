import path from "node:path";

import type { LmsRuntimeConfig } from "./config.js";
import { getCourseAssignment } from "./assignments.js";
import {
  downloadAttachmentToDirectory,
  selectAttachmentByIndex
} from "./attachments.js";
import { getCourseMaterial } from "./materials.js";
import { getCourseNotice } from "./notices.js";
import { MjuLmsSsoClient } from "./sso-client.js";
import type { DownloadedAttachmentFile } from "./types.js";

export interface DownloadNoticeAttachmentOptions {
  userId: string;
  password: string;
  kjkey: string;
  articleId: number;
  attachmentIndex?: number;
  outputDir?: string;
}

export interface DownloadMaterialAttachmentOptions {
  userId: string;
  password: string;
  kjkey: string;
  articleId: number;
  attachmentIndex?: number;
  outputDir?: string;
}

export interface DownloadAssignmentAttachmentOptions {
  userId: string;
  password: string;
  kjkey: string;
  rtSeq: number;
  attachmentIndex?: number;
  attachmentKind?: "prompt" | "submission";
  outputDir?: string;
}

export async function downloadNoticeAttachment(
  client: MjuLmsSsoClient,
  config: LmsRuntimeConfig,
  options: DownloadNoticeAttachmentOptions
): Promise<DownloadedAttachmentFile> {
  const detail = await getCourseNotice(client, options);
  const attachment = selectAttachmentByIndex(
    detail.attachments,
    options.attachmentIndex ?? 0,
    "공지 첨부파일"
  );

  return downloadAttachmentToDirectory(client, attachment, {
    outputDir:
      options.outputDir ??
      path.join(config.downloadsDir, "notice", options.kjkey, String(options.articleId))
  });
}

export async function downloadMaterialAttachment(
  client: MjuLmsSsoClient,
  config: LmsRuntimeConfig,
  options: DownloadMaterialAttachmentOptions
): Promise<DownloadedAttachmentFile> {
  const detail = await getCourseMaterial(client, options);
  const attachment = selectAttachmentByIndex(
    detail.attachments,
    options.attachmentIndex ?? 0,
    "자료 첨부파일"
  );

  return downloadAttachmentToDirectory(client, attachment, {
    outputDir:
      options.outputDir ??
      path.join(config.downloadsDir, "material", options.kjkey, String(options.articleId))
  });
}

export async function downloadAssignmentAttachment(
  client: MjuLmsSsoClient,
  config: LmsRuntimeConfig,
  options: DownloadAssignmentAttachmentOptions
): Promise<DownloadedAttachmentFile> {
  const detail = await getCourseAssignment(client, options);
  const attachmentKind = options.attachmentKind ?? "prompt";
  const attachments =
    attachmentKind === "submission"
      ? (detail.submission?.attachments ?? [])
      : detail.attachments;
  const attachment = selectAttachmentByIndex(
    attachments,
    options.attachmentIndex ?? 0,
    attachmentKind === "submission" ? "과제 제출 첨부파일" : "과제 첨부파일"
  );

  return downloadAttachmentToDirectory(client, attachment, {
    outputDir:
      options.outputDir ??
      path.join(
        config.downloadsDir,
        "assignment",
        attachmentKind,
        options.kjkey,
        String(options.rtSeq)
      )
  });
}
