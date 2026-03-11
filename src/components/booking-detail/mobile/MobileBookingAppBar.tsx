import { useState } from "react";
import { ArrowLeft, MoreHorizontal, LogIn, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OtaBadge } from "@/components/ui/ota-badge";
import { MobileActionSheet, type ActionSheetItem } from "./MobileActionSheet";

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Đã xác nhận",
  CHECKED_IN: "Đã nhận phòng",
  IN_HOUSE: "Đang lưu trú",
  CHECKED_OUT: "Đã trả phòng",
  CANCELLED: "Đã huỷ",
  NO_SHOW: "No-show",
  PENDING: "Chờ xác nhận",
  DONE: "Hoàn thành",
  WAIT_ROOM: "Chờ phân bổ",
  NEW: "Mới",
};

interface MobileBookingAppBarProps {
  bookingCode: string;
  bookingStatus: string | null;
  bookingType: string;
  source: string;
  hasActiveDispute: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canCheckInNextSegment: boolean;
  canCheckInSegment: boolean;
  isCheckingIn: boolean;
  isCheckingOut: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onBack: () => void;
  overflowItems: ActionSheetItem[];
  canPerformActions: boolean;
}

export function MobileBookingAppBar({
  bookingCode,
  bookingStatus,
  source,
  hasActiveDispute,
  canCheckIn,
  canCheckOut,
  canCheckInNextSegment,
  canCheckInSegment,
  isCheckingIn,
  isCheckingOut,
  onCheckIn,
  onCheckOut,
  onBack,
  overflowItems,
  canPerformActions,
}: MobileBookingAppBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const showPrimaryCTA = canPerformActions && (canCheckIn || canCheckOut);

  return (
    <>
      <div className="relative overflow-hidden bg-gradient-to-r from-[#0B3C5D] via-[#0E4A73] to-[#1565A0] text-white shadow-sm will-change-transform px-4 py-3">
        {/* Decorative background blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />
        </div>

        {/* Row — Back + Title + CTA + Overflow */}
        <div className="relative flex items-center min-h-[44px] gap-1">
          {/* Back button — 44px touch target */}
          <button
            onClick={onBack}
            className="w-11 h-11 flex items-center justify-center shrink-0 text-white rounded-full hover:bg-white/15 transition-colors -ml-1.5"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <h1 className="flex-1 text-base font-bold tracking-tight truncate text-white">
            Chi tiết đặt phòng
          </h1>

          {showPrimaryCTA && (
            <>
              {canCheckIn && (
                <Button
                  size="sm"
                  onClick={onCheckIn}
                  disabled={isCheckingIn || !canCheckInSegment}
                  className="h-8 px-3 text-xs bg-white/15 hover:bg-white/25 text-white border border-white/20 shadow-none gap-1.5 shrink-0"
                >
                  {isCheckingIn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                  {canCheckInNextSegment ? "Nhận tiếp" : "Nhận phòng"}
                </Button>
              )}
              {canCheckOut && !canCheckIn && (
                <Button
                  size="sm"
                  onClick={onCheckOut}
                  disabled={isCheckingOut}
                  className="h-8 px-3 text-xs bg-white/15 hover:bg-white/25 text-white border border-white/20 shadow-none gap-1.5 shrink-0"
                >
                  {isCheckingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                  Trả phòng
                </Button>
              )}
            </>
          )}

          {/* Overflow — 44px touch target, opens action sheet */}
          {canPerformActions && overflowItems.length > 0 && (
            <button
              onClick={() => setSheetOpen(true)}
              className="w-11 h-11 flex items-center justify-center shrink-0 text-white rounded-full hover:bg-white/15 transition-colors -mr-1.5"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile action sheet instead of dropdown */}
      <MobileActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        items={overflowItems}
        title="Hành động"
      />
    </>
  );
}
