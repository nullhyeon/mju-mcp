# LMS Tool Reference

이 문서는 현재 공개된 LMS MCP tool의 범위와 사용 규칙을 정리합니다.

## 1. 공통 규칙

### 1.1 강의 식별

대부분의 LMS 강의 관련 tool은 아래 입력을 지원합니다.

- `course`: 강의명, 과목코드, 또는 `KJKEY`
- `kjkey`: 기존 직접 입력 방식

해석 순서:

1. `kjkey` 가 있으면 그대로 사용
2. `course` 가 `KJKEY` 형식이면 그대로 사용
3. `course` 가 강의명 또는 과목코드와 정확히 맞으면 최신 학기에서 자동 선택
4. 최신 학기에서 후보가 1개만 남는 부분 검색 결과도 자동 선택
5. 최신 학기에서 못 찾으면 전체 학기로 재검색
6. 전체 학기에서도 후보가 여러 개면 자동 실행하지 않고 에러를 반환
7. 둘 다 없으면 같은 세션의 마지막 강의를 기본값으로 사용

### 1.2 도구 간 강의 컨텍스트 공유

조회 tool은 같은 세션에서 마지막으로 사용한 강의를 이어받습니다.

예:

1. `mju_lms_list_notices(course="캡스톤디자인")`
2. `mju_lms_list_assignments({})`

두 번째 호출은 같은 세션이면 캡스톤디자인을 기본 강의로 사용합니다.

### 1.3 쓰기 기능 승인 흐름

실제 상태를 바꾸는 tool은 보수적으로 동작합니다.

- `mju_lms_submit_assignment`
- `mju_lms_delete_assignment_submission`

공통 규칙:

1. `confirm=true` 가 필요합니다.
2. 첫 호출은 `approval-required` 와 `approvalToken` 을 반환합니다.
3. 같은 세션에서 같은 입력으로 `approvalToken` 을 넣어 다시 호출해야 실제 실행됩니다.

## 2. 인증과 세션

| Tool | 용도 | 핵심 입력 |
| --- | --- | --- |
| `mju_lms_login_sso` | SSO 자체 점검과 스냅샷 저장 | `userId`, `password`, `freshLogin?` |
| `mju_lms_auth_status` | 저장 로그인 상태 조회 | 없음 |
| `mju_lms_auth_login` | 저장 로그인 생성 | `userId`, `password` |
| `mju_lms_auth_logout` | 저장 세션만 삭제 | 없음 |
| `mju_lms_auth_forget` | 저장 로그인 전체 삭제 | 없음 |

## 3. 강의

| Tool | 용도 | 핵심 입력 |
| --- | --- | --- |
| `mju_lms_list_courses` | 정규 수강과목 목록 조회 | `year?`, `term?`, `search?`, `allTerms?` |

반환 핵심:

- 학기 목록
- 선택된 학기
- 강의명
- 과목코드
- 교수명
- `KJKEY`

## 4. 공지

| Tool | 용도 | 핵심 입력 |
| --- | --- | --- |
| `mju_lms_list_notices` | 공지 목록 조회 | `course?`, `kjkey?`, `page?`, `pageSize?`, `search?` |
| `mju_lms_get_notice` | 공지 상세 조회 | `course?`, `kjkey?`, `articleId` |

반환 핵심:

- 목록: `articleId`, 제목, 미리보기, 게시일, 조회수, `isUnread`
- 상세: 본문, 첨부파일, 작성자, 게시일, 만료일

## 5. 자료

| Tool | 용도 | 핵심 입력 |
| --- | --- | --- |
| `mju_lms_list_materials` | 자료 활동 목록 조회 | `course?`, `kjkey?`, `week?` |
| `mju_lms_get_material` | 자료 활동 상세 조회 | `course?`, `kjkey?`, `articleId` |

반환 핵심:

- 목록: `articleId`, 제목, 주차, 첨부 수
- 상세: 본문, 첨부 목록, 조회수, `qnaTarget?`

## 6. 과제 읽기

| Tool | 용도 | 핵심 입력 |
| --- | --- | --- |
| `mju_lms_list_assignments` | 과제 목록 조회 | `course?`, `kjkey?`, `week?` |
| `mju_lms_get_assignment` | 과제 상세 조회 | `course?`, `kjkey?`, `rtSeq` |

반환 핵심:

- 목록: `rtSeq`, 제목, 주차, 상태, 제출 흔적
- 상세: 본문, 마감일, 제출방식, 첨부, 제출 요약

## 7. 과제 쓰기

| Tool | 용도 | 핵심 입력 |
| --- | --- | --- |
| `mju_lms_check_assignment_submission` | 제출 가능 여부와 제출 스펙 확인 | `course?`, `kjkey?`, `rtSeq`, `text?`, `textFilePath?`, `localFiles?` |
| `mju_lms_submit_assignment` | 초기 제출 또는 수정 제출 실행 | `course?`, `kjkey?`, `rtSeq`, `confirm`, `approvalToken?`, `text?`, `textFilePath?`, `localFiles?` |
| `mju_lms_delete_assignment_submission` | 제출 내역 삭제 | `course?`, `kjkey?`, `rtSeq`, `confirm`, `approvalToken?` |

### 7.1 제출 전 확인 tool

`mju_lms_check_assignment_submission` 은 실제 제출을 하지 않습니다.

확인 가능한 것:

- 초기 제출인지 수정 제출인지
- 제출 버튼 / 삭제 버튼 존재 여부
- 차단 사유
- 경고
- 기존 첨부 수
- 새로 올릴 로컬 파일 상태

### 7.2 제출 실행 tool

`mju_lms_submit_assignment` 는 초기 제출과 수정 제출을 모두 담당합니다.

중요:

- `confirm=true` 없이는 실행되지 않습니다.
- 첫 호출은 미리보기만 하고 승인 토큰을 돌려줍니다.
- 둘째 호출에서 실제 제출 또는 수정 제출이 수행됩니다.

### 7.3 삭제 실행 tool

`mju_lms_delete_assignment_submission` 도 같은 2단계 승인 흐름을 사용합니다.

## 8. 온라인 학습

| Tool | 용도 | 핵심 입력 |
| --- | --- | --- |
| `mju_lms_list_online_weeks` | 온라인 학습 주차 목록 | `course?`, `kjkey?` |
| `mju_lms_get_online_week` | 주차별 학습 메타 조회 | `course?`, `kjkey?`, `lectureWeeks` |

반환 핵심:

- 주차 목록
- 진행 상태 텍스트
- 학습 아이템 목록
- 아이템별 진행률
- launch form 메타

## 9. 첨부 다운로드

| Tool | 용도 | 핵심 입력 |
| --- | --- | --- |
| `mju_lms_download_attachment` | 첨부파일을 로컬에 저장 | `kind`, `course?`, `kjkey?`, `articleId?`, `rtSeq?`, `attachmentIndex?`, `attachmentKind?`, `outputDir?` |
| `mju_lms_download_attachments_bulk` | 여러 항목의 첨부파일을 한 번에 로컬 저장 | `kind`, `course?`, `kjkey?`, `articleId?`/`articleIds?`, `rtSeq?`/`rtSeqs?`, `attachmentKind?`, `outputDir?` |

지원 대상:

- `kind: "notice"`
- `kind: "material"`
- `kind: "assignment"` + `attachmentKind: "prompt" | "submission"`

bulk tool 규칙:

- `notice`, `material` 은 `articleId` 또는 `articleIds` 를 사용합니다.
- `assignment` 는 `rtSeq` 또는 `rtSeqs` 를 사용합니다.
- 여러 항목을 한 번에 받으면 `outputDir/<item-id>/` 하위로 나눠 저장합니다.
- 첨부가 없는 항목은 전체 실패 대신 경고로 반환합니다.

## 10. 집약형 요약

| Tool | 용도 | 핵심 입력 |
| --- | --- | --- |
| `mju_lms_get_course_digest` | 한 강의의 공지/자료/과제/온라인 상태 종합 | `course?`, `kjkey?`, `days?`, `limit?` |
| `mju_lms_get_unsubmitted_assignments` | 미제출 과제만 모아보기 | `course?`, `kjkey?`, `allCourses?` |
| `mju_lms_get_due_assignments` | 마감 임박 과제 모아보기 | `course?`, `kjkey?`, `allCourses?`, `days?`, `includeSubmitted?` |
| `mju_lms_get_action_items` | 미제출/마감임박/안읽은공지/미수강학습 종합 | `course?`, `kjkey?`, `allCourses?`, `days?` |
| `mju_lms_get_unread_notices` | 안읽은 공지 모아보기 | `course?`, `kjkey?`, `allCourses?` |
| `mju_lms_get_incomplete_online_weeks` | 미수강 온라인 학습 모아보기 | `course?`, `kjkey?`, `allCourses?` |

`allCourses=true` 는 전체 이력이 아니라 최신 학기의 모든 강의를 묶는 의미입니다.

`mju_lms_get_course_digest` 반환 핵심:

- 안읽은 공지 수와 일부 항목
- 최근 자료 수와 일부 항목
- 미제출 과제 수와 일부 항목
- 지정 일수 이내 마감 과제 수와 일부 항목
- 미수강 온라인 학습 수와 일부 항목

## 11. 대표 예시

### 공지 목록

```json
{
  "name": "mju_lms_list_notices",
  "arguments": {
    "course": "캡스톤디자인"
  }
}
```

### 과제 상세

```json
{
  "name": "mju_lms_get_assignment",
  "arguments": {
    "course": "캡스톤디자인",
    "rtSeq": 9945057
  }
}
```

### 강의 종합 요약

```json
{
  "name": "mju_lms_get_course_digest",
  "arguments": {
    "course": "캡스톤디자인",
    "days": 7,
    "limit": 5
  }
}
```

### 첨부 bulk 다운로드

```json
{
  "name": "mju_lms_download_attachments_bulk",
  "arguments": {
    "kind": "material",
    "course": "캡스톤디자인",
    "articleIds": [9924534, 9929323]
  }
}
```

### 제출 미리보기

```json
{
  "name": "mju_lms_submit_assignment",
  "arguments": {
    "course": "캡스톤디자인",
    "rtSeq": 9945057,
    "text": "제출합니다.",
    "confirm": true
  }
}
```

### 제출 실행

```json
{
  "name": "mju_lms_submit_assignment",
  "arguments": {
    "course": "캡스톤디자인",
    "rtSeq": 9945057,
    "text": "제출합니다.",
    "confirm": true,
    "approvalToken": "TOKEN_FROM_PREVIEW"
  }
}
```
