import { useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";
import { fetchStaysOperations, type SegmentInfo, type CoverageInfo, type BookingInfo, type StayWithBooking } from "@/lib/stays/fetchStaysOperations";
import { HEAVY_QUERY_OPTIONS } from "@/lib/navigation/heavyQueryOptions";
import { keepPrevious } from "@/lib/query-helpers";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { StatusBadge } from "@/components/ui/status-badge";
import { getStayTimelineVariant } from "@/constants/status-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Users,
  Building2,
  Phone,
  MoreHorizontal,
  Loader2,
  Eye,
  LogIn,
  LogOut,
  Banknote,
  AlertTriangle,
  FileText,
  Globe,
  CalendarDays,
  CheckCircle,
  Undo2,
  Camera,
  Send,
  Home,
  FileWarning,
  Repeat,
  CheckCircle2,
  Plane,
  Plus,
  BedDouble,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MetricCard } from "@/components/ui/metric-card";
import { supabase } from "@/integrations/supabase/client";
import { CheckInDialog } from "@/components/booking/CheckInDialog";
import { CheckOutDialog } from "@/components/booking/CheckOutDialog";
import { MultiRoomCheckInDialog } from "@/components/booking/MultiRoomCheckInDialog";
import { MultiRoomCheckOutDialog } from "@/components/booking/MultiRoomCheckOutDialog";
import { MultiRoomUndoDialog } from "@/components/booking/MultiRoomUndoDialog";
import { CollectPaymentDialog } from "@/components/booking/CollectPaymentDialog";
import { HostSupplyDialog } from "@/components/booking/HostSupplyDialog";
import { UploadDocumentDialog } from "@/components/booking/UploadDocumentDialog";
import { AddServiceDialog } from "@/components/booking/AddServiceDialog";
import { AddSurchargeDialog } from "@/components/booking/AddSurchargeDialog";
import { useCheckOut, useUndoCheckIn, useUndoCheckOut, useUndoNoShow } from "@/hooks/useStays";
import { useBatchDocumentStatus, useSendDocumentsToHost } from "@/hooks/useGuestDocuments";
import { toast } from "sonner";
import { formatBookingCode } from "@/lib/bookingCodeFormatter";
import { useResponsibleOwnersBatch, useOwnerFilterOptions } from "@/hooks/useResponsibleOwner";
import { OpsOwnerBadge } from "@/components/ui/ResponsibleOwnerBadge";
import { StayCompactCard } from "@/components/stays/StayCompactCard";
import { StayDetailSheet } from "@/components/stays/StayDetailSheet";
import { DateModeSelector } from "@/components/ui/date-mode-selector";
import { SegmentInfoBadge, DateModeBadge } from "@/components/ui/segment-warning";
import { DateMode } from "@/lib/segment-governance";
import { FilterBar } from "@/components/ui/filter-bar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// =============== TYPES ===============
// Types imported from @/lib/stays/fetchStaysOperations

// =============== TIMELINE STATUS (computed from dates) ===============
type TimelineStatus = "UPCOMING" | "CHECKIN_TODAY" | "IN_HOUSE" | "CHECKOUT_TODAY" | "COMPLETED";

const getTimelineStatus = (
  checkInDate: string,
  checkOutDate: string,
  actualCheckIn: string | null,
  actualCheckOut: string | null,
  selectedDate: string
): TimelineStatus => {
  // Already checked out
  if (actualCheckOut) return "COMPLETED";

  // In house (checked in but not out)
  if (actualCheckIn) {
    if (checkOutDate === selectedDate) return "CHECKOUT_TODAY";
    return "IN_HOUSE";
  }

  // Not checked in yet
  if (checkInDate === selectedDate) return "CHECKIN_TODAY";
  if (checkInDate > selectedDate) return "UPCOMING";

  // Past check-in date but not checked in
  return "CHECKIN_TODAY";
};

const getTimelineLabel = (status: TimelineStatus) => {
  switch (status) {
    case "UPCOMING": return "Sắp đến";
    case "CHECKIN_TODAY": return "Nhận phòng hôm nay";
    case "IN_HOUSE": return "Đang lưu trú";
    case "CHECKOUT_TODAY": return "Trả phòng hôm nay";
    case "COMPLETED": return "Đã trả phòng";
  }
};

// =============== OPERATIONAL STATUS (warnings) ===============
type OperationalStatus = "ROOM_UNASSIGNED" | "DOCUMENT_MISSING" | "ROOM_CHANGE" | "READY";

const getOperationalStatus = (
  hasRoom: boolean,
  hasDocument: boolean,
  hasRoomChange: boolean
): OperationalStatus => {
  if (!hasRoom) return "ROOM_UNASSIGNED";
  if (!hasDocument) return "DOCUMENT_MISSING";
  if (hasRoomChange) return "ROOM_CHANGE";
  return "READY";
};

// =============== HELPERS ===============
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatCurrency = (amount: number | null) => {
  if (amount === null) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

// Local date helpers (VN timezone)
const toLocalDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const getLocalDateKeyFromTimestamp = (ts: string | null) => {
  if (!ts) return null;
  return toLocalDateKey(new Date(ts));
};

const getDateString = (offset: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return toLocalDateKey(date);
};

const DATE_OPTIONS = {
  today: { label: "Hôm nay", offset: 0 },
  tomorrow: { label: "Ngày mai", offset: 1 },
  yesterday: { label: "Hôm qua", offset: -1 },
  custom: { label: "Tùy chỉnh", offset: null },
} as const;

type DateOptionKey = keyof typeof DATE_OPTIONS;

// =============== COMPONENT ===============
// Date range options for no_room filter (Chưa phân bổ tab)
const NO_ROOM_DATE_OPTIONS = [
  { value: "0", label: "Trước ngày CI" },
  { value: "7", label: "7 ngày" },
  { value: "14", label: "14 ngày" },
  { value: "21", label: "21 ngày" },
  { value: "30", label: "30 ngày" },
] as const;

export default function StaysPage() {
  const navigate = useNavigate();
  const { canUsePage } = useCurrentUserPagePermissions();
  const canPerformActions = canUsePage('/stays');

  const [view, setView] = useState<"checkin_all" | "inhouse" | "checkout" | "new_booking" | "upcoming" | "overdue">("checkin_all");
  const [searchTerm, setSearchTerm] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [selectedDateOption, setSelectedDateOption] = useState<DateOptionKey>("today");
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [customDatePopoverOpen, setCustomDatePopoverOpen] = useState(false);
  const [dateMode, setDateMode] = useState<DateMode>("OPS"); // Default to OPS mode

  // New filters: Host, Property (segment-based)
  const [hostFilter, setHostFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");

  // OTA property filter for no_room tab
  const [otaPropertyFilter, setOtaPropertyFilter] = useState<string>("all");

  // No-room date range filter: how far ahead from today (by check-in date)
  // Default: show bookings with check-in within 7 days (urgent first)
  const [noRoomDateRange, setNoRoomDateRange] = useState<string>("7");

  // FilterBar active state — noRoomDateRange default is "7" (not "all")
  const hasActiveFilters = searchTerm !== "" || ownerFilter !== "all" || hostFilter !== "all" || propertyFilter !== "all" || otaPropertyFilter !== "all" || noRoomDateRange !== "7";
  const clearAllFilters = () => {
    setSearchTerm("");
    setOwnerFilter("all");
    setHostFilter("all");
    setPropertyFilter("all");
    setOtaPropertyFilter("all");
    setNoRoomDateRange("7");
  };

  // Compute selected date based on option or custom date
  const selectedDate = useMemo(() => {
    if (selectedDateOption === "custom" && customDate) {
      return toLocalDateKey(customDate);
    }
    const option = DATE_OPTIONS[selectedDateOption];
    return getDateString(option.offset ?? 0);
  }, [selectedDateOption, customDate]);

  // Dialog states
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [checkOutDialogOpen, setCheckOutDialogOpen] = useState(false);
  // Multi-room dialog states
  const [multiRoomCheckInDialogOpen, setMultiRoomCheckInDialogOpen] = useState(false);
  const [multiRoomCheckOutDialogOpen, setMultiRoomCheckOutDialogOpen] = useState(false);
  const [multiRoomUndoDialogOpen, setMultiRoomUndoDialogOpen] = useState(false);
  const [undoType, setUndoType] = useState<"CHECK_IN" | "CHECK_OUT">("CHECK_IN");
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [assignRoomDialogOpen, setAssignRoomDialogOpen] = useState(false);
  const [uploadDocDialogOpen, setUploadDocDialogOpen] = useState(false);
  const [addServiceDialogOpen, setAddServiceDialogOpen] = useState(false);
  const [addSurchargeDialogOpen, setAddSurchargeDialogOpen] = useState(false);
  const [selectedStay, setSelectedStay] = useState<StayWithBooking | null>(null);

  // Sheet state for detail panel
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  // Undo confirmation dialog state
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);
  const [undoConfirmType, setUndoConfirmType] = useState<"CHECK_IN" | "CHECK_OUT">("CHECK_IN");
  const [undoConfirmStay, setUndoConfirmStay] = useState<StayWithBooking | null>(null);

  // Mutations
  const checkOutMutation = useCheckOut();
  const undoCheckInMutation = useUndoCheckIn();
  const undoCheckOutMutation = useUndoCheckOut();
  const undoNoShowMutation = useUndoNoShow();
  const sendToHostMutation = useSendDocumentsToHost();

  // =============== FETCH DATA ===============
  // Query for declaration warning: NOT_SENT where check-in is today
  const todayDateKey = useMemo(() => toLocalDateKey(new Date()), []);
  const { data: declarationWarning } = useQuery({
    queryKey: ["declaration_warning", todayDateKey],
    queryFn: async () => {
      // Get stays where actual_check_in_at is today
      const { data: staysData } = await supabase
        .from("stays")
        .select("unified_booking_id, actual_check_in_at")
        .not("actual_check_in_at", "is", null);

      if (!staysData?.length) return { count: 0 };

      // Filter to today's check-ins
      const todayCheckIns = staysData.filter(s =>
        s.actual_check_in_at && s.actual_check_in_at.slice(0, 10) === todayDateKey
      );
      if (!todayCheckIns.length) return { count: 0 };

      const bookingIds = todayCheckIns.map(s => s.unified_booking_id);

      // Get documents for these bookings
      const { data: docs } = await supabase
        .from("guest_documents")
        .select("unified_booking_id, document_image, sent_to_host_status")
        .in("unified_booking_id", bookingIds);

      // Count bookings with NOT_SENT status (has image but not sent)
      const bookingsWithNotSent = new Set<string>();
      docs?.forEach(doc => {
        if (doc.document_image && doc.sent_to_host_status !== "SENT") {
          bookingsWithNotSent.add(doc.unified_booking_id);
        }
      });

      // Also count bookings with NO documents at all (among today's check-ins)
      const bookingsWithDocs = new Set(docs?.map(d => d.unified_booking_id) || []);
      todayCheckIns.forEach(s => {
        if (!bookingsWithDocs.has(s.unified_booking_id)) {
          bookingsWithNotSent.add(s.unified_booking_id);
        }
      });

      return { count: bookingsWithNotSent.size };
    },
    staleTime: 30000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Query from bookings_mirror (accurate data from booking center) and LEFT JOIN with stays
  // Filter by An Gia Residences group properties
  const staysQuery = useQuery({
    queryKey: ["stays_operations", selectedDate],
    ...HEAVY_QUERY_OPTIONS,
    placeholderData: keepPrevious,
    queryFn: () => fetchStaysOperations(selectedDate),
  });
  const { data: stays = [], isLoading, refetch } = staysQuery;

  usePrefetchMountLog('StaysPage', [
    { key: ['stays_operations', selectedDate], query: staysQuery },
  ]);

  // Get document status — memoize IDs to stabilize queryKey and prevent refetch loops
  const stableBookingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of stays) ids.add(s.unified_booking_id);
    return Array.from(ids);
  }, [stays]);
  const { data: documentStatuses = {} } = useBatchDocumentStatus(stableBookingIds);

  // =============== FILTERING & SORTING ===============
  const filteredStays = useMemo(() => {
    // Only show the “current” stay per booking to avoid duplicate rows and KPI double-counting.
    let result = stays.filter(s => s.booking !== null && s.isCurrent);

    // Filter out cancelled/no-show bookings (except for new_booking tab which shows ALL statuses)
    if (view !== "new_booking") {
      result = result.filter(s => {
        const status = s.booking?.booking_status;
        return status !== "CANCELLED" && status !== "NO_SHOW";
      });
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(stay =>
        stay.unified_booking_id.toLowerCase().includes(term) ||
        stay.booking?.guest_name?.toLowerCase().includes(term) ||
        stay.booking?.guest_phone?.includes(term)
      );
    }

    // View filter based on timeline status
    switch (view) {
      case "checkin_all":
        // Nhận phòng: Tất cả booking check-in hôm nay (có/chưa segment, đã/chưa check-in)
        result = result.filter(s => {
          const segmentDateFrom = s.segment?.date_from?.split("T")[0];
          if (s.segment) {
            // Có segment: date_from = selectedDate (chưa check-in hoặc đã check-in hôm nay)
            return segmentDateFrom === selectedDate;
          }
          // Chưa có segment: booking check_in_date = selectedDate
          return s.booking?.check_in_date === selectedDate;
        });
        break;
      case "inhouse":
        // Đang ở: Đã check-in, chưa check-out
        result = result.filter(s => s.actual_check_in_at && !s.actual_check_out_at);
        break;
      case "checkout":
        // Trả phòng: Đã phân bổ + ngày trả phòng = selectedDate
        // Shows ALL bookings with checkout date matching, regardless of check-in status
        // Aligns with Booking Center (SOT) behavior
        result = result.filter(s => {
          if (!s.segment) return false; // Phải đã phân bổ
          // Ngày trả phòng: ưu tiên segment date_to, fallback booking check_out_date
          const segmentDateTo = s.segment.date_to?.split("T")[0];
          const checkOutDate = segmentDateTo || s.booking?.check_out_date;
          return checkOutDate === selectedDate;
        });
        break;
      case "new_booking":
        // Đặt phòng mới: booking_date = selectedDate (SOT: unified_bookings.booking_date)
        result = result.filter(s => {
          // booking_created_at is now booking_date (DATE YYYY-MM-DD), not a timestamp
          return s.booking?.booking_created_at === selectedDate;
        });
        break;
      case "upcoming":
        // Chưa phân bổ phòng: Chưa phân bổ segment HOẶC coverage chưa đầy đủ
        {
          const seenBookings = new Set<string>();
          result = result.filter(s => {
            if (seenBookings.has(s.unified_booking_id)) return false;
            const isComplete = s.coverage?.isComplete ?? false;
            if (isComplete) return false;
            seenBookings.add(s.unified_booking_id);
            return true;
          });
        }
        break;
      case "overdue":
        result = result.filter(s => {
          if (s.booking?.payment_type !== "HOTEL_COLLECT") return false;
          const remaining = (s.booking?.total_amount_net || 0) - s.amount_collected;
          return remaining > 0 && s.booking?.check_out_date && s.booking.check_out_date < selectedDate;
        });
        break;
    }

    // Priority sorting (spec section 9)
    result.sort((a, b) => {
      const aHasRoom = !!a.segment;
      const bHasRoom = !!b.segment;
      const aCheckInToday = a.booking?.check_in_date === selectedDate && !a.actual_check_in_at;
      const bCheckInToday = b.booking?.check_in_date === selectedDate && !b.actual_check_in_at;
      const aCheckOutToday = a.segment?.date_to === selectedDate && !a.actual_check_out_at;
      const bCheckOutToday = b.segment?.date_to === selectedDate && !b.actual_check_out_at;

      // 1. Check-in today + no room (highest priority)
      if (aCheckInToday && !aHasRoom && !(bCheckInToday && !bHasRoom)) return -1;
      if (bCheckInToday && !bHasRoom && !(aCheckInToday && !aHasRoom)) return 1;

      // 2. Check-out today + room change
      if (aCheckOutToday && a.hasRoomChange && !(bCheckOutToday && b.hasRoomChange)) return -1;
      if (bCheckOutToday && b.hasRoomChange && !(aCheckOutToday && a.hasRoomChange)) return 1;

      // 3. Check-in today (with room)
      if (aCheckInToday && !bCheckInToday) return -1;
      if (bCheckInToday && !aCheckInToday) return 1;

      // 4. In-house
      const aInHouse = a.actual_check_in_at && !a.actual_check_out_at;
      const bInHouse = b.actual_check_in_at && !b.actual_check_out_at;
      if (aInHouse && !bInHouse) return -1;
      if (bInHouse && !aInHouse) return 1;

      // 5. By check-in date
      return (a.booking?.check_in_date || "").localeCompare(b.booking?.check_in_date || "");
    });

    return result;
  }, [stays, view, searchTerm, selectedDate]);

  // Get booking IDs for batch owner lookup — use STABLE base stays, not filtered subset
  // This prevents re-fetching owners on every filter/search change
  const { getOwnershipInfo, storedOwners } = useResponsibleOwnersBatch(stableBookingIds);

  // Get unique owners for filter dropdown (separate lightweight query for large databases)
  const { data: ownerOptions = [] } = useOwnerFilterOptions();

  // Fallback to storedOwners if ownerOptions is empty (for backward compatibility)
  const uniqueOwners = useMemo(() => {
    if (ownerOptions.length > 0) {
      return ownerOptions;
    }
    // Fallback: derive from storedOwners
    const owners: Array<{ userId: string; userName: string }> = [];
    const seen = new Set<string>();

    storedOwners.forEach((owner) => {
      if (!seen.has(owner.userId)) {
        seen.add(owner.userId);
        owners.push({ userId: owner.userId, userName: owner.userName });
      }
    });

    return owners.sort((a, b) => a.userName.localeCompare(b.userName));
  }, [ownerOptions, storedOwners]);

  // Apply owner filter to filteredStays
  const ownerFilteredStays = useMemo(() => {
    if (ownerFilter === "all") return filteredStays;

    return filteredStays.filter((stay) => {
      const owner = storedOwners.get(stay.unified_booking_id);
      if (ownerFilter === "unassigned") {
        return !owner;
      }
      return owner?.userId === ownerFilter;
    });
  }, [filteredStays, ownerFilter, storedOwners]);

  // Get unique hosts and properties from segments for filtering
  const { uniqueHosts, uniqueProperties, uniqueOtaProperties } = useMemo(() => {
    const hostsMap = new Map<string, string>();
    const propertiesMap = new Map<string, string>();
    const otaPropertiesSet = new Set<string>();

    stays.forEach(stay => {
      // OTA properties from booking
      if (stay.booking?.pms_property_name) {
        otaPropertiesSet.add(stay.booking.pms_property_name);
      }

      if (stay.segment) {
        const partnerId = stay.segment.partner_id;
        const partnerName = stay.segment.partners?.partner_name;
        const propertyName = stay.segment.host_property_name;

        if (partnerId && partnerName) {
          hostsMap.set(partnerId, partnerName);
        }
        if (propertyName) {
          propertiesMap.set(propertyName, propertyName);
        }
      }
    });

    return {
      uniqueHosts: Array.from(hostsMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      uniqueProperties: Array.from(propertiesMap.keys()).sort(),
      uniqueOtaProperties: Array.from(otaPropertiesSet).sort(),
    };
  }, [stays]);

  // Apply host and property filters
  const hostPropertyFilteredStays = useMemo(() => {
    let result = ownerFilteredStays;

    // Host filter (segment-based)
    if (hostFilter !== "all") {
      result = result.filter(stay => stay.segment?.partner_id === hostFilter);
    }

    // Property filter (segment-based)
    if (propertyFilter !== "all") {
      result = result.filter(stay => stay.segment?.host_property_name === propertyFilter);
    }

    // OTA property filter (only for upcoming view)
    if (view === "upcoming" && otaPropertyFilter !== "all") {
      result = result.filter(stay => stay.booking?.pms_property_name === otaPropertyFilter);
    }

    return result;
  }, [ownerFilteredStays, hostFilter, propertyFilter, otaPropertyFilter, view]);

  // =============== STATS (memoized single-pass) ===============
  const { activeStays, checkinAllStays, inHouse, checkedOutToday, newBookings, noRoomStays, overduePaymentStays } = useMemo(() => {
    const active: typeof stays = [];
    const checkinAll: typeof stays = [];
    const house: typeof stays = [];
    const checkedOut: typeof stays = [];
    const newBook: typeof stays = [];
    const noRoom: typeof stays = [];
    const overdue: typeof stays = [];
    const seenNoRoom = new Set<string>();

    for (const s of stays) {
      if (!s.booking) continue;

      // Count newBookings BEFORE status filter — includes ALL statuses (same SOT as Booking Center)
      if (s.booking?.booking_created_at === selectedDate) {
        newBook.push(s);
      }

      // Skip CANCELLED/NO_SHOW for all other KPIs
      if (s.booking.booking_status === "CANCELLED" || s.booking.booking_status === "NO_SHOW") continue;
      active.push(s);

      const segmentDateFrom = s.segment?.date_from?.split("T")[0];
      const hasSegment = !!s.segment;
      const checkedInAt = s.actual_check_in_at;
      const checkedOutAt = s.actual_check_out_at;

      // checkinAll: tất cả booking check-in hôm nay (merged: checkin + checked_in + no_room today)
      if (hasSegment ? segmentDateFrom === selectedDate : s.booking?.check_in_date === selectedDate) {
        checkinAll.push(s);
      }
      // inHouse: đã check-in, chưa check-out
      if (checkedInAt && !checkedOutAt) {
        house.push(s);
      }
      // checkedOutToday → allocated + checkout date = selectedDate
      // Includes ALL bookings regardless of check-in status (aligned with Booking Center SOT)
      if (hasSegment) {
        const segmentDateTo = s.segment?.date_to?.split("T")[0];
        const checkOutDateForKpi = segmentDateTo || s.booking?.check_out_date;
        if (checkOutDateForKpi === selectedDate) {
          checkedOut.push(s);
        }
      }
      // noRoomStays: chưa phân bổ đủ
      if (!seenNoRoom.has(s.unified_booking_id)) {
        const isComplete = s.coverage?.isComplete ?? false;
        if (!isComplete) {
          seenNoRoom.add(s.unified_booking_id);
          noRoom.push(s);
        }
      }
      // overduePaymentStays
      if (s.booking?.payment_type === "HOTEL_COLLECT") {
        const remaining = (s.booking?.total_amount_net || 0) - s.amount_collected;
        if (remaining > 0 && s.booking?.check_out_date && s.booking.check_out_date < selectedDate) {
          overdue.push(s);
        }
      }
    }

    return {
      activeStays: active,
      checkinAllStays: checkinAll,
      inHouse: house,
      checkedOutToday: checkedOut,
      newBookings: newBook,
      noRoomStays: noRoom,
      overduePaymentStays: overdue,
    };
  }, [stays, selectedDate]);

  // =============== NO-ROOM DATE FILTER (applied AFTER categorization) ===============
  // Filters noRoomStays by check-in date range — only affects "Chưa phân bổ" tab
  const filteredNoRoomStays = useMemo(() => {
    if (noRoomDateRange === "all") return noRoomStays;
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const rangeDays = parseInt(noRoomDateRange);
    return noRoomStays.filter(stay => {
      if (!stay.booking?.check_in_date) return false;
      const checkInMs = new Date(stay.booking.check_in_date + "T00:00:00").getTime();
      const diffDays = Math.floor((checkInMs - todayMs) / (1000 * 60 * 60 * 24));
      if (rangeDays === 0) {
        // "Trước ngày CI" = check-in đã qua hoặc hôm nay (urgent!)
        return diffDays <= 0;
      }
      // "X ngày" = check-in trong X ngày tới (0 <= diff <= X)
      return diffDays >= 0 && diffDays <= rangeDays;
    });
  }, [noRoomStays, noRoomDateRange]);

  // =============== HANDLERS ===============
  const queryClient = useQueryClient();

  /**
   * Open check-in dialog - auto-detect multi-room booking
   * Multi-room: totalSegments > 1 OR booking has multiple room lines
   */
  const openCheckIn = (stay: StayWithBooking) => {
    setSelectedStay(stay);
    // Detect multi-room booking: multiple segments = multi-room
    const isMultiRoom = stay.totalSegments > 1;
    if (isMultiRoom) {
      setMultiRoomCheckInDialogOpen(true);
    } else {
      setCheckInDialogOpen(true);
    }
  };

  /**
   * Open check-out dialog - auto-detect multi-room booking
   */
  const openCheckOut = useCallback((stay: StayWithBooking) => {
    if (!stay.unified_booking_id) return;
    setSelectedStay(stay);
    // Detect multi-room booking: multiple segments = multi-room
    const isMultiRoom = stay.totalSegments > 1;
    if (isMultiRoom) {
      setMultiRoomCheckOutDialogOpen(true);
    } else {
      setCheckOutDialogOpen(true);
    }
  }, []);

  const openCollectPayment = (stay: StayWithBooking) => {
    setSelectedStay(stay);
    setCollectDialogOpen(true);
  };

  const openAssignRoom = (stay: StayWithBooking) => {
    setSelectedStay(stay);
    setAssignRoomDialogOpen(true);
  };

  const openUploadDoc = (stay: StayWithBooking) => {
    setSelectedStay(stay);
    setUploadDocDialogOpen(true);
  };

  const openAddService = (stay: StayWithBooking) => {
    setSelectedStay(stay);
    setAddServiceDialogOpen(true);
  };

  const openAddSurcharge = (stay: StayWithBooking) => {
    setSelectedStay(stay);
    setAddSurchargeDialogOpen(true);
  };

  const handleUndoCheckIn = useCallback((stay: StayWithBooking) => {
    // Multi-room: open dialog to select which segments to undo
    if (stay.totalSegments > 1) {
      setSelectedStay(stay);
      setUndoType("CHECK_IN");
      setMultiRoomUndoDialogOpen(true);
      return;
    }

    // Single-room: show confirmation dialog
    setUndoConfirmStay(stay);
    setUndoConfirmType("CHECK_IN");
    setUndoConfirmOpen(true);
  }, []);

  const handleUndoCheckOut = useCallback((stay: StayWithBooking) => {
    // Multi-room: open dialog to select which segments to undo
    if (stay.totalSegments > 1) {
      setSelectedStay(stay);
      setUndoType("CHECK_OUT");
      setMultiRoomUndoDialogOpen(true);
      return;
    }

    // Single-room: show confirmation dialog
    setUndoConfirmStay(stay);
    setUndoConfirmType("CHECK_OUT");
    setUndoConfirmOpen(true);
  }, []);

  // Execute undo after confirmation
  const executeUndoConfirm = useCallback(() => {
    if (!undoConfirmStay) return;
    const stay = undoConfirmStay;

    if (undoConfirmType === "CHECK_IN") {
      if (undoCheckInMutation.isPending) return;
      queryClient.setQueryData(
        ["stays_operations", selectedDate],
        (oldData: StayWithBooking[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map(s =>
            s.unified_booking_id === stay.unified_booking_id
              ? { ...s, stay_status: "WAIT_ROOM", actual_check_in_at: null, _isOptimistic: true }
              : s
          );
        }
      );
      undoCheckInMutation.mutate(stay.unified_booking_id);
    } else {
      if (undoCheckOutMutation.isPending) return;
      queryClient.setQueryData(
        ["stays_operations", selectedDate],
        (oldData: StayWithBooking[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map(s =>
            s.unified_booking_id === stay.unified_booking_id
              ? { ...s, stay_status: "CHECKED_IN", actual_check_out_at: null, _isOptimistic: true }
              : s
          );
        }
      );
      undoCheckOutMutation.mutate(stay.unified_booking_id);
    }

    setUndoConfirmOpen(false);
    setUndoConfirmStay(null);
  }, [undoConfirmStay, undoConfirmType, queryClient, selectedDate, undoCheckInMutation, undoCheckOutMutation]);

  const handleUndoNoShow = (stay: StayWithBooking) => {
    if (undoNoShowMutation.isPending) return;
    undoNoShowMutation.mutate(stay.unified_booking_id);
  };

  // =============== RENDER ===============
  return (
    <>
      <Header
        title="Bảng điều khiển"
        subtitle="Quản lý hoạt động hàng ngày: nhận phòng, trả phòng, thanh toán"
        actions={
          <div className="flex items-center gap-3">
            <Select
              value={selectedDateOption}
              onValueChange={(v: DateOptionKey) => {
                setSelectedDateOption(v);
                if (v === "custom") {
                  setCustomDatePopoverOpen(true);
                }
              }}
            >
              <SelectTrigger className="w-[130px] h-8 !bg-white/15 !border-white/30 !text-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hôm nay</SelectItem>
                <SelectItem value="tomorrow">Ngày mai</SelectItem>
                <SelectItem value="yesterday">Hôm qua</SelectItem>
                <SelectItem value="custom">Tùy chỉnh</SelectItem>
              </SelectContent>
            </Select>
            {selectedDateOption === "custom" && (
              <Popover open={customDatePopoverOpen} onOpenChange={setCustomDatePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 h-8 !bg-white/15 !border-white/30 !text-white text-xs">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {customDate ? formatDate(toLocalDateKey(customDate)) : "Chọn ngày"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customDate}
                    onSelect={(date) => {
                      setCustomDate(date);
                      setCustomDatePopoverOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        }
      />

      <PageContainer><SectionCard>
        {/* Declaration Warning */}
        {declarationWarning && declarationWarning.count > 0 && (
          <Link to="/stays/declarations" className="block">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-warning/10 border border-warning/30 hover:bg-warning/20 transition-colors cursor-pointer">
              <FileWarning className="h-5 w-5 text-warning shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-warning">Chưa gửi thông tin khai báo lưu trú hôm nay</p>
                <p className="text-sm text-muted-foreground">
                  Có <span className="font-semibold text-warning">{declarationWarning.count}</span> khách nhận phòng hôm nay chưa được gửi thông tin khai báo đến Host
                </p>
              </div>
              <span className="text-xs text-muted-foreground">Xem chi tiết →</span>
            </div>
          </Link>
        )}

        {/* Date Mode Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">Chế độ lọc:</span>
          <DateModeSelector value={dateMode} onChange={setDateMode} size="sm" />
          <span className="ml-1 sm:ml-2 text-xs sm:text-sm text-muted-foreground">{formatDate(selectedDate)}</span>
        </div>

        {/* KPI Cards — reference-style: icon right, single row, stagger animation */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-0 rounded-xl border border-border bg-card overflow-hidden">
          {[
            { key: "checkin_all" as const, label: "NHẬN PHÒNG", value: checkinAllStays.length, sub: formatDate(selectedDate), icon: ArrowDownToLine, color: "text-primary", bgColor: "bg-primary/8", ring: "ring-primary border-primary" },
            { key: "inhouse" as const, label: "ĐANG Ở", value: inHouse.length, sub: "Đang lưu trú", icon: Users, color: "text-success", bgColor: "bg-success/8", ring: "ring-success border-success" },
            { key: "checkout" as const, label: "TRẢ PHÒNG", value: checkedOutToday.length, sub: formatDate(selectedDate), icon: ArrowUpFromLine, color: "text-warning", bgColor: "bg-warning/8", ring: "ring-warning border-warning" },
            { key: "new_booking" as const, label: "ĐẶT MỚI", value: newBookings.length, sub: formatDate(selectedDate), icon: Plus, color: "text-info", bgColor: "bg-info/8", ring: "ring-info border-info" },
            { key: "upcoming" as const, label: "CHƯA PHÂN BỔ", value: filteredNoRoomStays.length, sub: "cần xử lý", icon: Home, color: "text-destructive", bgColor: "bg-destructive/8", ring: "ring-destructive border-destructive" },
            { key: "overdue" as const, label: "QUÁ HẠN", value: overduePaymentStays.length, sub: "cần thu", icon: AlertTriangle, color: "text-warning", bgColor: "bg-warning/8", ring: "ring-warning border-warning" },
          ].map((kpi, idx, arr) => {
            const Icon = kpi.icon;
            const isActive = view === kpi.key;
            return (
              <div
                key={kpi.key}
                onClick={() => setView(kpi.key)}
                className={`stagger-item relative flex items-center justify-between px-2 sm:px-4 cursor-pointer transition-all duration-200 box-border h-[68px] sm:h-[88px]
                  hover:bg-muted/40 hover:shadow-inner
                  ${idx < arr.length - 1 ? "lg:border-r lg:border-border" : ""}
                  ${idx % 3 !== 2 ? "max-lg:border-r max-lg:border-border" : ""}
                  ${idx < 3 ? "max-lg:border-b max-lg:border-border" : ""}
                  ${isActive ? `ring-2 ring-inset ${kpi.ring} bg-card z-10` : ""}
                `}
              >
                <div className="flex flex-col min-w-0">
                  <span className={`text-[8px] sm:text-[10px] font-semibold uppercase tracking-wider mb-0.5 transition-colors duration-200 ${isActive ? kpi.color : "text-muted-foreground"}`}>
                    {kpi.label}
                  </span>
                  <span className={`text-lg sm:text-2xl font-bold tabular-nums leading-tight transition-colors duration-200 ${isActive ? kpi.color : "text-foreground"}`}>
                    {kpi.value}
                  </span>
                  <span className={`text-[9px] sm:text-[11px] mt-0.5 transition-colors duration-200 hidden sm:block ${isActive ? `${kpi.color} opacity-70` : "text-muted-foreground"}`}>
                    {kpi.sub}
                  </span>
                </div>
                <div className={`p-1.5 sm:p-2 rounded-xl ${kpi.bgColor} shrink-0 ml-1 sm:ml-3 transition-transform duration-200 ${isActive ? "scale-110" : ""}`}>
                  <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${kpi.color} transition-colors duration-200`} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Tab Navigation - 6 pills with smooth transitions */}
        <div className="border-b border-border" style={{ animation: 'premium-fade-in 300ms cubic-bezier(0.16, 1, 0.3, 1) 150ms both' }}>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide py-1 px-0.5">
            {[
              { key: "checkin_all", label: "Nhận phòng", count: checkinAllStays.length, icon: <ArrowDownToLine className="h-3.5 w-3.5" /> },
              { key: "inhouse", label: "Đang ở", count: inHouse.length, icon: <Users className="h-3.5 w-3.5" /> },
              { key: "checkout", label: "Trả phòng", count: checkedOutToday.length, icon: <ArrowUpFromLine className="h-3.5 w-3.5" /> },
              { key: "new_booking", label: "Đặt phòng mới", count: newBookings.length, icon: <Plus className="h-3.5 w-3.5" /> },
              { key: "upcoming", label: "Chưa phân bổ phòng", count: filteredNoRoomStays.length, icon: <Home className="h-3.5 w-3.5" /> },
              { key: "overdue", label: "Quá hạn", count: overduePaymentStays.length, icon: <AlertTriangle className="h-3.5 w-3.5" /> },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key as any)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ease-out ${view === tab.key
                  ? "bg-primary text-white shadow-md scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:scale-[1.01]"
                  }`}
              >
                {tab.icon}
                {tab.label}
                <span className={`ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold transition-all duration-200 ${view === tab.key ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  }`}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Inline Filters — slide in */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-3" style={{ animation: 'premium-fade-in 300ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both' }}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Sắp xếp theo</span>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs bg-card border border-input">
                <SelectValue placeholder="Tất cả NV" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả NV</SelectItem>
                <SelectItem value="unassigned">Chưa gán</SelectItem>
                {uniqueOwners.map(owner => (
                  <SelectItem key={owner.userId} value={owner.userId}>{owner.userName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date range filter — only for "Chưa phân bổ" tab */}
          {view === "upcoming" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Check-in trong</span>
              <Select value={noRoomDateRange} onValueChange={setNoRoomDateRange}>
                <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs bg-card border border-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NO_ROOM_DATE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Search */}
          <div className="relative sm:ml-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tìm khách, booking..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-8 w-full sm:w-[200px] text-xs bg-card border border-input"
            />
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty State */}
        {/* Display stays: use filteredNoRoomStays for "upcoming" tab, hostPropertyFilteredStays for others */}
        {(() => {
          const displayStays = view === "upcoming" ? filteredNoRoomStays : hostPropertyFilteredStays;
          return <>
            {!isLoading && displayStays.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Không có dữ liệu</p>
                <p className="text-sm mt-1">
                  {view === "checkin_all" && "Không có khách nhận phòng hôm nay"}
                  {view === "inhouse" && "Không có khách đang ở"}
                  {view === "checkout" && "Không có khách trả phòng hôm nay"}
                  {view === "new_booking" && "Không có đặt phòng mới hôm nay"}
                  {view === "upcoming" && "Không có lưu trú nào chưa phân bổ phòng"}
                  {view === "overdue" && "Không có thanh toán quá hạn"}
                </p>
              </div>
            )}

            {/* Stay Cards - Flat list, no grouping */}
            {!isLoading && displayStays.length > 0 && (
              <div className="flex flex-col gap-2" style={{ animation: 'premium-fade-in-up 400ms cubic-bezier(0.16, 1, 0.3, 1) 250ms both' }}>
                {displayStays.map((stay, stayIdx) => {
                  const hasRoom = !!stay.segment;
                  const variant: "no_segment" | "has_segment" = hasRoom ? "has_segment" : "no_segment";

                  // Per-tab action buttons
                  const getQuickActions = () => {
                    switch (view) {
                      case "checkin_all": {
                        const actions: Array<{ label: string; onClick: () => void }> = [];
                        // Chưa phân bổ → show Phân bổ
                        if (!hasRoom) {
                          actions.push({ label: "Phân bổ", onClick: () => openAssignRoom(stay) });
                        }
                        // Chưa check-in → show Nhận phòng (only if has room)
                        if (hasRoom && !stay.actual_check_in_at) {
                          actions.push({ label: "Nhận phòng", onClick: () => openCheckIn(stay) });
                        }
                        return actions;
                      }
                      case "inhouse":
                        // Đang ở: hoàn tác nhận phòng
                        return stay.actual_check_in_at
                          ? [{ label: "Hoàn tác nhận phòng", onClick: () => handleUndoCheckIn(stay) }]
                          : [];
                      case "checkout": {
                        // Trả phòng: nút trả phòng (nếu chưa trả) hoặc hoàn tác (nếu đã trả)
                        const acts: Array<{ label: string; onClick: () => void }> = [];
                        if (stay.actual_check_in_at && !stay.actual_check_out_at) {
                          acts.push({ label: "Trả phòng", onClick: () => openCheckOut(stay) });
                        }
                        if (stay.actual_check_out_at) {
                          acts.push({ label: "Hoàn tác trả phòng", onClick: () => handleUndoCheckOut(stay) });
                        }
                        return acts;
                      }
                      case "new_booking":
                        return [];
                      case "upcoming":
                        return [{ label: "Phân bổ phòng", onClick: () => openAssignRoom(stay) }];
                      case "overdue":
                        return [{ label: "Thu tiền", onClick: () => openCollectPayment(stay) }];
                      default:
                        return [];
                    }
                  };

                  const owner = storedOwners.get(stay.unified_booking_id);
                  return (
                    <div
                      key={stay.segmentKey}
                      style={{ animation: `premium-fade-in 280ms cubic-bezier(0.16, 1, 0.3, 1) ${Math.min(stayIdx * 30, 500)}ms both` }}
                    >
                      <StayCompactCard
                        stay={stay}
                        variant={variant}
                        quickActions={getQuickActions()}
                        ownerName={owner?.userName}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </>;
        })()}
      </SectionCard ></PageContainer >

      {/* Detail Sheet */}
      < StayDetailSheet
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        stay={selectedStay}
        documentStatus={selectedStay ? documentStatuses[selectedStay.unified_booking_id] : undefined}
        onCheckIn={(stay) => { setDetailSheetOpen(false); openCheckIn(stay); }
        }
        onCheckOut={(stay) => { setDetailSheetOpen(false); openCheckOut(stay); }}
        onCollectPayment={(stay) => { setDetailSheetOpen(false); openCollectPayment(stay); }}
        onAssignRoom={(stay) => { setDetailSheetOpen(false); openAssignRoom(stay); }}
        onUploadDocument={(stay) => { setDetailSheetOpen(false); openUploadDoc(stay); }}
        onAddService={(stay) => { setDetailSheetOpen(false); openAddService(stay); }}
        onAddSurcharge={(stay) => { setDetailSheetOpen(false); openAddSurcharge(stay); }}
      />

      {/* Dialogs */}
      {
        selectedStay && selectedStay.booking && (
          <>
            <CheckInDialog
              open={checkInDialogOpen}
              onOpenChange={setCheckInDialogOpen}
              stay={selectedStay}
              booking={selectedStay.booking}
            />

            <CheckOutDialog
              open={checkOutDialogOpen}
              onOpenChange={setCheckOutDialogOpen}
              stay={{
                id: selectedStay.id,
                unified_booking_id: selectedStay.unified_booking_id,
                actual_check_in_at: selectedStay.actual_check_in_at || null,
              }}
              booking={{
                guest_name: selectedStay.booking.guest_name || "",
                guest_phone: selectedStay.booking.guest_phone || null,
                check_in_date: selectedStay.booking.check_in_date,
                check_out_date: selectedStay.booking.check_out_date,
                payment_type: selectedStay.booking.payment_type || "",
                total_amount_net: selectedStay.booking.total_amount_net,
              }}
              amountCollected={selectedStay.amount_collected || 0}
              onCollectRoom={() => {
                setCheckOutDialogOpen(false);
                setCollectDialogOpen(true);
              }}
              onCollectService={() => {
                setCheckOutDialogOpen(false);
                setAddServiceDialogOpen(true);
              }}
              onCollectSurcharge={() => {
                setCheckOutDialogOpen(false);
                setAddSurchargeDialogOpen(true);
              }}
              // Pass segment ID for segment-level check-out tracking
              currentSegmentId={selectedStay.segment?.segment_id || null}
            />

            {/* Multi-room Check-in Dialog */}
            <MultiRoomCheckInDialog
              open={multiRoomCheckInDialogOpen}
              onOpenChange={setMultiRoomCheckInDialogOpen}
              stay={{
                id: selectedStay.id,
                unified_booking_id: selectedStay.unified_booking_id,
                host_room_id: selectedStay.host_room_id,
                host_property_name: selectedStay.host_property_name,
                host_room_type: selectedStay.host_room_type,
                stay_status: selectedStay.stay_status,
              }}
              booking={{
                guest_name: selectedStay.booking.guest_name || "",
                guest_phone: selectedStay.booking.guest_phone || null,
                check_in_date: selectedStay.booking.check_in_date,
                check_out_date: selectedStay.booking.check_out_date,
                source: selectedStay.booking.source || "unknown",
                payment_type: selectedStay.booking.payment_type || "",
                pms_property_name: selectedStay.booking.pms_property_name,
                nights: selectedStay.booking.nights,
                total_amount_net: selectedStay.booking.total_amount_net,
                nationality: selectedStay.booking.nationality,
              }}
            />

            {/* Multi-room Check-out Dialog */}
            <MultiRoomCheckOutDialog
              open={multiRoomCheckOutDialogOpen}
              onOpenChange={setMultiRoomCheckOutDialogOpen}
              stay={{
                id: selectedStay.id,
                unified_booking_id: selectedStay.unified_booking_id,
                actual_check_in_at: selectedStay.actual_check_in_at || null,
              }}
              booking={{
                guest_name: selectedStay.booking.guest_name || "",
                guest_phone: selectedStay.booking.guest_phone || null,
                check_in_date: selectedStay.booking.check_in_date,
                check_out_date: selectedStay.booking.check_out_date,
                payment_type: selectedStay.booking.payment_type || "",
                total_amount_net: selectedStay.booking.total_amount_net,
              }}
              amountCollected={selectedStay.amount_collected || 0}
              onCollectRoom={() => {
                setMultiRoomCheckOutDialogOpen(false);
                setCollectDialogOpen(true);
              }}
              onCollectService={() => {
                setMultiRoomCheckOutDialogOpen(false);
                setAddServiceDialogOpen(true);
              }}
              onCollectSurcharge={() => {
                setMultiRoomCheckOutDialogOpen(false);
                setAddSurchargeDialogOpen(true);
              }}
            />

            <CollectPaymentDialog
              open={collectDialogOpen}
              onOpenChange={setCollectDialogOpen}
              unifiedBookingId={selectedStay.unified_booking_id}
              remainingAmount={(selectedStay.booking.total_amount_net || 0) - selectedStay.amount_collected}
              bookingStatus={selectedStay.booking.booking_status}
              stayStatus={selectedStay.stay_status}
              paymentType={selectedStay.booking.payment_type}
            />

            <HostSupplyDialog
              open={assignRoomDialogOpen}
              onOpenChange={setAssignRoomDialogOpen}
              unifiedBookingId={selectedStay.unified_booking_id}
              checkInDate={selectedStay.booking.check_in_date}
              checkOutDate={selectedStay.booking.check_out_date}
              guestName={selectedStay.booking.guest_name}
              nights={selectedStay.booking.nights || 1}
              stayStatus={selectedStay.stay_status}
            />

            <UploadDocumentDialog
              open={uploadDocDialogOpen}
              onOpenChange={setUploadDocDialogOpen}
              unifiedBookingId={selectedStay.unified_booking_id}
            />

            <AddServiceDialog
              open={addServiceDialogOpen}
              onOpenChange={setAddServiceDialogOpen}
              unifiedBookingId={selectedStay.unified_booking_id}
            />

            <AddSurchargeDialog
              open={addSurchargeDialogOpen}
              onOpenChange={setAddSurchargeDialogOpen}
              unifiedBookingId={selectedStay.unified_booking_id}
              hostPartnerId={selectedStay.segment?.partner_id || null}
            />

            <MultiRoomUndoDialog
              open={multiRoomUndoDialogOpen}
              onOpenChange={setMultiRoomUndoDialogOpen}
              undoType={undoType}
              stay={{
                id: selectedStay.id,
                unified_booking_id: selectedStay.unified_booking_id,
                host_property_name: selectedStay.host_property_name,
                host_room_type: selectedStay.host_room_type,
              }}
              booking={{
                guest_name: selectedStay.booking.guest_name,
                check_in_date: selectedStay.booking.check_in_date,
                check_out_date: selectedStay.booking.check_out_date,
                source: selectedStay.booking.source,
              }}
            />
          </>
        )
      }

      {/* Undo Confirmation Dialog */}
      <ConfirmDialog
        open={undoConfirmOpen}
        onOpenChange={setUndoConfirmOpen}
        title={undoConfirmType === "CHECK_IN" ? "Hoàn tác nhận phòng" : "Hoàn tác trả phòng"}
        description={undoConfirmType === "CHECK_IN"
          ? `Bạn có chắc muốn hoàn tác nhận phòng cho khách "${undoConfirmStay?.booking?.guest_name || ""}"? Trạng thái sẽ trở về chưa nhận phòng.`
          : `Bạn có chắc muốn hoàn tác trả phòng cho khách "${undoConfirmStay?.booking?.guest_name || ""}"? Trạng thái sẽ trở về đang ở.`
        }
        confirmText="Xác nhận hoàn tác"
        variant="warning"
        isLoading={undoCheckInMutation.isPending || undoCheckOutMutation.isPending}
        onConfirm={executeUndoConfirm}
      />
    </>
  );
}
