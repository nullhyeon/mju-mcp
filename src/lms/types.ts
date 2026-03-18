export interface DecodedResponse {
  statusCode: number;
  url: string;
  text: string;
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
