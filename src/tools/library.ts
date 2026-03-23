import { createHash } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import type { AppContext } from "../mcp/app-context.js";
import {
  cancelLibraryRoomReservation,
  createLibraryRoomReservation,
  getLibraryStudyRoomDetail,
  listLibraryRoomReservations,
  listLibraryStudyRooms,
  previewLibraryRoomReservation,
  previewLibraryRoomReservationCancel,
  previewLibraryRoomReservationUpdate,
  updateLibraryRoomReservation
} from "../library/services.js";
import type {
  LibraryReservationMutationPreview,
  LibraryReservationRequestInput,
  LibraryRoomReservationDetail
} from "../library/types.js";
import { requireCredentials } from "./credentials.js";
import { registerLibrarySeatTools } from "./library-seats.js";

const WRITE_APPROVAL_TTL_MS = 5 * 60 * 1000;

const userSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  memberNo: z.string(),
  branchId: z.number().int().optional(),
  branchName: z.string().optional(),
  branchAlias: z.string().optional()
});

const companionSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  memberNo: z.string()
});

const useSectionSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string()
});

const roomSummarySchema = z.object({
  roomId: z.number().int(),
  roomName: z.string(),
  floorLabel: z.string().optional(),
  minQuota: z.number().int().optional(),
  maxQuota: z.number().int().optional(),
  isChargeable: z.boolean(),
  unableMessage: z.string().optional()
});

const campusAvailabilitySchema = z.object({
  campus: z.enum(["humanities", "nature"]),
  branchGroupId: z.number().int(),
  branchName: z.string(),
  branchAlias: z.string(),
  selectedDate: z.string(),
  availableDates: z.array(z.string()),
  floors: z.array(
    z.object({
      value: z.number().int(),
      label: z.string()
    })
  ),
  rooms: z.array(roomSummarySchema)
});

const roomDetailSchema = z.object({
  roomId: z.number().int(),
  roomName: z.string(),
  campusName: z.string().optional(),
  campusAlias: z.string().optional(),
  buildingName: z.string().optional(),
  floorLabel: z.string().optional(),
  date: z.string(),
  availableDates: z.array(z.string()),
  useCompanionRegistration: z.boolean(),
  minQuota: z.number().int().optional(),
  maxQuota: z.number().int().optional(),
  minDurationMinutes: z.number().int().optional(),
  maxDurationMinutes: z.number().int().optional(),
  useSections: z.array(useSectionSchema),
  reservableStartTimes: z.array(z.string()),
  reservableEndTimes: z.array(z.string()).optional(),
  blockedRanges: z.array(
    z.object({
      startTime: z.string(),
      endTime: z.string(),
      className: z.string()
    })
  ),
  timeline: z.array(
    z.object({
      time: z.string(),
      className: z.string(),
      selectable: z.boolean(),
      stepMinutes: z.number().int()
    })
  )
});

const reservationSummarySchema = z.object({
  reservationId: z.number().int(),
  roomId: z.number().int().optional(),
  roomName: z.string(),
  campusName: z.string().optional(),
  campusAlias: z.string().optional(),
  useSectionName: z.string().optional(),
  stateCode: z.string().optional(),
  stateLabel: z.string().optional(),
  reservationTime: z.string(),
  beginTime: z.string().optional(),
  endTime: z.string().optional(),
  companionCount: z.number().int()
});

const reservationDetailSchema = z.object({
  reservationId: z.number().int(),
  roomId: z.number().int(),
  roomName: z.string(),
  campusName: z.string().optional(),
  campusAlias: z.string().optional(),
  buildingName: z.string().optional(),
  floorLabel: z.string().optional(),
  reservationTime: z.string(),
  beginTime: z.string(),
  endTime: z.string(),
  stateCode: z.string().optional(),
  stateLabel: z.string().optional(),
  useSection: useSectionSchema.optional(),
  isEditable: z.boolean(),
  companionCount: z.number().int(),
  companions: z.array(companionSchema),
  patronMessage: z.string().optional(),
  equipmentIds: z.array(z.number().int()),
  additionalInfoValues: z.record(z.string(), z.string())
});

const previewSchema = z.object({
  roomId: z.number().int(),
  roomName: z.string(),
  campusName: z.string().optional(),
  campusAlias: z.string().optional(),
  date: z.string(),
  beginTime: z.string(),
  endTime: z.string(),
  reservationTime: z.string(),
  useSection: useSectionSchema,
  companionCount: z.number().int(),
  resolvedCompanions: z.array(companionSchema),
  approvalWarnings: z.array(z.string())
});

const companionInputSchema = z.object({
  name: z.string(),
  memberNo: z.string()
});

const reservationInputShape = {
  roomId: z.number().int().positive().describe("도서관 room id 입니다."),
  date: z.string().describe("예약 날짜입니다. 예: 2026-03-23"),
  beginTime: z.string().describe("예약 시작 시각입니다. 예: 16:00"),
  endTime: z.string().describe("예약 종료 시각입니다. 예: 17:00"),
  useSectionId: z.number().int().positive().optional(),
  useSectionCode: z.string().optional(),
  useSectionName: z.string().optional(),
  companionCount: z.number().int().min(0).optional(),
  companions: z.array(companionInputSchema).optional(),
  patronMessage: z.string().optional(),
  equipmentIds: z.array(z.number().int().positive()).optional(),
  additionalInfoValues: z.record(z.string(), z.string()).optional()
};

const mutationSchema = z.object({
  status: z.enum(["approval-required", "reserved", "updated", "cancelled"]),
  requiresApproval: z.boolean(),
  approvalToken: z.string().optional(),
  approvalExpiresAt: z.string().optional(),
  approvalMessage: z.string().optional(),
  reservationId: z.number().int().optional(),
  roomId: z.number().int().optional(),
  roomName: z.string().optional(),
  campusName: z.string().optional(),
  campusAlias: z.string().optional(),
  date: z.string().optional(),
  beginTime: z.string().optional(),
  endTime: z.string().optional(),
  reservationTime: z.string().optional(),
  useSection: useSectionSchema.optional(),
  companionCount: z.number().int().optional(),
  resolvedCompanions: z.array(companionSchema).optional(),
  approvalWarnings: z.array(z.string()).optional(),
  stateCode: z.string().optional(),
  stateLabel: z.string().optional(),
  remainingReservationCount: z.number().int().optional(),
  cancelledReservation: reservationDetailSchema.optional(),
  existingReservation: reservationDetailSchema.optional()
});

function ensureConfirmFlag(confirm: boolean): void {
  if (confirm !== true) {
    throw new Error("실제 쓰기 흐름에 들어가려면 confirm=true 가 필요합니다.");
  }
}

function buildReservationInput(
  input: LibraryReservationRequestInput
): LibraryReservationRequestInput {
  return {
    ...input,
    ...(input.useSectionCode?.trim() ? { useSectionCode: input.useSectionCode.trim() } : {}),
    ...(input.useSectionName?.trim() ? { useSectionName: input.useSectionName.trim() } : {}),
    ...(input.patronMessage?.trim() ? { patronMessage: input.patronMessage.trim() } : {}),
    ...(input.companions
      ? {
          companions: input.companions.map((companion) => ({
            name: companion.name.trim(),
            memberNo: companion.memberNo.trim()
          }))
        }
      : {})
  };
}

function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildCreateFingerprint(
  preview: LibraryReservationMutationPreview,
  input: LibraryReservationRequestInput
): string {
  return hashPayload({
    action: "library-create-room-reservation",
    preview,
    patronMessage: input.patronMessage ?? "",
    equipmentIds: input.equipmentIds ?? [],
    additionalInfoValues: input.additionalInfoValues ?? {}
  });
}

function buildUpdateFingerprint(
  reservationId: number,
  preview: LibraryReservationMutationPreview,
  input: Omit<LibraryReservationRequestInput, "roomId">
): string {
  return hashPayload({
    action: "library-update-room-reservation",
    reservationId,
    preview,
    patronMessage: input.patronMessage ?? "",
    equipmentIds: input.equipmentIds ?? [],
    additionalInfoValues: input.additionalInfoValues ?? {}
  });
}

function buildCancelFingerprint(reservation: LibraryRoomReservationDetail): string {
  return hashPayload({
    action: "library-cancel-room-reservation",
    reservationId: reservation.reservationId,
    roomId: reservation.roomId,
    reservationTime: reservation.reservationTime,
    stateCode: reservation.stateCode ?? ""
  });
}

function formatStudyRoomListText(
  result: Awaited<ReturnType<typeof listLibraryStudyRooms>>
): string {
  const lines = [`도서관 스터디룸 조회`, `사용자: ${result.user.name} (${result.user.memberNo})`];
  for (const campus of result.campuses) {
    lines.push(`${campus.branchAlias} ${campus.selectedDate} | 방 ${campus.rooms.length}개`);
    for (const room of campus.rooms.slice(0, 10)) {
      const meta = [
        room.floorLabel,
        room.minQuota !== undefined && room.maxQuota !== undefined
          ? `${room.minQuota}-${room.maxQuota}명`
          : undefined,
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

function formatStudyRoomDetailText(
  result: Awaited<ReturnType<typeof getLibraryStudyRoomDetail>>
): string {
  const room = result.room;
  return [
    `${room.roomName}${room.campusAlias ? ` | ${room.campusAlias}` : ""} | ${room.date}`,
    [room.buildingName, room.floorLabel].filter(Boolean).join(" | "),
    `예약 가능 시작 시각: ${room.reservableStartTimes.join(", ") || "없음"}`,
    room.reservableEndTimes
      ? `선택 시작 시각 기준 종료 가능 시각: ${room.reservableEndTimes.join(", ") || "없음"}`
      : undefined,
    room.useSections.length > 0
      ? `이용 목적: ${room.useSections.map((section) => `${section.name}(${section.code})`).join(", ")}`
      : undefined
  ]
    .filter(Boolean)
    .join("\n");
}

function formatReservationListText(
  result: Awaited<ReturnType<typeof listLibraryRoomReservations>>
): string {
  if (result.reservations.length === 0) {
    return "도서관 스터디룸 예약 내역이 없습니다.";
  }

  return [
    `도서관 스터디룸 예약 ${result.reservations.length}건`,
    ...result.reservations.map((reservation) => {
      const meta = [
        reservation.campusAlias,
        reservation.useSectionName,
        reservation.stateLabel,
        `${reservation.companionCount}명`
      ]
        .filter(Boolean)
        .join(" | ");
      return `- [${reservation.reservationId}] ${reservation.roomName} | ${reservation.reservationTime}${meta ? ` | ${meta}` : ""}`;
    })
  ].join("\n");
}

function formatApprovalText(
  actionLabel: string,
  preview: LibraryReservationMutationPreview,
  approvalExpiresAt: string
): string {
  return [
    `승인 필요: ${actionLabel}`,
    `${preview.roomName}${preview.campusAlias ? ` | ${preview.campusAlias}` : ""}`,
    preview.reservationTime,
    `이용 목적: ${preview.useSection.name} (${preview.useSection.code})`,
    `동행자 수: ${preview.companionCount}`,
    preview.resolvedCompanions.length > 0
      ? `동행자: ${preview.resolvedCompanions.map((companion) => `${companion.name}(${companion.memberNo})`).join(", ")}`
      : undefined,
    preview.approvalWarnings.length > 0
      ? `경고: ${preview.approvalWarnings.join(" / ")}`
      : undefined,
    `승인 만료 시각: ${approvalExpiresAt}`,
    "같은 세션에서 approvalToken 을 포함해 다시 호출하면 실제 작업이 실행됩니다."
  ]
    .filter(Boolean)
    .join("\n");
}

function formatMutationText(
  actionLabel: string,
  result: { reservationId: number; roomName: string; reservationTime: string; stateLabel?: string }
): string {
  return [
    `${actionLabel} 완료`,
    `[${result.reservationId}] ${result.roomName}`,
    result.reservationTime,
    result.stateLabel ? `상태: ${result.stateLabel}` : undefined
  ]
    .filter(Boolean)
    .join("\n");
}

export function registerLibraryTools(
  server: McpServer,
  context: AppContext
): void {
  server.registerTool(
    "mju_library_list_study_rooms",
    {
      title: "도서관 스터디룸 목록 조회",
      description:
        "명지대학교 도서관 스터디룸 예약 가능 공간을 캠퍼스/날짜 기준으로 조회합니다.",
      inputSchema: {
        campus: z
          .string()
          .optional()
          .describe("인문, 자연, all 중 하나입니다. 생략하면 전체 캠퍼스를 조회합니다."),
        date: z
          .string()
          .optional()
          .describe("조회 날짜입니다. 예: 2026-03-23")
      },
      outputSchema: {
        user: userSchema,
        campuses: z.array(campusAvailabilitySchema)
      }
    },
    async ({ campus, date }) => {
      const credentials = await requireCredentials(context);
      const client = context.createLibraryClient();
      const result = await listLibraryStudyRooms(client, credentials, {
        ...(campus?.trim() ? { campus } : {}),
        ...(date?.trim() ? { date } : {})
      });

      return {
        content: [{ type: "text", text: formatStudyRoomListText(result) }],
        structuredContent: {
          user: result.user,
          campuses: result.campuses
        }
      };
    }
  );

  server.registerTool(
    "mju_library_get_study_room",
    {
      title: "도서관 스터디룸 상세 조회",
      description:
        "특정 스터디룸의 날짜별 타임라인, 이용 목적, 인원 규칙, 예약 가능 시작/종료 시각을 조회합니다.",
      inputSchema: {
        roomId: z.number().int().positive().describe("도서관 room id 입니다."),
        date: z.string().describe("조회 날짜입니다. 예: 2026-03-23"),
        beginTime: z
          .string()
          .optional()
          .describe("종료 가능 시각 계산 기준이 되는 시작 시각입니다. 예: 16:00")
      },
      outputSchema: {
        user: userSchema,
        room: roomDetailSchema
      }
    },
    async ({ roomId, date, beginTime }) => {
      const credentials = await requireCredentials(context);
      const client = context.createLibraryClient();
      const result = await getLibraryStudyRoomDetail(client, credentials, {
        roomId,
        date,
        ...(beginTime?.trim() ? { beginTime } : {})
      });

      return {
        content: [{ type: "text", text: formatStudyRoomDetailText(result) }],
        structuredContent: {
          user: result.user,
          room: result.room
        }
      };
    }
  );

  server.registerTool(
    "mju_library_list_room_reservations",
    {
      title: "도서관 스터디룸 예약 목록 조회",
      description: "현재 로그인한 사용자의 도서관 스터디룸 예약 목록을 조회합니다.",
      inputSchema: {},
      outputSchema: {
        user: userSchema,
        reservations: z.array(reservationSummarySchema)
      }
    },
    async () => {
      const credentials = await requireCredentials(context);
      const client = context.createLibraryClient();
      const result = await listLibraryRoomReservations(client, credentials);

      return {
        content: [{ type: "text", text: formatReservationListText(result) }],
        structuredContent: {
          user: result.user,
          reservations: result.reservations
        }
      };
    }
  );

  server.registerTool(
    "mju_library_reserve_study_room",
    {
      title: "도서관 스터디룸 예약",
      description:
        "도서관 스터디룸 예약을 수행합니다. confirm=true 로 미리보기와 승인 토큰을 발급받고, 같은 세션에서 approvalToken 을 포함해 다시 호출해야 실제 예약이 실행됩니다.",
      inputSchema: {
        ...reservationInputShape,
        confirm: z.boolean().describe("쓰기 흐름에 들어갈지 여부입니다. true 여야 합니다."),
        approvalToken: z.string().optional().describe("미리보기 호출에서 발급된 승인 토큰입니다.")
      },
      outputSchema: mutationSchema
    },
    async (input, extra) => {
      ensureConfirmFlag(input.confirm);

      const credentials = await requireCredentials(context);
      const client = context.createLibraryClient();
      const request = buildReservationInput({
        roomId: input.roomId,
        date: input.date,
        beginTime: input.beginTime,
        endTime: input.endTime,
        ...(input.useSectionId !== undefined ? { useSectionId: input.useSectionId } : {}),
        ...(input.useSectionCode !== undefined ? { useSectionCode: input.useSectionCode } : {}),
        ...(input.useSectionName !== undefined ? { useSectionName: input.useSectionName } : {}),
        ...(input.companionCount !== undefined ? { companionCount: input.companionCount } : {}),
        ...(input.companions ? { companions: input.companions } : {}),
        ...(input.patronMessage !== undefined ? { patronMessage: input.patronMessage } : {}),
        ...(input.equipmentIds ? { equipmentIds: input.equipmentIds } : {}),
        ...(input.additionalInfoValues ? { additionalInfoValues: input.additionalInfoValues } : {})
      });
      const previewResult = await previewLibraryRoomReservation(client, credentials, request);
      const fingerprint = buildCreateFingerprint(previewResult.preview, request);

      if (!input.approvalToken) {
        const approval = context.issueWriteApproval(extra.sessionId, {
          action: "library-create-room-reservation",
          fingerprint,
          ttlMs: WRITE_APPROVAL_TTL_MS
        });

        return {
          content: [
            {
              type: "text",
              text: formatApprovalText("스터디룸 예약", previewResult.preview, approval.expiresAt)
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
            ...(previewResult.preview.campusName ? { campusName: previewResult.preview.campusName } : {}),
            ...(previewResult.preview.campusAlias ? { campusAlias: previewResult.preview.campusAlias } : {}),
            date: previewResult.preview.date,
            beginTime: previewResult.preview.beginTime,
            endTime: previewResult.preview.endTime,
            reservationTime: previewResult.preview.reservationTime,
            useSection: previewResult.preview.useSection,
            companionCount: previewResult.preview.companionCount,
            resolvedCompanions: previewResult.preview.resolvedCompanions,
            approvalWarnings: previewResult.preview.approvalWarnings
          }
        };
      }

      context.consumeWriteApproval(extra.sessionId, input.approvalToken, {
        action: "library-create-room-reservation",
        fingerprint
      });
      const result = await createLibraryRoomReservation(client, credentials, request);

      return {
        content: [{ type: "text", text: formatMutationText("스터디룸 예약", result.result) }],
        structuredContent: {
          status: "reserved" as const,
          requiresApproval: false,
          reservationId: result.result.reservationId,
          roomId: result.result.roomId,
          roomName: result.result.roomName,
          ...(result.result.campusName ? { campusName: result.result.campusName } : {}),
          ...(result.result.campusAlias ? { campusAlias: result.result.campusAlias } : {}),
          date: result.result.date,
          beginTime: result.result.beginTime,
          endTime: result.result.endTime,
          reservationTime: result.result.reservationTime,
          useSection: result.result.useSection,
          companionCount: result.result.companionCount,
          resolvedCompanions: result.result.resolvedCompanions,
          approvalWarnings: result.result.approvalWarnings,
          ...(result.result.stateCode ? { stateCode: result.result.stateCode } : {}),
          ...(result.result.stateLabel ? { stateLabel: result.result.stateLabel } : {})
        }
      };
    }
  );

  server.registerTool(
    "mju_library_update_study_room_reservation",
    {
      title: "도서관 스터디룸 예약 수정",
      description:
        "기존 도서관 스터디룸 예약을 수정합니다. confirm=true 로 미리보기와 승인 토큰을 발급받고, 같은 세션에서 approvalToken 을 포함해 다시 호출해야 실제 수정이 실행됩니다.",
      inputSchema: {
        reservationId: z.number().int().positive().describe("수정할 예약 id 입니다."),
        date: z.string().describe("변경할 예약 날짜입니다. 예: 2026-03-23"),
        beginTime: z.string().describe("변경할 시작 시각입니다. 예: 17:00"),
        endTime: z.string().describe("변경할 종료 시각입니다. 예: 18:00"),
        useSectionId: z.number().int().positive().optional(),
        useSectionCode: z.string().optional(),
        useSectionName: z.string().optional(),
        companionCount: z.number().int().min(0).optional(),
        companions: z.array(companionInputSchema).optional(),
        patronMessage: z.string().optional(),
        equipmentIds: z.array(z.number().int().positive()).optional(),
        additionalInfoValues: z.record(z.string(), z.string()).optional(),
        confirm: z.boolean().describe("쓰기 흐름에 들어갈지 여부입니다. true 여야 합니다."),
        approvalToken: z.string().optional().describe("미리보기 호출에서 발급된 승인 토큰입니다.")
      },
      outputSchema: mutationSchema
    },
    async (input, extra) => {
      ensureConfirmFlag(input.confirm);

      const credentials = await requireCredentials(context);
      const client = context.createLibraryClient();
      const request = buildReservationInput({
        roomId: 0,
        date: input.date,
        beginTime: input.beginTime,
        endTime: input.endTime,
        ...(input.useSectionId !== undefined ? { useSectionId: input.useSectionId } : {}),
        ...(input.useSectionCode !== undefined ? { useSectionCode: input.useSectionCode } : {}),
        ...(input.useSectionName !== undefined ? { useSectionName: input.useSectionName } : {}),
        ...(input.companionCount !== undefined ? { companionCount: input.companionCount } : {}),
        ...(input.companions ? { companions: input.companions } : {}),
        ...(input.patronMessage !== undefined ? { patronMessage: input.patronMessage } : {}),
        ...(input.equipmentIds ? { equipmentIds: input.equipmentIds } : {}),
        ...(input.additionalInfoValues ? { additionalInfoValues: input.additionalInfoValues } : {})
      });
      const { roomId: _unusedRoomId, ...updateRequest } = request;
      const previewResult = await previewLibraryRoomReservationUpdate(
        client,
        credentials,
        input.reservationId,
        updateRequest
      );
      const fingerprint = buildUpdateFingerprint(
        input.reservationId,
        previewResult.preview,
        updateRequest
      );

      if (!input.approvalToken) {
        const approval = context.issueWriteApproval(extra.sessionId, {
          action: "library-update-room-reservation",
          fingerprint,
          ttlMs: WRITE_APPROVAL_TTL_MS
        });

        return {
          content: [
            {
              type: "text",
              text: formatApprovalText("스터디룸 예약 수정", previewResult.preview, approval.expiresAt)
            }
          ],
          structuredContent: {
            status: "approval-required" as const,
            requiresApproval: true,
            approvalToken: approval.token,
            approvalExpiresAt: approval.expiresAt,
            approvalMessage:
              "같은 세션에서 approvalToken 을 포함해 다시 호출하면 실제 수정이 실행됩니다.",
            reservationId: input.reservationId,
            roomId: previewResult.preview.roomId,
            roomName: previewResult.preview.roomName,
            ...(previewResult.preview.campusName ? { campusName: previewResult.preview.campusName } : {}),
            ...(previewResult.preview.campusAlias ? { campusAlias: previewResult.preview.campusAlias } : {}),
            date: previewResult.preview.date,
            beginTime: previewResult.preview.beginTime,
            endTime: previewResult.preview.endTime,
            reservationTime: previewResult.preview.reservationTime,
            useSection: previewResult.preview.useSection,
            companionCount: previewResult.preview.companionCount,
            resolvedCompanions: previewResult.preview.resolvedCompanions,
            approvalWarnings: previewResult.preview.approvalWarnings,
            existingReservation: previewResult.existingReservation
          }
        };
      }

      context.consumeWriteApproval(extra.sessionId, input.approvalToken, {
        action: "library-update-room-reservation",
        fingerprint
      });
      const result = await updateLibraryRoomReservation(
        client,
        credentials,
        input.reservationId,
        updateRequest
      );

      return {
        content: [{ type: "text", text: formatMutationText("스터디룸 예약 수정", result.result) }],
        structuredContent: {
          status: "updated" as const,
          requiresApproval: false,
          reservationId: result.result.reservationId,
          roomId: result.result.roomId,
          roomName: result.result.roomName,
          ...(result.result.campusName ? { campusName: result.result.campusName } : {}),
          ...(result.result.campusAlias ? { campusAlias: result.result.campusAlias } : {}),
          date: result.result.date,
          beginTime: result.result.beginTime,
          endTime: result.result.endTime,
          reservationTime: result.result.reservationTime,
          useSection: result.result.useSection,
          companionCount: result.result.companionCount,
          resolvedCompanions: result.result.resolvedCompanions,
          approvalWarnings: result.result.approvalWarnings,
          ...(result.result.stateCode ? { stateCode: result.result.stateCode } : {}),
          ...(result.result.stateLabel ? { stateLabel: result.result.stateLabel } : {})
        }
      };
    }
  );

  server.registerTool(
    "mju_library_cancel_study_room_reservation",
    {
      title: "도서관 스터디룸 예약 취소",
      description:
        "기존 도서관 스터디룸 예약을 취소합니다. confirm=true 로 미리보기와 승인 토큰을 발급받고, 같은 세션에서 approvalToken 을 포함해 다시 호출해야 실제 취소가 실행됩니다.",
      inputSchema: {
        reservationId: z.number().int().positive().describe("취소할 예약 id 입니다."),
        confirm: z.boolean().describe("쓰기 흐름에 들어갈지 여부입니다. true 여야 합니다."),
        approvalToken: z.string().optional().describe("미리보기 호출에서 발급된 승인 토큰입니다.")
      },
      outputSchema: mutationSchema
    },
    async ({ reservationId, confirm, approvalToken }, extra) => {
      ensureConfirmFlag(confirm);

      const credentials = await requireCredentials(context);
      const client = context.createLibraryClient();
      const previewResult = await previewLibraryRoomReservationCancel(
        client,
        credentials,
        reservationId
      );
      const fingerprint = buildCancelFingerprint(previewResult.reservation);

      if (!approvalToken) {
        const approval = context.issueWriteApproval(extra.sessionId, {
          action: "library-cancel-room-reservation",
          fingerprint,
          ttlMs: WRITE_APPROVAL_TTL_MS
        });

        return {
          content: [
            {
              type: "text",
              text: [
                `승인 필요: 스터디룸 예약 취소`,
                `[${previewResult.reservation.reservationId}] ${previewResult.reservation.roomName}`,
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
            ...(previewResult.reservation.campusName ? { campusName: previewResult.reservation.campusName } : {}),
            ...(previewResult.reservation.campusAlias ? { campusAlias: previewResult.reservation.campusAlias } : {}),
            beginTime: previewResult.reservation.beginTime,
            endTime: previewResult.reservation.endTime,
            reservationTime: previewResult.reservation.reservationTime,
            companionCount: previewResult.reservation.companionCount,
            ...(previewResult.reservation.stateCode ? { stateCode: previewResult.reservation.stateCode } : {}),
            ...(previewResult.reservation.stateLabel ? { stateLabel: previewResult.reservation.stateLabel } : {}),
            cancelledReservation: previewResult.reservation
          }
        };
      }

      context.consumeWriteApproval(extra.sessionId, approvalToken, {
        action: "library-cancel-room-reservation",
        fingerprint
      });
      const result = await cancelLibraryRoomReservation(client, credentials, reservationId);

      return {
        content: [
          {
            type: "text",
            text: [
              `스터디룸 예약 취소 완료`,
              `[${result.cancelledReservation.reservationId}] ${result.cancelledReservation.roomName}`,
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
          ...(result.cancelledReservation.campusName ? { campusName: result.cancelledReservation.campusName } : {}),
          ...(result.cancelledReservation.campusAlias ? { campusAlias: result.cancelledReservation.campusAlias } : {}),
          beginTime: result.cancelledReservation.beginTime,
          endTime: result.cancelledReservation.endTime,
          reservationTime: result.cancelledReservation.reservationTime,
          companionCount: result.cancelledReservation.companionCount,
          ...(result.cancelledReservation.stateCode ? { stateCode: result.cancelledReservation.stateCode } : {}),
          ...(result.cancelledReservation.stateLabel ? { stateLabel: result.cancelledReservation.stateLabel } : {}),
          remainingReservationCount: result.remainingReservations.length,
          cancelledReservation: result.cancelledReservation
        }
      };
    }
  );

  registerLibrarySeatTools(server, context);
}
