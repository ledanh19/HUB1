/**
 * SEGMENT GOVERNANCE UTILITIES
 * ============================
 * 
 * PRINCIPLE: Segment = đơn vị vận hành + pháp lý (Ops Authority)
 * - Check-in/Check-out thao tác theo SEGMENT (đúng nghiệp vụ)
 * - CCCD/Document mapping theo HOST (partner_id)
 * - Filter ngày theo OTA / OPS / COMBINED mode
 * 
 * CONSTRAINT (KHÔNG ĐỔI DB):
 * - stays table chỉ có booking-level (1 record per unified_booking_id)
 * - guest_documents không có partner_id
 * - → Governance chỉ ở UI-level, derived states
 */

import { HostSupplySegment } from "@/hooks/useHostSupplySegments";

// =============== TYPES ===============

export interface SegmentAnalysis {
  segment_id: string;
  partner_id: string;
  partner_name: string | null;
  host_property_name: string | null;
  host_room_type: string | null;
  room_code: string | null;
  date_from: string;
  date_to: string;
  nights: number;
  segmentIndex: number;        // 1-based
  totalSegments: number;
  // Governance flags
  requiresCheckIn: boolean;    // true if first segment or different host from previous
  requiresDocument: boolean;   // true if different host from previous
  isFirstSegment: boolean;
  isPreviousHostDifferent: boolean;
  hasGapFromPrevious: boolean;
}

export interface SegmentGovernanceResult {
  segments: SegmentAnalysis[];
  hasMultiHost: boolean;
  hasGap: boolean;
  hasOverlap: boolean;
  totalNights: number;
  uniqueHosts: string[];       // partner_ids
  warningLevel: "NONE" | "INFO" | "WARNING" | "CRITICAL";
  warnings: string[];
}

export interface DateModeConfig {
  mode: "OTA" | "OPS" | "COMBINED";
  selectedDate: string;        // YYYY-MM-DD format
}

export interface CheckInRequirement {
  canCheckIn: boolean;
  blockingReason: string | null;
  segment: SegmentAnalysis | null;
  documentRequired: boolean;
  warnings: string[];
}

// =============== SEGMENT ANALYSIS ===============

/**
 * Analyze segments for a booking and determine governance requirements
 */
export function analyzeSegments(
  segments: HostSupplySegment[],
  bookingCheckIn: string,
  bookingCheckOut: string
): SegmentGovernanceResult {
  if (segments.length === 0) {
    return {
      segments: [],
      hasMultiHost: false,
      hasGap: false,
      hasOverlap: false,
      totalNights: 0,
      uniqueHosts: [],
      warningLevel: "WARNING",
      warnings: ["Chưa có Host Supply Segment - cần phân bổ phòng host"],
    };
  }

  // Sort segments by date_from
  const sorted = [...segments].sort((a, b) => 
    a.date_from.localeCompare(b.date_from)
  );

  const uniqueHostIds = new Set<string>();
  const warnings: string[] = [];
  let hasGap = false;
  let hasOverlap = false;
  let totalNights = 0;

  const analyzed: SegmentAnalysis[] = sorted.map((seg, idx) => {
    uniqueHostIds.add(seg.partner_id);
    totalNights += seg.nights;

    const previousSeg = idx > 0 ? sorted[idx - 1] : null;
    const isPreviousHostDifferent = previousSeg 
      ? previousSeg.partner_id !== seg.partner_id 
      : false;
    
    // Check for gap: previous date_to !== current date_from
    const hasGapFromPrevious = previousSeg 
      ? previousSeg.date_to !== seg.date_from
      : false;
    
    if (hasGapFromPrevious) {
      // Check if it's a gap (positive) or overlap (negative)
      const prevEnd = new Date(previousSeg!.date_to);
      const currStart = new Date(seg.date_from);
      if (currStart > prevEnd) {
        hasGap = true;
        warnings.push(`Gap giữa segment ${idx} và ${idx + 1}: ${previousSeg!.date_to} → ${seg.date_from}`);
      } else if (currStart < prevEnd) {
        hasOverlap = true;
        warnings.push(`OVERLAP giữa segment ${idx} và ${idx + 1}: ${seg.date_from} < ${previousSeg!.date_to}`);
      }
    }

    // Check-in requirement rules:
    // 1. First segment → always requires check-in
    // 2. Different host → requires check-in + document
    // 3. Gap → requires check-in
    const isFirstSegment = idx === 0;
    const requiresCheckIn = isFirstSegment || isPreviousHostDifferent || hasGapFromPrevious;
    const requiresDocument = isFirstSegment || isPreviousHostDifferent;

    return {
      segment_id: seg.id,
      partner_id: seg.partner_id,
      partner_name: seg.partner?.partner_name || null,
      host_property_name: seg.host_property_name,
      host_room_type: seg.host_room_type,
      room_code: seg.room_code,
      date_from: seg.date_from,
      date_to: seg.date_to,
      nights: seg.nights,
      segmentIndex: idx + 1,
      totalSegments: sorted.length,
      requiresCheckIn,
      requiresDocument,
      isFirstSegment,
      isPreviousHostDifferent,
      hasGapFromPrevious,
    };
  });

  // Multi-host warning
  const hasMultiHost = uniqueHostIds.size > 1;
  if (hasMultiHost) {
    warnings.push(`Booking có ${uniqueHostIds.size} hosts khác nhau - cần check-in/document riêng cho mỗi host`);
  }

  // Determine warning level
  let warningLevel: "NONE" | "INFO" | "WARNING" | "CRITICAL" = "NONE";
  if (hasOverlap) {
    warningLevel = "CRITICAL";
  } else if (hasGap) {
    warningLevel = "WARNING";
  } else if (hasMultiHost) {
    warningLevel = "INFO";
  }

  return {
    segments: analyzed,
    hasMultiHost,
    hasGap,
    hasOverlap,
    totalNights,
    uniqueHosts: Array.from(uniqueHostIds),
    warningLevel,
    warnings,
  };
}

// =============== SEGMENT SELECTION ===============

/**
 * Find the current segment based on selected ops date
 * Returns the segment where selectedDate ∈ [date_from, date_to)
 */
export function findCurrentSegment(
  segments: SegmentAnalysis[],
  selectedDate: string
): SegmentAnalysis | null {
  const dateStr = selectedDate.split("T")[0]; // Normalize to YYYY-MM-DD
  
  return segments.find(seg => {
    const from = seg.date_from.split("T")[0];
    const to = seg.date_to.split("T")[0];
    return dateStr >= from && dateStr < to;
  }) || null;
}

/**
 * Find segments that match selectedDate (for filter)
 * Can return multiple if there's overlap
 */
export function findMatchingSegments(
  segments: SegmentAnalysis[],
  selectedDate: string
): SegmentAnalysis[] {
  const dateStr = selectedDate.split("T")[0];
  
  return segments.filter(seg => {
    const from = seg.date_from.split("T")[0];
    const to = seg.date_to.split("T")[0];
    return dateStr >= from && dateStr < to;
  });
}

// =============== CHECK-IN GOVERNANCE ===============

/**
 * Determine if check-in is allowed and what requirements exist
 */
export function evaluateCheckInRequirement(
  governance: SegmentGovernanceResult,
  selectedDate: string,
  actualCheckInAt: string | null,
  hasDocumentImage: boolean
): CheckInRequirement {
  const warnings: string[] = [];

  // Block if overlap exists
  if (governance.hasOverlap) {
    return {
      canCheckIn: false,
      blockingReason: "CRITICAL: Có segment bị chồng ngày - không thể check-in",
      segment: null,
      documentRequired: false,
      warnings: ["Cần sửa segment overlap trước khi check-in"],
    };
  }

  // Block if no segments
  if (governance.segments.length === 0) {
    return {
      canCheckIn: false,
      blockingReason: "Chưa có Host Supply Segment - cần phân bổ phòng host trước",
      segment: null,
      documentRequired: false,
      warnings: ["Tạo segment với host và phòng để tiếp tục"],
    };
  }

  // Find current segment for selected date
  const currentSegment = findCurrentSegment(governance.segments, selectedDate);
  
  if (!currentSegment) {
    // Check if selectedDate is before first segment
    const firstSeg = governance.segments[0];
    if (selectedDate < firstSeg.date_from.split("T")[0]) {
      return {
        canCheckIn: false,
        blockingReason: `Ngày đang chọn (${selectedDate}) trước ngày bắt đầu segment đầu tiên (${firstSeg.date_from})`,
        segment: null,
        documentRequired: false,
        warnings: [],
      };
    }
    
    return {
      canCheckIn: false,
      blockingReason: `Không có segment nào cho ngày ${selectedDate}`,
      segment: null,
      documentRequired: false,
      warnings: governance.hasGap ? ["Có GAP trong segment coverage"] : [],
    };
  }

  // Check if document is required for this segment
  const documentRequired = currentSegment.requiresDocument && !hasDocumentImage;

  if (documentRequired) {
    warnings.push("Cần tải CCCD/Passport cho host này");
  }

  // If this segment requires check-in (first or different host)
  if (currentSegment.requiresCheckIn) {
    if (currentSegment.isPreviousHostDifferent) {
      warnings.push(`Đổi host từ segment trước - bắt buộc check-in lại với ${currentSegment.partner_name || 'host mới'}`);
    }
    if (currentSegment.hasGapFromPrevious) {
      warnings.push("Có GAP với segment trước - bắt buộc check-in lại");
    }
  }

  return {
    canCheckIn: true,
    blockingReason: null,
    segment: currentSegment,
    documentRequired,
    warnings,
  };
}

// =============== DATE MODE FILTER ===============

export type DateMode = "OTA" | "OPS" | "COMBINED";

export interface DateFilterResult {
  matchesOTA: boolean;
  matchesOPS: boolean;
  matchesCombined: boolean;
  effectiveDateFrom: string | null;  // The date to use for display
  effectiveDateTo: string | null;
  dateSource: "OTA" | "OPS" | "FALLBACK";
}

/**
 * Determine if a booking/segment matches the selected date based on date mode
 */
export function evaluateDateFilter(
  config: DateModeConfig,
  bookingCheckIn: string,
  bookingCheckOut: string,
  segmentDateFrom: string | null,
  segmentDateTo: string | null
): DateFilterResult {
  const selectedDate = config.selectedDate;
  const bookingCheckInDate = bookingCheckIn?.split("T")[0];
  const bookingCheckOutDate = bookingCheckOut?.split("T")[0];
  const segmentFrom = segmentDateFrom?.split("T")[0] || null;
  const segmentTo = segmentDateTo?.split("T")[0] || null;

  // OTA mode: check against booking dates
  const matchesOTA = 
    (bookingCheckInDate === selectedDate) || 
    (bookingCheckOutDate === selectedDate);

  // OPS mode: check against segment dates (if exists)
  let matchesOPS = false;
  if (segmentFrom && segmentTo) {
    matchesOPS = selectedDate >= segmentFrom && selectedDate < segmentTo;
  }

  // COMBINED: matches either
  const matchesCombined = matchesOTA || matchesOPS;

  // Determine effective dates for display
  let effectiveDateFrom: string | null = null;
  let effectiveDateTo: string | null = null;
  let dateSource: "OTA" | "OPS" | "FALLBACK" = "FALLBACK";

  switch (config.mode) {
    case "OPS":
      if (segmentFrom) {
        effectiveDateFrom = segmentFrom;
        effectiveDateTo = segmentTo;
        dateSource = "OPS";
      } else {
        effectiveDateFrom = bookingCheckInDate;
        effectiveDateTo = bookingCheckOutDate;
        dateSource = "FALLBACK";
      }
      break;
    case "OTA":
      effectiveDateFrom = bookingCheckInDate;
      effectiveDateTo = bookingCheckOutDate;
      dateSource = "OTA";
      break;
    case "COMBINED":
      // Prefer OPS if available, fallback to OTA
      if (segmentFrom) {
        effectiveDateFrom = segmentFrom;
        effectiveDateTo = segmentTo;
        dateSource = "OPS";
      } else {
        effectiveDateFrom = bookingCheckInDate;
        effectiveDateTo = bookingCheckOutDate;
        dateSource = "OTA";
      }
      break;
  }

  return {
    matchesOTA,
    matchesOPS,
    matchesCombined,
    effectiveDateFrom,
    effectiveDateTo,
    dateSource,
  };
}

/**
 * Filter function for date mode
 */
export function matchesDateMode(
  config: DateModeConfig,
  bookingCheckIn: string,
  bookingCheckOut: string,
  segmentDateFrom: string | null,
  segmentDateTo: string | null
): boolean {
  const result = evaluateDateFilter(
    config,
    bookingCheckIn,
    bookingCheckOut,
    segmentDateFrom,
    segmentDateTo
  );

  switch (config.mode) {
    case "OTA":
      return result.matchesOTA;
    case "OPS":
      return result.matchesOPS || (result.dateSource === "FALLBACK" && result.matchesOTA);
    case "COMBINED":
      return result.matchesCombined;
  }
}

// =============== DOCUMENT GOVERNANCE ===============

export type DocumentStatus = 
  | "PRECHECK"           // Uploaded before check-in (valid)
  | "VALID_FOR_SEGMENT"  // Valid for current host/segment
  | "REQUIRED_REUPLOAD"  // Different host, need new docs
  | "NO_DOCUMENT";       // No docs at all

/**
 * Derive document status based on segment context
 * NOTE: This is DERIVED, not stored - because guest_documents has no partner_id
 */
export function deriveDocumentStatus(
  hasDocument: boolean,
  hasDocumentImage: boolean,
  sentToHostStatus: string | null,
  currentSegment: SegmentAnalysis | null
): {
  status: DocumentStatus;
  label: string;
  variant: "success" | "warning" | "danger" | "info";
  requiresAction: boolean;
  actionLabel: string | null;
} {
  if (!hasDocument || !hasDocumentImage) {
    return {
      status: "NO_DOCUMENT",
      label: "Chưa có giấy tờ",
      variant: "danger",
      requiresAction: true,
      actionLabel: "Tải CCCD/Passport",
    };
  }

  // If there's a segment and it's a different host from first
  if (currentSegment && currentSegment.isPreviousHostDifferent) {
    return {
      status: "REQUIRED_REUPLOAD",
      label: "Cần tải lại cho Host mới",
      variant: "warning",
      requiresAction: true,
      actionLabel: `Tải CCCD cho ${currentSegment.partner_name || 'Host mới'}`,
    };
  }

  // Check if sent to host
  if (sentToHostStatus === "SENT") {
    return {
      status: "VALID_FOR_SEGMENT",
      label: "Đã gửi Host",
      variant: "success",
      requiresAction: false,
      actionLabel: null,
    };
  }

  return {
    status: "PRECHECK",
    label: "Đã có, chưa gửi Host",
    variant: "info",
    requiresAction: true,
    actionLabel: "Gửi cho Host",
  };
}

// =============== WARNING HELPERS ===============

export interface GovernanceWarning {
  type: "MULTI_HOST" | "GAP" | "OVERLAP" | "NO_SEGMENT" | "DOCUMENT_REQUIRED";
  level: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  actionRequired: boolean;
  actionLabel: string | null;
}

export function buildGovernanceWarnings(
  governance: SegmentGovernanceResult,
  documentStatus: ReturnType<typeof deriveDocumentStatus>
): GovernanceWarning[] {
  const warnings: GovernanceWarning[] = [];

  // Overlap - CRITICAL
  if (governance.hasOverlap) {
    warnings.push({
      type: "OVERLAP",
      level: "CRITICAL",
      message: "CRITICAL: Có segment bị chồng ngày - cần sửa trước khi thao tác",
      actionRequired: true,
      actionLabel: "Sửa Segment",
    });
  }

  // No segments
  if (governance.segments.length === 0) {
    warnings.push({
      type: "NO_SEGMENT",
      level: "WARNING",
      message: "Chưa có Host Supply Segment - cần phân bổ phòng host",
      actionRequired: true,
      actionLabel: "Phân bổ phòng Host",
    });
  }

  // Gap
  if (governance.hasGap) {
    warnings.push({
      type: "GAP",
      level: "WARNING",
      message: "Có GAP trong segment - một số đêm chưa được phân bổ",
      actionRequired: true,
      actionLabel: "Phân bổ phòng",
    });
  }

  // Multi-host
  if (governance.hasMultiHost) {
    warnings.push({
      type: "MULTI_HOST",
      level: "INFO",
      message: `Booking có ${governance.uniqueHosts.length} hosts - cần check-in/CCCD riêng cho mỗi host`,
      actionRequired: false,
      actionLabel: null,
    });
  }

  // Document required
  if (documentStatus.requiresAction && documentStatus.status !== "PRECHECK") {
    warnings.push({
      type: "DOCUMENT_REQUIRED",
      level: documentStatus.status === "NO_DOCUMENT" ? "WARNING" : "INFO",
      message: documentStatus.label,
      actionRequired: true,
      actionLabel: documentStatus.actionLabel,
    });
  }

  return warnings;
}
