/**
 * SEGMENT GOVERNANCE HOOK
 * =======================
 * 
 * React hook to use segment governance utilities
 * Provides reactive state for segment analysis, check-in requirements,
 * document status, and warnings.
 */

import { useMemo } from "react";
import { useHostSupplySegments, HostSupplySegment } from "@/hooks/useHostSupplySegments";
import { useGuestDocuments } from "@/hooks/useGuestDocuments";
import {
  analyzeSegments,
  findCurrentSegment,
  evaluateCheckInRequirement,
  deriveDocumentStatus,
  buildGovernanceWarnings,
  SegmentGovernanceResult,
  SegmentAnalysis,
  CheckInRequirement,
  GovernanceWarning,
  DateMode,
  DateModeConfig,
  matchesDateMode,
  evaluateDateFilter,
} from "@/lib/segment-governance";

export interface UseSegmentGovernanceOptions {
  unifiedBookingId: string;
  bookingCheckIn: string;
  bookingCheckOut: string;
  selectedDate: string;        // Current ops date (YYYY-MM-DD)
  dateMode?: DateMode;         // OTA | OPS | COMBINED
  actualCheckInAt?: string | null;
}

export interface UseSegmentGovernanceResult {
  // Loading state
  isLoading: boolean;
  
  // Segment analysis
  governance: SegmentGovernanceResult;
  segments: SegmentAnalysis[];
  currentSegment: SegmentAnalysis | null;
  
  // Check-in requirements
  checkInRequirement: CheckInRequirement;
  
  // Document status
  hasDocument: boolean;
  hasDocumentImage: boolean;
  documentStatus: ReturnType<typeof deriveDocumentStatus>;
  
  // Warnings
  warnings: GovernanceWarning[];
  hasBlockingWarning: boolean;
  
  // Date mode helpers
  matchesCurrentDateMode: boolean;
  dateFilterResult: ReturnType<typeof evaluateDateFilter>;
  
  // Quick checks
  canCheckIn: boolean;
  requiresDocument: boolean;
  hasMultiHost: boolean;
  hasOverlap: boolean;
  hasGap: boolean;
}

export function useSegmentGovernance(
  options: UseSegmentGovernanceOptions
): UseSegmentGovernanceResult {
  const {
    unifiedBookingId,
    bookingCheckIn,
    bookingCheckOut,
    selectedDate,
    dateMode = "OPS",
    actualCheckInAt = null,
  } = options;

  // Fetch segments
  const { data: rawSegments = [], isLoading: segmentsLoading } = useHostSupplySegments(unifiedBookingId);
  
  // Fetch documents
  const { data: documents = [], isLoading: docsLoading } = useGuestDocuments(unifiedBookingId);

  const isLoading = segmentsLoading || docsLoading;

  // Analyze segments
  const governance = useMemo(() => {
    return analyzeSegments(rawSegments, bookingCheckIn, bookingCheckOut);
  }, [rawSegments, bookingCheckIn, bookingCheckOut]);

  // Find current segment for selected date
  const currentSegment = useMemo(() => {
    return findCurrentSegment(governance.segments, selectedDate);
  }, [governance.segments, selectedDate]);

  // Document status
  const hasDocument = documents.length > 0;
  const hasDocumentImage = documents.some(d => d.document_image);
  const sentToHostStatus = documents.some(d => d.sent_to_host_status === "SENT") ? "SENT" : "NOT_SENT";

  const documentStatus = useMemo(() => {
    return deriveDocumentStatus(hasDocument, hasDocumentImage, sentToHostStatus, currentSegment);
  }, [hasDocument, hasDocumentImage, sentToHostStatus, currentSegment]);

  // Check-in requirement
  const checkInRequirement = useMemo(() => {
    return evaluateCheckInRequirement(governance, selectedDate, actualCheckInAt, hasDocumentImage);
  }, [governance, selectedDate, actualCheckInAt, hasDocumentImage]);

  // Build warnings
  const warnings = useMemo(() => {
    return buildGovernanceWarnings(governance, documentStatus);
  }, [governance, documentStatus]);

  const hasBlockingWarning = warnings.some(w => w.level === "CRITICAL");

  // Date mode filter
  const dateConfig: DateModeConfig = { mode: dateMode, selectedDate };
  
  const matchesCurrentDateMode = useMemo(() => {
    return matchesDateMode(
      dateConfig,
      bookingCheckIn,
      bookingCheckOut,
      currentSegment?.date_from || null,
      currentSegment?.date_to || null
    );
  }, [dateConfig, bookingCheckIn, bookingCheckOut, currentSegment]);

  const dateFilterResult = useMemo(() => {
    return evaluateDateFilter(
      dateConfig,
      bookingCheckIn,
      bookingCheckOut,
      currentSegment?.date_from || null,
      currentSegment?.date_to || null
    );
  }, [dateConfig, bookingCheckIn, bookingCheckOut, currentSegment]);

  return {
    isLoading,
    governance,
    segments: governance.segments,
    currentSegment,
    checkInRequirement,
    hasDocument,
    hasDocumentImage,
    documentStatus,
    warnings,
    hasBlockingWarning,
    matchesCurrentDateMode,
    dateFilterResult,
    canCheckIn: checkInRequirement.canCheckIn && !hasBlockingWarning,
    requiresDocument: checkInRequirement.documentRequired,
    hasMultiHost: governance.hasMultiHost,
    hasOverlap: governance.hasOverlap,
    hasGap: governance.hasGap,
  };
}

export default useSegmentGovernance;
