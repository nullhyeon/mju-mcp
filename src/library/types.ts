import type { LibraryCampusKey } from "./constants.js";

export interface LibraryApiEnvelope<T> {
  success: boolean;
  code?: string;
  message?: string;
  data?: T;
}

export interface LibrarySessionPayload {
  savedAt: string;
  accessToken: string;
}

export interface LibraryUserInfo {
  id: number;
  name: string;
  memberNo: string;
  branchId?: number;
  branchName?: string;
  branchAlias?: string;
}

export interface LibraryFloorOption {
  value: number;
  label: string;
}

export interface LibraryStudyRoomSummary {
  roomId: number;
  roomName: string;
  roomTypeName?: string;
  floorValue?: number;
  floorLabel?: string;
  minQuota?: number;
  maxQuota?: number;
  quota?: number;
  isChargeable: boolean;
  unableMessage?: string;
}

export interface LibraryCampusAvailability {
  campus: LibraryCampusKey;
  branchGroupId: number;
  branchName: string;
  branchAlias: string;
  selectedDate: string;
  availableDates: string[];
  floors: LibraryFloorOption[];
  rooms: LibraryStudyRoomSummary[];
}

export interface LibrarySeatCounts {
  total: number;
  occupied: number;
  waiting: number;
  available: number;
}

export interface LibraryReadingRoomSummary {
  roomId: number;
  roomName: string;
  roomTypeId?: number;
  roomTypeName?: string;
  branchId?: number;
  branchName?: string;
  branchAlias?: string;
  isChargeable: boolean;
  unableMessage?: string;
  seats: LibrarySeatCounts;
}

export interface LibraryReadingRoomCampusAvailability {
  campus: LibraryCampusKey;
  branchGroupId: number;
  branchName: string;
  branchAlias: string;
  rooms: LibraryReadingRoomSummary[];
}

export interface LibrarySeatType {
  id: number;
  name: string;
}

export interface LibrarySeatReservableDate {
  date: string;
  beginTime: string;
  endTime: string;
}

export interface LibrarySeatSummary {
  seatId: number;
  roomId?: number;
  roomName?: string;
  seatCode: string;
  isActive: boolean;
  isReservable: boolean;
  isOccupied: boolean;
  remainingTime: number;
  chargeTime: number;
}

export interface LibrarySeatChargeableHour {
  id: number;
  isAllDayOpen: boolean;
  beginTime: string;
  endTime: string;
  minUseTime: number;
  maxUseTime: number;
  defaultUseTime: number;
}

export interface LibrarySeatDetail {
  seatId: number;
  seatCode: string;
  roomId: number;
  roomName: string;
  companionCount: number;
  isOccupied: boolean;
  isFavoriteSeat: boolean;
  hasTimeline: boolean;
  chargeableHour?: LibrarySeatChargeableHour;
}

export interface LibraryReadingRoomDetail {
  roomId: number;
  roomName: string;
  description?: string;
  attention?: string;
  reservable: boolean;
  reservableDates: LibrarySeatReservableDate[];
  seatTypes: LibrarySeatType[];
  seats: LibrarySeatSummary[];
  hopeDate: string;
  totalSeatCount: number;
  occupiedSeatCount: number;
  reservableSeatCount: number;
}

export interface LibrarySeatReservationSummary {
  reservationId: number;
  roomId: number;
  roomName: string;
  seatId: number;
  seatCode: string;
  reservationTime: string;
  beginTime: string;
  endTime: string;
  stateCode?: string;
  stateLabel?: string;
  isCheckinable: boolean;
  checkinExpiryDate?: string;
  arrivalConfirmMethods: string[];
  isReturnable: boolean;
  isRenewable: boolean;
  renewalLimit?: number;
  renewableCount?: number;
  dateCreated?: string;
}

export interface LibrarySeatReservationRequestInput {
  roomId: number;
  seatId: number;
}

export interface LibrarySeatReservationPreview {
  roomId: number;
  roomName: string;
  seatId: number;
  seatCode: string;
  beginTime: string;
  endTime: string;
  reservationTime: string;
  approvalWarnings: string[];
  chargeableHour?: LibrarySeatChargeableHour;
}

export interface LibrarySeatReservationResult
  extends LibrarySeatReservationPreview {
  reservationId: number;
  stateCode?: string;
  stateLabel?: string;
  checkinExpiryDate?: string;
  arrivalConfirmMethods: string[];
}

export interface LibraryUseSection {
  id: number;
  code: string;
  name: string;
}

export interface LibraryTimeSlot {
  time: string;
  className: string;
  selectable: boolean;
  stepMinutes: number;
}

export interface LibraryBlockedTimeRange {
  startTime: string;
  endTime: string;
  className: string;
}

export interface LibraryStudyRoomDetail {
  roomId: number;
  roomName: string;
  campusId?: number;
  campusName?: string;
  campusAlias?: string;
  buildingName?: string;
  floorValue?: number;
  floorLabel?: string;
  roomTypeName?: string;
  minQuota?: number;
  maxQuota?: number;
  quota?: number;
  isChargeable: boolean;
  description?: string;
  attention?: string;
  note?: string;
  date: string;
  availableDates: string[];
  availableMonths: string[];
  timeUnit?: string;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  useCompanionRegistration: boolean;
  useOutsiderRegistration: boolean;
  equipments: Array<{
    id: number;
    name: string;
  }>;
  expansionFields: Array<{
    code: string;
    name: string;
    isMandatory: boolean;
  }>;
  useSections: LibraryUseSection[];
  timeline: LibraryTimeSlot[];
  blockedRanges: LibraryBlockedTimeRange[];
  reservableStartTimes: string[];
  reservableEndTimes?: string[];
}

export interface LibraryCompanionInput {
  name: string;
  memberNo: string;
}

export interface LibraryCompanion {
  id: number;
  name: string;
  memberNo: string;
}

export interface LibraryRoomReservationSummary {
  reservationId: number;
  roomId?: number;
  roomName: string;
  campusName?: string;
  campusAlias?: string;
  useSectionName?: string;
  stateCode?: string;
  stateLabel?: string;
  reservationTime: string;
  beginTime?: string;
  endTime?: string;
  companionCount: number;
}

export interface LibraryRoomReservationDetail {
  reservationId: number;
  roomId: number;
  roomName: string;
  campusName?: string;
  campusAlias?: string;
  buildingName?: string;
  floorLabel?: string;
  reservationTime: string;
  beginTime: string;
  endTime: string;
  stateCode?: string;
  stateLabel?: string;
  useSection?: LibraryUseSection;
  isEditable: boolean;
  isCheckinable: boolean;
  isReturnable: boolean;
  isRenewable: boolean;
  companionCount: number;
  companions: LibraryCompanion[];
  patronMessage?: string;
  workerMessage?: string;
  dateCreated?: string;
  timeUnit?: string;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  minQuota?: number;
  maxQuota?: number;
  useCompanionRegistration: boolean;
  useOutsiderRegistration: boolean;
  equipmentIds: number[];
  additionalInfoValues: Record<string, string>;
}

export interface LibraryReservationRequestInput {
  roomId: number;
  date: string;
  beginTime: string;
  endTime: string;
  useSectionId?: number;
  useSectionCode?: string;
  useSectionName?: string;
  companionCount?: number;
  companions?: LibraryCompanionInput[];
  patronMessage?: string;
  equipmentIds?: number[];
  additionalInfoValues?: Record<string, string>;
}

export interface LibraryReservationMutationPreview {
  roomId: number;
  roomName: string;
  campusName?: string;
  campusAlias?: string;
  date: string;
  beginTime: string;
  endTime: string;
  reservationTime: string;
  useSection: LibraryUseSection;
  companionCount: number;
  resolvedCompanions: LibraryCompanion[];
  approvalWarnings: string[];
}

export interface LibraryReservationMutationResult
  extends LibraryReservationMutationPreview {
  reservationId: number;
  stateCode?: string;
  stateLabel?: string;
}
