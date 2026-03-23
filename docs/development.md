# Development Guide

이 문서는 이 저장소에서 기능을 추가하거나 유지보수할 때의 작업 방식을 정리합니다.

## 1. 기본 명령

설치:

```bash
npm install
```

타입체크:

```bash
npm run check
```

빌드:

```bash
npm run build
```

서버 실행:

```bash
npm run start
```

개발 실행:

```bash
npm run dev
```

인증 CLI:

```bash
npm run auth:status
npm run auth:login -- --id YOUR_ID --password YOUR_PASSWORD
npm run auth:logout
npm run auth:forget
```

## 2. 추천 작업 프로세스

이 저장소에서 기능 추가는 아래 순서가 가장 안전합니다.

1. 계획 수립
2. 실제 서비스 구조 확인
3. 구현
4. 실데이터 테스트
5. 리뷰 및 검토
6. 수정
7. 문서 반영
8. 커밋

핵심은 “구현 전에 실제 시스템 호출 구조를 먼저 확인한다” 입니다.

## 3. 실데이터 검증 원칙

- 로그인 구조가 바뀔 수 있으니 실제 호출로 재검증합니다.
- 읽기 기능도 브라우저 화면과 JSON 응답을 대조하는 편이 안전합니다.
- 쓰기 기능은 실제 상태를 바꾸므로 반드시 승인 흐름을 유지합니다.
- 가능하면 대표 과목 / 대표 과제 / 대표 메뉴를 고정해 회귀 검증합니다.

## 4. 서비스별 구현 방식

### LMS

- HTML 파싱과 폼 기반 POST가 중심입니다.
- 강의 식별은 `course-resolver` 계층을 재사용합니다.
- 쓰기 기능은 승인 토큰을 사용합니다.

### MSI

- 로그인 체인과 메뉴 진입 계층이 중요합니다.
- 메뉴별 파서가 분리되는 편이 유지보수에 좋습니다.

### UCheck

- SPA 구조라서 URL보다 JSON API 호출 체인이 중요합니다.
- 화면 클릭 흐름은 내부 JSON 호출 재현으로 구현하는 편이 안정적입니다.

### Library

- 같은 계정을 쓰더라도 로그인 방식이 LMS SSO와 같다고 가정하면 안 됩니다.
- 먼저 실제 로그인 응답이 cookie 기반인지 token 기반인지 확인하는 편이 안전합니다.
- 스터디룸은 timeline, 이용 목적, 최소 인원 규칙을 함께 읽어야 합니다.
- 동행자 입력은 이름/학번을 내부 patron id 로 해석하는 보조 API까지 확인해야 합니다.
- 열람실은 room 목록, room 상세, seat 상세, 내 예약 목록 API가 각각 분리되어 있습니다.
- 열람실 예약은 preview 에서 좌석 규칙과 예약 가능 구간을 먼저 읽고, 실제 POST 오류 코드까지 함께 검증하는 편이 안전합니다.
- 열람실 입실 확인은 NFC/KIOSK 가 필요하므로 예약/취소와 체크인 자동화를 분리해서 보는 편이 좋습니다.

## 5. 문서 운영 원칙

현재 공개용 문서는 다음 파일을 기준으로 유지합니다.

- `README.md`
- `docs/getting-started.md`
- `docs/tool-reference-lms.md`
- `docs/tool-reference-msi.md`
- `docs/tool-reference-ucheck.md`
- `docs/tool-reference-library.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/security.md`

공개 문서 원칙:

- 현재 HEAD 기준으로 실제 지원하는 기능만 적습니다.
- 실계정 비밀번호, 세션 값, 장문의 원본 HTML, 민감한 스냅샷은 넣지 않습니다.
- 내부 작업 로그 성격 문서는 공개 문서와 분리합니다.

## 6. 커밋 원칙

- 커밋 메시지는 한국어 기준으로 맞추는 것을 권장합니다.
- 기능 단위로 묶어서 커밋합니다.
- unrelated change 는 가능한 한 같이 커밋하지 않습니다.

예:

- `feat: UCheck 출석현황 조회 tool 추가`
- `fix: MSI 로그인 판별 보강`
- `docs: 공개 문서 체계 정리`

## 7. 리뷰 포인트

코드 리뷰 시에는 다음을 우선 봅니다.

- 실제 시스템 구조와 맞는가
- 세션 재사용이 안전한가
- 강의 식별이 애매한 경우를 막는가
- 쓰기 기능에 승인/확인 장치가 있는가
- 실데이터 검증 기록이 남아 있는가
- 문서가 현재 동작과 맞는가

## 8. 새 기능 추가 체크리스트

- 서비스 로그인/세션 구조 확인
- 실제 API 또는 HTML 구조 확인
- 타입 정의 추가
- 서비스 계층 구현
- tool 계층 연결
- `npm run check`
- `npm run build`
- 실데이터 검증
- 문서 반영

## 9. 내부 메모성 문서

저장소에는 공개 문서 외에도 작업 메모, 실데이터 검증 기록, 세션 인계 기록 같은 내부 문서가 존재할 수 있습니다.

이 문서들은 유용하지만, 그대로 공개 기준 문서로 쓰기보다는 개발 참고 자료로 보는 편이 좋습니다.
