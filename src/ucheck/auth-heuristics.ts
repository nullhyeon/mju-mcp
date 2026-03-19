import type { DecodedResponse } from "../lms/types.js";

const LOGIN_SUCCESS_MARKERS = [
  'data-ng-app="ucheck"',
  "/system/menu/login/select.json?as=",
  "/lecture/lecture/select.json",
  "Location-Based",
  "Smart Attendance Check-in System"
];

function looksLikeLoginPage(url: string, text: string): boolean {
  const lowerText = text.toLowerCase();

  return (
    url.includes("sso/auth") ||
    lowerText.includes("signin-form") ||
    lowerText.includes("integrated login") ||
    text.includes("통합로그인")
  );
}

export function looksLoggedIn(
  response: Pick<DecodedResponse, "url" | "text">
): boolean {
  const url = response.url.toLowerCase();
  const text = response.text;
  const lowerText = text.toLowerCase();

  if (looksLikeLoginPage(url, text)) {
    return false;
  }

  return LOGIN_SUCCESS_MARKERS.some((marker) =>
    lowerText.includes(marker.toLowerCase())
  );
}
