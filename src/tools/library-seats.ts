import { createHash } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import type { AppContext } from "../mcp/app-context.js";
import {
  cancelLibrarySeatReservation,
  createLibrarySeatReservation,
  getLibraryReadingRoomDetail,
  listLibraryReadingRooms,
  listLibrarySeatReservations,
  previewLibrarySeatReservation,
  previewLibrarySeatReservationCancel
} from "../library/seat-services.js";
import type {
  LibrarySeatChargeableHour,
  LibrarySeatReservationPreview,
  LibrarySeatReservationRequestInput,
  LibrarySeatReservationSummary
} from "../library/types.js";
import { requireCredentials } from "./credentials.js";

const WRITE_APPROVAL_TTL_MS = 5 * 60 * 1000;

const userSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  memberNo: z.string(),
  branchId: z.number().int().optional(),
  branchName: z.string().optional(),
  branchAlias: z.string().optional()
});

const seatCountsSchema = z.object({
  total: z.number().int(),
  occupied: z.number().int(),
  waiting: z.number().int(),
  available: z.number().int()
});

const readingRoomSummarySchema = z.object({
  roomId: z.number().int(),
  roomName: z.string(),
  roomTypeId: z.number().int().optional(),
  roomTypeName: z.string().optional(),
  branchId: z.number().int().optional(),
  branchName: z.string().optional(),
  branchAlias: z.string().optional(),
  isChargeable: z.boolean(),
  unableMessage: z.string().optional(),
  seats: seatCountsSchema
});

const readingRoomCampusSchema = z.object({
  campus: z.enum(["humanities", "nature"]),
  branchGroupId: z.number().int(),
  branchName: z.string(),
  branchAlias: z.string(),
  rooms: z.array(readingRoomSummarySchema)
});

const seatTypeSchema = z.object({
  id: z.number().int(),
  name: z.string()
});

const reservableDateSchema = z.object({
  date: z.string(),
  beginTime: z.string(),
  endTime: z.string()
});

const seatSummarySchema = z.object({
  seatId: z.number().int(),
  roomId: z.number().int().optional(),
  roomName: z.string().optional(),
  seatCode: z.string(),
  isActive: z.boolean(),
  isReservable: z.boolean(),
  isOccupied: z.boolean(),
  remainingTime: z.number().int(),
  chargeTime: z.number().int()
});

const chargeableHourSchema = z.object({
  id: z.number().int(),
  isAllDayOpen: z.boolean(),
  beginTime: z.string(),
  endTime: z.string(),
  minUseTime: z.number().int(),
  maxUseTime: z.number().int(),
  defaultUseTime: z.number().int()
});

const readingRoomDetailSchema = z.object({
  roomId: z.number().int(),
  roomName: z.string(),
  description: z.string().optional(),
  attention: z.string().optional(),
  reservable: z.boolean(),
  reservableDates: z.array(reservableDateSchema),
  seatTypes: z.array(seatTypeSchema),
  seats: z.array(seatSummarySchema),
  hopeDate: z.string(),
  totalSeatCount: z.number().int(),
  occupiedSeatCount: z.number().int(),
  reservableSeatCount: z.number().int()
});

const seatReservationSchema = z.object({
  reservationId: z.number().int(),
  roomId: z.number().int(),
  roomName: z.string(),
  seatId: z.number().int(),
  seatCode: z.string(),
  reservationTime: z.string(),
  beginTime: z.string(),
  endTime: z.string(),
  stateCode: z.string().optional(),
  stateLabel: z.string().optional(),
  isCheckinable: z.boolean(),
  checkinExpiryDate: z.string().optional(),
  arrivalConfirmMethods: z.array(z.string()),
  isReturnable: z.boolean(),
  isRenewable: z.boolean(),
  renewalLimit: z.number().int().optional(),
  renewableCount: z.number().int().optional(),
  dateCreated: z.string().optional()
});

const seatPreviewSchema = z.object({
  roomId: z.number().int(),
  roomName: z.string(),
  seatId: z.number().int(),
  seatCode: z.string(),
  beginTime: z.string(),
  endTime: z.string(),
  reservationTime: z.string(),
  approvalWarnings: z.array(z.string()),
  chargeableHour: chargeableHourSchema.optional()
});

const seatMutationSchema = z.object({
  status: z.enum(["approval-required", "reserved", "cancelled"]),
  requiresApproval: z.boolean(),
  approvalToken: z.string().optional(),
  approvalExpiresAt: z.string().optional(),
  approvalMessage: z.string().optional(),
  reservationId: z.number().int().optional(),
  roomId: z.number().int().optional(),
  roomName: z.string().optional(),
  seatId: z.number().int().optional(),
  seatCode: z.string().optional(),
  beginTime: z.string().optional(),
  endTime: z.string().optional(),
  reservationTime: z.string().optional(),
  approvalWarnings: z.array(z.string()).optional(),
  chargeableHour: chargeableHourSchema.optional(),
  stateCode: z.string().optional(),
  stateLabel: z.string().optional(),
  checkinExpiryDate: z.string().optional(),
  arrivalConfirmMethods: z.array(z.string()).optional(),
  remainingReservationCount: z.number().int().optional(),
  cancelledReservation: seatReservationSchema.optional()
});

function ensureConfirmFlag(confirm: boolean): void {
  if (confirm !== true) {
    throw new Error("실제 쓰기 흐름에 들어가려면 confirm=true 가 필요합니다.");
  }
}

function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildSeatReservationInput(
  input: LibrarySeatReservationRequestInput
): LibrarySeatReservationRequestInput {
  return {
    roomId: input.roomId,
    seatId: input.seatId
  };
}

function buildReserveFingerprint(
  request: LibrarySeatReservationRequestInput
): string {
  return hashPayload({
    action: "library-create-seat-reservation",
    roomId: request.roomId,
    seatId: request.seatId
  });
}

function buildCancelFingerprint(reservation: LibrarySeatReservationSummary): string {
  return hashPayload({
    action: "library-cancel-seat-reservation",
    reservationId: reservation.reservationId,
    roomId: reservation.roomId,
    seatId: reservation.seatId,
    reservationTime: reservation.reservationTime,
    stateCode: reservation.stateCode ?? ""
  });
}

function formatChargeableHour(hour: LibrarySeatChargeableHour | undefined): string | undefined {
  if (!hour) {
    return undefined;
  }

  return [
    `이용 규칙: ${hour.minUseTime}-${hour.maxUseTime}분`,
    hour.isAllDayOpen ? "종일 개방" : `${hour.beginTime}-${hour.endTime}`
  ].join(" | ");
}

function formatReadingRoomListText(
  result: Awaited<ReturnType<typeof listLibraryReadingRooms>>
): string {
  const lines = [`도서관 열람실 조회`, `사용자: ${result.user.name} (${result.user.memberNo})`];
  for (const campus of result.campuses) {
    lines.push(`${campus.branchAlias} | 열람실 ${campus.rooms.length}개`);
    for (const room of campus.rooms.slice(0, 10)) {
      const meta = [
        room.roomTypeName,
        `${room.seats.available}/${room.seats.total}석`,
        room.unableMessage
      ]
        .filter(Boolean)
        .join(" | ");
      lines.push(`- [${room.roomId}] ${room.roomName}${meta ? ` | ${meta}` : ""}`);
    }
    if (campus.rooms.length > 10) {
      lines.push(`- 외 ${campus.rooms.length - 10}개`);
    }
  }
  return lines.join("\n");
}

function formatReadingRoomDetailText(
  result: Awaited<ReturnType<typeof getLibraryReadingRoomDetail>>
): string {
  const room = result.room;
  return [
    `${room.roomName} | 기준 시각 ${room.hopeDate}`,
    `좌석: 전체 ${room.totalSeatCount} | 예약 가능 ${room.reservableSeatCount} | 사용 중 ${room.occupiedSeatCount}`,
    room.reservableDates.length > 0
      ? `예약 가능 구간: ${room.reservableDates.map((item) => `${item.date} ${item.beginTime}-${item.endTime}`).join(", ")}`
      : "예약 가능 구간: 없음",
    room.seatTypes.length > 0
      ? `좌석 유형: ${room.seatTypes.map((item) => item.name).join(", ")}`
      : undefined
  ]
    .filter(Boolean)
    .join("\n");
}

function formatSeatReservationListText(
  result: Awaited<ReturnType<typeof listLibrarySeatReservations>>
): string {
  if (result.reservations.length === 0) {
    return "도서관 열람실 예약 내역이 없습니다.";
  }

  return [
    `도서관 열람실 예약 ${result.reservations.length}건`,
    ...result.reservations.map((reservation) => {
      const meta = [
        `좌석 ${reservation.seatCode}`,
        reservation.stateLabel,
        reservation.isCheckinable ? "입실 확인 가능" : undefined
      ]
        .filter(Boolean)
        .join(" | ");
      return `- [${reservation.reservationId}] ${reservation.roomName} | ${reservation.reservationTime}${meta ? ` | ${meta}` : ""}`;
    })
  ].join("\n");
}

function formatSeatApprovalText(
  actionLabel: string,
  preview: LibrarySeatReservationPreview,
  approvalExpiresAt: string
): string {
  return [
    `승인 필요: ${actionLabel}`,
    `${preview.roomName} | 좌석 ${preview.seatCode}`,
    `예상 예약 시각: ${preview.reservationTime}`,
    formatChargeableHour(preview.chargeableHour),
    preview.approvalWarnings.length > 0
      ? `경고: ${preview.approvalWarnings.join(" / ")}`
      : undefined,
    `승인 만료 시각: ${approvalExpiresAt}`,
    "같은 세션에서 approvalToken 을 포함해 다시 호출하면 실제 작업이 실행됩니다."
  ]
    .filter(Boolean)
    .join("\n");
}

export function registerLibrarySeatTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_library_list_reading_rooms",
    {
      title: "도서관 열람실 목록 조회",
      description:
        "명지대학교 도서관 열람실 목록과 좌석 점유 현황을 캠퍼스 기준으로 조회합니다.",
      inputSchema: {
        campus: z
          .string()
          .optional()
          .describe("인문, 자연, all 중 하나입니다. 생략하면 전체 캠퍼스를 조회합니다.")
      },
      outputSchema: {
        user: userSchema,
        campuses: z.array(readingRoomCampusSchema)
      }
    },
    async ({ campus }) => {
      const credentials = await requireCredentials(context);
      const client = context.createLibraryClient();
      const result = await listLibraryReadingRooms(client, credentials, {
        ...(campus?.trim() ? { campus } : {})
      });

      return {
        content: [{ type: "text", text: formatReadingRoomListText(result) }],
        structuredContent: {
          user: result.user,
          campuses: result.campuses
        }
      };
    }
  );

  server.registerTool(
    "mju_library_get_reading_room",
    {
      title: "도서관 열람실 상세 조회",
      description:
        "특정 열람실의 예약 가능 구간과 좌석 목록을 조회합니다. hopeDate 를 주면 해당 시각 기준으로 좌석 예약 가능 여부를 계산합니다.",
      inputSchema: {
        roomId: z.number().int().positive().describe("열람실 room id 입니다."),
        hopeDate: z
          .string()
          .optional()
          .describe("좌석 예약 가능 여부 계산 기준 시각입니다. 예: 2026-03-23 09:00")
      },
      outputSchema: {
        user: userSchema,
        room: readingRoomDetailSchema
      }
    },
    async ({ roomId, hopeDate }) => {
      const credentials = await requireCredentials(context);
      const client = context.createLibraryClient();
      const result = await getLibraryReadingRoomDetail(client, credentials, {
        roomId,
        ...(hopeDate?.trim() ? { hopeDate } : {})
      });

      return {
        content: [{ type: "text", text: formatReadingRoomDetailText(result) }],
        structuredContent: {
          user: result.user,
          room: result.room
        }
      };
    }
  );

  server.registerTool(
    "mju_library_list_seat_reservations",
    {
      title: "도서관 열람실 예약 목록 조회",
      description: "현재 로그인한 사용자의 도서관 열람실 좌석 예약 목록을 조회합니다.",
      inputSchema: {},
      outputSchema: {
        user: userSchema,
        reservations: z.array(seatReservationSchema)
      }
    },
    async () => {
      const credentials = await requireCredentials(context);
      const client = context.createLibraryClient();
      const result = await listLibrarySeatReservations(client, credentials);

      return {
        content: [{ type: "text", text: formatSeatReservationListText(result) }],
        structuredContent: {
          user: result.user,
          reservations: result.reservations
        }
      };
    }
  );

  server.registerTool(
    "mju_library_reserve_seat",
    {
      title: "도서관 열람실 좌석 예약",
      description:
        "도서관 열람실 좌석을 즉시 예약합니다. 현재 구현은 실데이터로 검증한 즉시 예약 좌석만 지원하며, confirm=true 로 미리보기와 승인 토큰을 발급받고 같은 세션에서 approvalToken 을 포함해 다시 호출해야 실제 예약이 실행됩니다.",
      inputSchema: {
        roomId: z.number().int().positive().describe("열람실 room id 입니다."),
        seatId: z.number().int().positive().describe("좌석 id 입니다."),
        confirm: z.boolean().describe("쓰기 흐름에 들어갈지 여부입니다. true 여야 합니다."),
        approvalToken: z.string().optional().describe("미리보기 호출에서 발급된 승인 토큰입니다.")
      },
      outputSchema: seatMutationSchema
    },
    async (input, extra) => {
      ensureConfirmFlag(input.confirm);

      const credentials = await requireCredentials(context);
      const client = context.createLibraryClient();
      const request = buildSeatReservationInput({
        roomId: input.roomId,
        seatId: input.seatId
      });
      const previewResult = await previewLibrarySeatReservation(client, credentials, request);
      const fingerprint = buildReserveFingerprint(request);

      if (!input.approvalToken) {
        const approval = context.issueWriteApproval(extra.sessionId, {
          action: "library-create-seat-reservation",
          fingerprint,
          ttlMs: WRITE_APPROVAL_TTL_MS
        });

        return {
          content: [
            {
              type: "text",
              text: formatSeatApprovalText(
                "열람실 좌석 예약",
                previewResult.preview,
                approval.expiresAt
              )
            }
          ],
          structuredContent: {
            status: "approval-required" as const,
            requiresApproval: true,
            approvalToken: approval.token,
            approvalExpiresAt: approval.expiresAt,
            approvalMessage:
              "같은 세션에서 approvalToken 을 포함해 다시 호출하면 실제 예약이 실행됩니다.",
            roomId: previewResult.preview.roomId,
            roomName: previewResult.preview.roomName,
            seatId: previewResult.preview.seatId,
            seatCode: previewResult.preview.seatCode,
            beginTime: previewResult.preview.beginTime,
            endTime: previewResult.preview.endTime,
            reservationTime: previewResult.preview.reservationTime,
            approvalWarnings: previewResult.preview.approvalWarnings,
            ...(previewResult.preview.chargeableHour
              ? { chargeableHour: previewResult.preview.chargeableHour }
              : {})
          }
        };
      }

      context.consumeWriteApproval(extra.sessionId, input.approvalToken, {
        action: "library-create-seat-reservation",
        fingerprint
      });
      const result = await createLibrarySeatReservation(client, credentials, request);

      return {
        content: [
          {
            type: "text",
            text: [
              "열람실 좌석 예약 완료",
              `[${result.result.reservationId}] ${result.result.roomName} | 좌석 ${result.result.seatCode}`,
              result.result.reservationTime,
              result.result.stateLabel ? `상태: ${result.result.stateLabel}` : undefined
            ]
              .filter(Boolean)
              .join("\n")
          }
        ],
        structuredContent: {
          status: "reserved" as const,
          requiresApproval: false,
          reservationId: result.result.reservationId,
          roomId: result.result.roomId,
          roomName: result.result.roomName,
          seatId: result.result.seatId,
          seatCode: result.result.seatCode,
          beginTime: result.result.beginTime,
          endTime: result.result.endTime,
          reservationTime: result.result.reservationTime,
          approvalWarnings: result.result.approvalWarnings,
          ...(result.result.chargeableHour
            ? { chargeableHour: result.result.chargeableHour }
            : {}),
          ...(result.result.stateCode ? { stateCode: result.result.stateCode } : {}),
          ...(result.result.stateLabel ? { stateLabel: result.result.stateLabel } : {}),
          ...(result.result.checkinExpiryDate
            ? { checkinExpiryDate: result.result.checkinExpiryDate }
            : {}),
          arrivalConfirmMethods: result.result.arrivalConfirmMethods
        }
      };
    }
  );

  server.registerTool(
    "mju_library_cancel_seat_reservation",
    {
      title: "도서관 열람실 좌석 예약 취소",
      description:
        "기존 도서관 열람실 좌석 예약을 취소합니다. confirm=true 로 미리보기와 승인 토큰을 발급받고, 같은 세션에서 approvalToken 을 포함해 다시 호출해야 실제 취소가 실행됩니다.",
      inputSchema: {
        reservationId: z.number().int().positive().describe("취소할 열람실 예약 id 입니다."),
        confirm: z.boolean().describe("쓰기 흐름에 들어갈지 여부입니다. true 여야 합니다."),
        approvalToken: z.string().optional().describe("미리보기 호출에서 발급된 승인 토큰입니다.")
      },
      outputSchema: seatMutationSchema
    },
    async ({ reservationId, confirm, approvalToken }, extra) => {
      ensureConfirmFlag(confirm);

      const credentials = await requireCredentials(context);
      const client = context.createLibraryClient();
      const previewResult = await previewLibrarySeatReservationCancel(
        client,
        credentials,
        reservationId
      );
      const fingerprint = buildCancelFingerprint(previewResult.reservation);

      if (!approvalToken) {
        const approval = context.issueWriteApproval(extra.sessionId, {
          action: "library-cancel-seat-reservation",
          fingerprint,
          ttlMs: WRITE_APPROVAL_TTL_MS
        });

        return {
          content: [
            {
              type: "text",
              text: [
                "승인 필요: 열람실 좌석 예약 취소",
                `[${previewResult.reservation.reservationId}] ${previewResult.reservation.roomName} | 좌석 ${previewResult.reservation.seatCode}`,
                previewResult.reservation.reservationTime,
                `승인 만료 시각: ${approval.expiresAt}`,
                "같은 세션에서 approvalToken 을 포함해 다시 호출하면 실제 취소가 실행됩니다."
              ].join("\n")
            }
          ],
          structuredContent: {
            status: "approval-required" as const,
            requiresApproval: true,
            approvalToken: approval.token,
            approvalExpiresAt: approval.expiresAt,
            approvalMessage:
              "같은 세션에서 approvalToken 을 포함해 다시 호출하면 실제 취소가 실행됩니다.",
            reservationId: previewResult.reservation.reservationId,
            roomId: previewResult.reservation.roomId,
            roomName: previewResult.reservation.roomName,
            seatId: previewResult.reservation.seatId,
            seatCode: previewResult.reservation.seatCode,
            beginTime: previewResult.reservation.beginTime,
            endTime: previewResult.reservation.endTime,
            reservationTime: previewResult.reservation.reservationTime,
            ...(previewResult.reservation.stateCode
              ? { stateCode: previewResult.reservation.stateCode }
              : {}),
            ...(previewResult.reservation.stateLabel
              ? { stateLabel: previewResult.reservation.stateLabel }
              : {}),
            ...(previewResult.reservation.checkinExpiryDate
              ? { checkinExpiryDate: previewResult.reservation.checkinExpiryDate }
              : {}),
            arrivalConfirmMethods: previewResult.reservation.arrivalConfirmMethods,
            cancelledReservation: previewResult.reservation
          }
        };
      }

      context.consumeWriteApproval(extra.sessionId, approvalToken, {
        action: "library-cancel-seat-reservation",
        fingerprint
      });
      const result = await cancelLibrarySeatReservation(client, credentials, reservationId);

      return {
        content: [
          {
            type: "text",
            text: [
              "열람실 좌석 예약 취소 완료",
              `[${result.cancelledReservation.reservationId}] ${result.cancelledReservation.roomName} | 좌석 ${result.cancelledReservation.seatCode}`,
              result.cancelledReservation.reservationTime,
              `남은 예약 수: ${result.remainingReservations.length}`
            ].join("\n")
          }
        ],
        structuredContent: {
          status: "cancelled" as const,
          requiresApproval: false,
          reservationId: result.cancelledReservation.reservationId,
          roomId: result.cancelledReservation.roomId,
          roomName: result.cancelledReservation.roomName,
          seatId: result.cancelledReservation.seatId,
          seatCode: result.cancelledReservation.seatCode,
          beginTime: result.cancelledReservation.beginTime,
          endTime: result.cancelledReservation.endTime,
          reservationTime: result.cancelledReservation.reservationTime,
          ...(result.cancelledReservation.stateCode
            ? { stateCode: result.cancelledReservation.stateCode }
            : {}),
          ...(result.cancelledReservation.stateLabel
            ? { stateLabel: result.cancelledReservation.stateLabel }
            : {}),
          ...(result.cancelledReservation.checkinExpiryDate
            ? { checkinExpiryDate: result.cancelledReservation.checkinExpiryDate }
            : {}),
          arrivalConfirmMethods: result.cancelledReservation.arrivalConfirmMethods,
          remainingReservationCount: result.remainingReservations.length,
          cancelledReservation: result.cancelledReservation
        }
      };
    }
  );
}
