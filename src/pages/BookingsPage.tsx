import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { StatusBadge } from "@/components/ui/status-badge";
import { FilterBar } from "@/components/ui/filter-bar";
import { OtaBadge } from "@/components/ui/ota-badge";
import { getBookingStatusVariant } from "@/constants/status-config";
import { useFilterPersistence } from "@/hooks/useFilterPersistence";
import { PageSkeleton } from "@/components/ui/page-skeleton";
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
  Search,
  Filter,
  Plus,
  Download,
  MoreHorizontal,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar,
  CalendarCheck,
  Loader2,
  RefreshCw,
  BedDouble,
  LogIn,
  Wallet,
  X,
  CircleDollarSign,
  PlaneLanding,
  PlaneTakeoff,
  CalendarDays,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useNavigate } from "react-router-dom";
import { useBookingsPaginated, useBookingFilterOptions, useBookingTypeCounts, BookingQueryParams } from "@/hooks/useBookings";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";
// useBookingsRealtime removed — useRealtimeSystem in MainLayout handles all realtime
import { CreateManualBookingDialog } from "@/components/booking/CreateManualBookingDialog";
import { ConfirmAmountDialog } from "@/components/booking/ConfirmAmountDialog";
import { useBookingAmountOverrides, computeBookingAmount, BookingAmountOverride } from "@/hooks/useBookingAmountOverrides";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TruncatedCell } from "@/components/shared/TruncatedCell";
import { useResponsibleOwnersBatch, useOwnerFilterOptions } from "@/hooks/useResponsibleOwner";
import { BookingOwnerCell } from "@/components/ui/ResponsibleOwnerBadge";
import { User } from "lucide-react";

const formatCurrency = (amount: number | null) => {
  if (amount === null) return "—";
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
  });
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Get display status - prioritize channex_status if it's "modified"
const getDisplayStatus = (bookingStatus: string | null, channexStatus: string | null | undefined): string => {
  // If channex_status is "modified", show as MODIFIED regardless of booking_status
  if (channexStatus?.toLowerCase() === "modified") {
    return "MODIFIED";
  }
  // If channex_status is "cancelled", show as CANCELLED
  if (channexStatus?.toLowerCase() === "cancelled") {
    return "CANCELLED";
  }
  // CHECKED_IN / CHECKED_OUT are stay lifecycle states that got written to booking_status
  // They are still confirmed bookings — map them back to CONFIRMED for display
  const upper = (bookingStatus || "").toUpperCase();
  if (upper === "CHECKED_IN" || upper === "CHECKED_OUT") {
    return "CONFIRMED";
  }
  return bookingStatus || "";
};

const getStatusLabel = (status: string | null) => {
  switch (status) {
    case "CONFIRMED":
      return "Đã xác nhận";
    case "MODIFIED":
      return "Đã sửa đổi";
    case "CANCELLED":
      return "Đã huỷ";
    case "NO_SHOW":
      return "No-show";
    case "PENDING":
      return "Chờ xác nhận";
    default:
      return status || "—";
  }
};

// Stay status helpers
const getStayStatusVariant = (status: string | null) => {
  switch (status) {
    case "WAIT_ROOM":
      return "pending";
    case "CHECKED_IN":
    case "IN_HOUSE":
      return "info";
    case "CHECKED_OUT":
      return "success";
    case "NO_SHOW":
      return "noShow";
    default:
      return "default";
  }
};

const getStayStatusLabel = (status: string | null) => {
  switch (status) {
    case "WAIT_ROOM":
      return "Chờ phòng";
    case "CHECKED_IN":
      return "Đã nhận phòng";
    case "IN_HOUSE":
      return "Đang ở";
    case "CHECKED_OUT":
      return "Đã trả phòng";
    case "NO_SHOW":
      return "No-show";
    default:
      return "—";
  }
};

// Segment coverage helpers
const getSegmentCoverageVariant = (status: string | null | undefined) => {
  switch (status) {
    case "FULL":
      return "success";
    case "PARTIAL":
      return "warning";
    case "NONE":
    default:
      return "pending";
  }
};

const getSegmentCoverageLabel = (status: string | null | undefined, assignedNights?: number, totalNights?: number) => {
  switch (status) {
    case "FULL":
      return "Đủ phòng";
    case "PARTIAL":
      return assignedNights && totalNights ? `${assignedNights}/${totalNights} đêm` : "Một phần";
    case "NONE":
    default:
      return "Chưa gán";
  }
};

export default function BookingsPage() {
  const { canUsePage } = useCurrentUserPagePermissions();
  const canPerformActions = canUsePage('/bookings');

  // Use filter persistence hook for URL sync and localStorage
  const {
    searchTerm,
    statusFilter,
    sourceFilter,
    typeFilter,
    paymentTypeFilter,
    dateFrom,
    dateTo,
    dateFilterType,
    currentPage,
    pageSize,
    updateFilter,
    resetFilters,
    hasActiveFilters,
    saveScrollPosition,
    restoreScrollPosition,
  } = useFilterPersistence("bookings");

  // ── Debounced search: local input state updates immediately, filter syncs after 300ms ──
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);
  const debouncedUpdateSearch = useCallback(
    (() => {
      let timer: ReturnType<typeof setTimeout>;
      return (value: string) => {
        clearTimeout(timer);
        timer = setTimeout(() => updateFilter("searchTerm", value), 300);
      };
    })(),
    [updateFilter]
  );
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalSearchTerm(value);
    debouncedUpdateSearch(value);
  }, [debouncedUpdateSearch]);
  // Keep local in sync if searchTerm changes externally (e.g. URL nav)
  useEffect(() => { setLocalSearchTerm(searchTerm); }, [searchTerm]);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [stayStatusFilter, setStayStatusFilter] = useState<string>("all");
  const [segmentCoverageFilter, setSegmentCoverageFilter] = useState<string>("all");
  const [propertyNameFilter, setPropertyNameFilter] = useState<string>("all");
  const [propertyIdFilter, setPropertyIdFilter] = useState<string>("all");
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>("all");
  const [confirmAmountDialog, setConfirmAmountDialog] = useState<{
    open: boolean;
    bookingId: string;
    guestName: string;
    suggestedAmount: number | null;
    bookingType: string | null;
    suggestedCommissionPercent: number | null;
  }>({ open: false, bookingId: "", guestName: "", suggestedAmount: null, bookingType: null, suggestedCommissionPercent: null });
  const navigate = useNavigate();

  // ── Build server-side query params from filter state ──
  const queryParams: BookingQueryParams = useMemo(() => ({
    page: currentPage,
    pageSize: pageSize === "all" ? 10000 : Number(pageSize),
    search: searchTerm || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    source: sourceFilter !== "all" ? sourceFilter : undefined,
    bookingType: typeFilter !== "all" ? typeFilter : undefined,
    paymentType: paymentTypeFilter !== "all" ? paymentTypeFilter : undefined,
    propertyName: propertyNameFilter !== "all" ? propertyNameFilter : undefined,
    propertyId: propertyIdFilter !== "all" ? propertyIdFilter : undefined,
    roomType: roomTypeFilter !== "all" ? roomTypeFilter : undefined,
    stayStatus: stayStatusFilter !== "all" ? stayStatusFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    dateFilterType: dateFilterType || undefined,
  }), [currentPage, pageSize, searchTerm, statusFilter, sourceFilter, typeFilter, paymentTypeFilter, propertyNameFilter, propertyIdFilter, roomTypeFilter, stayStatusFilter, dateFrom, dateTo, dateFilterType]);

  const bookingsQuery = useBookingsPaginated(queryParams);
  const { data: paginatedResult, isLoading, isFetching, refetch } = bookingsQuery;
  const bookings = paginatedResult?.bookings ?? [];
  const serverTotalCount = paginatedResult?.totalCount ?? 0;
  const isPageTransitioning = isFetching && !isLoading; // fetching new page while showing previous data

  const filterQuery = useBookingFilterOptions();
  const typeCountsQuery = useBookingTypeCounts();
  const { data: overrides = [] } = useBookingAmountOverrides();
  const { data: filterOptions } = filterQuery;
  const { data: typeCounts } = typeCountsQuery;

  usePrefetchMountLog('BookingsPage', [
    { key: ['unified_bookings_paginated', queryParams], query: bookingsQuery },
    { key: ['booking_filter_options'], query: filterQuery },
    { key: ['booking_type_counts'], query: typeCountsQuery },
  ]);

  // Realtime handled by useRealtimeSystem in MainLayout (single subscription)

  // Get all booking IDs for batch owner lookup (only current page's IDs)
  const bookingIds = useMemo(() => bookings.map(b => b.unified_booking_id), [bookings]);
  const { getOwnershipInfo, storedOwners } = useResponsibleOwnersBatch(bookingIds);

  // Get unique owners for filter dropdown (separate lightweight query for large databases)
  const { data: ownerOptions = [] } = useOwnerFilterOptions();

  // Fallback to storedOwners if ownerOptions is empty (for backward compatibility)
  const uniqueOwners = useMemo(() => {
    if (ownerOptions.length > 0) {
      return ownerOptions;
    }
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

  // Restore scroll position when returning to this page
  useEffect(() => {
    restoreScrollPosition();
  }, [restoreScrollPosition]);

  // Create a map for quick override lookup
  const overrideMap = useMemo(() => {
    const map = new Map<string, BookingAmountOverride>();
    overrides.forEach(o => map.set(o.unified_booking_id, o));
    return map;
  }, [overrides]);

  // Stabilize storedOwners reference to avoid re-filter on 20s polling cycle
  const ownerSnapshotRef = useRef(storedOwners);
  ownerSnapshotRef.current = storedOwners;

  // ── Client-side post-filters for enriched fields ──
  // segmentCoverage and owner data come from separate queries, not directly from the paginated server query
  const paginatedBookings = useMemo(() => {
    let filtered = bookings;

    // Segment coverage filter (enriched post-fetch)
    if (segmentCoverageFilter !== "all") {
      filtered = filtered.filter(b => {
        const status = b.segment_coverage_status || "NONE";
        return status === segmentCoverageFilter;
      });
    }

    // Owner filter (enriched post-fetch from responsible_owners)
    if (ownerFilter !== "all") {
      filtered = filtered.filter(b => {
        const ownerInfo = getOwnershipInfo(b.unified_booking_id);
        if (ownerFilter === "unassigned") {
          return !ownerInfo.isOwnerAssigned;
        }
        return ownerInfo.responsibleOwner?.userId === ownerFilter;
      });
    }

    return filtered;
  }, [bookings, segmentCoverageFilter, ownerFilter, getOwnershipInfo]);

  // Pagination — use server totalCount
  const totalPages = pageSize === "all" ? 1 : Math.ceil(serverTotalCount / Number(pageSize));

  // Calculate totals for summary (only current page)
  const totalAmount = useMemo(() => {
    return paginatedBookings.reduce((sum, booking) => {
      const override = overrideMap.get(booking.unified_booking_id);
      const computed = computeBookingAmount(booking, override || null);
      return sum + (computed.amount || 0);
    }, 0);
  }, [paginatedBookings, overrideMap]);

  // Use filter options from dedicated lightweight hook
  const uniqueSources = filterOptions?.sources ?? [];
  const uniquePropertyNames = filterOptions?.propertyNames ?? [];
  const uniquePropertyIds = filterOptions?.propertyIds ?? [];
  const uniqueRoomTypes = useMemo(() => {
    if (!filterOptions) return [];
    if (propertyNameFilter === "all") return filterOptions.allRoomTypes;
    return filterOptions.roomTypesByProperty[propertyNameFilter] ?? [];
  }, [filterOptions, propertyNameFilter]);

  // Booking type counts from lightweight hook
  const bookingTypeCounts = typeCounts ?? { pms: 0, imported: 0, manual: 0, total: 0 };

  // Reset room type filter when property changes (if selected room is not in new property)
  useEffect(() => {
    if (propertyNameFilter !== "all" && roomTypeFilter !== "all") {
      const roomsInProperty = filterOptions?.roomTypesByProperty[propertyNameFilter] || [];
      if (!roomsInProperty.includes(roomTypeFilter)) {
        setRoomTypeFilter("all");
      }
    }
  }, [propertyNameFilter, filterOptions, roomTypeFilter]);

  const clearFilters = () => {
    resetFilters();
    setOwnerFilter("all");
    setStayStatusFilter("all");
    setSegmentCoverageFilter("all");
    setPropertyNameFilter("all");
    setPropertyIdFilter("all");
    setRoomTypeFilter("all");
  };

  // Check if owner/stay/segment/property/room filter is active (for hasActiveFilters indicator)
  const hasOwnerFilter = ownerFilter !== "all";
  const hasStayStatusFiltr = stayStatusFilter !== "all";
  const hasSegmentCoverageFiltr = segmentCoverageFilter !== "all";
  const hasPropertyNameFiltr = propertyNameFilter !== "all";
  const hasPropertyIdFiltr = propertyIdFilter !== "all";
  const hasRoomTypeFiltr = roomTypeFilter !== "all";

  const handleQuickAction = (action: string, bookingId: string, booking?: any) => {
    switch (action) {
      case "assign":
        navigate(`/bookings/${bookingId}?action=assign`);
        break;
      case "checkin":
        navigate(`/bookings/${bookingId}?action=checkin`);
        break;
      case "collect":
        navigate(`/bookings/${bookingId}?action=collect`);
        break;
      case "confirm_amount":
        if (booking) {
          setConfirmAmountDialog({
            open: true,
            bookingId,
            guestName: booking.guest_name || "",
            suggestedAmount: booking.total_amount_net,
            bookingType: booking.booking_type || null,
            suggestedCommissionPercent: booking.commission_rate || null,
          });
        }
        break;
      default:
        break;
    }
  };

  return (
    <>
      <Header
        title="Booking Center"
        subtitle=""
        actions={
          <div className="flex items-center gap-2 md:gap-4">
            {canPerformActions && (
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Tạo Booking</span>
              </Button>
            )}
          </div>
        }
      />

      <PageContainer>
        <SectionCard>
          {/* Filters - FilterBar pattern */}
          <FilterBar
            title="Bộ lọc"
            subtitle="Tìm kiếm và lọc đặt phòng"
            hasActiveFilters={!!(hasActiveFilters || hasOwnerFilter || hasStayStatusFiltr || hasSegmentCoverageFiltr || hasPropertyNameFiltr || hasPropertyIdFiltr || hasRoomTypeFiltr)}
            onClearFilters={clearFilters}
          >
            {/* ── Row 1: Search (full width) ── */}
            <FilterBar.Field label="Tìm kiếm" colSpan="full">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Tìm booking, khách, SĐT..."
                  value={localSearchTerm}
                  onChange={handleSearchChange}
                  className="pl-10"
                />
              </div>
            </FilterBar.Field>

            {/* ── Row 2: Status + Date type + Date range ── */}
            <FilterBar.Field label="Trạng thái ĐP">
              <Select value={statusFilter} onValueChange={(v) => updateFilter("statusFilter", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả TT" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả TT</SelectItem>
                  <SelectItem value="CONFIRMED">Đã xác nhận</SelectItem>
                  <SelectItem value="MODIFIED">Đã sửa đổi</SelectItem>
                  <SelectItem value="PENDING">Chờ xác nhận</SelectItem>
                  <SelectItem value="CANCELLED">Đã huỷ</SelectItem>
                  <SelectItem value="NO_SHOW">No-show</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>

            <FilterBar.Field label="Lọc theo ngày">
              <Select value={dateFilterType} onValueChange={(v) => updateFilter("dateFilterType", v as "check_in" | "check_out" | "booking" | "actual_check_out")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="check_in">Ngày nhận phòng</SelectItem>
                  <SelectItem value="check_out">Ngày trả phòng</SelectItem>
                  <SelectItem value="actual_check_out">Trả phòng thực tế</SelectItem>
                  <SelectItem value="booking">Ngày đặt</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>

            <FilterBar.Field label="Từ ngày">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => updateFilter("dateFrom", e.target.value)}
              />
            </FilterBar.Field>

            <FilterBar.Field label="Đến ngày">
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => updateFilter("dateTo", e.target.value)}
              />
            </FilterBar.Field>

            {/* ── Advanced filters (collapsible) ── */}
            <FilterBar.AdvancedSection
              activeCount={
                (sourceFilter !== "all" ? 1 : 0) +
                (typeFilter !== "all" ? 1 : 0) +
                (paymentTypeFilter !== "all" ? 1 : 0) +
                (stayStatusFilter !== "all" ? 1 : 0) +
                (segmentCoverageFilter !== "all" ? 1 : 0) +
                (propertyNameFilter !== "all" ? 1 : 0) +
                (propertyIdFilter !== "all" ? 1 : 0) +
                (roomTypeFilter !== "all" ? 1 : 0) +
                (ownerFilter !== "all" ? 1 : 0)
              }
            >
              <FilterBar.Field label="Nguồn OTA">
                <Select value={sourceFilter} onValueChange={(v) => updateFilter("sourceFilter", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả nguồn" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả nguồn</SelectItem>
                    {uniqueSources.map(source => (
                      <SelectItem key={source} value={source}>{source}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterBar.Field>

              <FilterBar.Field label="Loại">
                <Select value={typeFilter} onValueChange={(v) => updateFilter("typeFilter", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="PMS">PMS</SelectItem>
                    <SelectItem value="IMPORTED">Imported</SelectItem>
                    <SelectItem value="MANUAL">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBar.Field>

              <FilterBar.Field label="Thu tiền">
                <Select value={paymentTypeFilter} onValueChange={(v) => updateFilter("paymentTypeFilter", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="OTA_COLLECT">OTA thu</SelectItem>
                    <SelectItem value="HOTEL_COLLECT">KS thu</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBar.Field>

              <FilterBar.Field label="TT Phòng">
                <Select value={stayStatusFilter} onValueChange={setStayStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả TT phòng" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả TT phòng</SelectItem>
                    <SelectItem value="WAIT_ROOM">Chờ phòng</SelectItem>
                    <SelectItem value="CHECKED_IN">Đã nhận phòng</SelectItem>
                    <SelectItem value="IN_HOUSE">Đang ở</SelectItem>
                    <SelectItem value="CHECKED_OUT">Đã trả phòng</SelectItem>
                    <SelectItem value="NO_SHOW">No-show</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBar.Field>

              <FilterBar.Field label="Gán phòng">
                <Select value={segmentCoverageFilter} onValueChange={setSegmentCoverageFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="NONE">Chưa gán</SelectItem>
                    <SelectItem value="PARTIAL">Một phần</SelectItem>
                    <SelectItem value="FULL">Đủ phòng</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBar.Field>

              <FilterBar.Field label="Chỗ nghỉ OTA">
                <Select value={propertyNameFilter} onValueChange={setPropertyNameFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả chỗ nghỉ" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all">Tất cả chỗ nghỉ</SelectItem>
                    {uniquePropertyNames.map(name => (
                      <SelectItem key={name} value={name}>
                        <span className="truncate max-w-40">{name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterBar.Field>

              <FilterBar.Field label="ID chỗ nghỉ">
                <Select value={propertyIdFilter} onValueChange={setPropertyIdFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả ID" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all">Tất cả ID</SelectItem>
                    {uniquePropertyIds.map(id => (
                      <SelectItem key={id} value={id}>
                        <span className="truncate max-w-40 font-mono text-xs">{id}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterBar.Field>

              <FilterBar.Field label="Loại phòng">
                <Select value={roomTypeFilter} onValueChange={setRoomTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả loại phòng" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all">Tất cả loại phòng</SelectItem>
                    {uniqueRoomTypes.map(room => (
                      <SelectItem key={room} value={room}>
                        <span className="truncate max-w-36">{room}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterBar.Field>

              <FilterBar.Field label="Phụ trách">
                <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả NV" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả NV</SelectItem>
                    <SelectItem value="unassigned">Chưa gán</SelectItem>
                    {uniqueOwners.map(owner => (
                      <SelectItem key={owner.userId} value={owner.userId}>
                        {owner.userName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterBar.Field>
            </FilterBar.AdvancedSection>
          </FilterBar>

          {/* P&L reconciliation hint */}
          {dateFilterType === "check_out" && (
            <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 dark:bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
              <CalendarCheck className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                P&L tính doanh thu phòng theo <strong>Ngày trả phòng (booking)</strong> + trạng thái <strong>Đã trả phòng</strong>.
                Kết hợp với filter <strong>Đã xác nhận</strong> + <strong>Đã trả phòng</strong> để đối chiếu.
                Lưu ý: P&L "Tổng doanh thu" còn bao gồm doanh thu dịch vụ (Tour, Pickup, Addon).
              </span>
            </div>
          )}

          {/* Stats - Mobile compact */}
          <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm px-1 overflow-x-auto">
            <span className="text-muted-foreground whitespace-nowrap">
              <span className="text-foreground font-semibold tabular-nums">
                {serverTotalCount}
              </span>
              {hasActiveFilters && bookingTypeCounts.total > 0 && serverTotalCount !== bookingTypeCounts.total && (
                <span className="hidden md:inline"> / {bookingTypeCounts.total}</span>
              )}
              {' '}booking
            </span>
            <div className="h-4 w-px bg-border/60 flex-shrink-0" />
            <div className="flex items-center gap-1.5 md:gap-2">
              <StatusBadge variant="pms" size="sm">
                {bookingTypeCounts.pms}
              </StatusBadge>
              <StatusBadge variant="warning" size="sm">
                {bookingTypeCounts.imported}
              </StatusBadge>
              <StatusBadge variant="manual" size="sm">
                {bookingTypeCounts.manual}
              </StatusBadge>
            </div>
          </div>

          {/* Loading State — Skeleton matches table layout */}
          {isLoading && (
            <PageSkeleton cards={0} rows={10} columns={8} filters={false} />
          )}

          {/* Bookings List */}
          {!isLoading && (
            <div className={`transition-opacity duration-200 ${isPageTransitioning ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-2">
                {paginatedBookings.length === 0 ? (
                  <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
                        <CalendarCheck className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {bookings.length === 0 ? "Chưa có booking" : "Không tìm thấy"}
                      </p>
                      {bookings.length === 0 && canPerformActions && (
                        <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                          <Plus className="h-4 w-4 mr-1" />
                          Tạo Booking
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  paginatedBookings.map((booking) => {
                    const displayStatus = getDisplayStatus(booking.booking_status, booking.channex_status);
                    const override = overrideMap.get(booking.unified_booking_id);
                    const computed = computeBookingAmount(booking, override || null);

                    return (
                      <div
                        key={booking.unified_booking_id}
                        className="rounded-xl border border-border/60 bg-card p-3 active:bg-muted/50 transition-colors"
                        onClick={() => {
                          saveScrollPosition();
                          navigate(`/bookings/${booking.unified_booking_id}`);
                        }}
                      >
                        {/* Row 1: Guest name + Amount */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">{booking.guest_name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-micro text-muted-foreground font-mono">
                                {booking.booking_type !== "MANUAL"
                                  ? (booking.ota_booking_code || booking.pms_booking_id || booking.unified_booking_id).replace(/^[A-Za-z]+-/, "").slice(0, 12)
                                  : booking.unified_booking_id.slice(0, 12)}
                              </span>
                              <StatusBadge
                                variant={booking.booking_type === "MANUAL" ? "manual" : booking.booking_type === "IMPORTED" ? "warning" : "pms"}
                                size="sm"
                              >
                                {booking.booking_type}
                              </StatusBadge>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">
                              {computed.status === "CANCELLED" ? "0" : computed.status === "UNCONFIRMED" ? "—" : formatCurrency(computed.amount)}
                            </p>
                            <StatusBadge
                              variant={booking.payment_type === "OTA_COLLECT" ? "info" : "success"}
                              size="sm"
                            >
                              {booking.payment_type === "OTA_COLLECT" ? "OTA" : "KS"}
                            </StatusBadge>
                          </div>
                        </div>

                        {/* Row 2: OTA + Dates + Status */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <OtaBadge source={booking.source} size="sm" showIcon={true} />
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span>{formatDate(booking.check_in_date)}</span>
                              <span>→</span>
                              <span>{formatDate(booking.check_out_date)}</span>
                              <span className="font-medium">({booking.nights}đ)</span>
                            </div>
                          </div>
                          <StatusBadge variant={getBookingStatusVariant(displayStatus) as any} dot size="sm">
                            {getStatusLabel(displayStatus)}
                          </StatusBadge>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
                <div className="overflow-x-auto scrollbar-premium">
                  <table className="w-full min-w-[1920px] table-fixed" style={{ minHeight: pageSize !== 'all' ? `${Number(pageSize) * 57 + 52}px` : undefined }}>
                    <thead>
                      <tr className="border-b border-border/50 bg-gradient-to-b from-muted/60 to-muted/30">
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[80px]">
                          Loại
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[130px]">
                          Trạng thái ĐP
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[120px]">
                          ID chỗ nghỉ
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[180px] min-w-[160px]">
                          Booking
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[120px]">
                          Nguồn
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[200px]">
                          Chỗ nghỉ
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[220px]">
                          Loại phòng
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[180px]">
                          Khách hàng
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[120px]">
                          <div className="flex items-center gap-1.5">
                            <PlaneLanding className="h-3.5 w-3.5 text-success/70" />
                            Nhận phòng
                          </div>
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[120px]">
                          <div className="flex items-center gap-1.5">
                            <PlaneTakeoff className="h-3.5 w-3.5 text-primary/70" />
                            Trả phòng
                          </div>
                        </th>
                        <th className="px-4 py-3.5 text-center text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[60px]">
                          Đêm
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[100px]">
                          Phòng
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[120px]">
                          TT Phòng
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[130px]">
                          Gán phòng
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[120px]">
                          Hình thức
                        </th>
                        <th className="px-4 py-3.5 text-left text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[130px]">
                          Phụ trách
                        </th>
                        <th className="px-4 py-3.5 text-right text-caption font-semibold text-muted-foreground/90 tracking-wide whitespace-nowrap w-[120px]">
                          Giá phải thu
                        </th>
                        <th className="px-4 py-3.5 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40" onClick={(e) => {
                      // Event delegation: find the closest <tr> with data-booking-id
                      const row = (e.target as HTMLElement).closest('tr[data-booking-id]');
                      if (row) navigate(`/bookings/${row.getAttribute('data-booking-id')}`);
                    }}>
                      {paginatedBookings.length === 0 ? (
                        <tr>
                          <td colSpan={17} className="px-4 py-16">
                            <div className="flex flex-col items-center justify-center gap-4 text-center">
                              <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                                <CalendarCheck className="h-8 w-8 text-muted-foreground/50" />
                              </div>
                              <div className="space-y-1">
                                <p className="text-foreground font-medium">
                                  {bookings.length === 0 ? "Chưa có booking nào" : "Không tìm thấy kết quả"}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {bookings.length === 0
                                    ? "Đồng bộ từ Channex hoặc tạo booking thủ công"
                                    : "Thử điều chỉnh bộ lọc để tìm kiếm"}
                                </p>
                              </div>

                              {bookings.length === 0 ? (
                                <div className="flex items-center gap-3 mt-2">
                                  {/* Channex Integration button hidden - internal sync only
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 shadow-sm"
                                onClick={() => navigate("/channex-integration")}
                              >
                                <RefreshCw className="h-4 w-4" />
                                Mở Channex Integration
                              </Button>
                              */}
                                  {canPerformActions && (
                                    <Button
                                      size="sm"
                                      className="gap-2 shadow-md"
                                      onClick={() => setCreateDialogOpen(true)}
                                    >
                                      <Plus className="h-4 w-4" />
                                      Tạo Booking Manual
                                    </Button>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedBookings.map((booking, index) => (
                          <tr
                            key={booking.unified_booking_id}
                            data-booking-id={booking.unified_booking_id}
                            className="hover:bg-muted/50 hover:shadow-[inset_0_0_0_1px_hsl(var(--border)/0.3)] transition-all duration-150 group cursor-pointer h-[52px]"
                          >
                            {/* Loại (PMS/Manual/Import) - First column */}
                            <td className="px-3 py-2.5 whitespace-nowrap align-middle">
                              <StatusBadge
                                variant={
                                  booking.booking_type === "MANUAL"
                                    ? "manual"
                                    : booking.booking_type === "IMPORTED"
                                      ? "imported"
                                      : "pms"
                                }
                                size="sm"
                              >
                                {booking.booking_type}
                              </StatusBadge>
                            </td>

                            {/* Trạng thái đặt phòng - use channex_status if modified */}
                            <td className="px-3 py-2.5 whitespace-nowrap align-middle">
                              {(() => {
                                const displayStatus = getDisplayStatus(booking.booking_status, booking.channex_status);
                                return (
                                  <StatusBadge
                                    variant={getBookingStatusVariant(displayStatus) as any}
                                    dot
                                  >
                                    {getStatusLabel(displayStatus)}
                                  </StatusBadge>
                                );
                              })()}
                            </td>

                            {/* ID chỗ nghỉ (ota_property_id) */}
                            <td className="px-3 py-2.5 whitespace-nowrap overflow-hidden align-middle">
                              {booking.ota_property_id ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs font-mono text-muted-foreground truncate inline-block max-w-[110px] align-middle cursor-default">
                                      {booking.ota_property_id}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="font-mono text-xs">{booking.ota_property_id}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>

                            {/* Booking ID */}
                            <td className="px-3 py-2.5 whitespace-nowrap overflow-hidden align-middle">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Link
                                    to={`/bookings/${booking.unified_booking_id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-semibold text-[13px] hover:text-primary transition-colors underline-offset-2 hover:underline truncate max-w-40 inline-block align-middle"
                                  >
                                    {booking.booking_type !== "MANUAL"
                                      ? (booking.ota_booking_code || booking.pms_booking_id || booking.unified_booking_id).replace(/^[A-Za-z]+-/, "")
                                      : booking.unified_booking_id}
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="font-medium">{booking.booking_type !== "MANUAL"
                                    ? (booking.ota_booking_code || booking.pms_booking_id || booking.unified_booking_id).replace(/^[A-Za-z]+-/, "")
                                    : booking.unified_booking_id}</p>
                                  <p className="text-xs text-muted-foreground">Đặt: {formatDate(booking.booking_date)}</p>
                                </TooltipContent>
                              </Tooltip>
                            </td>

                            {/* Nguồn (OTA Source) */}
                            <td className="px-3 py-2.5 whitespace-nowrap align-middle">
                              <OtaBadge source={booking.source} size="sm" showIcon={true} />
                            </td>

                            {/* Chỗ nghỉ */}
                            <td className="px-3 py-2.5 whitespace-nowrap overflow-hidden align-middle">
                              {booking.booking_type !== "MANUAL" ? (
                                <span className="text-[13px] font-medium text-foreground truncate inline-block max-w-full align-middle">
                                  {booking.pms_property_name || "—"}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>

                            {/* Loại phòng */}
                            <td className="px-3 py-2.5 whitespace-nowrap overflow-hidden align-middle">
                              <span className="text-[13px] text-muted-foreground truncate inline-block max-w-full align-middle">
                                {booking.ota_room_type_sold || "—"}
                              </span>
                            </td>

                            {/* Khách hàng */}
                            <td className="px-3 py-2.5 whitespace-nowrap overflow-hidden align-middle">
                              <span className="text-[13px] font-medium truncate inline-block max-w-full align-middle">
                                {booking.guest_name}
                              </span>
                            </td>

                            {/* Check-in */}
                            <td className="px-3 py-2.5 whitespace-nowrap align-middle">
                              <div className="flex items-center gap-1.5">
                                <PlaneLanding className="h-3.5 w-3.5 flex-shrink-0 text-success" />
                                <span className="text-sm font-medium">
                                  {formatDate(booking.check_in_date)}
                                </span>
                              </div>
                            </td>

                            {/* Check-out */}
                            <td className="px-3 py-2.5 whitespace-nowrap align-middle">
                              <div className="flex items-center gap-1.5">
                                <PlaneTakeoff className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                                <span className="text-sm font-medium">
                                  {formatDate(booking.check_out_date)}
                                </span>
                              </div>
                            </td>

                            {/* Nights */}
                            <td className="px-3 py-2.5 text-center whitespace-nowrap align-middle">
                              <span className="text-sm font-semibold">{booking.nights}</span>
                            </td>

                            {/* Rooms */}
                            <td className="px-3 py-2.5 whitespace-nowrap align-middle">
                              <span className="text-sm">
                                {booking.rooms_count || 1} phòng
                              </span>
                            </td>

                            {/* TT Phòng (Stay Status) */}
                            <td className="px-3 py-2.5 whitespace-nowrap align-middle">
                              <StatusBadge
                                variant={getStayStatusVariant(booking.stay_status) as any}
                                size="sm"
                              >
                                {getStayStatusLabel(booking.stay_status)}
                              </StatusBadge>
                            </td>

                            {/* Gán phòng (Segment Coverage) */}
                            <td className="px-3 py-2.5 whitespace-nowrap align-middle">
                              <StatusBadge
                                variant={getSegmentCoverageVariant(booking.segment_coverage_status) as any}
                                size="sm"
                              >
                                {getSegmentCoverageLabel(
                                  booking.segment_coverage_status,
                                  booking.segment_assigned_nights,
                                  booking.nights
                                )}
                              </StatusBadge>
                            </td>

                            {/* Hình thức */}
                            <td className="px-3 py-2.5 whitespace-nowrap align-middle">
                              <StatusBadge
                                variant={
                                  booking.booking_type === "MANUAL"
                                    ? "confirmed"
                                    : booking.payment_type === "OTA_COLLECT"
                                      ? "warning"
                                      : "confirmed"
                                }
                                size="sm"
                              >
                                {booking.booking_type === "MANUAL"
                                  ? "Thu tại KS"
                                  : booking.payment_type === "OTA_COLLECT"
                                    ? "OTA thu"
                                    : "Thu tại KS"}
                              </StatusBadge>
                            </td>

                            {/* Phụ trách */}
                            <td className="px-3 py-2.5 whitespace-nowrap align-middle">
                              <BookingOwnerCell
                                ownershipInfo={getOwnershipInfo(booking.unified_booking_id)}
                              />
                            </td>

                            {/* Giá phải thu */}
                            <td className="px-3 py-2.5 text-right whitespace-nowrap align-middle">
                              {(() => {
                                const override = overrideMap.get(booking.unified_booking_id);
                                const computed = computeBookingAmount(booking, override || null);

                                if (computed.status === "CANCELLED") {
                                  return <span className="text-sm text-muted-foreground">0</span>;
                                }

                                if (computed.status === "UNCONFIRMED") {
                                  return (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="flex items-center justify-end gap-2">
                                            <span className="text-sm text-muted-foreground">—</span>
                                            <StatusBadge variant="warning" size="sm">
                                              Cần xác nhận
                                            </StatusBadge>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Giá cần thu hoặc sẽ nhận cho booking này</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  );
                                }

                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-sm font-medium">
                                          {formatCurrency(computed.amount)}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Giá cần thu hoặc sẽ nhận cho booking này</p>
                                        <p className="text-xs text-muted-foreground">
                                          {computed.source === "override"
                                            ? "✅ Đã xác nhận thủ công"
                                            : "📡 Từ dữ liệu OTA"}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}
                            </td>
                            <td className="px-3 py-2.5 align-middle">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem asChild>
                                    <Link to={`/bookings/${booking.unified_booking_id}`}>
                                      <Eye className="mr-2 h-4 w-4" />
                                      Xem chi tiết
                                    </Link>
                                  </DropdownMenuItem>
                                  {canPerformActions && (
                                    <>
                                      <DropdownMenuSeparator />
                                      {/* Show "Xác nhận giá" for unconfirmed bookings */}
                                      {(() => {
                                        const override = overrideMap.get(booking.unified_booking_id);
                                        const computed = computeBookingAmount(booking, override || null);
                                        if (!computed.isConfirmed && computed.status !== "CANCELLED") {
                                          return (
                                            <DropdownMenuItem onClick={() => handleQuickAction("confirm_amount", booking.unified_booking_id, booking)}>
                                              <CircleDollarSign className="mr-2 h-4 w-4" />
                                              Xác nhận giá
                                            </DropdownMenuItem>
                                          );
                                        }
                                        return null;
                                      })()}
                                      <DropdownMenuItem onClick={() => handleQuickAction("assign", booking.unified_booking_id)}>
                                        <BedDouble className="mr-2 h-4 w-4" />
                                        Phân bổ phòng
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleQuickAction("checkin", booking.unified_booking_id)}>
                                        <LogIn className="mr-2 h-4 w-4" />
                                        Check-in
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleQuickAction("collect", booking.unified_booking_id)}>
                                        <Wallet className="mr-2 h-4 w-4" />
                                        Thu tiền
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination - Desktop only */}
                <div className="hidden md:flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      {isPageTransitioning && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      )}
                      {paginatedBookings.length} / {serverTotalCount} booking
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <div className="text-sm font-medium text-success">
                      Tổng phải thu: {formatCurrency(totalAmount)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Số dòng:</span>
                      <Select
                        value={pageSize.toString()}
                        onValueChange={(v) => {
                          updateFilter("pageSize", v === "all" ? "all" : parseInt(v));
                        }}
                      >
                        <SelectTrigger className="w-[80px] h-8 bg-muted/50 border border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border border-border shadow-lg z-50">
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value="all">Tất cả</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {pageSize !== "all" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage <= 1}
                          onClick={() => updateFilter("currentPage", 1)}
                          title="Trang đầu"
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage <= 1}
                          onClick={() => updateFilter("currentPage", Math.max(1, currentPage - 1))}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-1 mx-1">
                          <input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={currentPage}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (val >= 1 && val <= totalPages) {
                                updateFilter("currentPage", val);
                              }
                            }}
                            className="w-14 h-8 text-center text-sm border border-border rounded-md bg-background tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-sm text-muted-foreground">/ {Math.max(totalPages, 1)}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages}
                          onClick={() => updateFilter("currentPage", Math.min(totalPages, currentPage + 1))}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages}
                          onClick={() => updateFilter("currentPage", totalPages)}
                          title="Trang cuối"
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Mobile Summary + Pagination */}
              <div className="md:hidden mt-3 rounded-xl border border-border/60 bg-card p-3">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-xs text-muted-foreground">{hasActiveFilters ? 'Kết quả: ' : 'Tổng: '}</span>
                    <span className="text-sm font-semibold">{serverTotalCount}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Phải thu: </span>
                    <span className="text-sm font-semibold text-success">{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
                {pageSize !== "all" && totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => updateFilter("currentPage", 1)}
                        className="h-9 px-2"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => updateFilter("currentPage", Math.max(1, currentPage - 1))}
                        className="h-9 px-3"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {currentPage} / {Math.max(totalPages, 1)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => updateFilter("currentPage", Math.min(totalPages, currentPage + 1))}
                        className="h-9 px-3"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => updateFilter("currentPage", totalPages)}
                        className="h-9 px-2"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Create Manual Booking Dialog */}
          <CreateManualBookingDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
          />

          {/* Confirm Amount Dialog */}
          <ConfirmAmountDialog
            open={confirmAmountDialog.open}
            onOpenChange={(open) => setConfirmAmountDialog(prev => ({ ...prev, open }))}
            unifiedBookingId={confirmAmountDialog.bookingId}
            guestName={confirmAmountDialog.guestName}
            suggestedAmount={confirmAmountDialog.suggestedAmount}
            bookingType={confirmAmountDialog.bookingType}
            suggestedCommissionPercent={confirmAmountDialog.suggestedCommissionPercent}
          />
        </SectionCard >
      </PageContainer >
    </>
  );
}

