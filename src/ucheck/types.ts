export interface UcheckYearTerm {
  lectureYear: number;
  lectureTerm: number;
}

export interface UcheckAccountInfo {
  accountId: string;
  accountRole: string;
  name: string;
  studentNo?: string;
  baseYearTerm: UcheckYearTerm;
  availableYearTerms: UcheckYearTerm[];
}

export interface UcheckLectureSummary {
  lectureNo: number;
  lectureYear: number;
  lectureTerm: number;
  courseCode: string;
  courseTitle: string;
  classCode?: string | undefined;
  professor?: string | undefined;
  department?: string | undefined;
  scheduleSummary?: string | undefined;
}

export interface UcheckAttendanceSummary {
  attendedCount: number;
  tardyCount: number;
  earlyLeaveCount: number;
  absentCount: number;
}

export interface UcheckAttendanceSession {
  week: number;
  classNo: number;
  sessionLabel: string;
  date?: string | undefined;
  dateLabel?: string | undefined;
  timeRange?: string | undefined;
  classroom?: string | undefined;
  isPast: boolean;
  statusCode?: string | undefined;
  statusLabel?: string | undefined;
  attendAt?: string | undefined;
  leaveAt?: string | undefined;
}

export interface UcheckCourseAttendanceResult {
  studentNo?: string;
  studentName: string;
  resolvedBy:
    | "lecture-no"
    | "course-title"
    | "course-code"
    | "course-search";
  course: UcheckLectureSummary;
  summary: UcheckAttendanceSummary;
  totalSessions: number;
  completedSessions: number;
  sessions: UcheckAttendanceSession[];
}
