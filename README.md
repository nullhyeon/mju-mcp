# myongji-lms-mcp

명지대학교 LMS를 감싸는 read-only MCP 서버 프로젝트입니다.

## 현재 상태

현재까지 구현된 범위는 다음과 같습니다.

- TypeScript 기반 MCP 서버 골격
- 명지대 LMS SSO 로그인 포팅
- 세션 저장 및 세션 재사용
- stdio 기반 MCP 서버 부트스트랩
- 첫 번째 read-only tool: `mju_lms_list_courses`

즉 지금은 "로그인 가능 여부를 확인하는 단계"를 넘어서,
실제 MCP tool을 하나씩 붙여 나갈 수 있는 상태입니다.

## 사용 기술

- MCP 서버 SDK: `@modelcontextprotocol/sdk` v1.x
- 언어: TypeScript
- HTTP/세션: `got` + `tough-cookie`
- HTML 파싱: `cheerio`
- 스키마 검증: `zod`

현재는 안정적인 SDK 라인인 v1.x를 기준으로 구현하고 있습니다.

## 디렉터리 구조

- `src/index.ts`: stdio MCP 서버 진입점
- `src/cli/login-sso.ts`: SSO 로그인 단독 검증용 CLI
- `src/lms/`: 명지대 LMS 로그인, 세션, 파서, 서비스
- `src/mcp/`: MCP 서버 생성과 앱 컨텍스트
- `src/tools/`: MCP tool 등록

## 현재 구현된 tool

### `mju_lms_list_courses`

정규 수강과목 목록을 조회합니다.

지원 범위:

- 기본값: 최신 학기 수강과목
- 특정 학기 조회: `year`, `term`
- 전체 학기 조회: `allTerms`
- 검색어 필터: `search`

반환 정보:

- 학기 목록
- 선택된 학기
- 강의명
- 과목코드
- 교수명
- `KJKEY`
- 강의실 진입 경로

## 빠른 실행

```bash
npm install
npm run check
npm run build
```

SSO 로그인 확인:

```bash
npm run login:sso -- --id YOUR_ID --password YOUR_PASSWORD
npm run login:sso -- --fresh-login --id YOUR_ID --password YOUR_PASSWORD
```

MCP 서버 실행:

```bash
npm run start
```

## 환경 변수

- `MJU_LMS_USER_ID`
- `MJU_LMS_PASSWORD`
- `MJU_LMS_SESSION_FILE`
- `MJU_LMS_MAIN_HTML_FILE`
- `MJU_LMS_COURSES_FILE`

## 다음 작업

다음 우선순위는 아래 순서가 자연스럽습니다.

1. `공지` tool 추가
2. `과제` tool 추가
3. `자료 활동` tool 추가
4. `온라인 학습 메타` tool 추가
