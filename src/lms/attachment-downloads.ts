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
import type {
  AssignmentDetailResult,
  DownloadedAttachmentFile,
  LmsAttachment,
  MaterialDetailResult,
  NoticeDetailResult
} from "./types.js";

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

export interface DownloadNoticeAttachmentsOptions {
  userId: string;
  password: string;
  kjkey: string;
  articleIds: number[];
  outputDir?: string;
}

export interface DownloadMaterialAttachmentsOptions {
  userId: string;
  password: string;
  kjkey: string;
  articleIds: number[];
  outputDir?: string;
}

export interface DownloadAssignmentAttachmentsOptions {
  userId: string;
  password: string;
  kjkey: string;
  rtSeqs: number[];
  attachmentKind?: "prompt" | "submission";
  outputDir?: string;
}

export interface BulkDownloadedAttachmentItem {
  articleId?: number;
  rtSeq?: number;
  title: string;
  attachmentKind?: "prompt" | "submission";
  attachmentCount: number;
  downloadedCount: number;
  savedDir: string;
  files: DownloadedAttachmentFile[];
}

export interface BulkDownloadedAttachmentResult {
  kind: "notice" | "material" | "assignment";
  kjkey: string;
  attachmentKind?: "prompt" | "submission";
  itemCount: number;
  fileCount: number;
  warnings: string[];
  items: BulkDownloadedAttachmentItem[];
}

interface AttachmentCollectionEntry {
  articleId?: number;
  rtSeq?: number;
  title: string;
  attachmentKind?: "prompt" | "submission";
  attachments: LmsAttachment[];
  savedDir: string;
}

function resolveBulkOutputDir(
  customOutputDir: string | undefined,
  fallbackDir: string,
  itemId: number,
  hasMultipleItems: boolean
): string {
  if (!customOutputDir) {
    return fallbackDir;
  }

  return hasMultipleItems ? path.join(customOutputDir, String(itemId)) : customOutputDir;
}

function getNoticeFallbackDir(
  config: LmsRuntimeConfig,
  kjkey: string,
  articleId: number
): string {
  return path.join(config.downloadsDir, "notice", kjkey, String(articleId));
}

function getMaterialFallbackDir(
  config: LmsRuntimeConfig,
  kjkey: string,
  articleId: number
): string {
  return path.join(config.downloadsDir, "material", kjkey, String(articleId));
}

function getAssignmentFallbackDir(
  config: LmsRuntimeConfig,
  kjkey: string,
  rtSeq: number,
  attachmentKind: "prompt" | "submission"
): string {
  return path.join(
    config.downloadsDir,
    "assignment",
    attachmentKind,
    kjkey,
    String(rtSeq)
  );
}

function createBulkDownloadWarning(
  entry: AttachmentCollectionEntry,
  kind: "notice" | "material" | "assignment"
): string {
  const itemId = entry.articleId ?? entry.rtSeq;
  const label =
    kind === "notice" ? "공지" : kind === "material" ? "자료" : "과제";
  const titleSuffix = entry.title ? ` (${entry.title})` : "";
  return `${label} ${itemId ?? "?"}${titleSuffix} 에는 다운로드할 첨부파일이 없습니다.`;
}

async function downloadAttachmentCollections(
  client: MjuLmsSsoClient,
  options: {
    kind: "notice" | "material" | "assignment";
    kjkey: string;
    attachmentKind?: "prompt" | "submission";
    entries: AttachmentCollectionEntry[];
  }
): Promise<BulkDownloadedAttachmentResult> {
  const warnings: string[] = [];
  const items: BulkDownloadedAttachmentItem[] = [];
  let fileCount = 0;

  for (const entry of options.entries) {
    if (entry.attachments.length === 0) {
      warnings.push(createBulkDownloadWarning(entry, options.kind));
      items.push({
        ...(entry.articleId !== undefined ? { articleId: entry.articleId } : {}),
        ...(entry.rtSeq !== undefined ? { rtSeq: entry.rtSeq } : {}),
        title: entry.title,
        ...(entry.attachmentKind ? { attachmentKind: entry.attachmentKind } : {}),
        attachmentCount: 0,
        downloadedCount: 0,
        savedDir: entry.savedDir,
        files: []
      });
      continue;
    }

    const files: DownloadedAttachmentFile[] = [];
    for (const attachment of entry.attachments) {
      const downloaded = await downloadAttachmentToDirectory(client, attachment, {
        outputDir: entry.savedDir
      });
      files.push(downloaded);
      fileCount += 1;
    }

    items.push({
      ...(entry.articleId !== undefined ? { articleId: entry.articleId } : {}),
      ...(entry.rtSeq !== undefined ? { rtSeq: entry.rtSeq } : {}),
      title: entry.title,
      ...(entry.attachmentKind ? { attachmentKind: entry.attachmentKind } : {}),
      attachmentCount: entry.attachments.length,
      downloadedCount: files.length,
      savedDir: entry.savedDir,
      files
    });
  }

  return {
    kind: options.kind,
    kjkey: options.kjkey,
    ...(options.attachmentKind ? { attachmentKind: options.attachmentKind } : {}),
    itemCount: options.entries.length,
    fileCount,
    warnings,
    items
  };
}

function resolveAssignmentAttachments(
  detail: AssignmentDetailResult,
  attachmentKind: "prompt" | "submission"
): LmsAttachment[] {
  return attachmentKind === "submission"
    ? (detail.submission?.attachments ?? [])
    : detail.attachments;
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
      getNoticeFallbackDir(config, options.kjkey, options.articleId)
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
      getMaterialFallbackDir(config, options.kjkey, options.articleId)
  });
}

export async function downloadAssignmentAttachment(
  client: MjuLmsSsoClient,
  config: LmsRuntimeConfig,
  options: DownloadAssignmentAttachmentOptions
): Promise<DownloadedAttachmentFile> {
  const detail = await getCourseAssignment(client, options);
  const attachmentKind = options.attachmentKind ?? "prompt";
  const attachments = resolveAssignmentAttachments(detail, attachmentKind);
  const attachment = selectAttachmentByIndex(
    attachments,
    options.attachmentIndex ?? 0,
    attachmentKind === "submission" ? "과제 제출 첨부파일" : "과제 첨부파일"
  );

  return downloadAttachmentToDirectory(client, attachment, {
    outputDir:
      options.outputDir ??
      getAssignmentFallbackDir(
        config,
        options.kjkey,
        options.rtSeq,
        attachmentKind
      )
  });
}

export async function downloadNoticeAttachments(
  client: MjuLmsSsoClient,
  config: LmsRuntimeConfig,
  options: DownloadNoticeAttachmentsOptions
): Promise<BulkDownloadedAttachmentResult> {
  const hasMultipleItems = options.articleIds.length > 1;
  const entries: AttachmentCollectionEntry[] = [];

  for (const articleId of options.articleIds) {
    const detail: NoticeDetailResult = await getCourseNotice(client, {
      userId: options.userId,
      password: options.password,
      kjkey: options.kjkey,
      articleId
    });
    entries.push({
      articleId,
      title: detail.title,
      attachments: detail.attachments,
      savedDir: resolveBulkOutputDir(
        options.outputDir,
        getNoticeFallbackDir(config, options.kjkey, articleId),
        articleId,
        hasMultipleItems
      )
    });
  }

  return downloadAttachmentCollections(client, {
    kind: "notice",
    kjkey: options.kjkey,
    entries
  });
}

export async function downloadMaterialAttachments(
  client: MjuLmsSsoClient,
  config: LmsRuntimeConfig,
  options: DownloadMaterialAttachmentsOptions
): Promise<BulkDownloadedAttachmentResult> {
  const hasMultipleItems = options.articleIds.length > 1;
  const entries: AttachmentCollectionEntry[] = [];

  for (const articleId of options.articleIds) {
    const detail: MaterialDetailResult = await getCourseMaterial(client, {
      userId: options.userId,
      password: options.password,
      kjkey: options.kjkey,
      articleId
    });
    entries.push({
      articleId,
      title: detail.title,
      attachments: detail.attachments,
      savedDir: resolveBulkOutputDir(
        options.outputDir,
        getMaterialFallbackDir(config, options.kjkey, articleId),
        articleId,
        hasMultipleItems
      )
    });
  }

  return downloadAttachmentCollections(client, {
    kind: "material",
    kjkey: options.kjkey,
    entries
  });
}

export async function downloadAssignmentAttachments(
  client: MjuLmsSsoClient,
  config: LmsRuntimeConfig,
  options: DownloadAssignmentAttachmentsOptions
): Promise<BulkDownloadedAttachmentResult> {
  const attachmentKind = options.attachmentKind ?? "prompt";
  const hasMultipleItems = options.rtSeqs.length > 1;
  const entries: AttachmentCollectionEntry[] = [];

  for (const rtSeq of options.rtSeqs) {
    const detail: AssignmentDetailResult = await getCourseAssignment(client, {
      userId: options.userId,
      password: options.password,
      kjkey: options.kjkey,
      rtSeq
    });
    entries.push({
      rtSeq,
      title: detail.title,
      attachmentKind,
      attachments: resolveAssignmentAttachments(detail, attachmentKind),
      savedDir: resolveBulkOutputDir(
        options.outputDir,
        getAssignmentFallbackDir(config, options.kjkey, rtSeq, attachmentKind),
        rtSeq,
        hasMultipleItems
      )
    });
  }

  return downloadAttachmentCollections(client, {
    kind: "assignment",
    kjkey: options.kjkey,
    attachmentKind,
    entries
  });
}
