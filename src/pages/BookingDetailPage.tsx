import { useState, useEffect, useMemo, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileBookingDetailScreen } from "@/components/booking-detail/mobile/MobileBookingDetailScreen";
import type { MobileBookingTab } from "@/components/booking-detail/mobile/MobileBookingTabBar";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { AppLink } from "@/components/system/AppLink";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { CardHeaderRow } from "@/components/booking-detail/CardHeaderRow";
import { Header } from "@/components/layout/Header";
import { StatusBadge } from "@/components/ui/status-badge";
import { OtaBadge } from "@/components/ui/ota-badge";
import { getBookingStatusVariant } from "@/constants/status-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackButton } from "@/components/ui/BackButton";
import {
  Calendar,
  User,
  Phone,
  Mail,
  Building2,
  CreditCard,
  FileText,
  AlertTriangle,
  AlertCircle,
  Clock,
  Edit,
  MoreHorizontal,
  MapPin,
  Plane,
  Receipt,
  DollarSign,
  CheckCircle,
  XCircle,
  Loader2,
  Globe,
  Home,
  Banknote,
  LogIn,
  LogOut,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useBookingDetail,
  useHotelCollects,
  useGuestDocuments,
  useBookingAuditLogs,
  useHostRoom,
  useStayRecord,
  useConfirmRoundingAdjustment,
} from "@/hooks/useBookings";
import { useServiceOrdersByBooking } from "@/hooks/useServiceOrders";
import { useCheckIn, useCheckOut, useUndoCheckIn, useUndoCheckOut } from "@/hooks/useStays";
import { useDisputes } from "@/hooks/useDisputes";
import { useNoShowByBooking, NO_SHOW_REASON_LABELS } from "@/hooks/useNoShow";

import { AddSegmentDialog } from "@/components/booking/AddSegmentDialog";
import { AddServiceDialog } from "@/components/booking/AddServiceDialog";
import { UploadDocumentDialog } from "@/components/booking/UploadDocumentDialog";
import { NoShowDialog } from "@/components/booking/NoShowDialog";
import { RemoveNoShowDialog } from "@/components/booking/RemoveNoShowDialog";
import { DirectRefundDialog } from "@/components/dispute/DirectRefundDialog";
import { BookingCaseCard } from "@/components/dispute/BookingCaseCard";
import { CancelManualBookingDialog } from "@/components/booking/CancelManualBookingDialog";
import { EditManualBookingDialog } from "@/components/booking/EditManualBookingDialog";
import { CollectionTableActions } from "@/components/booking/CollectionTableActions";
import { HotelCollect } from "@/hooks/useCollections";
import {
  useHostDepositRequests,
  useDeleteHostDepositRequest,
  HostDepositPurpose,
  HostDepositRequest
} from "@/hooks/useHostDepositRequests";
import { HostSupplySegments } from "@/components/booking/HostSupplySegments";
import { AddExtraChargeDialog } from "@/components/booking/AddExtraChargeDialog";
import { CheckInDialog } from "@/components/booking/CheckInDialog";
import { CheckOutDialog } from "@/components/booking/CheckOutDialog";
import { MultiRoomCheckInDialog } from "@/components/booking/MultiRoomCheckInDialog";
import { MultiRoomCheckOutDialog } from "@/components/booking/MultiRoomCheckOutDialog";
import { MultiRoomUndoDialog } from "@/components/booking/MultiRoomUndoDialog";
import { PaymentBucketsSection } from "@/components/booking/PaymentBucketsSection";
import { CreateHostDepositDialog } from "@/components/booking/CreateHostDepositDialog";
import { EditHostDepositDialog } from "@/components/booking/EditHostDepositDialog";
import { ServiceOrdersSection } from "@/components/booking/ServiceOrdersSection";
import { CollectionEventItem } from "@/components/booking/CollectionEventItem";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";
import { getPaymentMethodLabel, getProviderLabel } from "@/constants/paymentMethods";
import { resolveISO3, getFlag } from "@/lib/countryMapping";
import {
  useHostSupplySegments,
  useHostExtraCharges,
  getBookingDates,
  getAssignedDates,
  getMissingDates,
  findOverlaps,
} from "@/hooks/useHostSupplySegments";
import { useHostSurcharges } from "@/hooks/useSurcharges";
import { useOtaPayoutCashInForBooking } from "@/hooks/useOtaPayouts";
import { useBookingChanges, FIELD_LABELS, CHANGE_TYPE_LABELS, CHANGE_SOURCE_LABELS, OTA_SKIP_FIELDS } from "@/hooks/useBookingChanges";
import { useBookingAmountOverride, computeBookingAmount } from "@/hooks/useBookingAmountOverrides";
import { toast } from "sonner";
import { Pencil, Trash2, Lock, Image, Upload } from "lucide-react";
import { ReceiptUpload, ReceiptStatusBadge } from "@/components/ui/receipt-upload";
import { useUpdateCollectionReceipt } from "@/hooks/useCollections";
import { useResponsibleOwner } from "@/hooks/useResponsibleOwner";
import { BookingOwnerSection } from "@/components/ui/ResponsibleOwnerBadge";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { AssignOwnerDialog } from "@/components/booking/AssignOwnerDialog";
import { PAYMENT_TOLERANCE_VND } from "@/constants/payment-tolerance";
import { MetaCard, MetaBlock, MetaLabel, MetaPrimaryText, MetaSecondaryText, MetaIcon } from "@/components/meta";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStatusLabel = (status: string | null) => {
  const labels: Record<string, string> = {
    CONFIRMED: "Đã xác nhận",
    CHECKED_IN: "Đã nhận phòng",
    IN_HOUSE: "Đang lưu trú",
    CHECKED_OUT: "Đã trả phòng",
    CANCELLED: "Đã huỷ",
    NO_SHOW: "No-show",
    PENDING: "Chờ xác nhận",
    DONE: "Hoàn thành",
    WAIT_ROOM: "Chờ phân bổ phòng",
    NEW: "Mới",
  };
  return labels[status || ""] || status || "—";
};

export default function BookingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  // Preload mobile task page chunks on mount (mobile only)
  useEffect(() => {
    if (!isMobile) return;
    const chunks = [
      () => import("./mobile/MobileAddServicePage"),
      () => import("./mobile/MobileCollectPaymentPage"),
      () => import("./mobile/MobileAllocateRoomPage"),
      () => import("./mobile/MobileAddExtraChargePage"),
      () => import("./mobile/MobileCreateDepositPage"),
    ];
    chunks.forEach(fn => fn().catch(() => { }));
  }, [isMobile]);

  // Permission check: can_use = false means view-only (no actions)
  const { canUsePage } = useCurrentUserPagePermissions();
  const canPerformActions = canUsePage('/bookings');

  const [assignRoomDialogOpen, setAssignRoomDialogOpen] = useState(false);
  const [addServiceDialogOpen, setAddServiceDialogOpen] = useState(false);
  const [uploadDocDialogOpen, setUploadDocDialogOpen] = useState(false);
  const [noShowDialogOpen, setNoShowDialogOpen] = useState(false);
  const [removeNoShowDialogOpen, setRemoveNoShowDialogOpen] = useState(false);
  const [directRefundDialogOpen, setDirectRefundDialogOpen] = useState(false);
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [checkOutDialogOpen, setCheckOutDialogOpen] = useState(false);
  // Multi-room dialog states
  const [multiRoomCheckInDialogOpen, setMultiRoomCheckInDialogOpen] = useState(false);
  const [multiRoomCheckOutDialogOpen, setMultiRoomCheckOutDialogOpen] = useState(false);
  const [multiRoomUndoDialogOpen, setMultiRoomUndoDialogOpen] = useState(false);
  const [undoType, setUndoType] = useState<"CHECK_IN" | "CHECK_OUT">("CHECK_IN");
  const [addExtraChargeDialogOpen, setAddExtraChargeDialogOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositDialogPurpose, setDepositDialogPurpose] = useState<HostDepositPurpose>("HOST_DEPOSIT");
  const [editDepositDialogOpen, setEditDepositDialogOpen] = useState(false);
  const [editingDepositRequest, setEditingDepositRequest] = useState<HostDepositRequest | null>(null);
  const [deleteDepositDialogOpen, setDeleteDepositDialogOpen] = useState(false);
  const [deletingDepositRequest, setDeletingDepositRequest] = useState<HostDepositRequest | null>(null);
  const [assignOwnerDialogOpen, setAssignOwnerDialogOpen] = useState(false);
  const [cancelBookingDialogOpen, setCancelBookingDialogOpen] = useState(false);
  const [editBookingDialogOpen, setEditBookingDialogOpen] = useState(false);
  // Animation trigger: add bd-animated class AFTER first paint
  const [bdAnimated, setBdAnimated] = useState(false);
  const { data: booking, isLoading, isError, error: bookingError, refetch } = useBookingDetail(id);

  // Trigger entrance animations after booking data loads + first paint
  useEffect(() => {
    if (!booking || bdAnimated) return;
    // Double rAF ensures browser has painted the hidden state first
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setBdAnimated(true);
      });
    });
  }, [booking, bdAnimated]);

  // Fallback: booking might have been removed from unified_bookings after cancellation.
  // We still allow opening a lightweight detail view from booking_changes.
  const { data: archivedBooking } = useQuery({
    queryKey: ["booking-archived-fallback", id],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("booking_changes")
        .select("change_type, created_at, after_data")
        .eq("unified_booking_id", id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const latest = data[0]?.after_data as Record<string, unknown> | null;
      const insert = data.find((r) => r.change_type === "INSERT")?.after_data as Record<string, unknown> | null;
      const base = insert ?? latest ?? null;
      if (!base) return null;

      return {
        unified_booking_id: id,
        booking_status: (latest?.booking_status as string) || (base.booking_status as string) || "UNKNOWN",
        guest_name: (base.guest_name as string) || (latest?.guest_name as string) || "Unknown",
        check_in_date: (base.check_in_date as string) || "",
        check_out_date: (base.check_out_date as string) || "",
        nights: (base.nights as number) || 1,
        payment_type: (base.payment_type as string) || "",
        source: (base.ota_source as string) || (base.source as string) || "",
        pms_property_name: (base.pms_property_name as string) || "",
        total_amount_net: Number(base.total_amount_net ?? 0) || 0,
        created_at: (base.created_at as string) || (data[data.length - 1]?.created_at as string) || new Date().toISOString(),
        booking_type: "PMS",
      };
    },
    // Only trigger archived fallback when booking genuinely doesn't exist (null),
    // NOT when the active query errored (e.g., PGRST116 from duplicate rows).
    enabled: !!id && !booking && !isLoading && !isError,
  });

  const { data: hotelCollects = [] } = useHotelCollects(id);
  const { data: serviceOrders = [] } = useServiceOrdersByBooking(id || "__none__");
  const { data: documents = [] } = useGuestDocuments(id);
  const { data: auditData } = useBookingAuditLogs(id);
  const auditLogs = auditData?.logs || [];
  const auditProfiles = auditData?.profiles || {};
  const { data: hostRoom } = useHostRoom(booking?.host_room_id || undefined);
  const { data: stayRecord } = useStayRecord(id);
  const { data: disputes = [] } = useDisputes(id);
  const { data: noShowRecord } = useNoShowByBooking(id || "");
  const { data: hostDepositRequests = [] } = useHostDepositRequests({ unifiedBookingId: id ?? "__none__" });
  const deleteDepositMutation = useDeleteHostDepositRequest();
  const { data: hostSegments = [] } = useHostSupplySegments(id);
  const { data: extraCharges = [] } = useHostExtraCharges(id);
  const { data: hostSurcharges = [] } = useHostSurcharges(id || "");
  const { data: bookingChanges = [] } = useBookingChanges(id);
  const { data: amountOverride } = useBookingAmountOverride(id);

  // Rounding adjustment
  const confirmRounding = useConfirmRoundingAdjustment();

  // Responsible owner tracking
  const ownershipInfo = useResponsibleOwner(id);

  const depositRequests = useMemo(
    () => hostDepositRequests.filter((r) => r.purpose === "HOST_DEPOSIT"),
    [hostDepositRequests]
  );
  const prepaidRequests = useMemo(
    () => hostDepositRequests.filter((r) => r.purpose === "HOST_PREPAID"),
    [hostDepositRequests]
  );
  // OTA Payout cash-in for OTA_COLLECT bookings
  const isOtaCollect = booking?.payment_type === "OTA_COLLECT";
  const { data: otaPayoutCashIn } = useOtaPayoutCashInForBooking(isOtaCollect ? id : undefined);

  const hasActiveDispute = disputes.some(d => d.status === "OPEN" || d.status === "IN_REVIEW");

  // Coverage status for segments
  const coverageStatus = useMemo(() => {
    if (!booking) return null;

    const bookingDates = getBookingDates(booking.check_in_date, booking.check_out_date);
    const roomsCount = Math.max(1, booking.rooms_count || 1);
    const isMultiRoom = roomsCount > 1;

    // In multi-room bookings, segments across different room_line_index can have the same dates
    // and MUST NOT be treated as "overlap".
    const segmentsByRoom = new Map<number, typeof hostSegments>();
    for (const seg of hostSegments) {
      const idx = (seg as any).room_line_index ?? 0;
      const list = segmentsByRoom.get(idx) || [];
      list.push(seg);
      segmentsByRoom.set(idx, list);
    }

    let totalMissing = 0;
    const overlappingDatesSet = new Set<string>();

    if (isMultiRoom) {
      // Coverage is evaluated per room line.
      for (let roomIdx = 0; roomIdx < roomsCount; roomIdx++) {
        const roomSegs = segmentsByRoom.get(roomIdx) || [];
        const assignedDates = getAssignedDates(roomSegs);
        const missingDates = getMissingDates(bookingDates, assignedDates);
        totalMissing += missingDates.length;

        const overlaps = findOverlaps(roomSegs);
        overlaps.forEach((d) => overlappingDatesSet.add(d));
      }
    } else {
      const assignedDates = getAssignedDates(hostSegments);
      const missingDates = getMissingDates(bookingDates, assignedDates);
      totalMissing = missingDates.length;

      const overlaps = findOverlaps(hostSegments);
      overlaps.forEach((d) => overlappingDatesSet.add(d));
    }

    const overlappingDates = Array.from(overlappingDatesSet).sort();

    // Total Host Cost = Segments + Extra Charges (host_surcharges is for guest collection, not host cost)
    const segmentsTotal = hostSegments.reduce((sum, s) => sum + s.total_amount, 0);
    const extraChargesTotal = extraCharges.reduce((sum, c) => sum + c.amount, 0);

    const totalRequired = bookingDates.length * roomsCount;
    const assignedNights = Math.max(0, totalRequired - totalMissing);

    return {
      totalNights: totalRequired,
      assignedNights,
      missingNights: totalMissing,
      // Keep legacy fields for UI (dates are only meaningful in single-room)
      missingDates: [] as string[],
      overlappingDates,
      isComplete: totalMissing === 0 && overlappingDates.length === 0,
      hasOverlap: overlappingDates.length > 0,
      hasSegments: hostSegments.length > 0,
      totalHostCost: segmentsTotal + extraChargesTotal,
    };
  }, [booking, hostSegments, extraCharges]);

  // Effective stay: use stayRecord if exists, otherwise create fallback from booking
  const effectiveStay = useMemo(() => {
    if (stayRecord) return stayRecord;
    if (!booking) return null;
    // Fallback stay object when no stay record exists
    return {
      id: booking.unified_booking_id, // Use booking ID as fallback
      unified_booking_id: booking.unified_booking_id,
      host_room_id: null,
      host_property_name: null,
      host_room_type: null,
      stay_status: booking.stay_status || "WAIT_ROOM",
    };
  }, [stayRecord, booking]);

  const checkInMutation = useCheckIn();
  const checkOutMutation = useCheckOut();
  const undoCheckInMutation = useUndoCheckIn();
  const undoCheckOutMutation = useUndoCheckOut();

  // Handle action params from URL (quick actions)
  const actionParam = useMemo(() => searchParams.get("action"), [searchParams]);

  useEffect(() => {
    // IMPORTANT: depend on the derived string (actionParam) instead of the URLSearchParams object.
    // Depending on searchParams directly can cause update loops because setSearchParams creates a new instance.
    if (!actionParam || !booking) return;

    switch (actionParam) {
      case "assign":
        setAssignRoomDialogOpen(true);
        break;
      case "checkin":
        // Open check-in dialog instead of direct mutation
        setCheckInDialogOpen(true);
        break;
      case "collect":
        navigate(`/bookings/${booking.unified_booking_id}/payment/add?category=ROOM&lock=1`, { replace: true });
        break;
      case "collectService":
        navigate(`/bookings/${booking.unified_booking_id}/payment/add?category=SERVICE&lock=1`, { replace: true });
        break;
      case "service":
        setAddServiceDialogOpen(true);
        break;
    }

    // Clear action param after handling (one-shot) — preserve tab param
    const currentTab = searchParams.get("tab");
    const preserved: Record<string, string> = {};
    if (currentTab) preserved.tab = currentTab;
    setSearchParams(preserved, { replace: true });
  }, [actionParam, booking, setSearchParams]);

  // Calculate financial metrics - 3 BUCKETS: Room, Fees, Services
  // Use computeBookingAmount for consistent pricing (handles CANCELLED, overrides, etc.)
  const computedAmount = useMemo(() => {
    return computeBookingAmount(booking, amountOverride || null);
  }, [booking, amountOverride]);

  // BUCKET 1: Room (Tiền phòng) - use computed amount for consistency with BookingsPage
  const roomExpected = computedAmount.amount || 0;
  const roomCollections = hotelCollects.filter(c =>
    c.status !== "VOIDED" && (c as any).related_type === "ROOM"
  );
  const hotelCollectRoomAmount = roomCollections.reduce((sum, c) => sum + (c.amount_collected || 0), 0);
  const otaCashIn = otaPayoutCashIn?.totalCashIn || 0;
  const roomCollectedAmount = isOtaCollect ? otaCashIn : hotelCollectRoomAmount;
  const roomRemaining = roomExpected - roomCollectedAmount;

  // BUCKET 2: Fees (Phụ phí) - expected from host_extra_charges
  const feesExpected = extraCharges.reduce((sum, c) => sum + (c.amount || 0), 0);
  // Fees collected = hotel_collects where related_type = EXTRA (exclude VOIDED)
  const feeCollections = hotelCollects.filter(
    (c) => c.status !== "VOIDED" && (c as any).related_type === "EXTRA"
  );
  const feesCollected = feeCollections.reduce((sum, c) => sum + (c.amount_collected || 0), 0);

  // BUCKET 3: Services (Dịch vụ) - from service_orders where collector_type = ROOMRISE
  const servicesExpected = serviceOrders
    .filter((s: any) => s.collector_type === "ROOMRISE" || !s.collector_type)
    .reduce((sum: number, s: any) => sum + (s.sale_price || 0), 0);
  // Services collected = hotel_collects where related_type = SERVICE (exclude VOIDED)
  const serviceCollections = hotelCollects.filter(
    (c) => c.status !== "VOIDED" && (c as any).related_type === "SERVICE"
  );
  const servicesCollected = serviceCollections.reduce((sum, c) => sum + (c.amount_collected || 0), 0);

  // Calculate totals for all 3 buckets
  const totalExpected = roomExpected + feesExpected + servicesExpected;
  const totalCollected = roomCollectedAmount + feesCollected + servicesCollected;
  const totalRemaining = totalExpected - totalCollected;

  // For OTA_COLLECT: hotel only needs to collect fees + services (OTA already collected room)
  // For HOTEL_COLLECT: hotel collects everything
  const feesRemaining = feesExpected - feesCollected;
  const servicesRemaining = servicesExpected - servicesCollected;
  const hotelCollectRemaining = isOtaCollect
    ? (feesRemaining + servicesRemaining) // Only fees + services for OTA_COLLECT
    : totalRemaining; // Everything for HOTEL_COLLECT

  // Legacy compatibility
  const remainingAmount = hotelCollectRemaining;

  // Compute overall payment status based on 3 buckets (derived - NOT stored in DB)
  // Rounding tolerance: treat small outstanding as "paid"
  const isRoomWithinTolerance = !isOtaCollect && roomRemaining > 0 && roomRemaining <= PAYMENT_TOLERANCE_VND;

  const getOverallPaymentStatus = () => {
    const roomPaid = roomCollectedAmount >= roomExpected || isRoomWithinTolerance;
    const feesPaid = feesExpected === 0 || feesCollected >= feesExpected;
    const servicesPaid = servicesExpected === 0 || servicesCollected >= servicesExpected;

    if (roomPaid && feesPaid && servicesPaid) return "FULLY_PAID";
    if (totalCollected === 0) return "UNPAID";
    return "PARTIALLY_PAID";
  };
  const overallPaymentStatus = getOverallPaymentStatus();

  // Compute room-specific payment status (for OTA indicator)
  const getRoomPaymentStatus = () => {
    if (roomCollectedAmount === 0) return "UNPAID";
    if (roomCollectedAmount >= roomExpected) return "PAID";
    return "PARTIALLY_PAID";
  };
  const roomPaymentStatus = getRoomPaymentStatus();

  // Badge for overall status considering all 3 buckets
  const getPaymentStatusBadge = () => {
    if (isOtaCollect) {
      // For OTA_COLLECT: room is handled by OTA, check fees + services
      const feesAndServicesRemaining = feesRemaining + servicesRemaining;
      if (feesAndServicesRemaining <= 0 && roomPaymentStatus === "PAID") {
        return { variant: "success" as const, label: "Đã thu đủ" };
      }
      if (feesAndServicesRemaining > 0) {
        return { variant: "warning" as const, label: `Còn phụ phí/DV (${formatCurrency(feesAndServicesRemaining)})` };
      }
      if (roomPaymentStatus === "UNPAID") {
        return { variant: "info" as const, label: "Chờ OTA về tiền phòng" };
      }
      if (roomPaymentStatus === "PARTIALLY_PAID") {
        return { variant: "warning" as const, label: "OTA về 1 phần tiền phòng" };
      }
      return { variant: "success" as const, label: "Đã thu đủ (OTA)" };
    }

    // For HOTEL_COLLECT: check all 3 buckets
    switch (overallPaymentStatus) {
      case "UNPAID":
        return { variant: "danger" as const, label: "Chưa thu" };
      case "PARTIALLY_PAID": {
        const roomPaid = roomCollectedAmount >= roomExpected || isRoomWithinTolerance;
        if (!roomPaid) return { variant: "danger" as const, label: "Chưa thu đủ tiền phòng" };
        return { variant: "warning" as const, label: "Còn phụ phí/dịch vụ" };
      }
      case "FULLY_PAID":
        return { variant: "success" as const, label: "Đã thu đủ" };
      default:
        return { variant: "default" as const, label: "—" };
    }
  };
  const paymentStatusInfo = getPaymentStatusBadge();

  // Detect multi-room: hostSegments with different room_line_index values
  const isMultiRoom = useMemo(() => {
    if (hostSegments.length <= 1) return false;
    const uniqueRoomLines = new Set(hostSegments.map((s: any) => s.room_line_index ?? 0));
    return uniqueRoomLines.size > 1 || hostSegments.length > 1;
  }, [hostSegments]);

  // Actions - auto-detect multi-room and open appropriate dialog
  const handleCheckIn = () => {
    if (isMultiRoom) {
      setMultiRoomCheckInDialogOpen(true);
    } else {
      setCheckInDialogOpen(true);
    }
  };

  const handleCheckOut = () => {
    if (isMultiRoom) {
      setMultiRoomCheckOutDialogOpen(true);
    } else {
      setCheckOutDialogOpen(true);
    }
  };

  const handleUndoCheckIn = () => {
    if (!id) return;
    if (isMultiRoom) {
      setUndoType("CHECK_IN");
      setMultiRoomUndoDialogOpen(true);
    } else {
      undoCheckInMutation.mutate(id);
    }
  };

  const handleUndoCheckOut = () => {
    if (!id) return;
    if (isMultiRoom) {
      setUndoType("CHECK_OUT");
      setMultiRoomUndoDialogOpen(true);
    } else {
      undoCheckOutMutation.mutate(id);
    }
  };

  // Action conditions - SYNCED with StaysPage logic
  // Use stayRecord timestamps for accurate status (not just booking status which may be stale)
  const actualCheckIn = stayRecord?.actual_check_in_at;
  const actualCheckOut = stayRecord?.actual_check_out_at;
  const stayStatus = stayRecord?.stay_status || booking?.stay_status;

  // C7: Partial coverage - allow check-in if at least one segment exists
  const hasSegment = hostSegments.length > 0;
  const canCheckInSegment = hasSegment; // Can check-in if any segment exists

  // MULTI-SEGMENT SUPPORT: Detect multi-host segments for sequential check-in/check-out
  // When a booking has multiple segments from different hosts, each segment may need separate check-in/check-out
  const multiSegmentInfo = useMemo(() => {
    if (hostSegments.length <= 1) {
      return { isMultiHost: false, nextSegmentToCheckIn: null, hasRemainingSegments: false, currentSegmentIndex: 0 };
    }

    // Check if different hosts are involved
    const uniqueHostIds = new Set(hostSegments.map(s => s.partner_id));
    const isMultiHost = uniqueHostIds.size > 1;

    if (!isMultiHost) {
      return { isMultiHost: false, nextSegmentToCheckIn: null, hasRemainingSegments: false, currentSegmentIndex: 0 };
    }

    // Sort segments by date_from
    const sortedSegments = [...hostSegments].sort(
      (a, b) => new Date(a.date_from).getTime() - new Date(b.date_from).getTime()
    );

    // INDEX-BASED APPROACH: Find which segment we're currently on
    let nextSegmentToCheckIn = null;
    let hasRemainingSegments = false;
    let currentSegmentIndex = -1;

    if (stayStatus === "CHECKED_OUT" && actualCheckOut) {
      // Strategy: Find which segment was just checked out
      // We need to determine the index based on checkout timestamp
      const checkOutDateStr = actualCheckOut.split('T')[0];

      // Try to find segment that contains checkout date
      for (let i = 0; i < sortedSegments.length; i++) {
        const seg = sortedSegments[i];
        const segFrom = seg.date_from.split('T')[0];
        const segTo = seg.date_to.split('T')[0];

        // Check if checkout date falls within segment range [from, to]
        if (checkOutDateStr >= segFrom && checkOutDateStr <= segTo) {
          currentSegmentIndex = i;
          break;
        }
      }

      // If not found (checkout late or early), find the closest segment
      if (currentSegmentIndex === -1) {
        // Check if checkout is BEFORE all segments (unlikely but handle it)
        if (checkOutDateStr < sortedSegments[0].date_from.split('T')[0]) {
          currentSegmentIndex = -1; // Haven't checked in to any segment yet
        } else {
          // Checkout is AFTER segment range - find the last segment that started before/on checkout
          for (let i = sortedSegments.length - 1; i >= 0; i--) {
            const seg = sortedSegments[i];
            const segFrom = seg.date_from.split('T')[0];
            // If segment started on or before checkout date, this was likely the segment
            if (checkOutDateStr >= segFrom) {
              currentSegmentIndex = i;
              break;
            }
          }
        }
      }

      // If we found current segment and there's a next one, that's our target
      if (currentSegmentIndex >= 0 && currentSegmentIndex < sortedSegments.length - 1) {
        nextSegmentToCheckIn = sortedSegments[currentSegmentIndex + 1];
        hasRemainingSegments = true;
      }

      console.log('[MULTI-SEG] Segment detection:', {
        checkOutDateStr,
        currentSegmentIndex,
        hasNext: currentSegmentIndex < sortedSegments.length - 1,
        nextSegmentId: nextSegmentToCheckIn?.id,
        segments: sortedSegments.map((s, i) => ({
          index: i,
          from: s.date_from.split('T')[0],
          to: s.date_to.split('T')[0],
          host: s.host_property_name
        }))
      });
    } else if (!actualCheckIn) {
      // Not checked in yet - first segment
      nextSegmentToCheckIn = sortedSegments[0];
      currentSegmentIndex = -1;
    }

    return {
      isMultiHost,
      nextSegmentToCheckIn,
      hasRemainingSegments,
      sortedSegments,
      currentSegmentIndex
    };
  }, [hostSegments, actualCheckIn, actualCheckOut, stayStatus]);

  // canCheckIn: Enhanced for multi-segment support
  // Case 1: Normal booking - chưa check-in thực tế, không phải CHECKED_OUT hay NO_SHOW
  // Case 2: Multi-host segments - even if CHECKED_OUT, allow check-in for remaining segments
  const canCheckInNormal = !actualCheckIn && stayStatus !== "CHECKED_OUT" && stayStatus !== "NO_SHOW" && booking?.booking_status !== "CANCELLED";
  const canCheckInNextSegment = multiSegmentInfo.isMultiHost &&
    multiSegmentInfo.hasRemainingSegments &&
    stayStatus === "CHECKED_OUT" &&
    booking?.booking_status !== "CANCELLED" &&
    booking?.booking_status !== "NO_SHOW";
  const canCheckIn = canCheckInNormal || canCheckInNextSegment;

  // DEBUG: Multi-segment check-in/check-out logic
  console.log('[MULTI-SEG DEBUG]', {
    bookingId: id,
    hostSegments: hostSegments.length,
    uniqueHosts: new Set(hostSegments.map(s => s.partner_id)).size,
    isMultiHost: multiSegmentInfo.isMultiHost,
    hasRemainingSegments: multiSegmentInfo.hasRemainingSegments,
    nextSegment: multiSegmentInfo.nextSegmentToCheckIn?.id,
    stayStatus,
    actualCheckIn,
    actualCheckOut,
    canCheckInNormal,
    canCheckInNextSegment,
    canCheckIn,
  });

  // canCheckOut: đã check-in và đang trong phòng (status CHECKED_IN hoặc IN_HOUSE)
  // For multi-segment: use status-based check, not timestamp-based (actualCheckOut is preserved)
  const canCheckOut = !!actualCheckIn && (stayStatus === "CHECKED_IN" || stayStatus === "IN_HOUSE");
  // canUndoCheckIn: đã check-in nhưng chưa check-out (status CHECKED_IN hoặc IN_HOUSE)
  const canUndoCheckIn = (stayStatus === "CHECKED_IN" || stayStatus === "IN_HOUSE");
  // canUndoCheckOut: đã check-out và không còn segment tiếp theo cần check-in
  const canUndoCheckOut = stayStatus === "CHECKED_OUT" && !multiSegmentInfo.hasRemainingSegments;

  const isNoShow = booking?.booking_status === "NO_SHOW" || !!noShowRecord;
  const canMarkNoShow = !isNoShow && (booking?.booking_status === "CONFIRMED" || booking?.stay_status === "WAIT_ROOM");

  // Manual booking detection (data-driven, not prefix heuristic)
  // Primary: booking_type field from unified_bookings view
  // Fallback: query manual_bookings table existence if booking_type is missing
  const bookingTypeFromView = (booking as any)?.booking_type;
  const needsFallback = !!booking && !bookingTypeFromView;
  const { data: manualFallback } = useQuery({
    queryKey: ["is_manual_booking", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("manual_bookings")
        .select("unified_booking_id")
        .eq("unified_booking_id", id!)
        .maybeSingle();
      return !!data;
    },
    enabled: needsFallback,
    staleTime: 60_000,
  });
  const isManualBooking = bookingTypeFromView === "MANUAL" || (needsFallback && manualFallback === true);
  const canCancelManualBooking = isManualBooking && booking?.booking_status === "CONFIRMED";
  const canEditManualBooking = isManualBooking && booking?.booking_status === "CONFIRMED";

  // ========== MEMOIZE DIALOG PROPS (Fix: infinite render loop) ==========
  // Object literals created on every render cause infinite re-renders in child dialogs.
  // Memoize to ensure stable references when underlying data hasn't changed.
  const multiRoomCheckInProps = useMemo(() => {
    if (!effectiveStay || !booking) return null;
    return {
      stay: {
        id: effectiveStay.id,
        unified_booking_id: booking.unified_booking_id,
        host_room_id: effectiveStay.host_room_id,
        host_property_name: effectiveStay.host_property_name,
        host_room_type: effectiveStay.host_room_type,
        stay_status: effectiveStay.stay_status,
      },
      booking: {
        guest_name: booking.guest_name || "",
        guest_phone: booking.guest_phone || null,
        check_in_date: booking.check_in_date,
        check_out_date: booking.check_out_date,
        source: booking.source || "unknown",
        payment_type: booking.payment_type || "",
        pms_property_name: booking.pms_property_name || null,
        nights: booking.nights,
        total_amount_net: booking.total_amount_net,
        nationality: booking.nationality,
      },
    };
  }, [
    effectiveStay?.id,
    effectiveStay?.host_room_id,
    effectiveStay?.host_property_name,
    effectiveStay?.host_room_type,
    effectiveStay?.stay_status,
    booking?.unified_booking_id,
    booking?.guest_name,
    booking?.guest_phone,
    booking?.check_in_date,
    booking?.check_out_date,
    booking?.source,
    booking?.payment_type,
    booking?.pms_property_name,
    booking?.nights,
    booking?.total_amount_net,
    booking?.nationality,
  ]);

  const multiRoomCheckOutProps = useMemo(() => {
    if (!effectiveStay || !booking) return null;
    return {
      stay: {
        id: effectiveStay.id,
        unified_booking_id: booking.unified_booking_id,
        actual_check_in_at: stayRecord?.actual_check_in_at || null,
      },
      booking: {
        guest_name: booking.guest_name || "",
        guest_phone: booking.guest_phone || null,
        check_in_date: booking.check_in_date,
        check_out_date: booking.check_out_date,
        payment_type: booking.payment_type || "",
        total_amount_net: booking.total_amount_net,
      },
    };
  }, [
    effectiveStay?.id,
    booking?.unified_booking_id,
    stayRecord?.actual_check_in_at,
    booking?.guest_name,
    booking?.guest_phone,
    booking?.check_in_date,
    booking?.check_out_date,
    booking?.payment_type,
    booking?.total_amount_net,
  ]);

  const multiRoomUndoProps = useMemo(() => {
    if (!effectiveStay || !booking) return null;
    return {
      stay: {
        id: effectiveStay.id,
        unified_booking_id: booking.unified_booking_id,
        host_property_name: effectiveStay.host_property_name,
        host_room_type: effectiveStay.host_room_type,
      },
      booking: {
        guest_name: booking.guest_name || "",
        check_in_date: booking.check_in_date,
        check_out_date: booking.check_out_date,
        source: booking.source || "",
      },
    };
  }, [
    effectiveStay?.id,
    booking?.unified_booking_id,
    effectiveStay?.host_property_name,
    effectiveStay?.host_room_type,
    booking?.guest_name,
    booking?.check_in_date,
    booking?.check_out_date,
    booking?.source,
  ]);
  // ========================================================================

  if (isLoading) {
    return (
      <>
        <Header title="Chi tiết Booking" />
        <PageContainer><SectionCard>
          <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </SectionCard></PageContainer>
      </>
    );
  }

  // Error state: show clear error with retry, NOT archive fallback
  if (isError && !booking) {
    return (
      <>
        <Header title="Chi tiết Booking" />
        <PageContainer><SectionCard>
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold">Không thể tải booking</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Có lỗi khi truy vấn dữ liệu booking. Vui lòng thử tải lại.
              </p>
              {bookingError && (
                <p className="text-xs text-muted-foreground/60 mt-2 font-mono">
                  {(bookingError as Error).message}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="default" onClick={() => refetch()}>
                Thử tải lại
              </Button>
              <Button asChild variant="outline">
                <AppLink to="/bookings">Quay lại danh sách</AppLink>
              </Button>
            </div>
          </div>
        </SectionCard></PageContainer>
      </>
    );
  }

  if (!booking) {
    if (archivedBooking) {
      return (
        <>
          <Header title="Chi tiết Booking" />
          <PageContainer><SectionCard>
            <header className="sticky top-0 z-30 border-b border-border bg-background/98">
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-4">
                  <BackButton />
                  <div>
                    <div className="flex items-center gap-3">
                      <h1 className="text-xl font-semibold">{archivedBooking.unified_booking_id}</h1>
                      <StatusBadge variant="pms">ARCHIVED</StatusBadge>
                      <OtaBadge source={archivedBooking.source} />
                      <StatusBadge variant={getBookingStatusVariant(archivedBooking.booking_status) as any} dot>
                        {getStatusLabel(archivedBooking.booking_status)}
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Booking này không còn trong danh sách booking (thường do đã huỷ), nhưng vẫn có lịch sử thay đổi.
                    </p>
                  </div>
                </div>
              </div>
            </header>

            <main className="px-6 py-6">
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold mb-4">Thông tin tóm tắt</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-muted-foreground">Khách</p>
                    <p className="font-medium">{archivedBooking.guest_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tài sản</p>
                    <p className="font-medium">{archivedBooking.pms_property_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Nhận phòng</p>
                    <p className="font-medium">{formatDate(archivedBooking.check_in_date || null)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Trả phòng</p>
                    <p className="font-medium">{formatDate(archivedBooking.check_out_date || null)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Số đêm</p>
                    <p className="font-medium">{archivedBooking.nights}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Giá trị</p>
                    <p className="font-medium">{formatCurrency(archivedBooking.total_amount_net)}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild variant="default">
                    <AppLink to="/bookings">Quay lại danh sách</AppLink>
                  </Button>
                  <Button variant="outline" onClick={() => refetch()}>
                    Thử tải lại
                  </Button>
                </div>
              </section>
            </main>
          </SectionCard></PageContainer>
        </>
      );
    }

    return (
      <>
        <Header title="Chi tiết Booking" />
        <PageContainer><SectionCard>
          <div className="flex flex-col items-center justify-center h-screen gap-4">
            <AlertTriangle className="h-12 w-12 text-warning" />
            <h2 className="text-sm font-semibold">Không tìm thấy booking</h2>
            <Button asChild variant="outline">
              <AppLink to="/bookings">Quay lại danh sách</AppLink>
            </Button>
          </div>
        </SectionCard></PageContainer>
      </>
    );
  }

  // Map URL action params to mobile tabs
  const getMobileInitialTab = (): MobileBookingTab | undefined => {
    if (!actionParam) return undefined;
    switch (actionParam) {
      case "assign": return "allocation";
      case "collect": case "collectService": return "payments";
      case "service": return "services";
      default: return undefined;
    }
  };

  // Helper: get current tab from URL for task page state restoration
  const getCurrentTab = () => searchParams.get("tab") || "overview";
  const getTaskNavState = () => ({ returnTab: getCurrentTab() });

  // ── MOBILE NATIVE SCREEN ──
  if (isMobile) {
    return (
      <>
        <MobileBookingDetailScreen
          booking={booking}
          bookingId={id}
          computedAmount={computedAmount}
          paymentStatusInfo={paymentStatusInfo}
          roomExpected={roomExpected}
          roomCollectedAmount={roomCollectedAmount}
          feesExpected={feesExpected}
          feesCollected={feesCollected}
          servicesExpected={servicesExpected}
          servicesCollected={servicesCollected}
          isOtaCollect={isOtaCollect}
          otaPayoutCount={otaPayoutCashIn?.payoutCount || 0}
          roomCollectionCount={roomCollections.length}
          feesCollectionCount={feeCollections.length}
          servicesCollectionCount={serviceCollections.length}
          hotelCollects={hotelCollects}
          amountOverride={amountOverride}
          hostSegments={hostSegments}
          coverageStatus={coverageStatus}
          depositRequests={depositRequests}
          prepaidRequests={prepaidRequests}
          extraCharges={extraCharges}
          noShowRecord={noShowRecord}
          ownershipInfo={ownershipInfo}
          documents={documents}
          auditLogs={auditLogs}
          auditProfiles={auditProfiles}
          bookingChanges={bookingChanges}
          serviceOrders={serviceOrders}
          hasActiveDispute={hasActiveDispute}
          canPerformActions={canPerformActions}
          canCheckIn={canCheckIn}
          canCheckOut={canCheckOut}
          canCheckInNextSegment={canCheckInNextSegment}
          canCheckInSegment={canCheckInSegment}
          canUndoCheckIn={canUndoCheckIn}
          canUndoCheckOut={canUndoCheckOut}
          isNoShow={isNoShow}
          canMarkNoShow={canMarkNoShow}
          isManualBooking={isManualBooking}
          canEditManualBooking={canEditManualBooking}
          canCancelManualBooking={canCancelManualBooking}
          isCheckingIn={checkInMutation.isPending}
          isCheckingOut={checkOutMutation.isPending}
          isConfirmingRounding={confirmRounding.isPending}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          onUndoCheckIn={handleUndoCheckIn}
          onUndoCheckOut={handleUndoCheckOut}
          onCollectPayment={() => navigate(`/bookings/${booking.unified_booking_id}/payment/add?category=ROOM&lock=1`, { state: getTaskNavState() })}
          onCollectService={() => navigate(`/bookings/${booking.unified_booking_id}/payment/add?category=SERVICE&lock=1`, { state: getTaskNavState() })}
          onAssignRoom={() => navigate(`/bookings/${booking.unified_booking_id}/allocation/add`, { state: getTaskNavState() })}
          onAddService={() => navigate(`/bookings/${booking.unified_booking_id}/service/add`, { state: getTaskNavState() })}
          onUploadDoc={() => setUploadDocDialogOpen(true)}
          onNoShow={() => setNoShowDialogOpen(true)}
          onRemoveNoShow={() => setRemoveNoShowDialogOpen(true)}
          onDirectRefund={() => setDirectRefundDialogOpen(true)}
          onAssignOwner={() => setAssignOwnerDialogOpen(true)}
          onAddExtraCharge={() => navigate(`/bookings/${booking.unified_booking_id}/extra-charge/add`, { state: getTaskNavState() })}
          onDeposit={(purpose) => {
            navigate(`/bookings/${booking.unified_booking_id}/deposit/add?purpose=${purpose}`, { state: getTaskNavState() });
          }}
          onEditDeposit={(r) => {
            setEditingDepositRequest(r);
            setEditDepositDialogOpen(true);
          }}
          onDeleteDeposit={(r) => {
            setDeletingDepositRequest(r);
            setDeleteDepositDialogOpen(true);
          }}
          onEditBooking={() => setEditBookingDialogOpen(true)}
          onCancelBooking={() => setCancelBookingDialogOpen(true)}
          onAddFees={() => {
            if (hostSegments.length === 0) {
              toast.error("Cần phân bổ phòng trước khi thêm phụ phí Host");
              return;
            }
            navigate(`/bookings/${booking.unified_booking_id}/extra-charge/add`, { state: getTaskNavState() });
          }}
          onConfirmRounding={(amount) => {
            confirmRounding.mutate({
              bookingId: booking.unified_booking_id,
              amount,
            });
          }}
          onCollectionComplete={() => refetch()}
          refetch={refetch}
          initialTab={getMobileInitialTab()}
        />

        {/* All dialogs — same as desktop, no duplication */}
        <AddSegmentDialog open={assignRoomDialogOpen} onOpenChange={setAssignRoomDialogOpen} unifiedBookingId={booking.unified_booking_id} checkInDate={booking.check_in_date} checkOutDate={booking.check_out_date} existingSegments={hostSegments} />
        <AddExtraChargeDialog open={addExtraChargeDialogOpen} onOpenChange={setAddExtraChargeDialogOpen} unifiedBookingId={booking.unified_booking_id} segments={hostSegments} />
        <AddServiceDialog open={addServiceDialogOpen} onOpenChange={setAddServiceDialogOpen} unifiedBookingId={booking.unified_booking_id} />
        <UploadDocumentDialog open={uploadDocDialogOpen} onOpenChange={setUploadDocDialogOpen} unifiedBookingId={booking.unified_booking_id} />
        <NoShowDialog open={noShowDialogOpen} onOpenChange={setNoShowDialogOpen} bookingId={booking.unified_booking_id} guestName={booking.guest_name || undefined} />
        {noShowRecord && <RemoveNoShowDialog open={removeNoShowDialogOpen} onOpenChange={setRemoveNoShowDialogOpen} noShowId={noShowRecord.id} bookingId={booking.unified_booking_id} guestName={booking.guest_name || undefined} />}
        <DirectRefundDialog open={directRefundDialogOpen} onOpenChange={setDirectRefundDialogOpen} bookingId={booking.unified_booking_id} guestName={booking.guest_name || undefined} totalAmount={booking.total_amount_net ? Number(booking.total_amount_net) : undefined} otaSource={booking.source || undefined} bookingCode={(booking as any).booking_id_extranet || booking.unified_booking_id.slice(0, 12)} paymentType={booking.payment_type || undefined} />
        <AssignOwnerDialog open={assignOwnerDialogOpen} onOpenChange={setAssignOwnerDialogOpen} bookingId={booking.unified_booking_id} currentOwnerId={ownershipInfo.responsibleOwner?.userId} />
        {effectiveStay && <CheckInDialog open={checkInDialogOpen} onOpenChange={setCheckInDialogOpen} stay={{ id: effectiveStay.id, unified_booking_id: booking.unified_booking_id, host_room_id: effectiveStay.host_room_id, host_property_name: effectiveStay.host_property_name, host_room_type: effectiveStay.host_room_type, stay_status: effectiveStay.stay_status, actual_check_out_at: stayRecord?.actual_check_out_at || null }} booking={{ guest_name: booking.guest_name || "", guest_phone: booking.guest_phone || null, check_in_date: booking.check_in_date, check_out_date: booking.check_out_date, source: booking.source || "", payment_type: booking.payment_type || "", pms_property_name: booking.pms_property_name || null, nights: booking.nights, total_amount_net: booking.total_amount_net, nationality: booking.nationality }} isMultiSegmentCheckIn={canCheckInNextSegment} nextSegment={multiSegmentInfo.nextSegmentToCheckIn ? { id: multiSegmentInfo.nextSegmentToCheckIn.id, partner_id: multiSegmentInfo.nextSegmentToCheckIn.partner_id, host_property_name: multiSegmentInfo.nextSegmentToCheckIn.host_property_name, host_room_type: multiSegmentInfo.nextSegmentToCheckIn.host_room_type, date_from: multiSegmentInfo.nextSegmentToCheckIn.date_from, date_to: multiSegmentInfo.nextSegmentToCheckIn.date_to } : null} />}
        {effectiveStay && <CheckOutDialog open={checkOutDialogOpen} onOpenChange={setCheckOutDialogOpen} stay={{ id: effectiveStay.id, unified_booking_id: booking.unified_booking_id, actual_check_in_at: stayRecord?.actual_check_in_at || null }} booking={{ guest_name: booking.guest_name || "", guest_phone: booking.guest_phone || null, check_in_date: booking.check_in_date, check_out_date: booking.check_out_date, payment_type: booking.payment_type || "", total_amount_net: booking.total_amount_net }} amountCollected={roomCollectedAmount} onCollectRoom={() => { setCheckOutDialogOpen(false); navigate(`/bookings/${booking.unified_booking_id}/payment/add?category=ROOM&lock=1`); }} onCollectService={() => { setCheckOutDialogOpen(false); navigate(`/bookings/${booking.unified_booking_id}/payment/add?category=SERVICE&lock=1`); }} onCollectSurcharge={() => { setCheckOutDialogOpen(false); setAddExtraChargeDialogOpen(true); }} />}
        {hostSegments.length > 0 && <CreateHostDepositDialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen} purpose={depositDialogPurpose} segments={hostSegments} unifiedBookingId={booking.unified_booking_id} />}
        <EditHostDepositDialog open={editDepositDialogOpen} onOpenChange={setEditDepositDialogOpen} request={editingDepositRequest} />
        <AlertDialog open={deleteDepositDialogOpen} onOpenChange={setDeleteDepositDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc muốn xóa đề xuất {deletingDepositRequest?.purpose === "HOST_DEPOSIT" ? "đặt cọc" : "trả trước"} này?
                <br /><strong>Mã: {deletingDepositRequest?.request_code}</strong> • {formatCurrency(deletingDepositRequest?.proposed_amount || 0)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction onClick={async () => { if (deletingDepositRequest) { await deleteDepositMutation.mutateAsync(deletingDepositRequest.id); setDeleteDepositDialogOpen(false); setDeletingDepositRequest(null); } }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Xóa</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {multiRoomCheckInProps && <MultiRoomCheckInDialog open={multiRoomCheckInDialogOpen} onOpenChange={setMultiRoomCheckInDialogOpen} stay={multiRoomCheckInProps.stay} booking={multiRoomCheckInProps.booking} />}
        {multiRoomCheckOutProps && <MultiRoomCheckOutDialog open={multiRoomCheckOutDialogOpen} onOpenChange={setMultiRoomCheckOutDialogOpen} stay={multiRoomCheckOutProps.stay} booking={multiRoomCheckOutProps.booking} amountCollected={roomCollectedAmount} onCollectRoom={() => { setMultiRoomCheckOutDialogOpen(false); navigate(`/bookings/${booking.unified_booking_id}/payment/add?category=ROOM&lock=1`); }} onCollectService={() => { setMultiRoomCheckOutDialogOpen(false); navigate(`/bookings/${booking.unified_booking_id}/payment/add?category=SERVICE&lock=1`); }} onCollectSurcharge={() => { setMultiRoomCheckOutDialogOpen(false); setAddExtraChargeDialogOpen(true); }} />}
        {multiRoomUndoProps && <MultiRoomUndoDialog open={multiRoomUndoDialogOpen} onOpenChange={setMultiRoomUndoDialogOpen} undoType={undoType} stay={multiRoomUndoProps.stay} booking={multiRoomUndoProps.booking} />}
        {isManualBooking && <CancelManualBookingDialog open={cancelBookingDialogOpen} onOpenChange={setCancelBookingDialogOpen} booking={{ unified_booking_id: booking.unified_booking_id, guest_name: booking.guest_name || "", check_in_date: booking.check_in_date || "", check_out_date: booking.check_out_date || "", total_amount_net: booking.total_amount_net || 0, total_amount_gross: booking.total_amount_gross || 0, booking_status: booking.booking_status || "", source: booking.source || "", nights: booking.nights || 0, payment_type: booking.payment_type || "", note: (booking as any).note }} />}
        {isManualBooking && <EditManualBookingDialog open={editBookingDialogOpen} onOpenChange={setEditBookingDialogOpen} booking={{ unified_booking_id: booking.unified_booking_id, guest_name: booking.guest_name || "", guest_phone: booking.guest_phone || null, guest_email: booking.guest_email || null, source: booking.source || "", check_in_date: booking.check_in_date || "", check_out_date: booking.check_out_date || "", total_amount_net: booking.total_amount_net || 0, total_amount_gross: booking.total_amount_gross || 0, nights: booking.nights || 0, note: (booking as any).note, booking_status: booking.booking_status || "", payment_type: booking.payment_type || "" }} />}
      </>
    );
  }

  // ── DESKTOP LAYOUT (existing) ──
  return (
    <>
      <Header title="Chi tiết Booking" compact leadingAction={<BackButton className="!text-white hover:!bg-white/20 !border-none" />} />
      <PageContainer className={`pb-8 ${bdAnimated ? 'bd-animated' : ''}`}>
        {/* Header */}
        <SectionCard noPadding className="mb-2 bd-header">
          <header className="sticky top-0 z-30">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-1.5">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <h1 className="text-base font-bold tracking-tight truncate">
                      {booking.booking_type === "PMS"
                        ? (booking.ota_booking_code || booking.pms_booking_id || booking.unified_booking_id).replace(/^[A-Za-z]+-/, "")
                        : booking.unified_booking_id}
                    </h1>
                    <StatusBadge
                      size="sm"
                      variant={
                        booking.booking_type === "MANUAL"
                          ? "manual"
                          : booking.booking_type === "IMPORTED"
                            ? "warning"
                            : "pms"
                      }
                    >
                      {booking.booking_type}
                    </StatusBadge>
                    <OtaBadge source={booking.source} size="sm" />
                    <StatusBadge
                      size="sm"
                      variant={getBookingStatusVariant(booking.booking_status) as any}
                      dot
                    >
                      {getStatusLabel(booking.booking_status)}
                    </StatusBadge>
                    {hasActiveDispute && (
                      <AppLink to="/disputes">
                        <StatusBadge variant="danger" size="sm">
                          <AlertTriangle className="h-3 w-3" />
                          Có tranh chấp OTA
                        </StatusBadge>
                      </AppLink>
                    )}
                  </div>
                  <p className="text-caption text-muted-foreground mt-1 truncate">
                    {formatDate(booking.booking_date)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {/* View-only mode: show message if user cannot perform actions */}
                {!canPerformActions && (
                  <StatusBadge variant="secondary" size="sm">
                    <Lock className="h-3 w-3" />
                    Chỉ xem
                  </StatusBadge>
                )}
                {canPerformActions && canCheckIn && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          size="sm"
                          variant={canCheckInNextSegment ? "default" : "outline"}
                          onClick={handleCheckIn}
                          disabled={checkInMutation.isPending || !canCheckInSegment}
                        >
                          {checkInMutation.isPending ? (
                            <Loader2 className="mr-1 sm:mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <LogIn className="mr-1 sm:mr-2 h-4 w-4" />
                          )}
                          {canCheckInNextSegment ? "Nhận phòng tiếp" : "Nhận phòng"}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!canCheckInSegment && (
                      <TooltipContent>
                        Phải phân bổ phòng Host trước khi check-in
                      </TooltipContent>
                    )}
                    {canCheckInNextSegment && (
                      <TooltipContent>
                        Khách chuyển sang segment/host tiếp theo
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
                {canPerformActions && canCheckOut && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCheckOut}
                    disabled={checkOutMutation.isPending}
                    className=""
                  >
                    {checkOutMutation.isPending ? (
                      <Loader2 className="mr-1 sm:mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <LogOut className="mr-1 sm:mr-2 h-4 w-4" />
                    )}
                    Trả phòng
                  </Button>
                )}

                {canPerformActions && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canUndoCheckIn && (
                        <DropdownMenuItem
                          onClick={handleUndoCheckIn}
                          disabled={undoCheckInMutation.isPending}
                        >
                          <LogIn className="mr-2 h-4 w-4" />
                          Hoàn tác Nhận phòng
                        </DropdownMenuItem>
                      )}
                      {canUndoCheckOut && (
                        <DropdownMenuItem
                          onClick={handleUndoCheckOut}
                          disabled={undoCheckOutMutation.isPending}
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          Hoàn tác Trả phòng
                        </DropdownMenuItem>
                      )}
                      {isNoShow && noShowRecord && (
                        <DropdownMenuItem
                          onClick={() => setRemoveNoShowDialogOpen(true)}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Gỡ No-show (Admin)
                        </DropdownMenuItem>
                      )}
                      {canMarkNoShow && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDirectRefundDialogOpen(true)}
                            title="Tạo Case để theo dõi hoàn tiền. Hoàn trực tiếp sẽ tạo đề xuất chi."
                          >
                            <CreditCard className="mr-2 h-4 w-4" />
                            Yêu cầu hoàn tiền
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setNoShowDialogOpen(true)}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Đánh dấu No-show
                          </DropdownMenuItem>
                        </>
                      )}
                      {isManualBooking && (
                        <>
                          <DropdownMenuSeparator />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <DropdownMenuItem
                                  onClick={() => setEditBookingDialogOpen(true)}
                                  disabled={!canEditManualBooking}
                                >
                                  <Edit className="mr-2 h-4 w-4" />
                                  Sửa thông tin booking
                                </DropdownMenuItem>
                              </div>
                            </TooltipTrigger>
                            {!canEditManualBooking && (
                              <TooltipContent side="left">Chỉ sửa khi booking đang CONFIRMED</TooltipContent>
                            )}
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setCancelBookingDialogOpen(true)}
                                  disabled={!canCancelManualBooking}
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Huỷ đặt phòng
                                </DropdownMenuItem>
                              </div>
                            </TooltipTrigger>
                            {!canCancelManualBooking && (
                              <TooltipContent side="left">Chỉ huỷ khi booking đang CONFIRMED. Nếu đã nhận phòng hãy hoàn tác trước.</TooltipContent>
                            )}
                          </Tooltip>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </header>
        </SectionCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4">

            {/* No-Show Alert Section */}
            {noShowRecord && (
              <div className="rounded-xl border border-warning/50 bg-warning/10 p-4 bd-alert">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-warning">No-Show</h3>
                      <StatusBadge variant="noShow" size="sm">
                        {NO_SHOW_REASON_LABELS[noShowRecord.reason as keyof typeof NO_SHOW_REASON_LABELS] || noShowRecord.reason}
                      </StatusBadge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-muted-foreground">Ngày no-show</p>
                        <p className="font-medium">{formatDate(noShowRecord.no_show_date)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Ghi nhận lúc</p>
                        <p className="font-medium">{formatDateTime(noShowRecord.created_at)}</p>
                      </div>
                    </div>
                    {noShowRecord.note && (
                      <div className="mt-3 p-2 bg-background/50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Ghi chú</p>
                        <p className="text-xs">{noShowRecord.note}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Booking Info - For ALL booking types */}
            <SectionCard className="bd-card bd-card-hover" style={{ animationDelay: '0ms' }}>
              <CardHeaderRow
                icon={Building2}
                title="Tổng quan đặt phòng"
              >
                {booking.booking_type === "PMS" && (
                  <StatusBadge variant="info" size="sm">READ-ONLY</StatusBadge>
                )}
                <StatusBadge variant={paymentStatusInfo.variant} size="sm">
                  {paymentStatusInfo.label}
                </StatusBadge>
              </CardHeaderRow>

              <div className="mt-4">

                {/* Row 1: Core booking info */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="min-w-0">
                    <MetaLabel>Ngày đặt phòng</MetaLabel>
                    <p className="text-sm font-semibold whitespace-nowrap">{formatDate(booking.booking_date)}</p>
                  </div>
                  <div className="min-w-0">
                    <MetaLabel>Hình thức thu</MetaLabel>
                    {/* MANUAL bookings ALWAYS show "Thu tại KS", NEVER "OTA thu" */}
                    <StatusBadge
                      variant={booking.booking_type === "MANUAL" ? "success" : booking.payment_type === "OTA_COLLECT" ? "info" : "success"}
                      size="sm"
                    >
                      {booking.booking_type === "MANUAL" ? "Thu tại KS" : booking.payment_type === "OTA_COLLECT" ? "OTA thu" : "Thu tại KS"}
                    </StatusBadge>
                  </div>
                  {(booking.booking_type === "PMS" || booking.booking_type === "IMPORTED") && (
                    <>
                      <div className="min-w-0">
                        <MetaLabel>Tên chỗ nghỉ</MetaLabel>
                        <p className="text-sm font-semibold whitespace-nowrap truncate">{booking.pms_property_name || "—"}</p>
                      </div>
                      <div className="min-w-0">
                        <MetaLabel>ID chỗ nghỉ</MetaLabel>
                        <p className="text-sm font-semibold font-mono tabular-nums whitespace-nowrap">
                          {booking.ota_property_id || booking.pms_property_id || "—"}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <MetaLabel>Loại phòng</MetaLabel>
                        <p className="text-sm font-semibold">{booking.ota_room_type_sold || "—"}</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Row 2: Stay details + financials */}
                <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="min-w-0">
                    <MetaLabel>Số đêm</MetaLabel>
                    <p className="text-sm font-semibold whitespace-nowrap">{booking.nights} đêm</p>
                  </div>
                  {booking.booking_type !== "MANUAL" && (
                    <div className="min-w-0">
                      <MetaLabel>Số phòng</MetaLabel>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold whitespace-nowrap">{booking.rooms_count || 1} phòng</p>
                        {(booking.rooms_count || 1) > 1 && (
                          <StatusBadge variant="info" size="sm">MULTI</StatusBadge>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="min-w-0">
                    <MetaLabel>Nhận phòng</MetaLabel>
                    <p className="text-sm font-semibold whitespace-nowrap">{formatDate(booking.check_in_date)}</p>
                  </div>
                  <div className="min-w-0">
                    <MetaLabel>Trả phòng</MetaLabel>
                    <p className="text-sm font-semibold whitespace-nowrap">{formatDate(booking.check_out_date)}</p>
                  </div>
                  <div className="min-w-0">
                    <MetaLabel>
                      Số tiền phải thu
                      {booking.booking_type !== "MANUAL" && booking.payment_type === "HOTEL_COLLECT" && " (bao gồm hoa hồng)"}
                    </MetaLabel>
                    <p className={`text-sm font-semibold tabular-nums whitespace-nowrap ${computedAmount.status === "CANCELLED" ? "text-muted-foreground" : computedAmount.status === "UNCONFIRMED" ? "text-warning" : "text-primary"}`}>
                      {computedAmount.status === "CANCELLED"
                        ? "0 (Đã huỷ)"
                        : computedAmount.status === "UNCONFIRMED"
                          ? "Cần xác nhận"
                          : formatCurrency(computedAmount.amount)}
                    </p>
                  </div>
                </div>





                {/* OTA Commission Section - Show only for HOTEL_COLLECT bookings */}
                {(booking.booking_type === "PMS" || booking.booking_type === "IMPORTED") &&
                  booking.payment_type === "HOTEL_COLLECT" && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-xs font-medium text-muted-foreground">Hoa hồng OTA</h3>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <MetaLabel>Tỷ lệ hoa hồng</MetaLabel>
                                <p className="font-medium">
                                  {(() => {
                                    // Priority: amountOverride.commission_percent > booking.commission_rate
                                    const overrideCommission = amountOverride?.commission_percent;
                                    if (overrideCommission && overrideCommission > 0) {
                                      return `${overrideCommission.toFixed(1)}%`;
                                    }
                                    if (booking.commission_rate && booking.commission_rate > 0) {
                                      return `${booking.commission_rate.toFixed(1)}%`;
                                    }
                                    return "—";
                                  })()}
                                </p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {(() => {
                                const overrideCommission = amountOverride?.commission_percent;
                                if (overrideCommission && overrideCommission > 0) {
                                  return `Nguồn: Đã xác nhận thủ công (${overrideCommission}%)`;
                                }
                                if (booking.commission_rate && booking.commission_rate > 0) {
                                  return `Nguồn: ${booking.source || 'OTA'} commission`;
                                }
                                return "Chưa có dữ liệu hoa hồng từ kênh OTA";
                              })()}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help">
                                <MetaLabel>Phí hoa hồng</MetaLabel>
                                <p className="font-medium text-destructive">
                                  {(() => {
                                    // Priority: amountOverride.commission_percent > booking.commission_rate
                                    const overrideCommission = amountOverride?.commission_percent;
                                    const effectiveRate = (overrideCommission && overrideCommission > 0)
                                      ? overrideCommission
                                      : booking.commission_rate;

                                    if (effectiveRate && effectiveRate > 0 && computedAmount.amount) {
                                      const fee = Math.round(computedAmount.amount * (effectiveRate / 100));
                                      return formatCurrency(fee);
                                    }
                                    // Fallback to stored commission_amount if available
                                    if (booking.commission_amount && booking.commission_amount > 0) {
                                      return formatCurrency(booking.commission_amount);
                                    }
                                    return "—";
                                  })()}
                                </p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {(() => {
                                const overrideCommission = amountOverride?.commission_percent;
                                const effectiveRate = (overrideCommission && overrideCommission > 0)
                                  ? overrideCommission
                                  : booking.commission_rate;

                                if (effectiveRate && effectiveRate > 0) {
                                  return `Tính trên giá đã xác nhận: ${formatCurrency(computedAmount.amount)} × ${effectiveRate.toFixed(1)}%`;
                                }
                                return "Chưa có dữ liệu hoa hồng từ kênh OTA";
                              })()}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div>
                          <MetaLabel>Doanh thu sau hoa hồng</MetaLabel>
                          <p className="font-medium text-primary">
                            {(() => {
                              const overrideCommission = amountOverride?.commission_percent;
                              const effectiveRate = (overrideCommission && overrideCommission > 0)
                                ? overrideCommission
                                : booking.commission_rate;

                              if (effectiveRate && effectiveRate > 0 && computedAmount.amount) {
                                const fee = Math.round(computedAmount.amount * (effectiveRate / 100));
                                return formatCurrency(computedAmount.amount - fee);
                              }
                              // If no commission, show full amount
                              if (computedAmount.amount) {
                                return formatCurrency(computedAmount.amount);
                              }
                              return "—";
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            </SectionCard>

            {/* Host Supply Segments - New Segment-Based System */}
            <SectionCard className="bd-card bd-card-hover" style={{ animationDelay: '80ms' }}>
              <CardHeaderRow icon={Home} title="Host Supply">
                {coverageStatus && (
                  <StatusBadge
                    variant={coverageStatus.isComplete ? "success" : coverageStatus.hasOverlap ? "danger" : "warning"}
                    size="sm"
                  >
                    {coverageStatus.isComplete
                      ? "ĐỦ ĐÊM"
                      : coverageStatus.hasOverlap
                        ? "CHỒNG LẤN"
                        : `THIẾU ${coverageStatus.missingNights}`
                    }
                  </StatusBadge>
                )}
                <StatusBadge variant={getBookingStatusVariant(booking.stay_status) as any} dot>
                  {getStatusLabel(booking.stay_status)}
                </StatusBadge>
              </CardHeaderRow>

              <div className="mt-4">

                {/* Host Supply Segments Component */}
                <HostSupplySegments
                  unifiedBookingId={booking.unified_booking_id || ""}
                  checkInDate={booking.check_in_date}
                  checkOutDate={booking.check_out_date}
                  stayStatus={booking.stay_status || undefined}
                  isReadOnly={false}
                />

                {/* Host Cost Summary */}
                {coverageStatus && coverageStatus.totalHostCost > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <MetaLabel>Tổng chi phí Host (segments + phụ phí)</MetaLabel>
                        <p className="text-sm font-semibold text-destructive tabular-nums">{formatCurrency(coverageStatus.totalHostCost)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Host Deposits & Prepaids Section */}
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <MetaLabel>Đặt cọc & Trả trước Host</MetaLabel>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hostSegments.length}
                        onClick={() => {
                          setDepositDialogPurpose("HOST_DEPOSIT");
                          setDepositDialogOpen(true);
                        }}
                        className=""
                      >
                        <DollarSign className="mr-1 sm:mr-2 h-4 w-4" />
                        Đặt cọc
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!hostSegments.length}
                        onClick={() => {
                          setDepositDialogPurpose("HOST_PREPAID");
                          setDepositDialogOpen(true);
                        }}
                        className=""
                      >
                        <Banknote className="mr-1 sm:mr-2 h-4 w-4" />
                        Trả trước
                      </Button>
                    </div>
                  </div>
                  {/* Display deposit requests (payment_requests) */}
                  {depositRequests.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground mb-2">Đặt cọc (Deposit) – Lịch sử đề xuất</p>
                      <div className="space-y-2">
                        {depositRequests.map((r) => {
                          const statusMeta: Record<string, { variant: any; label: string }> = {
                            PENDING: { variant: "warning", label: "Chờ duyệt" },
                            APPROVED: { variant: "info", label: "Đã duyệt - Chờ chi" },
                            PAID: { variant: "success", label: "Đã chi tiền" },
                            REJECTED: { variant: "danger", label: "Từ chối" },
                          };
                          const meta = statusMeta[r.status] || { variant: "default", label: r.status };
                          // Can only edit/delete if PENDING and not linked to settlement or applied
                          const canEdit = r.status === "PENDING" && !r.settlement_id && !r.is_applied;

                          return (
                            <div key={r.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <StatusBadge variant={meta.variant} size="sm">
                                  {meta.label}
                                </StatusBadge>
                                <span className="font-medium">{formatCurrency(r.proposed_amount)}</span>
                                <span className="text-muted-foreground truncate">
                                  • {r.partner_name || "Host"} • {r.request_code}
                                </span>
                                {(r.is_applied || r.settlement_id) && (
                                  <Badge variant="outline" className="text-xs bg-success/10 text-success gap-1">
                                    <Lock className="h-3 w-3" />
                                    Đã QT
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <span className="text-muted-foreground">{formatDate(r.requested_at)}</span>
                                  {r.status === "PAID" && r.total_paid > 0 && (
                                    <p className="text-xs text-success">Đã chi: {formatCurrency(r.total_paid)}</p>
                                  )}
                                  {r.status === "APPROVED" && (
                                    <p className="text-xs text-warning">Chưa chi tiền</p>
                                  )}
                                </div>
                                {canEdit && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => {
                                        setEditingDepositRequest(r);
                                        setEditDepositDialogOpen(true);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => {
                                        setDeletingDepositRequest(r);
                                        setDeleteDepositDialogOpen(true);
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Display prepaid requests (payment_requests) */}
                  {prepaidRequests.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Trả trước (Prepaid) – Lịch sử đề xuất</p>
                      <div className="space-y-2">
                        {prepaidRequests.map((r) => {
                          const statusMeta: Record<string, { variant: any; label: string }> = {
                            PENDING: { variant: "warning", label: "Chờ duyệt" },
                            APPROVED: { variant: "info", label: "Đã duyệt - Chờ chi" },
                            PAID: { variant: "success", label: "Đã chi tiền" },
                            REJECTED: { variant: "danger", label: "Từ chối" },
                          };
                          const meta = statusMeta[r.status] || { variant: "default", label: r.status };
                          // Can only edit/delete if PENDING and not linked to settlement or applied
                          const canEdit = r.status === "PENDING" && !r.settlement_id && !r.is_applied;

                          return (
                            <div key={r.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <StatusBadge variant={meta.variant} size="sm">
                                  {meta.label}
                                </StatusBadge>
                                <span className="font-medium">{formatCurrency(r.proposed_amount)}</span>
                                <span className="text-muted-foreground truncate">
                                  • {r.partner_name || "Host"} • {r.request_code}
                                </span>
                                {(r.is_applied || r.settlement_id) && (
                                  <Badge variant="outline" className="text-xs bg-success/10 text-success gap-1">
                                    <Lock className="h-3 w-3" />
                                    Đã QT
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <span className="text-muted-foreground">{formatDate(r.requested_at)}</span>
                                  {r.status === "PAID" && r.total_paid > 0 && (
                                    <p className="text-xs text-success">Đã chi: {formatCurrency(r.total_paid)}</p>
                                  )}
                                  {r.status === "APPROVED" && (
                                    <p className="text-xs text-warning">Chưa chi tiền</p>
                                  )}
                                </div>
                                {canEdit && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => {
                                        setEditingDepositRequest(r);
                                        setEditDepositDialogOpen(true);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => {
                                        setDeletingDepositRequest(r);
                                        setDeleteDepositDialogOpen(true);
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {depositRequests.length === 0 && prepaidRequests.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Chưa có đề xuất đặt cọc hoặc trả trước cho Host
                    </p>
                  )}
                </div>
              </div>
            </SectionCard>

            <div className="bd-card" style={{ animationDelay: '160ms' }}>
              <PaymentBucketsSection
                booking={{
                  unified_booking_id: booking.unified_booking_id,
                  payment_type: booking.payment_type || "HOTEL_COLLECT",
                  booking_type: booking.booking_type,
                  total_amount_net: booking.total_amount_net,
                  guest_name: booking.guest_name || "",
                  booking_status: booking.booking_status,
                }}
                roomExpected={roomExpected}
                roomCollectedAmount={roomCollectedAmount}
                feesExpected={feesExpected}
                feesCollected={feesCollected}
                servicesExpected={servicesExpected}
                servicesCollected={servicesCollected}
                isOtaCollect={isOtaCollect}
                otaPayoutCount={otaPayoutCashIn?.payoutCount || 0}
                roomCollectionCount={roomCollections.length}
                feesCollectionCount={feeCollections.length}
                servicesCollectionCount={serviceCollections.length}
                canAddFees={hostSegments.length > 0}
                onAddFees={() => {
                  // Cho phép thêm phụ phí sau check-out vì Host có thể báo giá sau
                  // Use case: dọn phòng, hư hỏng đồ đạc, điện nước sau khi đọc công tơ...
                  if (hostSegments.length === 0) {
                    toast.error("Cần phân bổ phòng trước khi thêm phụ phí Host");
                    return;
                  }
                  setAddExtraChargeDialogOpen(true);
                }}
                onAddService={() => setAddServiceDialogOpen(true)}
                onCollectionComplete={() => refetch()}
                onConfirmRounding={(amount) => {
                  if (!booking) return;
                  confirmRounding.mutate({
                    bookingId: booking.unified_booking_id,
                    amount,
                  });
                }}
                isConfirmingRounding={confirmRounding.isPending}
              />
            </div>

            {/* Services Section with Edit/Delete */}
            <div className="bd-card" style={{ animationDelay: '240ms' }}>
              <ServiceOrdersSection
                unifiedBookingId={booking.unified_booking_id || ""}
                isSettled={(booking as any).is_settled === true}
                onAddService={() => setAddServiceDialogOpen(true)}
              />
            </div>

            {/* Tabs */}
            <SectionCard className="bd-card" style={{ animationDelay: '320ms' }}>
              <Tabs defaultValue="payments" className="space-y-4">
                <TabsList className="bg-muted/50">
                  <TabsTrigger value="payments" className="gap-2">
                    <DollarSign className="h-4 w-4" />
                    Thu tiền ({hotelCollects.length})
                  </TabsTrigger>
                  <TabsTrigger value="documents" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Giấy tờ ({documents.length})
                  </TabsTrigger>
                  <TabsTrigger value="timeline" className="gap-2">
                    <Clock className="h-4 w-4" />
                    Lịch sử ({bookingChanges.length + auditLogs.length})
                  </TabsTrigger>
                </TabsList>


                <TabsContent value="payments" className="mt-4 bd-tab-content">
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-border">
                      <span className="text-xs text-muted-foreground">
                        {hotelCollects.length} lần thu tiền
                      </span>

                    </div>
                    {hotelCollects.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50 bd-empty-icon" />
                        <p>Chưa có lần thu tiền nào</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px]">
                          <thead>
                            <tr className="border-b border-border bg-muted/30">
                              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                                Loại
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                                Thời gian
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                                Phương thức
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                                Người nhận
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                                Số tiền
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                                Ghi chú
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                                Thao tác
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {hotelCollects.map((collect) => {
                              const collectionType = (collect as any).collection_type || "COLLECT";
                              const relatedType = (collect as any).related_type || "ROOM";
                              const isVoided = collectionType === "VOID" || (collect as any).voided_at;
                              const isRefund = collectionType === "REFUND";

                              // Determine label and color based on related_type
                              const getRelatedTypeInfo = () => {
                                switch (relatedType) {
                                  case "SERVICE":
                                    return { label: "Dịch vụ", colorClass: "text-primary" };
                                  case "FEE":
                                  case "EXTRA":
                                    return { label: "Phụ phí", colorClass: "text-warning" };
                                  default:
                                    return { label: "Tiền phòng", colorClass: "text-muted-foreground" };
                                }
                              };
                              const relatedTypeInfo = getRelatedTypeInfo();

                              return (
                                <tr key={collect.id} className={`hover:bg-muted/30 ${isVoided ? "opacity-50" : ""}`}>
                                  <td className="px-4 py-3 text-xs">
                                    <div className="flex flex-col gap-1">
                                      <StatusBadge
                                        variant={isRefund ? "warning" : isVoided ? "default" : "success"}
                                        size="sm"
                                      >
                                        {isRefund ? "Hoàn tiền" : isVoided ? "Đã hủy" : "Thu tiền"}
                                      </StatusBadge>
                                      <span className={`text-xs ${relatedTypeInfo.colorClass}`}>
                                        {relatedTypeInfo.label}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-xs">
                                    {formatDateTime(collect.collected_at)}
                                  </td>
                                  <td className="px-4 py-3 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <PaymentMethodIcon code={collect.payment_method || ''} className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <span>{getPaymentMethodLabel(collect.payment_method || '')}</span>
                                    </div>
                                    {collect.payment_method === 'PAYMENT_LINK' && (collect as any).payment_provider && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <PaymentMethodIcon code={(collect as any).payment_provider} className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                                        <span className="text-[10px] text-muted-foreground">{getProviderLabel((collect as any).payment_provider)}</span>
                                      </div>
                                    )}
                                    {collect.payment_method === 'PAYMENT_LINK' && (collect as any).payment_link_url && (
                                      <a
                                        href={(collect as any).payment_link_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 mt-0.5 text-[10px] text-primary hover:underline truncate max-w-[140px]"
                                        title={(collect as any).payment_link_url}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                        <span className="truncate">{(collect as any).payment_link_url.replace(/^https?:\/\//, '')}</span>
                                      </a>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <StatusBadge
                                      variant={collect.payee_type === "ROOMRISE" ? "success" : collect.payee_type === "HOST" ? "warning" : "default"}
                                      size="sm"
                                    >
                                      {collect.payee_type === "ROOMRISE" ? "Roomrise thu" : collect.payee_type === "HOST" ? "Host thu" : "NCC thu"}
                                    </StatusBadge>
                                  </td>
                                  <td className={`px-4 py-3 text-right text-xs font-medium ${isRefund ? "text-warning" : isVoided ? "line-through text-muted-foreground" : ""}`}>
                                    {isRefund ? "-" : ""}{formatCurrency(Math.abs(collect.amount_collected || 0))}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-muted-foreground">
                                    {(collect as any).reason_note || collect.note || "—"}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {collectionType === "COLLECT" && !isVoided && (
                                      <CollectionTableActions
                                        collection={collect as unknown as HotelCollect}
                                        onActionComplete={() => refetch()}
                                      />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="documents" className="mt-4 bd-tab-content">
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    {documents.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50 bd-empty-icon" />
                        <p>Chưa có giấy tờ nào</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() => setUploadDocDialogOpen(true)}
                        >
                          Tải lên giấy tờ
                        </Button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[500px]">
                          <thead>
                            <tr className="border-b border-border bg-muted/30">
                              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                                Loại
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                                Số giấy tờ
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                                Ngày tải lên
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {documents.map((doc: any) => (
                              <tr key={doc.id} className="hover:bg-muted/30">
                                <td className="px-4 py-3 text-xs font-medium">
                                  {doc.document_type}
                                </td>
                                <td className="px-4 py-3 text-xs">
                                  {doc.document_number || "—"}
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                  {formatDateTime(doc.uploaded_at)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="timeline" className="mt-4 space-y-4 bd-tab-content">
                  {/* Lịch sử hoạt động nội bộ — PMS SaaS vertical timeline */}
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      Nhật ký thao tác ({auditLogs.length || 0})
                    </h4>

                    {auditLogs.length > 0 ? (
                      <div className="relative">
                        {/* Vertical connecting line */}
                        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

                        <div className="space-y-0">
                          {auditLogs.map((log: any) => {
                            // ── Action config ──
                            const actionConfig: Record<string, { color: string; dotColor: string; label: string }> = {
                              "Nhận phòng": { color: "text-success", dotColor: "bg-success", label: "Nhận phòng" },
                              "Trả phòng": { color: "text-primary", dotColor: "bg-primary", label: "Trả phòng" },
                              "Check-in": { color: "text-success", dotColor: "bg-success", label: "Nhận phòng" },
                              "Check-out": { color: "text-primary", dotColor: "bg-primary", label: "Trả phòng" },
                              "Hoàn tác Check-in": { color: "text-warning", dotColor: "bg-warning", label: "Hoàn tác nhận phòng" },
                              "Hoàn tác Check-out": { color: "text-warning", dotColor: "bg-warning", label: "Hoàn tác trả phòng" },
                              "MULTI_ROOM_UNDO_CHECK_IN": { color: "text-warning", dotColor: "bg-warning", label: "Hoàn tác nhận phòng" },
                              "MULTI_ROOM_UNDO_CHECK_OUT": { color: "text-warning", dotColor: "bg-warning", label: "Hoàn tác trả phòng" },
                              "CREATE": { color: "text-success", dotColor: "bg-success", label: "Tạo mới" },
                              "UPDATE": { color: "text-warning", dotColor: "bg-warning", label: "Cập nhật" },
                              "DELETE": { color: "text-destructive", dotColor: "bg-destructive", label: "Xóa" },
                              "Tạo booking": { color: "text-primary", dotColor: "bg-primary", label: "Tạo booking" },
                              "Cập nhật booking": { color: "text-warning", dotColor: "bg-warning", label: "Cập nhật booking" },
                              "Phân bổ phòng Host": { color: "text-warning", dotColor: "bg-warning", label: "Phân bổ phòng" },
                              "Đổi phòng Host": { color: "text-warning", dotColor: "bg-warning", label: "Đổi phòng" },
                              "Đánh dấu No-show": { color: "text-destructive", dotColor: "bg-destructive", label: "No-show" },
                              "Thêm dịch vụ": { color: "text-primary", dotColor: "bg-primary", label: "Thêm dịch vụ" },
                              "Tải lên giấy tờ": { color: "text-info", dotColor: "bg-info", label: "Upload giấy tờ" },
                              "Gửi giấy tờ cho Host": { color: "text-info", dotColor: "bg-info", label: "Gửi giấy tờ Host" },
                              "Thu tiền": { color: "text-success", dotColor: "bg-success", label: "Thu tiền" },
                              "VOID": { color: "text-destructive", dotColor: "bg-destructive", label: "Hủy thu tiền" },
                              "REFUND": { color: "text-warning", dotColor: "bg-warning", label: "Hoàn tiền" },
                              "AUTO_CREATE": { color: "text-muted-foreground", dotColor: "bg-muted-foreground", label: "Tự động tạo" },
                              "AUTO_SYNC": { color: "text-muted-foreground", dotColor: "bg-muted-foreground", label: "Đồng bộ" },
                              "MANUAL_ASSIGN": { color: "text-info", dotColor: "bg-info", label: "Gán người phụ trách" },
                              "PERMISSION_UPDATE": { color: "text-warning", dotColor: "bg-warning", label: "Cập nhật quyền" },
                            };

                            const config = actionConfig[log.action] || {
                              color: "text-muted-foreground", dotColor: "bg-muted-foreground",
                            };
                            const label = (config as any).label || log.action;

                            // ── Entity label ──
                            const entityMap: Record<string, string> = {
                              booking: "Booking", stays: "Lưu trú", hotel_collects: "Thu tiền",
                              host_supply_segments: "Phân bổ Host", host_extra_charges: "Phụ phí Host",
                              guest_documents: "Giấy tờ", payment_requests: "Đề xuất TT",
                              surcharges: "Phụ phí", cash_outs: "Chi tiền",
                              host_deposits: "Đặt cọc Host", responsible_owner: "Phân công",
                            };
                            const entityLabel = entityMap[log.entity] || log.entity;

                            // ── User info ──
                            const profile = log.user_id ? auditProfiles[log.user_id] : null;
                            const userName = profile?.full_name || profile?.email?.split("@")[0] || (log.user_id ? log.user_id.slice(0, 8) : "Hệ thống");
                            const initials = userName === "Hệ thống" ? "HT" :
                              userName.split(" ").filter(Boolean).map((w: string) => w[0]).join("").slice(-2).toUpperCase();

                            // ── Human-readable detail extraction ──
                            const afterData = log.after_data as Record<string, any> | null;
                            const details: { label: string; value: string }[] = [];
                            if (afterData) {
                              const fieldLabels: Record<string, string> = {
                                stay_status: "Trạng thái", actual_check_in_at: "Nhận phòng lúc",
                                actual_check_out_at: "Trả phòng lúc", room_code: "Phòng",
                                host_room_type: "Loại phòng", amount_collected: "Số tiền",
                                payment_method: "Phương thức", total_amount: "Tổng tiền",
                                nightly_rate: "Giá đêm", nights: "Số đêm",
                                date_from: "Từ ngày", date_to: "Đến ngày",
                                document_type: "Loại giấy tờ", service_name: "Dịch vụ",
                                note: "Ghi chú", source: "Nguồn", assigned_by: "Phương thức",
                                host_property_name: "Tòa nhà",
                              };
                              const statusLabels: Record<string, string> = {
                                CHECKED_IN: "Đã nhận phòng", CHECKED_OUT: "Đã trả phòng",
                                CONFIRMED: "Đã xác nhận", CANCELLED: "Đã hủy",
                                MANUAL: "Thủ công", AUTO: "Tự động",
                              };
                              const skipFields = new Set([
                                "id", "unified_booking_id", "created_at", "updated_at", "created_by",
                                "updated_by", "checked_in_by", "checked_out_by", "partner_id",
                                "segment_id", "host_room_id", "settlement_id", "scenario_id",
                                "locked_at", "is_sample_data", "room_line_index",
                                "is_multi_segment_checkin", "docs_missing", "has_document",
                                "has_host_room", "pending_services", "pending_surcharges",
                                "checkout_note", "remaining_room_amount",
                                "segment_partner_id", "segment_date_from", "segment_date_to",
                              ]);

                              for (const [key, value] of Object.entries(afterData)) {
                                if (skipFields.has(key) || value === null || value === undefined) continue;
                                if (typeof value === "object") continue;
                                if (String(value).length > 40 && key.includes("_id")) continue;

                                const fLabel = fieldLabels[key] || key.replace(/_/g, " ");
                                let displayValue = String(value);

                                if (statusLabels[displayValue]) displayValue = statusLabels[displayValue];
                                else if ((key.includes("amount") || key.includes("rate")) && !isNaN(Number(value)))
                                  displayValue = formatCurrency(Number(value));
                                else if (key.includes("_at") && displayValue.includes("T"))
                                  displayValue = formatDateTime(displayValue);
                                else if ((key === "date_from" || key === "date_to") && displayValue.includes("-"))
                                  displayValue = formatDate(displayValue);

                                details.push({ label: fLabel, value: displayValue });
                              }
                            }

                            const showDetails = details.slice(0, 4);
                            const moreCount = details.length - 4;

                            return (
                              <div key={log.id} className="relative flex gap-3 pb-4 last:pb-0">
                                {/* Timeline dot */}
                                <div className="relative z-10 flex items-center justify-center shrink-0 w-[31px]">
                                  <div className={`w-2.5 h-2.5 rounded-full ring-[3px] ring-card ${config.dotColor}`} />
                                </div>

                                {/* Content card */}
                                <div className="flex-1 min-w-0 -mt-0.5 pb-1">
                                  <div className="flex items-start gap-2.5">
                                    {/* User avatar */}
                                    <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                                      <span className="text-[10px] font-bold text-muted-foreground">{initials}</span>
                                    </div>

                                    {/* Main content */}
                                    <div className="flex-1 min-w-0">
                                      {/* Header: User did Action on Entity @ Time */}
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-semibold text-foreground">{userName}</span>
                                        <span className={`text-xs font-medium ${config.color}`}>{label}</span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{entityLabel}</span>
                                        {log.role_snapshot && (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">{log.role_snapshot}</span>
                                        )}
                                        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                                          {formatDateTime(log.event_time)}
                                        </span>
                                      </div>

                                      {/* Human-readable details */}
                                      {showDetails.length > 0 && (
                                        <div className="mt-1.5 p-2 rounded-md bg-muted/40 text-[11px] leading-relaxed space-y-0.5">
                                          {showDetails.map((d, i) => (
                                            <div key={i} className="flex gap-1.5">
                                              <span className="text-muted-foreground/70 shrink-0">{d.label}:</span>
                                              <span className="text-foreground font-medium">{d.value}</span>
                                            </div>
                                          ))}
                                          {moreCount > 0 && (
                                            <div className="text-[10px] text-muted-foreground/50 pt-0.5">
                                              +{moreCount} trường khác
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Clock className="h-10 w-10 mx-auto mb-2 opacity-50 bd-empty-icon" />
                        <p>Chưa có hoạt động nào</p>
                        <p className="text-xs mt-1">Khi có thao tác (nhận phòng, thu tiền...), lịch sử sẽ hiển thị tại đây</p>
                      </div>
                    )}
                  </div>

                  {/* Lịch sử đồng bộ từ Channex */}
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      Đồng bộ OTA ({bookingChanges.length})
                    </h4>
                    {bookingChanges.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Globe className="h-10 w-10 mx-auto mb-2 opacity-50 bd-empty-icon" />
                        <p>Chưa có lịch sử đồng bộ</p>
                        <p className="text-xs mt-1">Khi có thay đổi từ OTA/Channex, lịch sử sẽ hiển thị tại đây</p>
                      </div>
                    ) : (
                      <div className="relative">
                        {/* Vertical connecting line */}
                        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

                        <div className="space-y-0">
                          {bookingChanges.map((change) => {
                            const changeTypeLabel = CHANGE_TYPE_LABELS[change.change_type] || change.change_type;
                            const sourceLabel = CHANGE_SOURCE_LABELS[change.change_source] || change.change_source;

                            // Filter changed_fields to show only operator-relevant ones
                            const visibleFields = (change.changed_fields || []).filter(f => !OTA_SKIP_FIELDS.has(f));
                            const fieldLabels = visibleFields.map(f => FIELD_LABELS[f] || f);

                            // Dot color based on change type
                            const dotColor = change.change_type === "INSERT" ? "bg-success"
                              : change.change_type === "STATUS_CHANGE" ? "bg-warning"
                                : "bg-info";

                            // Format display value
                            const formatFieldValue = (field: string, val: unknown): string => {
                              if (val === null || val === undefined) return "—";
                              const s = String(val);
                              if ((field.includes("amount") || field === "commission_amount") && !isNaN(Number(val)))
                                return formatCurrency(Number(val));
                              if ((field === "check_in_date" || field === "check_out_date") && s.includes("-"))
                                return formatDate(s);
                              return s;
                            };

                            return (
                              <div key={change.id} className="relative flex gap-3 pb-4 last:pb-0">
                                {/* Timeline dot */}
                                <div className="relative z-10 flex items-center justify-center shrink-0 w-[31px]">
                                  <div className={`w-2.5 h-2.5 rounded-full ring-[3px] ring-card ${dotColor}`} />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0 -mt-0.5 pb-1">
                                  <div className="flex items-start gap-2.5">
                                    {/* OTA icon */}
                                    <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                                      <Globe className="h-3.5 w-3.5 text-primary" />
                                    </div>

                                    {/* Main content */}
                                    <div className="flex-1 min-w-0">
                                      {/* Header */}
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <StatusBadge
                                          variant={change.change_type === "INSERT" ? "success" : change.change_type === "STATUS_CHANGE" ? "warning" : "info"}
                                          size="sm"
                                        >
                                          {changeTypeLabel}
                                        </StatusBadge>
                                        <span className="text-xs text-muted-foreground">{sourceLabel}</span>
                                        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                                          {formatDateTime(change.created_at)}
                                        </span>
                                      </div>

                                      {/* Changed fields summary */}
                                      {fieldLabels.length > 0 && (
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                          {fieldLabels.join(", ")}
                                        </p>
                                      )}

                                      {/* Diff details — only show operator-relevant fields */}
                                      {change.before_data && change.after_data && visibleFields.length > 0 && (
                                        <div className="mt-1.5 p-2 rounded-md bg-muted/40 text-[11px] leading-relaxed space-y-0.5">
                                          {visibleFields.map(field => {
                                            const fieldLabel = FIELD_LABELS[field] || field;
                                            const beforeVal = formatFieldValue(field, change.before_data?.[field]);
                                            const afterVal = formatFieldValue(field, change.after_data?.[field]);

                                            return (
                                              <div key={field} className="flex items-center gap-1.5">
                                                <span className="text-muted-foreground/70 shrink-0">{fieldLabel}:</span>
                                                <span className="text-destructive line-through text-[10px]">{beforeVal}</span>
                                                <span className="text-muted-foreground/50">→</span>
                                                <span className="text-foreground font-medium">{afterVal}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                </TabsContent>
              </Tabs>
            </SectionCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 bd-sidebar">
            {/* Responsible Owner Info — BookingOwnerSection wraps MetaCard internally */}
            <MetaCard title="Thông tin xử lý" icon={User}>
              <BookingOwnerSection
                ownershipInfo={ownershipInfo}
                bookingId={id}
                onAssignClick={() => setAssignOwnerDialogOpen(true)}
              />
            </MetaCard>

            {/* Guest Info */}
            <MetaCard title="Thông tin khách" icon={User}>
              <MetaBlock>
                <MetaLabel>Tên khách</MetaLabel>
                <div className="flex items-center gap-2">
                  <MetaIcon icon={User} />
                  <MetaPrimaryText>{booking.guest_name}</MetaPrimaryText>
                </div>
              </MetaBlock>
              {booking.guest_phone && (
                <MetaBlock>
                  <MetaLabel>Điện thoại</MetaLabel>
                  <div className="flex items-center gap-2">
                    <MetaIcon icon={Phone} />
                    <MetaPrimaryText>{booking.guest_phone}</MetaPrimaryText>
                  </div>
                </MetaBlock>
              )}
              {booking.guest_email && (
                <MetaBlock>
                  <MetaLabel>Email</MetaLabel>
                  <div className="flex items-center gap-2">
                    <MetaIcon icon={Mail} />
                    <MetaPrimaryText>{booking.guest_email}</MetaPrimaryText>
                  </div>
                </MetaBlock>
              )}
              <MetaBlock>
                <MetaLabel>Quốc gia</MetaLabel>
                <div className="flex items-center gap-2">
                  {booking.nationality ? (
                    <>
                      {(() => {
                        const iso3 = resolveISO3(booking.nationality);
                        const flagUrl = iso3 !== "UNKNOWN" ? getFlag(iso3) : null;
                        return flagUrl ? (
                          <img src={flagUrl} alt={booking.nationality} className="w-5 h-auto rounded-sm" />
                        ) : (
                          <MetaIcon icon={Globe} />
                        );
                      })()}
                      <MetaPrimaryText>{booking.nationality}</MetaPrimaryText>
                    </>
                  ) : (
                    <>
                      <MetaIcon icon={Globe} />
                      <MetaPrimaryText>—</MetaPrimaryText>
                    </>
                  )}
                </div>
              </MetaBlock>
            </MetaCard>

            {/* Case Management */}
            <BookingCaseCard
              bookingId={booking.unified_booking_id}
              guestName={booking.guest_name}
            />

            {/* Quick Actions */}
            {canPerformActions && (
              <MetaCard title="Thao tác nhanh">
                <div className="space-y-2">
                  {canCheckIn && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block">
                          <Button
                            className="w-full justify-start"
                            variant="outline"
                            size="sm"
                            onClick={handleCheckIn}
                            disabled={checkInMutation.isPending || !canCheckInSegment}
                          >
                            <LogIn className="mr-2 h-4 w-4" />
                            Check-in
                            {!canCheckInSegment && (
                              <span className="ml-auto text-xs text-destructive">(Chưa phân bổ phòng)</span>
                            )}
                            {canCheckInSegment && coverageStatus && !coverageStatus.isComplete && coverageStatus.missingNights > 0 && (
                              <span className="ml-auto text-xs text-warning">(Thiếu {coverageStatus.missingNights} đêm)</span>
                            )}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!canCheckInSegment && (
                        <TooltipContent>
                          Phải phân bổ phòng Host trước khi check-in
                        </TooltipContent>
                      )}
                    </Tooltip>
                  )}
                  {canCheckOut && (
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      size="sm"
                      onClick={handleCheckOut}
                      disabled={checkOutMutation.isPending}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Check-out
                    </Button>
                  )}

                </div>
              </MetaCard>
            )}
          </div>
        </div>
      </PageContainer >

      {/* Dialogs */}

      <AddSegmentDialog
        open={assignRoomDialogOpen}
        onOpenChange={setAssignRoomDialogOpen}
        unifiedBookingId={booking.unified_booking_id}
        checkInDate={booking.check_in_date}
        checkOutDate={booking.check_out_date}
        existingSegments={hostSegments}
      />

      <AddExtraChargeDialog
        open={addExtraChargeDialogOpen}
        onOpenChange={setAddExtraChargeDialogOpen}
        unifiedBookingId={booking.unified_booking_id}
        segments={hostSegments}
      />

      <AddServiceDialog
        open={addServiceDialogOpen}
        onOpenChange={setAddServiceDialogOpen}
        unifiedBookingId={booking.unified_booking_id}
      />

      <UploadDocumentDialog
        open={uploadDocDialogOpen}
        onOpenChange={setUploadDocDialogOpen}
        unifiedBookingId={booking.unified_booking_id}
      />

      <NoShowDialog
        open={noShowDialogOpen}
        onOpenChange={setNoShowDialogOpen}
        bookingId={booking.unified_booking_id}
        guestName={booking.guest_name || undefined}
      />

      {
        noShowRecord && (
          <RemoveNoShowDialog
            open={removeNoShowDialogOpen}
            onOpenChange={setRemoveNoShowDialogOpen}
            noShowId={noShowRecord.id}
            bookingId={booking.unified_booking_id}
            guestName={booking.guest_name || undefined}
          />
        )
      }

      {/* Direct Refund Dialog */}
      <DirectRefundDialog
        open={directRefundDialogOpen}
        onOpenChange={setDirectRefundDialogOpen}
        bookingId={booking.unified_booking_id}
        guestName={booking.guest_name || undefined}
        totalAmount={booking.total_amount_net ? Number(booking.total_amount_net) : undefined}
        otaSource={booking.source || undefined}
        bookingCode={(booking as any).booking_id_extranet || booking.unified_booking_id.slice(0, 12)}
        paymentType={booking.payment_type || undefined}
      />

      {/* Assign Owner Dialog */}
      <AssignOwnerDialog
        open={assignOwnerDialogOpen}
        onOpenChange={setAssignOwnerDialogOpen}
        bookingId={booking.unified_booking_id}
        currentOwnerId={ownershipInfo.responsibleOwner?.userId}
      />


      {/* CheckIn Dialog with coverage validation */}
      {
        effectiveStay && (
          <CheckInDialog
            open={checkInDialogOpen}
            onOpenChange={setCheckInDialogOpen}
            stay={{
              id: effectiveStay.id,
              unified_booking_id: booking.unified_booking_id,
              host_room_id: effectiveStay.host_room_id,
              host_property_name: effectiveStay.host_property_name,
              host_room_type: effectiveStay.host_room_type,
              stay_status: effectiveStay.stay_status,
              actual_check_out_at: stayRecord?.actual_check_out_at || null,
            }}
            booking={{
              guest_name: booking.guest_name || "",
              guest_phone: booking.guest_phone || null,
              check_in_date: booking.check_in_date,
              check_out_date: booking.check_out_date,
              source: booking.source || "",
              payment_type: booking.payment_type || "",
              pms_property_name: booking.pms_property_name || null,
              nights: booking.nights,
              total_amount_net: booking.total_amount_net,
              nationality: booking.nationality,
            }}
            isMultiSegmentCheckIn={canCheckInNextSegment}
            nextSegment={multiSegmentInfo.nextSegmentToCheckIn ? {
              id: multiSegmentInfo.nextSegmentToCheckIn.id,
              partner_id: multiSegmentInfo.nextSegmentToCheckIn.partner_id,
              host_property_name: multiSegmentInfo.nextSegmentToCheckIn.host_property_name,
              host_room_type: multiSegmentInfo.nextSegmentToCheckIn.host_room_type,
              date_from: multiSegmentInfo.nextSegmentToCheckIn.date_from,
              date_to: multiSegmentInfo.nextSegmentToCheckIn.date_to,
            } : null}
          />
        )
      }

      {/* CheckOut Dialog with payment validation */}
      {
        effectiveStay && (
          <CheckOutDialog
            open={checkOutDialogOpen}
            onOpenChange={setCheckOutDialogOpen}
            stay={{
              id: effectiveStay.id,
              unified_booking_id: booking.unified_booking_id,
              actual_check_in_at: stayRecord?.actual_check_in_at || null,
            }}
            booking={{
              guest_name: booking.guest_name || "",
              guest_phone: booking.guest_phone || null,
              check_in_date: booking.check_in_date,
              check_out_date: booking.check_out_date,
              payment_type: booking.payment_type || "",
              total_amount_net: booking.total_amount_net,
            }}
            amountCollected={roomCollectedAmount}
            onCollectRoom={() => {
              setCheckOutDialogOpen(false);
              navigate(`/bookings/${booking.unified_booking_id}/payment/add?category=ROOM&lock=1`);
            }}
            onCollectService={() => {
              setCheckOutDialogOpen(false);
              navigate(`/bookings/${booking.unified_booking_id}/payment/add?category=SERVICE&lock=1`);
            }}
            onCollectSurcharge={() => {
              setCheckOutDialogOpen(false);
              setAddExtraChargeDialogOpen(true);
            }}
          />
        )
      }

      {/* Host Deposit/Prepaid Dialog */}
      {
        hostSegments.length > 0 && (
          <CreateHostDepositDialog
            open={depositDialogOpen}
            onOpenChange={setDepositDialogOpen}
            purpose={depositDialogPurpose}
            segments={hostSegments}
            unifiedBookingId={booking.unified_booking_id}
          />
        )
      }

      {/* Edit Host Deposit Dialog */}
      <EditHostDepositDialog
        open={editDepositDialogOpen}
        onOpenChange={setEditDepositDialogOpen}
        request={editingDepositRequest}
      />

      {/* Delete Deposit Confirmation Dialog */}
      <AlertDialog open={deleteDepositDialogOpen} onOpenChange={setDeleteDepositDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa đề xuất {deletingDepositRequest?.purpose === "HOST_DEPOSIT" ? "đặt cọc" : "trả trước"} này?
              <br />
              <strong>Mã: {deletingDepositRequest?.request_code}</strong> • {formatCurrency(deletingDepositRequest?.proposed_amount || 0)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deletingDepositRequest) {
                  await deleteDepositMutation.mutateAsync(deletingDepositRequest.id);
                  setDeleteDepositDialogOpen(false);
                  setDeletingDepositRequest(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Multi-room Check-in Dialog */}
      {
        multiRoomCheckInProps && (
          <MultiRoomCheckInDialog
            open={multiRoomCheckInDialogOpen}
            onOpenChange={setMultiRoomCheckInDialogOpen}
            stay={multiRoomCheckInProps.stay}
            booking={multiRoomCheckInProps.booking}
          />
        )
      }

      {/* Multi-room Check-out Dialog */}
      {
        multiRoomCheckOutProps && (
          <MultiRoomCheckOutDialog
            open={multiRoomCheckOutDialogOpen}
            onOpenChange={setMultiRoomCheckOutDialogOpen}
            stay={multiRoomCheckOutProps.stay}
            booking={multiRoomCheckOutProps.booking}
            amountCollected={roomCollectedAmount}
            onCollectRoom={() => {
              setMultiRoomCheckOutDialogOpen(false);
              navigate(`/bookings/${booking.unified_booking_id}/payment/add?category=ROOM&lock=1`);
            }}
            onCollectService={() => {
              setMultiRoomCheckOutDialogOpen(false);
              navigate(`/bookings/${booking.unified_booking_id}/payment/add?category=SERVICE&lock=1`);
            }}
            onCollectSurcharge={() => {
              setMultiRoomCheckOutDialogOpen(false);
              setAddExtraChargeDialogOpen(true);
            }}
          />
        )
      }

      {/* Multi-room Undo Dialog */}
      {
        multiRoomUndoProps && (
          <MultiRoomUndoDialog
            open={multiRoomUndoDialogOpen}
            onOpenChange={setMultiRoomUndoDialogOpen}
            undoType={undoType}
            stay={multiRoomUndoProps.stay}
            booking={multiRoomUndoProps.booking}
          />
        )
      }

      {/* Cancel Manual Booking Dialog */}
      {booking && isManualBooking && (
        <CancelManualBookingDialog
          open={cancelBookingDialogOpen}
          onOpenChange={setCancelBookingDialogOpen}
          booking={{
            unified_booking_id: booking.unified_booking_id,
            guest_name: booking.guest_name || "",
            check_in_date: booking.check_in_date || "",
            check_out_date: booking.check_out_date || "",
            total_amount_net: booking.total_amount_net || 0,
            total_amount_gross: booking.total_amount_gross || 0,
            booking_status: booking.booking_status || "",
            source: booking.source || "",
            nights: booking.nights || 0,
            payment_type: booking.payment_type || "",
            note: (booking as any).note,
          }}
        />
      )}

      {/* Edit Manual Booking Dialog */}
      {booking && isManualBooking && (
        <EditManualBookingDialog
          open={editBookingDialogOpen}
          onOpenChange={setEditBookingDialogOpen}
          booking={{
            unified_booking_id: booking.unified_booking_id,
            guest_name: booking.guest_name || "",
            guest_phone: booking.guest_phone || null,
            guest_email: booking.guest_email || null,
            source: booking.source || "",
            check_in_date: booking.check_in_date || "",
            check_out_date: booking.check_out_date || "",
            total_amount_net: booking.total_amount_net || 0,
            total_amount_gross: booking.total_amount_gross || 0,
            nights: booking.nights || 0,
            note: (booking as any).note,
            booking_status: booking.booking_status || "",
            payment_type: booking.payment_type || "",
          }}
        />
      )}
    </>
  );
}
