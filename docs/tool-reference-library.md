# Library Tool Reference

이 문서는 현재 공개된 명지대학교 도서관 MCP tool 범위를 정리합니다.

## 1. 범위

현재 도서관 기능은 두 묶음으로 나뉩니다.

- 스터디룸 예약
- 열람실 좌석 조회 / 예약

Tool:

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

## 2. 인증과 세션

도서관도 같은 학번/비밀번호를 사용하지만, 구현 방식은 LMS SSO 폼 암호화와 다릅니다.

- 자격증명 자체는 LMS와 같은 우선순위로 해석합니다.
- 실제 로그인 호출은 `POST https://lib.mju.ac.kr/pyxis-api/api/login` 입니다.
- 로그인 후 `Pyxis-Auth-Token` 헤더를 사용합니다.
- 기본 세션 파일: `%LOCALAPPDATA%\\mju-mcp\\state\\library-session.json`

즉 “같은 계정”은 맞지만, 코드 구조는 `token-based JSON API` 에 더 가깝습니다.

## 3. 스터디룸 tool

### `mju_library_list_study_rooms`

캠퍼스/날짜 기준으로 예약 가능한 스터디룸 목록을 조회합니다.

입력:

- `campus?`: `인문`, `자연`, `all`, `humanities`, `nature`
- `date?`: 예약 날짜

반환 핵심:

- 사용자 정보
- 캠퍼스별 선택 날짜
- 예약 가능 날짜
- 층 목록
- 방 목록

### `mju_library_get_study_room`

특정 스터디룸의 상세 타임라인을 조회합니다.

입력:

- `roomId`
- `date`
- `beginTime?`

반환 핵심:

- 이용 목적 목록
- 인원 규칙
- 최소/최대 이용 시간
- 타임라인
- 사용 불가 구간
- 예약 가능 시작 시각
- `beginTime` 지정 시 예약 가능 종료 시각

### `mju_library_list_room_reservations`

현재 로그인한 사용자의 스터디룸 예약 목록을 조회합니다.

반환 핵심:

- 예약 id
- 방 이름
- 캠퍼스
- 예약 시간
- 상태
- 동행자 수

### 쓰기 tool

스터디룸 쓰기 tool 은 모두 2단계 승인 흐름을 사용합니다.

1. `confirm=true` 로 첫 호출
2. 서버가 preview + `approvalToken` 반환
3. 같은 세션에서 `approvalToken` 포함 재호출
4. fingerprint 가 일치할 때만 실제 쓰기 실행

적용 대상:

- `mju_library_reserve_study_room`
- `mju_library_update_study_room_reservation`
- `mju_library_cancel_study_room_reservation`

## 4. 열람실 tool

### `mju_library_list_reading_rooms`

캠퍼스별 열람실 목록과 좌석 현황을 조회합니다.

입력:

- `campus?`: `인문`, `자연`, `all`, `humanities`, `nature`

반환 핵심:

- 사용자 정보
- 캠퍼스별 열람실 목록
- 열람실 id / 이름
- 좌석 총수 / 사용 중 / 예약 가능 수
- 현재 예약 가능 여부(`isChargeable`)
- 사용 불가 메시지(`unableMessage`)

### `mju_library_get_reading_room`

특정 열람실의 예약 가능 구간과 좌석 목록을 조회합니다.

입력:

- `roomId`
- `hopeDate?`: 좌석 예약 가능 여부 계산 기준 시각

반환 핵심:

- 열람실 이름
- 설명 / 주의 문구
- 예약 가능 구간 목록
- 좌석 유형
- 좌석 목록
- 기준 시각(`hopeDate`)
- 전체 좌석 수 / 사용 중 좌석 수 / 예약 가능 좌석 수

`hopeDate` 를 주면 좌석 목록의 `isReservable` 이 그 시각 기준으로 계산됩니다.

### `mju_library_list_seat_reservations`

현재 로그인한 사용자의 열람실 좌석 예약 목록을 조회합니다.

반환 핵심:

- 예약 id
- 열람실 id / 이름
- 좌석 id / 번호
- 예약 시간
- 상태
- 입실 확인 가능 여부
- `checkinExpiryDate`
- `arrivalConfirmMethods`

예약이 하나도 없으면 에러 대신 빈 목록을 반환합니다.

### `mju_library_reserve_seat`

열람실 좌석 예약 생성입니다.

입력 핵심:

- `roomId`
- `seatId`
- `confirm`
- `approvalToken?`

예:

```json
{
  "roomId": 19,
  "seatId": 1549,
  "confirm": true
}
```

현재 구현은 실데이터로 검증한 `즉시 예약 좌석`만 지원합니다.

즉, 사용자가 시작/종료 시각을 넣는 방식이 아니라:

1. 현재 시각을 분 단위로 자름
2. 좌석 상세의 `seatChargeableHour.defaultUseTime` 을 읽음
3. 서버에 `seatId + smufMethodCode` 중심 payload 로 예약 생성
4. 생성 후 `TEMP_CHARGE(임시배정)` 상태가 잡히는지 재조회

preview 단계에서 확인하는 것:

- 좌석 점유 여부
- 시간선(`timeLine`) 기반 좌석인지 여부
- 좌석 이용 규칙(`seatChargeableHour`)
- 예상 예약 시각

실데이터 검증 기준으로 `4F 제2노트북열람실 45번` 은 실제로:

- 예약 요청 시각 `2026-03-23 00:52:46`
- 예약 결과 `2026-03-23 00:52 ~ 04:52`
- 상태 `TEMP_CHARGE`
- `checkinExpiryDate = 2026-03-23 01:12:00`

까지 확인했습니다.

### `mju_library_cancel_seat_reservation`

기존 열람실 좌석 예약 취소입니다.

입력:

- `reservationId`
- `confirm`
- `approvalToken?`

## 5. 쓰기 승인 흐름

도서관 쓰기 tool 은 스터디룸과 열람실 모두 동일하게 2단계 승인 구조를 사용합니다.

1. `confirm=true` 로 preview 호출
2. `approvalToken` 발급
3. 같은 세션에서 같은 입력으로 다시 호출
4. fingerprint 일치 시 실제 생성 / 수정 / 취소 실행

열람실에 적용되는 tool:

- `mju_library_reserve_seat`
- `mju_library_cancel_seat_reservation`

## 6. 스터디룸 동행자 입력 규칙

스터디룸은 최소 인원 규칙이 있기 때문에 동행자 입력이 중요합니다.

예:

```json
{
  "companions": [
    { "name": "홍길동", "memberNo": "60123456" },
    { "name": "김명지", "memberNo": "60123457" }
  ],
  "companionCount": 2
}
```

내부 동작:

1. 입력된 `name`, `memberNo` 를 trim
2. `/api/rooms/{roomId}/check-companions` 로 내부 patron id 조회
3. 예약 payload 에는 `companionPatrons: [internalId...]` 로 변환

즉 사용자는 이름/학번만 넣고, 내부 시스템이 요구하는 companion id 는 서버 쪽에서 해석합니다.

## 7. 내부 동작

### 스터디룸

핵심 호출 체인:

1. `POST /pyxis-api/api/login`
2. `GET /pyxis-api/1/api/my-info`
3. `GET /pyxis-api/1/api/room-floors-and-chargeable-dates`
4. `GET /pyxis-api/1/api/rooms`
5. `GET /pyxis-api/1/api/rooms/{roomId}`
6. `GET /pyxis-api/1/api/rooms/{roomId}/use-sections`
7. `GET /pyxis-api/api/rooms/{roomId}/check-companions`
8. `POST/PUT/DELETE /pyxis-api/1/api/room-charges`

### 열람실

핵심 호출 체인:

1. `POST /pyxis-api/api/login`
2. `GET /pyxis-api/1/api/my-info`
3. `GET /pyxis-api/1/seat-rooms`
4. `GET /pyxis-api/1/api/seat-rooms/{roomId}`
5. `GET /pyxis-api/1/api/rooms/{roomId}/seats`
6. `GET /pyxis-api/1/api/rooms/{roomId}/seats/{seatId}`
7. `POST /pyxis-api/1/api/seat-charges`
8. `GET /pyxis-api/1/api/seat-charges/{reservationId}`
9. `GET /pyxis-api/1/api/seat-charges`
10. `DELETE /pyxis-api/1/api/seat-charges/{reservationId}`

열람실은 URL 이동보다 JSON API 호출 재현이 핵심입니다.

## 8. 실데이터 검증 메모

현재까지 확인한 내용:

- 열람실 목록 조회
- 열람실 상세 조회
- 좌석 목록 조회
- 좌석 상세 조회
- 내 열람실 예약 목록 조회
- 열람실 좌석 예약 preview 호출
- 승인 토큰을 포함한 실제 열람실 좌석 예약 성공
- 생성 직후 `TEMP_CHARGE(임시배정)` 상태 재조회 성공
- 실제 열람실 좌석 예약 취소 성공

대표 검증 케이스:

- `roomId=19`
- `seatId=1549`
- 좌석 표시명: `4F 제2노트북열람실 45번`
- 실제 생성 id: `1672613`
- 실제 상태: `TEMP_CHARGE`
- 실제 입실 확인 만료: `2026-03-23 01:12:00`

## 9. 알려진 제한

- 열람실은 예약 후 실제 입실에 `RF_TAG` 가 필요할 수 있습니다.
- 현재는 좌석 예약 / 취소까지만 자동화하고, 입실 확인(check-in)은 지원하지 않습니다.
- 시간선(`timeLine`) 기반 좌석은 아직 지원하지 않습니다.
- 열람실 상세 응답의 `reservable=false` 와 예약 가능 구간이 실제 즉시예약 성공 여부와 항상 일치하지는 않았습니다.
- 좌석 예약 수정, 연장, 퇴실 처리 자동화는 아직 지원하지 않습니다.
