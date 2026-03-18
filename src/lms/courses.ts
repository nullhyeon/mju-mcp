import { load } from "cheerio";

import { LMS_BASE } from "./constants.js";
import type {
  CourseListResult,
  CourseSummary,
  CourseTermSummary
} from "./types.js";
import { MjuLmsSsoClient } from "./sso-client.js";

const REGULAR_REGISTER_FORM_URL = `${LMS_BASE}/ilos/main/rg/regular_register_list_form.acl`;
const REGULAR_REGISTER_LIST_URL = `${LMS_BASE}/ilos/main/rg/regular_register_list.acl`;
const ENTER_CLASSROOM_PATH = "/ilos/cls/st/co/eclass_room2.acl";

export interface ListCoursesOptions {
  userId: string;
  password: string;
  year?: number;
  term?: number;
  search?: string;
  allTerms?: boolean;
}

function uniqueTerms(terms: CourseTermSummary[]): CourseTermSummary[] {
  const seen = new Set<string>();
  return terms.filter((term) => {
    if (seen.has(term.key)) {
      return false;
    }

    seen.add(term.key);
    return true;
  });
}

export function parseAvailableTermsFromCourseForm(html: string): CourseTermSummary[] {
  const matches = html.matchAll(/YearInfo\[(\d+)\]\s*=\s*"(\d+)\^(\d+)"/g);
  const terms: CourseTermSummary[] = [];

  for (const match of matches) {
    const order = Number.parseInt(match[1] ?? "", 10);
    const year = Number.parseInt(match[2] ?? "", 10);
    const term = Number.parseInt(match[3] ?? "", 10);

    if (
      Number.isNaN(order) ||
      Number.isNaN(year) ||
      Number.isNaN(term)
    ) {
      continue;
    }

    terms.push({
      order,
      year,
      term,
      key: `${year}-${term}`
    });
  }

  return uniqueTerms(terms);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractKjkey(onclickValue: string | undefined): string | null {
  if (!onclickValue) {
    return null;
  }

  const match = onclickValue.match(/eclassRoom\('([^']+)'/);
  return match?.[1] ?? null;
}

function extractCoverImageUrl(styleValue: string | undefined): string | undefined {
  if (!styleValue) {
    return undefined;
  }

  const match = styleValue.match(/background-image:\s*url\(([^)]+)\)/i);
  const rawUrl = match?.[1]?.replace(/^['"]|['"]$/g, "");
  if (!rawUrl) {
    return undefined;
  }

  return new URL(rawUrl, LMS_BASE).toString();
}

export function parseCoursesFromRegisterList(
  html: string,
  termRef: CourseTermSummary
): CourseSummary[] {
  const $ = load(html);
  const parsedTermLabel =
    normalizeText($(".year_info").first().text()) ||
    `${termRef.year}-${termRef.term}`;
  const courses: CourseSummary[] = [];

  $("ul.main_card_list > li").each((_, element) => {
    const item = $(element);
    const title = normalizeText(item.find(".card_title").first().text());
    const courseCode = normalizeText(item.find(".card_info").first().text());
    const professor = normalizeText(item.find(".card_text").first().text());
    const enterLink = item.find('a[onclick*="eclassRoom("]').first();
    const onclickValue = enterLink.attr("onclick");
    const kjkey = extractKjkey(onclickValue);

    if (!title || !courseCode || !professor || !kjkey) {
      return;
    }

    const course: CourseSummary = {
      kjkey,
      title,
      courseCode,
      professor,
      year: termRef.year,
      term: termRef.term,
      termLabel: parsedTermLabel,
      classroomLabel: normalizeText(enterLink.text()) || "강의실",
      enterPath: ENTER_CLASSROOM_PATH
    };

    const coverImageUrl = extractCoverImageUrl(
      item.find(".card_background_cover").attr("style")
    );
    if (coverImageUrl) {
      course.coverImageUrl = coverImageUrl;
    }

    courses.push(course);
  });

  return courses;
}

function selectTerms(
  terms: CourseTermSummary[],
  options: ListCoursesOptions
): CourseTermSummary[] {
  if (options.year || options.term) {
    return terms.filter((term) => {
      if (options.year && term.year !== options.year) {
        return false;
      }

      if (options.term && term.term !== options.term) {
        return false;
      }

      return true;
    });
  }

  if (options.allTerms) {
    return terms;
  }

  return terms.slice(0, 1);
}

export async function listRegularTakenCourses(
  client: MjuLmsSsoClient,
  options: ListCoursesOptions
): Promise<CourseListResult> {
  await client.ensureAuthenticated(options.userId, options.password);

  const formPage = await client.getPage(REGULAR_REGISTER_FORM_URL);
  const availableTerms = parseAvailableTermsFromCourseForm(formPage.text);
  const selectedTerms = selectTerms(availableTerms, options);
  const search = options.search?.trim() ?? "";
  const courses: CourseSummary[] = [];

  for (const termRef of selectedTerms) {
    const listPage = await client.postForm(REGULAR_REGISTER_LIST_URL, {
      YEAR: String(termRef.year),
      TERM: String(termRef.term),
      SCH_VALUE: search,
      encoding: "utf-8"
    });

    courses.push(...parseCoursesFromRegisterList(listPage.text, termRef));
  }

  return {
    mode: "taken",
    search,
    requested: {
      ...(options.year ? { year: options.year } : {}),
      ...(options.term ? { term: options.term } : {}),
      allTerms: options.allTerms ?? false
    },
    availableTerms,
    selectedTerms,
    courses
  };
}
