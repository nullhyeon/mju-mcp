# mju-mcp

`mju-mcp` 는 명지대학교 계열 서비스를 MCP tool로 노출하는 TypeScript 서버입니다.

현재 범위는 네 서비스로 나뉩니다.

- LMS: 강의, 공지, 과제, 자료, 온라인 학습, 첨부 다운로드, 집약형 요약, 과제 제출/수정/삭제
- MSI: 수강과목시간표, 현재 학기 수강성적, 성적이력, 졸업학점 조회
- UCheck: 과목별 출석현황 조회
- Library: 도서관 스터디룸 목록/상세 조회, 내 예약 조회, 예약/수정/취소, 열람실 목록/상세 조회, 좌석 예약 조회/예약/취소(임시배정까지)

읽기 기능이 중심이지만, LMS 과제 제출/수정/삭제와 도서관 스터디룸 예약/수정/취소처럼 실제 상태를 바꾸는 기능도 일부 지원합니다. 쓰기 tool은 모두 보수적인 승인 흐름을 거칩니다.

## 주요 특징

- 명지대 계열 통합 자격증명 재사용
- 저장 세션 재사용
- Windows Credential Manager 기반 저장 로그인
- stdio 기반 MCP 서버
- LMS 강의 식별 UX 개선
  - `course` 또는 `kjkey`
  - 같은 세션의 마지막 강의 기본값
- LMS 쓰기 tool 2단계 승인
  - `confirm=true`
  - `approvalToken`
- 도서관 스터디룸 동행자 이름/학번 -> 내부 patron id 자동 해석
- 도서관 열람실 좌석 목록/예약 가능 구간 조회
- LMS, MSI, UCheck, Library 세션 분리 저장

## 빠른 시작

### 1. 설치

```bash
npm install
npm run check
npm run build
```

### 2. 인증 준비

권장 방식은 Windows 저장 로그인입니다.

```bash
npm run auth:login -- --id YOUR_ID --password YOUR_PASSWORD
```

대안으로 환경 변수를 써도 됩니다.

- `MJU_LMS_USER_ID`
- `MJU_LMS_PASSWORD`

### 3. 서버 실행

```bash
npm run start
```

SSO 자체를 먼저 점검하고 싶으면:

```bash
npm run login:sso -- --id YOUR_ID --password YOUR_PASSWORD
```

## 문서

- [시작하기](docs/getting-started.md)
- [LMS Tool Reference](docs/tool-reference-lms.md)
- [MSI Tool Reference](docs/tool-reference-msi.md)
- [UCheck Tool Reference](docs/tool-reference-ucheck.md)
- [Library Tool Reference](docs/tool-reference-library.md)
- [아키텍처](docs/architecture.md)
- [개발 가이드](docs/development.md)
- [보안 가이드](docs/security.md)

## 현재 지원 tool 요약

### LMS

- `mju_lms_login_sso`
- `mju_lms_auth_status`
- `mju_lms_auth_login`
- `mju_lms_auth_logout`
- `mju_lms_auth_forget`
- `mju_lms_list_courses`
- `mju_lms_list_notices`
- `mju_lms_get_notice`
- `mju_lms_list_materials`
- `mju_lms_get_material`
- `mju_lms_list_assignments`
- `mju_lms_get_assignment`
- `mju_lms_check_assignment_submission`
- `mju_lms_submit_assignment`
- `mju_lms_delete_assignment_submission`
- `mju_lms_list_online_weeks`
- `mju_lms_get_online_week`
- `mju_lms_download_attachment`
- `mju_lms_get_unsubmitted_assignments`
- `mju_lms_get_due_assignments`
- `mju_lms_get_action_items`
- `mju_lms_get_unread_notices`
- `mju_lms_get_incomplete_online_weeks`

### MSI

- `mju_msi_get_timetable`
- `mju_msi_get_current_term_grades`
- `mju_msi_get_grade_history`
- `mju_msi_get_graduation_requirements`

### UCheck

- `mju_ucheck_get_course_attendance`

### Library

- `mju_library_list_study_rooms`
- `mju_library_get_study_room`
- `mju_library_list_room_reservations`
- `mju_library_reserve_study_room`
- `mju_library_update_study_room_reservation`
- `mju_library_cancel_study_room_reservation`
- `mju_library_list_reading_rooms`
- `mju_library_get_reading_room`
- `mju_library_list_seat_reservations`
- `mju_library_reserve_seat`
- `mju_library_cancel_seat_reservation`

## 저장 위치

현재 코드의 기본 앱 데이터 디렉터리와 세션 파일 prefix 도 `mju-mcp` 기준으로 통일되어 있습니다.

기본 앱 데이터 루트:

- `%LOCALAPPDATA%\\mju-mcp`

대표 저장 항목:

- `state/profile.json`
- `state/lms-session.json`
- `state/msi-session.json`
- `state/ucheck-session.json`
- `state/library-session.json`
- `snapshots/`
- `downloads/`

## 안전장치

- LMS 제출/수정/삭제는 `confirm=true` 와 승인 토큰이 모두 필요합니다.
- 도서관 스터디룸 예약/수정/취소와 열람실 좌석 예약/취소도 `confirm=true` 와 승인 토큰이 모두 필요합니다.
- 도서관 열람실은 좌석 예약 후 `임시배정` 까지만 자동화하고, 실제 입실 확인은 NFC 기반이라 현재 범위에 포함하지 않습니다.
- 문서와 커밋에는 실계정 비밀번호, 세션 파일, 스냅샷 HTML을 넣지 않습니다.
- 실데이터 검증은 가능하지만, 운영 상태를 바꾸는 호출은 항상 신중하게 수행해야 합니다.

## 상태 메모

이 저장소는 더 이상 “초기 부트스트랩 단계”가 아닙니다. LMS, MSI, UCheck, Library 각각에 대해 실제 데이터를 기준으로 반복 검증된 기능을 제공하는 실사용 중심 MCP 서버입니다.
