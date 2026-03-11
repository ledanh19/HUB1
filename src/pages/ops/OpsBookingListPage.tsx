/**
 * OpsBookingListPage — Layer 2: Filtered Booking List
 * 
 * Route: /ops/list/:status
 * 
 * - No tab bar (already has back button in header)
 * - Quick action dialogs synced with StaysPage SOT
 * - Card click → navigate to booking detail
 * - Back from detail returns to this exact page
 */

import { useState, useMemo, useCallback } from "react";

import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Users,
  Plus,
  Home,
  AlertTriangle,
  Loader2,
  Search,
} from "lucide-react";

import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchStaysOperations, type StayWithBooking } from "@/lib/stays/fetchStaysOperations";
import { DASHBOARD_STALE_TIMES } from "@/hooks/useDashboardData";
import { StayCompactCard } from "@/components/stays/StayCompactCard";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useOpsKpis, type OpsStatusKey } from "./useOpsKpis";
import { PageTransition } from "@/components/motion/PageTransition";
import { PressableCard } from "@/components/motion/PressableCard";

import { BookingCardSkeleton } from "@/components/ui/skeleton-shimmer";

// Dialogs — synced with StaysPage SOT
import { CheckInDialog } from "@/components/booking/CheckInDialog";
import { CheckOutDialog } from "@/components/booking/CheckOutDialog";
import { MultiRoomCheckInDialog } from "@/components/booking/MultiRoomCheckInDialog";
import { MultiRoomCheckOutDialog } from "@/components/booking/MultiRoomCheckOutDialog";
import { MultiRoomUndoDialog } from "@/components/booking/MultiRoomUndoDialog";
import { CollectPaymentDialog } from "@/components/booking/CollectPaymentDialog";
import { HostSupplyDialog } from "@/components/booking/HostSupplyDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useUndoCheckIn, useUndoCheckOut } from "@/hooks/useStays";

const toLocalDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const STATUS_CONFIG: Record<OpsStatusKey, { label: string; icon: typeof ArrowDownToLine; emptyMessage: string }> = {
  checkin_all: { label: "Nhận phòng", icon: ArrowDownToLine, emptyMessage: "Không có khách nhận phòng hôm nay" },
  inhouse: { label: "Đang ở", icon: Users, emptyMessage: "Không có khách đang ở" },
  checkout: { label: "Trả phòng", icon: ArrowUpFromLine, emptyMessage: "Không có khách trả phòng hôm nay" },
  new_booking: { label: "ĐP mới", icon: Plus, emptyMessage: "Không có đặt phòng mới hôm nay" },
  upcoming: { label: "Chưa phân bổ", icon: Home, emptyMessage: "Không có lưu trú nào chưa phân bổ phòng" },
  overdue: { label: "Quá hạn", icon: AlertTriangle, emptyMessage: "Không có thanh toán quá hạn" },
};

export default function OpsBookingListPage() {
  const { status } = useParams<{ status: string }>();
  const navigate = useNavigate();
  const { appNavigate } = useAppNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  const today = useMemo(() => toLocalDateKey(new Date()), []);
  const view = (status as OpsStatusKey) || "checkin_all";
  const config = STATUS_CONFIG[view] || STATUS_CONFIG.checkin_all;

  const { data: stays = [], isLoading } = useQuery<StayWithBooking[]>({
    queryKey: ["stays_operations", today],
    staleTime: DASHBOARD_STALE_TIMES.operations,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: () => fetchStaysOperations(today),
  });

  const kpis = useOpsKpis(stays, today);

  // ═══ Dialog states — synced with StaysPage SOT ═══
  const [selectedStay, setSelectedStay] = useState<StayWithBooking | null>(null);
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [checkOutDialogOpen, setCheckOutDialogOpen] = useState(false);
  const [multiRoomCheckInDialogOpen, setMultiRoomCheckInDialogOpen] = useState(false);
  const [multiRoomCheckOutDialogOpen, setMultiRoomCheckOutDialogOpen] = useState(false);
  const [multiRoomUndoDialogOpen, setMultiRoomUndoDialogOpen] = useState(false);
  const [undoType, setUndoType] = useState<"CHECK_IN" | "CHECK_OUT">("CHECK_IN");
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [assignRoomDialogOpen, setAssignRoomDialogOpen] = useState(false);
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);
  const [undoConfirmType, setUndoConfirmType] = useState<"CHECK_IN" | "CHECK_OUT">("CHECK_IN");
  const [undoConfirmStay, setUndoConfirmStay] = useState<StayWithBooking | null>(null);

  const undoCheckInMutation = useUndoCheckIn();
  const undoCheckOutMutation = useUndoCheckOut();

  // ═══ Dialog handlers — exact copy from StaysPage SOT ═══
  const openCheckIn = useCallback((stay: StayWithBooking) => {
    setSelectedStay(stay);
    if (stay.totalSegments > 1) {
      setMultiRoomCheckInDialogOpen(true);
    } else {
      setCheckInDialogOpen(true);
    }
  }, []);

  const openCheckOut = useCallback((stay: StayWithBooking) => {
    if (!stay.unified_booking_id) return;
    setSelectedStay(stay);
    if (stay.totalSegments > 1) {
      setMultiRoomCheckOutDialogOpen(true);
    } else {
      setCheckOutDialogOpen(true);
    }
  }, []);

  const openCollectPayment = useCallback((stay: StayWithBooking) => {
    setSelectedStay(stay);
    setCollectDialogOpen(true);
  }, []);

  const openAssignRoom = useCallback((stay: StayWithBooking) => {
    setSelectedStay(stay);
    setAssignRoomDialogOpen(true);
  }, []);

  const handleUndoCheckIn = useCallback((stay: StayWithBooking) => {
    if (stay.totalSegments > 1) {
      setSelectedStay(stay);
      setUndoType("CHECK_IN");
      setMultiRoomUndoDialogOpen(true);
      return;
    }
    setUndoConfirmStay(stay);
    setUndoConfirmType("CHECK_IN");
    setUndoConfirmOpen(true);
  }, []);

  const handleUndoCheckOut = useCallback((stay: StayWithBooking) => {
    if (stay.totalSegments > 1) {
      setSelectedStay(stay);
      setUndoType("CHECK_OUT");
      setMultiRoomUndoDialogOpen(true);
      return;
    }
    setUndoConfirmStay(stay);
    setUndoConfirmType("CHECK_OUT");
    setUndoConfirmOpen(true);
  }, []);

  const executeUndoConfirm = useCallback(() => {
    if (!undoConfirmStay) return;
    const stay = undoConfirmStay;

    if (undoConfirmType === "CHECK_IN") {
      if (undoCheckInMutation.isPending) return;
      queryClient.setQueryData(
        ["stays_operations", today],
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
        ["stays_operations", today],
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
  }, [undoConfirmStay, undoConfirmType, queryClient, today, undoCheckInMutation, undoCheckOutMutation]);

  // ═══ Per-tab quick actions — exact copy from StaysPage SOT ═══
  const getQuickActions = useCallback((stay: StayWithBooking) => {
    const hasRoom = !!stay.segment;
    switch (view) {
      case "checkin_all": {
        const actions: Array<{ label: string; onClick: () => void }> = [];
        if (!hasRoom) {
          actions.push({ label: "Phân bổ", onClick: () => openAssignRoom(stay) });
        }
        if (hasRoom && !stay.actual_check_in_at) {
          actions.push({ label: "Nhận phòng", onClick: () => openCheckIn(stay) });
        }
        return actions;
      }
      case "inhouse":
        return stay.actual_check_in_at
          ? [{ label: "Hoàn tác nhận phòng", onClick: () => handleUndoCheckIn(stay) }]
          : [];
      case "checkout": {
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
  }, [view, openCheckIn, openCheckOut, openAssignRoom, openCollectPayment, handleUndoCheckIn, handleUndoCheckOut]);

  // ═══ Filter stays ═══
  const filteredStays = useMemo(() => {
    let result = stays.filter(s => s.booking !== null && s.isCurrent);

    if (view !== "new_booking") {
      result = result.filter(s => {
        const bstatus = s.booking?.booking_status;
        return bstatus !== "CANCELLED" && bstatus !== "NO_SHOW";
      });
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(stay =>
        stay.unified_booking_id.toLowerCase().includes(term) ||
        stay.booking?.guest_name?.toLowerCase().includes(term) ||
        stay.booking?.guest_phone?.includes(term)
      );
    }

    switch (view) {
      case "checkin_all":
        result = result.filter(s => {
          const segmentDateFrom = s.segment?.date_from?.split("T")[0];
          if (s.segment) return segmentDateFrom === today;
          return s.booking?.check_in_date === today;
        });
        break;
      case "inhouse":
        result = result.filter(s => s.actual_check_in_at && !s.actual_check_out_at);
        break;
      case "checkout":
        result = result.filter(s => {
          if (!s.segment) return false;
          const segmentDateTo = s.segment.date_to?.split("T")[0];
          const checkOutDate = segmentDateTo || s.booking?.check_out_date;
          return checkOutDate === today;
        });
        break;
      case "new_booking":
        result = result.filter(s => s.booking?.booking_created_at === today);
        break;
      case "upcoming": {
        const seenBookings = new Set<string>();
        result = result.filter(s => {
          if (seenBookings.has(s.unified_booking_id)) return false;
          const isComplete = s.coverage?.isComplete ?? false;
          if (isComplete) return false;
          seenBookings.add(s.unified_booking_id);
          return true;
        });
        const todayMs = new Date().setHours(0, 0, 0, 0);
        result = result.filter(s => {
          if (!s.booking?.check_in_date) return false;
          const checkInMs = new Date(s.booking.check_in_date + "T00:00:00").getTime();
          const diffDays = Math.floor((checkInMs - todayMs) / (1000 * 60 * 60 * 24));
          return diffDays >= 0 && diffDays <= 7;
        });
        break;
      }
      case "overdue":
        result = result.filter(s => {
          if (s.booking?.payment_type !== "HOTEL_COLLECT") return false;
          const remaining = (s.booking?.total_amount_net || 0) - s.amount_collected;
          return remaining > 0 && s.booking?.check_out_date && s.booking.check_out_date < today;
        });
        break;
    }

    result.sort((a, b) => {
      const aHasRoom = !!a.segment;
      const bHasRoom = !!b.segment;
      const aCheckInToday = a.booking?.check_in_date === today && !a.actual_check_in_at;
      const bCheckInToday = b.booking?.check_in_date === today && !b.actual_check_in_at;

      if (aCheckInToday && !aHasRoom && !(bCheckInToday && !bHasRoom)) return -1;
      if (bCheckInToday && !bHasRoom && !(aCheckInToday && !aHasRoom)) return 1;
      if (aCheckInToday && !bCheckInToday) return -1;
      if (bCheckInToday && !aCheckInToday) return 1;

      const aInHouse = a.actual_check_in_at && !a.actual_check_out_at;
      const bInHouse = b.actual_check_in_at && !b.actual_check_out_at;
      if (aInHouse && !bInHouse) return -1;
      if (bInHouse && !aInHouse) return 1;

      return (a.booking?.check_in_date || "").localeCompare(b.booking?.check_in_date || "");
    });

    return result;
  }, [stays, view, searchTerm, today]);

  const Icon = config.icon;

  return (
    <PageTransition variant="slide">
      <Header
        title={config.label}
        subtitle={`${filteredStays.length} booking`}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => appNavigate("/ops")}
            className="gap-1.5 !text-white/80 hover:!text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      {/* Sticky search bar */}
      <div className="sticky top-[64px] z-30 bg-background px-3 py-2 -mx-3 sm:relative sm:top-auto sm:z-auto sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm khách, booking..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
      </div>

      <PageContainer className="!py-2 !my-0">

          {isLoading && (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <BookingCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!isLoading && filteredStays.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Icon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Không có dữ liệu</p>
              <p className="text-sm mt-1">{config.emptyMessage}</p>
            </div>
          )}

          {!isLoading && filteredStays.length > 0 && (
            <div className="flex flex-col gap-3">
              {filteredStays.map((stay) => {
                const hasRoom = !!stay.segment;
                const variant: "no_segment" | "has_segment" = hasRoom ? "has_segment" : "no_segment";

                return (
                  <PressableCard
                    key={stay.segmentKey}
                    onClick={() => appNavigate(`/bookings/${stay.unified_booking_id}`)}
                    className="cursor-pointer"
                  >
                    <StayCompactCard
                      stay={stay}
                      variant={variant}
                      quickActions={getQuickActions(stay)}
                    />
                  </PressableCard>
                );
              })}
            </div>
          )}
        
      </PageContainer>

      {/* ═══ Dialogs — synced with StaysPage SOT ═══ */}
      {selectedStay && selectedStay.booking && (
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
            }}
            onCollectSurcharge={() => {
              setCheckOutDialogOpen(false);
            }}
            currentSegmentId={selectedStay.segment?.segment_id || null}
          />

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
            }}
            onCollectSurcharge={() => {
              setMultiRoomCheckOutDialogOpen(false);
            }}
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
        </>
      )}

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
    </PageTransition>
  );
}
