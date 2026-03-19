export interface DecodedResponse {
  statusCode: number;
  url: string;
  text: string;
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface BinaryResponse {
  statusCode: number;
  url: string;
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface SsoForm {
  action: string;
  c_r_t: string;
  publicKey: string;
}

export interface CourseCandidate {
  title: string;
  href: string;
}

export interface CourseTermRef {
  year: number;
  term: number;
  key: string;
}

export interface CourseTermSummary extends CourseTermRef {
  order: number;
  sourceLabel?: string;
}

export interface CourseSummary {
  kjkey: string;
  title: string;
  courseCode: string;
  professor: string;
  year: number;
  term: number;
  termLabel: string;
  classroomLabel: string;
  enterPath: string;
  coverImageUrl?: string;
}

export interface CourseListResult {
  mode: "taken";
  search: string;
  requested: {
    year?: number;
    term?: number;
    allTerms: boolean;
  };
  availableTerms: CourseTermSummary[];
  selectedTerms: CourseTermSummary[];
  courses: CourseSummary[];
}

export interface AttachmentRequestParams {
  userId: string;
  kjkey: string;
  pfStFlag: string;
  contentSeq: string;
  turnitinSeq?: string;
}

export interface LmsAttachment {
  name: string;
  downloadUrl: string;
  previewUrl?: string;
  sizeLabel?: string;
  fileType?: string;
}

export interface DownloadedAttachmentFile {
  fileName: string;
  savedPath: string;
  finalUrl: string;
  sourceUrl: string;
  byteLength: number;
  statusCode: number;
  contentType?: string;
  contentDisposition?: string;
}

export interface ClassroomContext {
  kjkey: string;
  courseTitle?: string;
  mainUrl: string;
  mainHtml: string;
}

export interface NoticeSummary {
  articleId: number;
  title: string;
  previewText: string;
  postedAt?: string;
  viewCount?: number;
  isUnread: boolean;
  isExpired: boolean;
}

export interface NoticeListResult {
  kjkey: string;
  courseTitle?: string;
  search: string;
  page: number;
  pageSize: number;
  start: number;
  total: number;
  totalPages: number;
  notices: NoticeSummary[];
}

export interface NoticeDetailResult {
  kjkey: string;
  courseTitle?: string;
  articleId: number;
  title: string;
  author?: string;
  postedAt?: string;
  expireAt?: string;
  viewCount?: number;
  bodyHtml: string;
  bodyText: string;
  contentSeq?: string;
  attachments: LmsAttachment[];
}

export interface AssignmentSummary {
  rtSeq: number;
  title: string;
  week?: number;
  weekLabel?: string;
  statusLabel?: string;
  statusText?: string;
  isSubmitted: boolean;
}

export interface AssignmentListResult {
  kjkey: string;
  courseTitle?: string;
  week?: number;
  assignments: AssignmentSummary[];
}

export interface AssignmentSubmissionInfo {
  status?: string;
  submittedAt?: string;
  text?: string;
  contentSeq?: string;
  attachments: LmsAttachment[];
}

export interface AssignmentDetailResult {
  kjkey: string;
  courseTitle?: string;
  rtSeq: number;
  title: string;
  submissionMethod?: string;
  submissionFormat?: string;
  openAt?: string;
  dueAt?: string;
  points?: string;
  scoreVisibility?: string;
  bodyHtml: string;
  bodyText: string;
  contentSeq?: string;
  attachments: LmsAttachment[];
  submission?: AssignmentSubmissionInfo;
}

export type AssignmentSubmitMode = "initial-submit" | "update-submit";

export interface AssignmentSubmitPopupSpec {
  mode: AssignmentSubmitMode;
  submitPopupUrl: string;
  submitButtonLabel?: string;
  requiresTextInput: boolean;
  textFieldName?: string;
  hasFilePicker: boolean;
  uploadUrl?: string;
  uploadPath?: string;
  uploadPfStFlag?: string;
  submitCheckUrl?: string;
  submitCheckDiv?: string;
  submitUrl?: string;
  submitContentSeq?: string;
  existingFilesContentSeq?: string;
  existingTextHtml?: string;
  existingTextText?: string;
}

export interface AssignmentDeleteSpec {
  hasDeleteButton: boolean;
  deleteButtonLabel?: string;
  submitCheckUrl?: string;
  submitCheckDiv?: string;
  deleteUrl?: string;
  deleteContentSeq?: string;
}

export interface AssignmentSubmitDraftFileCheck {
  path: string;
  fileName: string;
  exists: boolean;
  sizeBytes?: number;
  withinMaxFileSize?: boolean;
  blockingReason?: string;
}

export interface AssignmentExistingAttachment {
  fileSeq: string;
  name: string;
  sizeBytes?: number;
  contentSeq?: string;
}

export interface AssignmentSubmitCheckResult {
  kjkey: string;
  rtSeq: number;
  courseTitle?: string;
  title: string;
  submissionFormat?: string;
  dueAt?: string;
  summaryStatusLabel?: string;
  summaryStatusText?: string;
  submissionMode: AssignmentSubmitMode;
  alreadySubmitted: boolean;
  existingSubmissionStatus?: string;
  existingSubmissionHtml?: string;
  existingSubmissionText?: string;
  existingAttachments: AssignmentExistingAttachment[];
  hasSubmitButton: boolean;
  submitButtonLabel?: string;
  submitPopupUrl?: string;
  requiresTextInput: boolean;
  textFieldName?: string;
  hasFilePicker: boolean;
  uploadUrl?: string;
  uploadPath?: string;
  uploadPfStFlag?: string;
  submitCheckUrl?: string;
  submitCheckDiv?: string;
  submitUrl?: string;
  submitContentSeq?: string;
  hasDeleteButton: boolean;
  deleteButtonLabel?: string;
  deleteSubmitCheckUrl?: string;
  deleteSubmitCheckDiv?: string;
  deleteUrl?: string;
  deleteContentSeq?: string;
  uploadLimitMessage?: string;
  maxFileSizeLabel?: string;
  maxFileSizeBytes?: number;
  providedTextLength: number;
  effectiveTextLength: number;
  usedExistingTextFallback: boolean;
  providedTextSatisfiesRequirement: boolean;
  localFiles: AssignmentSubmitDraftFileCheck[];
  canProceed: boolean;
  blockingReasons: string[];
  warnings: string[];
}

export interface AssignmentUploadedFile {
  path: string;
  fileName: string;
  sizeBytes: number;
  fileSeq: string;
}

export interface AssignmentSubmitResult {
  kjkey: string;
  rtSeq: number;
  title: string;
  courseTitle?: string;
  submissionFormat?: string;
  submissionMode: AssignmentSubmitMode;
  submittedTextLength: number;
  uploadedFiles: AssignmentUploadedFile[];
  submitUrl: string;
  verified: boolean;
  alreadySubmittedBeforeSubmit: boolean;
  finalSubmissionStatus?: string;
  finalSubmittedAt?: string;
  finalSubmissionText?: string;
  finalSubmissionAttachmentCount?: number;
  warnings: string[];
}

export interface AssignmentDeleteResult {
  kjkey: string;
  rtSeq: number;
  title: string;
  courseTitle?: string;
  deleteUrl: string;
  verified: boolean;
  hadSubmission: boolean;
  finalHasSubmission: boolean;
  finalHasSubmitButton: boolean;
  warnings: string[];
}

export interface ActivityQnaTarget {
  menuId: string;
  articleId: number;
  subArticleId?: string;
}

export interface MaterialSummary {
  articleId: number;
  title: string;
  week?: number;
  weekLabel?: string;
  attachmentCount?: number;
}

export interface MaterialListResult {
  kjkey: string;
  courseTitle?: string;
  week?: number;
  materials: MaterialSummary[];
}

export interface MaterialDetailResult {
  kjkey: string;
  courseTitle?: string;
  articleId: number;
  title: string;
  openAt?: string;
  author?: string;
  viewCount?: number;
  bodyHtml: string;
  bodyText: string;
  contentSeq?: string;
  attachments: LmsAttachment[];
  qnaTarget?: ActivityQnaTarget;
}

export interface OnlineWeekSummary {
  lectureWeeks: number;
  title: string;
  week?: number;
  weekLabel?: string;
  statusLabel?: string;
  statusText?: string;
}

export interface OnlineWeekListResult {
  kjkey: string;
  courseTitle?: string;
  weeks: OnlineWeekSummary[];
}

export interface OnlineLearningItem {
  linkSeq: number;
  title: string;
  progressPercent?: number;
  inPeriodProgressPercent?: number;
  outOfPeriodProgressPercent?: number;
  learningTime?: string;
  attendanceTime?: string;
  qnaCount?: number;
  stampCount?: number;
  thumbnailUrl?: string;
}

export interface OnlineLearningLaunchForm {
  action: string;
  lectureWeeks: number;
  kjkey: string;
  kjLectType?: string;
}

export interface OnlineWeekDetailResult {
  kjkey: string;
  courseTitle?: string;
  lectureWeeks: number;
  title?: string;
  week?: number;
  weekLabel?: string;
  statusLabel?: string;
  statusText?: string;
  attendanceLabel?: string;
  studyPeriod?: string;
  warningMessages: string[];
  launchForm: OnlineLearningLaunchForm;
  items: OnlineLearningItem[];
}

export interface LoginSnapshotResult {
  loggedIn: boolean;
  usedSavedSession: boolean;
  mainFinalUrl: string;
  cookieCount: number;
  courseCandidatesCount: number;
  sessionPath: string;
  mainHtmlPath: string;
  coursesPath: string;
}
