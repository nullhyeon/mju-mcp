import type { ResolvedLmsCredentials } from "../auth/types.js";
import {
  LIBRARY_BRANCH_GROUPS,
  LIBRARY_HOMEPAGE_ID,
  LIBRARY_SMUF_METHOD_CODE,
  type LibraryCampusKey
} from "./constants.js";
import { MjuLibraryClient } from "./client.js";
import type {
  LibraryReadingRoomCampusAvailability,
  LibraryReadingRoomDetail,
  LibraryReadingRoomSummary,
  LibrarySeatChargeableHour,
  LibrarySeatDetail,
  LibrarySeatReservationPreview,
  LibrarySeatReservationRequestInput,
  LibrarySeatReservationResult,
  LibrarySeatReservationSummary,
  LibrarySeatReservableDate,
  LibrarySeatSummary,
  LibrarySeatType,
  LibraryUserInfo
} from "./types.js";

interface RawBranch {
  id?: number;
  name?: string;
  alias?: string;
}

interface RawRoomType {
  id?: number;
  name?: string;
}

interface RawSeatCounts {
  total?: number;
  occupied?: number;
  waiting?: number;
  available?: number;
}

interface RawSeatRoomSummary {
  id?: number;
  name?: string;
  roomType?: RawRoomType;
  branch?: RawBranch;
  isChargeable?: boolean;
  unableMessage?: string;
  seats?: RawSeatCounts;
}

interface RawSeatReservableDate {
  date?: string;
  beginTime?: string;
  endTime?: string;
}

interface RawSeatRoomDetail {
  name?: string;
  description?: string;
  attention?: string;
  seatTypes?: Array<{
    id?: number;
    name?: string;
  }> | null;
  reservable?: boolean;
  reservableDates?: RawSeatReservableDate[] | null;
}

interface RawSeatRoomRef {
  id?: number;
  name?: string;
}

interface RawSeatSummary {
  id?: number;
  room?: RawSeatRoomRef;
  code?: string;
  isActive?: boolean;
  isReservable?: boolean;
  isOccupied?: boolean;
  remainingTime?: number;
  chargeTime?: number;
}

interface RawSeatChargeableHour {
  id?: number;
  isAllDayOpen?: boolean;
  beginTime?: string;
  endTime?: string;
  minUseTime?: number;
  maxUseTime?: number;
  defaultUseTime?: number;
}

interface RawSeatDetail {
  id?: number;
  code?: string;
  companionCnt?: number;
  isOccupied?: boolean;
  timeLine?: unknown[] | null;
  room?: RawSeatRoomRef;
  seatChargeableHour?: RawSeatChargeableHour;
  isFavoriteSeat?: boolean;
}

interface RawSeatChargeCreated {
  id?: number;
  room?: RawSeatRoomRef;
  seat?: {
    id?: number;
    code?: string;
  };
  beginTime?: string;
  endTime?: string;
}

interface RawSeatChargeDetailLog {
  id?: number;
  state?: {
    code?: string;
    name?: string;
  };
  beginTime?: string;
  endTime?: string;
  dateCreated?: string;
}

interface RawSeatChargeDetail {
  logs?: RawSeatChargeDetailLog[] | null;
}

interface RawSeatChargeSummary {
  id?: number;
  room?: RawSeatRoomRef;
  seat?: {
    id?: number;
    code?: string;
  };
  state?: {
    code?: string;
    name?: string;
  };
  reservationTime?: string;
  beginTime?: string;
  endTime?: string;
  isCheckinable?: boolean;
  checkinExpiryDate?: string;
  arrivalConfirmMethods?: string[] | null;
  isReturnable?: boolean;
  isRenewable?: boolean;
  renewalLimit?: number;
  renewableCnt?: number;
  dateCreated?: string;
}

interface RawListResponse<T> {
  totalCount?: number;
  list?: T[] | null;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }
  return value;
}

function ensureString(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function ensureNumber(value: number | undefined, message: string): number {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

function resolveCampusKey(input: string | undefined): LibraryCampusKey | "all" {
  const normalized = input?.trim().toLowerCase();
  if (!normalized || normalized === "all" || normalized === "전체") {
    return "all";
  }

  if (
    normalized === "자연" ||
    normalized === "자연캠퍼스" ||
    normalized === "nature"
  ) {
    return "nature";
  }

  if (
    normalized === "인문" ||
    normalized === "인문캠퍼스" ||
    normalized === "humanities"
  ) {
    return "humanities";
  }

  throw new Error("campus 는 인문, 자연, all 중 하나여야 합니다.");
}

function formatCompactTime(value: string | undefined): string | undefined {
  const compact = cleanString(value);
  if (!compact) {
    return undefined;
  }

  const match = /^(\d{2})(\d{2})$/.exec(compact);
  if (!match) {
    return compact;
  }

  return `${match[1]}:${match[2]}`;
}

function formatLocalDateTime(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function floorToMinute(date: Date = new Date()): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    0,
    0
  );
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function parseDateTime(value: string): Date {
  const match =
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) {
    throw new Error(
      `날짜/시간 형식이 올바르지 않습니다: ${value}. 예: 2026-03-23 09:00`
    );
  }

  const second = Number.parseInt(match[6] ?? "0", 10);
  return new Date(
    Number.parseInt(match[1]!, 10),
    Number.parseInt(match[2]!, 10) - 1,
    Number.parseInt(match[3]!, 10),
    Number.parseInt(match[4]!, 10),
    Number.parseInt(match[5]!, 10),
    second
  );
}

function parseClockMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`시각 형식이 올바르지 않습니다: ${value}`);
  }

  return Number.parseInt(match[1]!, 10) * 60 + Number.parseInt(match[2]!, 10);
}

function isWithinChargeableHourWindow(
  beginTime: string,
  endTime: string,
  hour: LibrarySeatChargeableHour
): boolean {
  if (hour.isAllDayOpen) {
    return true;
  }

  const begin = parseDateTime(beginTime);
  const end = parseDateTime(endTime);
  const sameDay =
    begin.getFullYear() === end.getFullYear() &&
    begin.getMonth() === end.getMonth() &&
    begin.getDate() === end.getDate();
  if (!sameDay) {
    return false;
  }

  const beginMinutes = begin.getHours() * 60 + begin.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const ruleBeginMinutes = parseClockMinutes(hour.beginTime);
  const ruleEndMinutes = parseClockMinutes(hour.endTime);
  return ruleBeginMinutes <= beginMinutes && endMinutes <= ruleEndMinutes;
}

function mapChargeableHour(
  raw: RawSeatChargeableHour | undefined
): LibrarySeatChargeableHour | undefined {
  if (!raw) {
    return undefined;
  }

  const id = cleanNumber(raw.id);
  const beginTime = formatCompactTime(raw.beginTime);
  const endTime = formatCompactTime(raw.endTime);
  const minUseTime = cleanNumber(raw.minUseTime);
  const maxUseTime = cleanNumber(raw.maxUseTime);
  const defaultUseTime = cleanNumber(raw.defaultUseTime);
  if (
    id === undefined ||
    beginTime === undefined ||
    endTime === undefined ||
    minUseTime === undefined ||
    maxUseTime === undefined ||
    defaultUseTime === undefined
  ) {
    return undefined;
  }

  return {
    id,
    isAllDayOpen: raw.isAllDayOpen === true,
    beginTime,
    endTime,
    minUseTime,
    maxUseTime,
    defaultUseTime
  };
}

function mapSeatSummary(raw: RawSeatSummary): LibrarySeatSummary {
  const roomId = cleanNumber(raw.room?.id);
  const roomName = cleanString(raw.room?.name);

  return {
    seatId: ensureNumber(raw.id, "열람실 좌석 id 를 찾지 못했습니다."),
    ...(roomId !== undefined ? { roomId } : {}),
    ...(roomName !== undefined ? { roomName } : {}),
    seatCode: ensureString(raw.code, "열람실 좌석 번호를 찾지 못했습니다."),
    isActive: raw.isActive === true,
    isReservable: raw.isReservable === true,
    isOccupied: raw.isOccupied === true,
    remainingTime: cleanNumber(raw.remainingTime) ?? 0,
    chargeTime: cleanNumber(raw.chargeTime) ?? 0
  };
}

function mapSeatReservationSummary(
  raw: RawSeatChargeSummary
): LibrarySeatReservationSummary {
  const stateCode = cleanString(raw.state?.code);
  const stateLabel = cleanString(raw.state?.name);
  const checkinExpiryDate = cleanString(raw.checkinExpiryDate);
  const dateCreated = cleanString(raw.dateCreated);
  const renewalLimit = cleanNumber(raw.renewalLimit);
  const renewableCount = cleanNumber(raw.renewableCnt);

  return {
    reservationId: ensureNumber(raw.id, "열람실 예약 id 를 찾지 못했습니다."),
    roomId: ensureNumber(raw.room?.id, "열람실 예약 room id 를 찾지 못했습니다."),
    roomName: ensureString(raw.room?.name, "열람실 예약 room 이름을 찾지 못했습니다."),
    seatId: ensureNumber(raw.seat?.id, "열람실 좌석 id 를 찾지 못했습니다."),
    seatCode: ensureString(raw.seat?.code, "열람실 좌석 번호를 찾지 못했습니다."),
    reservationTime: ensureString(
      raw.reservationTime,
      "열람실 예약 시간 문자열을 찾지 못했습니다."
    ),
    beginTime: ensureString(raw.beginTime, "열람실 예약 시작 시각을 찾지 못했습니다."),
    endTime: ensureString(raw.endTime, "열람실 예약 종료 시각을 찾지 못했습니다."),
    ...(stateCode !== undefined ? { stateCode } : {}),
    ...(stateLabel !== undefined ? { stateLabel } : {}),
    isCheckinable: raw.isCheckinable === true,
    ...(checkinExpiryDate !== undefined ? { checkinExpiryDate } : {}),
    arrivalConfirmMethods: (raw.arrivalConfirmMethods ?? []).filter(
      (value): value is string => typeof value === "string" && value.length > 0
    ),
    isReturnable: raw.isReturnable === true,
    isRenewable: raw.isRenewable === true,
    ...(renewalLimit !== undefined ? { renewalLimit } : {}),
    ...(renewableCount !== undefined ? { renewableCount } : {}),
    ...(dateCreated !== undefined ? { dateCreated } : {})
  };
}

function buildSeatReservationTimeLabel(beginTime: string, endTime: string): string {
  const [beginDate, beginClock] = beginTime.split(" ");
  const [endDate, endClock] = endTime.split(" ");
  if (beginDate && beginClock && endDate && endClock && beginDate === endDate) {
    return `${beginDate} ${beginClock} ~ ${endClock}`;
  }
  return `${beginTime} ~ ${endTime}`;
}

function isWithinReservableWindow(
  reservableDates: LibrarySeatReservableDate[],
  beginTime: string,
  endTime: string
): boolean {
  const begin = parseDateTime(beginTime);
  const end = parseDateTime(endTime);

  return reservableDates.some((item) => {
    const windowBegin = parseDateTime(`${item.date} ${item.beginTime}`);
    let windowEnd = parseDateTime(`${item.date} ${item.endTime}`);
    if (windowEnd.getTime() <= windowBegin.getTime()) {
      windowEnd = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000);
    }
    return windowBegin.getTime() <= begin.getTime() && end.getTime() <= windowEnd.getTime();
  });
}

function normalizeReservationMatchTime(value: string): string {
  return value.trim().replace(/:\d{2}$/, "");
}

function normalizeReservationLabel(beginTime: string, endTime: string): string {
  return buildSeatReservationTimeLabel(
    normalizeReservationMatchTime(beginTime),
    normalizeReservationMatchTime(endTime)
  );
}

async function ensureAuthenticated(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials
): Promise<LibraryUserInfo> {
  const { myInfo } = await client.ensureAuthenticated<{
    id?: number;
    name?: string;
    memberNo?: string;
    branch?: RawBranch;
  }>(credentials.userId, credentials.password);
  const branchId = cleanNumber(myInfo.branch?.id);
  const branchName = cleanString(myInfo.branch?.name);
  const branchAlias = cleanString(myInfo.branch?.alias);

  return {
    id: ensureNumber(myInfo.id, "도서관 사용자 id 를 찾지 못했습니다."),
    name: ensureString(myInfo.name, "도서관 사용자 이름을 찾지 못했습니다."),
    memberNo: ensureString(myInfo.memberNo, "도서관 사용자 학번을 찾지 못했습니다."),
    ...(branchId !== undefined ? { branchId } : {}),
    ...(branchName !== undefined ? { branchName } : {}),
    ...(branchAlias !== undefined ? { branchAlias } : {})
  };
}

async function getReadingRoomDetailInternal(
  client: MjuLibraryClient,
  options: {
    roomId: number;
    hopeDate?: string;
  }
): Promise<LibraryReadingRoomDetail> {
  const hopeDate = options.hopeDate?.trim() || formatLocalDateTime();
  const rawRoom = await client.getApiData<RawSeatRoomDetail>(
    `/${LIBRARY_HOMEPAGE_ID}/api/seat-rooms/${options.roomId}`,
    {
      searchParams: {
        smufMethodCode: LIBRARY_SMUF_METHOD_CODE
      }
    }
  );
  const rawSeats = await client.getApiData<RawListResponse<RawSeatSummary>>(
    `/${LIBRARY_HOMEPAGE_ID}/api/rooms/${options.roomId}/seats`,
    {
      searchParams: {
        hopeDate
      }
    }
  );
  const seats = (rawSeats.list ?? []).map(mapSeatSummary);
  const description = cleanString(rawRoom.description);
  const attention = cleanString(rawRoom.attention);

  return {
    roomId: options.roomId,
    roomName: ensureString(rawRoom.name, "열람실 이름을 찾지 못했습니다."),
    ...(description !== undefined ? { description } : {}),
    ...(attention !== undefined ? { attention } : {}),
    reservable: rawRoom.reservable === true,
    reservableDates: (rawRoom.reservableDates ?? [])
      .map((item) => {
        const date = cleanString(item.date);
        const beginTime = formatCompactTime(item.beginTime);
        const endTime = formatCompactTime(item.endTime);
        return date && beginTime && endTime
          ? { date, beginTime, endTime }
          : null;
      })
      .filter(
        (item): item is LibrarySeatReservableDate => item !== null
      ),
    seatTypes: (rawRoom.seatTypes ?? [])
      .map((item) => {
        const id = cleanNumber(item.id);
        const name = cleanString(item.name);
        return id !== undefined && name ? { id, name } : null;
      })
      .filter((item): item is LibrarySeatType => item !== null),
    seats,
    hopeDate,
    totalSeatCount: seats.length,
    occupiedSeatCount: seats.filter((seat) => seat.isOccupied).length,
    reservableSeatCount: seats.filter((seat) => seat.isReservable).length
  };
}

async function getSeatDetailInternal(
  client: MjuLibraryClient,
  input: Pick<LibrarySeatReservationRequestInput, "roomId" | "seatId"> & {
    hopeBeginTime: string;
  }
): Promise<LibrarySeatDetail> {
  const rawSeat = await client.getApiData<RawSeatDetail>(
    `/${LIBRARY_HOMEPAGE_ID}/api/rooms/${input.roomId}/seats/${input.seatId}`,
    {
      searchParams: {
        hopeBeginTime: input.hopeBeginTime
      }
    }
  );
  const chargeableHour = mapChargeableHour(rawSeat.seatChargeableHour);

  return {
    seatId: ensureNumber(rawSeat.id, "열람실 좌석 id 를 찾지 못했습니다."),
    seatCode: ensureString(rawSeat.code, "열람실 좌석 번호를 찾지 못했습니다."),
    roomId: ensureNumber(rawSeat.room?.id, "열람실 room id 를 찾지 못했습니다."),
    roomName: ensureString(rawSeat.room?.name, "열람실 room 이름을 찾지 못했습니다."),
    companionCount: cleanNumber(rawSeat.companionCnt) ?? 0,
    isOccupied: rawSeat.isOccupied === true,
    isFavoriteSeat: rawSeat.isFavoriteSeat === true,
    hasTimeline: Array.isArray(rawSeat.timeLine) && rawSeat.timeLine.length > 0,
    ...(chargeableHour !== undefined ? { chargeableHour } : {})
  };
}

async function buildSeatReservationPreview(
  client: MjuLibraryClient,
  input: LibrarySeatReservationRequestInput
): Promise<LibrarySeatReservationPreview> {
  const reservationStart = floorToMinute();
  const predictedBeginTime = formatLocalDateTime(reservationStart);
  const room = await getReadingRoomDetailInternal(client, {
    roomId: input.roomId,
    hopeDate: predictedBeginTime
  });
  const seat = await getSeatDetailInternal(client, {
    roomId: input.roomId,
    seatId: input.seatId,
    hopeBeginTime: predictedBeginTime
  });

  if (seat.roomId !== input.roomId) {
    throw new Error("선택한 좌석이 지정한 열람실에 속하지 않습니다.");
  }

  if (seat.isOccupied) {
    throw new Error("현재 좌석 상세 응답 기준으로 이미 사용 중인 좌석입니다.");
  }

  if (seat.hasTimeline) {
    throw new Error(
      "이 좌석은 시간선(timeLine) 기반 예약으로 보입니다. 현재 구현은 실데이터로 검증된 즉시 예약 좌석만 지원합니다."
    );
  }

  if (!room.roomName) {
    throw new Error("열람실 정보를 확인하지 못했습니다.");
  }

  if (!seat.chargeableHour) {
    throw new Error("좌석 이용 규칙(seatChargeableHour)을 찾지 못했습니다.");
  }

  const predictedEndTime = formatLocalDateTime(
    addMinutes(reservationStart, seat.chargeableHour.defaultUseTime)
  );

  return {
    roomId: seat.roomId,
    roomName: seat.roomName,
    seatId: seat.seatId,
    seatCode: seat.seatCode,
    beginTime: predictedBeginTime,
    endTime: predictedEndTime,
    reservationTime: buildSeatReservationTimeLabel(
      predictedBeginTime,
      predictedEndTime
    ),
    approvalWarnings: [],
    chargeableHour: seat.chargeableHour
  };
}

async function findSeatReservationById(
  client: MjuLibraryClient,
  reservationId: number
): Promise<LibrarySeatReservationSummary> {
  let raw: RawListResponse<RawSeatChargeSummary>;
  try {
    raw = await client.getApiData<RawListResponse<RawSeatChargeSummary>>(
      `/${LIBRARY_HOMEPAGE_ID}/api/seat-charges`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("[success.noRecord]")) {
      raw = { list: [] };
    } else {
      throw error;
    }
  }
  const reservation = (raw.list ?? [])
    .map(mapSeatReservationSummary)
    .find((item) => item.reservationId === reservationId);

  if (!reservation) {
    throw new Error(`열람실 예약 ${reservationId} 을(를) 찾지 못했습니다.`);
  }

  return reservation;
}

async function getSeatReservationDetailInternal(
  client: MjuLibraryClient,
  reservationId: number
): Promise<RawSeatChargeDetail> {
  return client.getApiData<RawSeatChargeDetail>(
    `/${LIBRARY_HOMEPAGE_ID}/api/seat-charges/${reservationId}`
  );
}

async function waitForSeatReservationById(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  reservationId: number,
  attempts = 6,
  delayMs = 1000
): Promise<LibrarySeatReservationSummary | undefined> {
  for (let index = 0; index < attempts; index += 1) {
    const reservations = await listLibrarySeatReservations(client, credentials);
    const matched = reservations.reservations.find(
      (item) => item.reservationId === reservationId
    );
    if (matched) {
      return matched;
    }

    if (index < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return undefined;
}

export async function listLibraryReadingRooms(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  options: {
    campus?: string;
  } = {}
): Promise<{
  user: LibraryUserInfo;
  campuses: LibraryReadingRoomCampusAvailability[];
}> {
  const user = await ensureAuthenticated(client, credentials);
  const campusSelection = resolveCampusKey(options.campus);
  const campuses: LibraryCampusKey[] =
    campusSelection === "all" ? ["nature", "humanities"] : [campusSelection];

  const results: LibraryReadingRoomCampusAvailability[] = [];
  for (const campus of campuses) {
    const branchGroup = LIBRARY_BRANCH_GROUPS[campus];
    const raw = await client.getApiData<RawListResponse<RawSeatRoomSummary>>(
      `/${LIBRARY_HOMEPAGE_ID}/seat-rooms`,
      {
        searchParams: {
          branchGroupId: branchGroup.id,
          smufMethodCode: LIBRARY_SMUF_METHOD_CODE
        }
      }
    );

    const rooms: LibraryReadingRoomSummary[] = (raw.list ?? []).map((item) => {
      const roomTypeId = cleanNumber(item.roomType?.id);
      const roomTypeName = cleanString(item.roomType?.name);
      const branchId = cleanNumber(item.branch?.id);
      const branchName = cleanString(item.branch?.name);
      const branchAlias = cleanString(item.branch?.alias);
      const unableMessage = cleanString(item.unableMessage);
      return {
        roomId: ensureNumber(item.id, "열람실 id 를 찾지 못했습니다."),
        roomName: ensureString(item.name, "열람실 이름을 찾지 못했습니다."),
        ...(roomTypeId !== undefined ? { roomTypeId } : {}),
        ...(roomTypeName !== undefined ? { roomTypeName } : {}),
        ...(branchId !== undefined ? { branchId } : {}),
        ...(branchName !== undefined ? { branchName } : {}),
        ...(branchAlias !== undefined ? { branchAlias } : {}),
        isChargeable: item.isChargeable === true,
        ...(unableMessage !== undefined ? { unableMessage } : {}),
        seats: {
          total: cleanNumber(item.seats?.total) ?? 0,
          occupied: cleanNumber(item.seats?.occupied) ?? 0,
          waiting: cleanNumber(item.seats?.waiting) ?? 0,
          available: cleanNumber(item.seats?.available) ?? 0
        }
      };
    });

    results.push({
      campus,
      branchGroupId: branchGroup.id,
      branchName: branchGroup.name,
      branchAlias: branchGroup.alias,
      rooms
    });
  }

  return {
    user,
    campuses: results
  };
}

export async function getLibraryReadingRoomDetail(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  options: {
    roomId: number;
    hopeDate?: string;
  }
): Promise<{
  user: LibraryUserInfo;
  room: LibraryReadingRoomDetail;
}> {
  const user = await ensureAuthenticated(client, credentials);
  const room = await getReadingRoomDetailInternal(client, options);
  return { user, room };
}

export async function listLibrarySeatReservations(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials
): Promise<{
  user: LibraryUserInfo;
  reservations: LibrarySeatReservationSummary[];
}> {
  const user = await ensureAuthenticated(client, credentials);
  let raw: RawListResponse<RawSeatChargeSummary>;
  try {
    raw = await client.getApiData<RawListResponse<RawSeatChargeSummary>>(
      `/${LIBRARY_HOMEPAGE_ID}/api/seat-charges`
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("[success.noRecord]")
    ) {
      raw = { list: [] };
    } else {
      throw error;
    }
  }

  return {
    user,
    reservations: (raw.list ?? []).map(mapSeatReservationSummary)
  };
}

export async function previewLibrarySeatReservation(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  input: LibrarySeatReservationRequestInput
): Promise<{
  user: LibraryUserInfo;
  preview: LibrarySeatReservationPreview;
}> {
  const user = await ensureAuthenticated(client, credentials);
  const preview = await buildSeatReservationPreview(client, input);
  return { user, preview };
}

export async function createLibrarySeatReservation(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  input: LibrarySeatReservationRequestInput
): Promise<{
  user: LibraryUserInfo;
  result: LibrarySeatReservationResult;
}> {
  const user = await ensureAuthenticated(client, credentials);
  const preview = await buildSeatReservationPreview(client, input);
  const created = await client.postApiData<RawSeatChargeCreated>(
    `/${LIBRARY_HOMEPAGE_ID}/api/seat-charges`,
    {
      seatId: input.seatId,
      smufMethodCode: LIBRARY_SMUF_METHOD_CODE
    }
  );

  const reservationId = cleanNumber(created.id);
  if (reservationId === undefined) {
    throw new Error("생성된 열람실 예약 id 를 확인하지 못했습니다.");
  }

  const createdReservation = await waitForSeatReservationById(
    client,
    credentials,
    reservationId
  );

  if (createdReservation) {
    return {
      user,
      result: {
        roomId: createdReservation.roomId,
        roomName: createdReservation.roomName,
        seatId: createdReservation.seatId,
        seatCode: createdReservation.seatCode,
        beginTime: normalizeReservationMatchTime(createdReservation.beginTime),
        endTime: normalizeReservationMatchTime(createdReservation.endTime),
        reservationTime: createdReservation.reservationTime,
        approvalWarnings: preview.approvalWarnings,
        ...(preview.chargeableHour ? { chargeableHour: preview.chargeableHour } : {}),
        reservationId,
        ...(createdReservation.stateCode ? { stateCode: createdReservation.stateCode } : {}),
        ...(createdReservation.stateLabel ? { stateLabel: createdReservation.stateLabel } : {}),
        ...(createdReservation.checkinExpiryDate
          ? { checkinExpiryDate: createdReservation.checkinExpiryDate }
          : {}),
        arrivalConfirmMethods: createdReservation.arrivalConfirmMethods
      }
    };
  }

  const createdBeginTime = cleanString(created.beginTime);
  const createdEndTime = cleanString(created.endTime);
  if (!createdBeginTime || !createdEndTime) {
    throw new Error("생성된 열람실 예약의 시작/종료 시각을 확인하지 못했습니다.");
  }

  const detail = await getSeatReservationDetailInternal(client, reservationId);
  const latestLog = [...(detail.logs ?? [])]
    .reverse()
    .find((item) => cleanString(item.state?.code) !== undefined);
  const stateCode = cleanString(latestLog?.state?.code);
  const stateLabel = cleanString(latestLog?.state?.name);

  return {
    user,
    result: {
      roomId: input.roomId,
      roomName: ensureString(
        cleanString(created.room?.name) ?? preview.roomName,
        "생성된 열람실 이름을 확인하지 못했습니다."
      ),
      seatId: ensureNumber(created.seat?.id ?? input.seatId, "생성된 좌석 id 를 확인하지 못했습니다."),
      seatCode: ensureString(
        cleanString(created.seat?.code) ?? preview.seatCode,
        "생성된 좌석 번호를 확인하지 못했습니다."
      ),
      beginTime: normalizeReservationMatchTime(createdBeginTime),
      endTime: normalizeReservationMatchTime(createdEndTime),
      reservationTime: normalizeReservationLabel(createdBeginTime, createdEndTime),
      approvalWarnings: preview.approvalWarnings,
      ...(preview.chargeableHour ? { chargeableHour: preview.chargeableHour } : {}),
      reservationId,
      ...(stateCode ? { stateCode } : {}),
      ...(stateLabel ? { stateLabel } : {}),
      arrivalConfirmMethods: []
    }
  };
}

export async function previewLibrarySeatReservationCancel(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  reservationId: number
): Promise<{
  user: LibraryUserInfo;
  reservation: LibrarySeatReservationSummary;
}> {
  const user = await ensureAuthenticated(client, credentials);
  const reservation = await findSeatReservationById(client, reservationId);
  return { user, reservation };
}

export async function cancelLibrarySeatReservation(
  client: MjuLibraryClient,
  credentials: ResolvedLmsCredentials,
  reservationId: number
): Promise<{
  user: LibraryUserInfo;
  cancelledReservation: LibrarySeatReservationSummary;
  remainingReservations: LibrarySeatReservationSummary[];
}> {
  const { user, reservation } = await previewLibrarySeatReservationCancel(
    client,
    credentials,
    reservationId
  );
  await client.deleteApiData(
    `/${LIBRARY_HOMEPAGE_ID}/api/seat-charges/${reservationId}`,
    {
      searchParams: {
        smufMethodCode: LIBRARY_SMUF_METHOD_CODE
      }
    }
  );
  const remainingReservations = await listLibrarySeatReservations(client, credentials);

  return {
    user,
    cancelledReservation: reservation,
    remainingReservations: remainingReservations.reservations
  };
}
