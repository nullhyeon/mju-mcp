# Getting Started

이 문서는 이 저장소를 처음 실행할 때 필요한 최소 절차를 정리합니다.

## 1. 요구 사항

- Node.js 22 이상
- npm
- Windows 또는 macOS

Windows에서는 Windows Credential Manager, macOS에서는 Keychain을 사용합니다.

## 2. 설치

```bash
npm install
npm run check
npm run build
```

권장 순서는 `check -> build -> start` 입니다.

## 3. 인증 방식

지원하는 인증 방식은 저장 로그인입니다.

### 3.1 저장 로그인

가장 권장하는 방식입니다.

```bash
npm run auth:login -- --id YOUR_ID --password YOUR_PASSWORD
```

이 방식의 저장 위치는 다음과 같습니다.

- 아이디: `%LOCALAPPDATA%\\mju-mcp\\state\\profile.json`
- 비밀번호: Windows Credential Manager 또는 macOS Keychain
- LMS 세션: `%LOCALAPPDATA%\\mju-mcp\\state\\lms-session.json`
- MSI 세션: `%LOCALAPPDATA%\\mju-mcp\\state\\msi-session.json`
- UCheck 세션: `%LOCALAPPDATA%\\mju-mcp\\state\\ucheck-session.json`
- Library 세션: `%LOCALAPPDATA%\\mju-mcp\\state\\library-session.json`

상태 확인:

```bash
npm run auth:status
```

세션만 지우기:

```bash
npm run auth:logout
```

프로필, 세션, 비밀번호 모두 지우기:

```bash
npm run auth:forget
```

선택 환경 변수:

- `MJU_LMS_APP_DIR`
- `MJU_LMS_PROFILE_FILE`
- `MJU_LMS_SESSION_FILE`
- `MJU_LMS_MAIN_HTML_FILE`
- `MJU_LMS_COURSES_FILE`
- `MJU_LMS_DOWNLOADS_DIR`
- `MJU_LMS_CREDENTIAL_SERVICE_NAME`
- `MJU_LMS_USER_AGENT`
- `MJU_MSI_APP_DIR`
- `MJU_MSI_SESSION_FILE`
- `MJU_MSI_MAIN_HTML_FILE`
- `MJU_MSI_MENU_FILE`
- `MJU_MSI_USER_AGENT`
- `MJU_UCHECK_APP_DIR`
- `MJU_UCHECK_SESSION_FILE`
- `MJU_UCHECK_MAIN_HTML_FILE`
- `MJU_UCHECK_USER_AGENT`
- `MJU_LIBRARY_APP_DIR`
- `MJU_LIBRARY_SESSION_FILE`
- `MJU_LIBRARY_USER_AGENT`

## 4. 서버 실행

stdio MCP 서버 실행:

```bash
npm run start
```

개발 중 바로 실행:

```bash
npm run dev
```

## 5. 첫 확인 순서

추천하는 첫 확인 순서는 아래와 같습니다.

1. `npm run check`
2. `npm run build`
3. `npm run auth:status`
4. `npm run login:sso -- --id YOUR_ID --password YOUR_PASSWORD`
5. MCP client에서 `mju_lms_list_courses` 호출

## 6. 첫 tool 호출 예시

### LMS 강의 목록

```json
{
  "name": "mju_lms_list_courses",
  "arguments": {}
}
```

### MSI 시간표

```json
{
  "name": "mju_msi_get_timetable",
  "arguments": {}
}
```

### UCheck 출석현황

```json
{
  "name": "mju_ucheck_get_course_attendance",
  "arguments": {
    "course": "시스템클라우드보안"
  }
}
```

### Library 스터디룸 목록

```json
{
  "name": "mju_library_list_study_rooms",
  "arguments": {
    "campus": "자연"
  }
}
```

### Library 열람실 목록

```json
{
  "name": "mju_library_list_reading_rooms",
  "arguments": {
    "campus": "nature"
  }
}
```

## 7. 문제 해결

### 로그인은 되는데 이후 호출이 실패할 때

- `npm run auth:logout` 으로 LMS 세션을 비운 뒤 다시 시도합니다.
- MSI/UCheck/Library만 이상하면 각각의 세션 파일만 삭제해도 됩니다.

### 저장 로그인 정보가 꼬였을 때

```bash
npm run auth:forget
```

이후 다시 `auth:login` 을 수행합니다.

### TypeScript 검사에서 실패할 때

의존성이 빠졌거나 빌드 결과물이 오래된 경우가 많습니다.

```bash
npm install
npm run check
```

### 실데이터 검증 전에 확인할 것

- 실제 LMS/UCheck/MSI/Library 상태를 바꾸는 tool인지 확인합니다.
- LMS 제출/삭제는 반드시 승인 흐름을 확인합니다.
- 도서관 예약/수정/취소도 반드시 승인 흐름을 확인합니다.
- 테스트용 과목과 과제를 먼저 정해두는 편이 안전합니다.
