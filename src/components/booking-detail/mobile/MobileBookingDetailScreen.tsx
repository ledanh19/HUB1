import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MobileBookingAppBar } from "./MobileBookingAppBar";
import { MobileBookingTabBar, type MobileBookingTab } from "./MobileBookingTabBar";
import { MobileOverviewTab } from "./tabs/MobileOverviewTab";
import { MobileAllocationTab } from "./tabs/MobileAllocationTab";
import { MobileServicesTab } from "./tabs/MobileServicesTab";
import { MobilePaymentsTab } from "./tabs/MobilePaymentsTab";
import { MobileHistoryTab } from "./tabs/MobileHistoryTab";
import { ArrowLeft, LogIn, LogOut, XCircle, CreditCard, Edit, Clock } from "lucide-react";
import { PageTransition } from "@/components/motion/PageTransition";
import { TabTransition } from "@/components/motion/TabTransition";
import type { HostDepositRequest, HostDepositPurpose } from "@/hooks/useHostDepositRequests";

export interface MobileBookingDetailProps {
  booking: any;
  bookingId: string | undefined;
  computedAmount: { amount: number | null; status: string };
  paymentStatusInfo: { variant: string; label: string };
  roomExpected: number;
  roomCollectedAmount: number;
  feesExpected: number;
  feesCollected: number;
  servicesExpected: number;
  servicesCollected: number;
  isOtaCollect: boolean;
  otaPayoutCount: number;
  roomCollectionCount: number;
  feesCollectionCount: number;
  servicesCollectionCount: number;
  hotelCollects: any[];
  amountOverride: any;
  hostSegments: any[];
  coverageStatus: any;
  depositRequests: HostDepositRequest[];
  prepaidRequests: HostDepositRequest[];
  extraCharges: any[];
  noShowRecord: any;
  ownershipInfo: any;
  documents: any[];
  auditLogs: any[];
  auditProfiles: Record<string, any>;
  bookingChanges: any[];
  serviceOrders: any[];
  hasActiveDispute: boolean;
  canPerformActions: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canCheckInNextSegment: boolean;
  canCheckInSegment: boolean;
  canUndoCheckIn: boolean;
  canUndoCheckOut: boolean;
  isNoShow: boolean;
  canMarkNoShow: boolean;
  isManualBooking: boolean;
  canEditManualBooking: boolean;
  canCancelManualBooking: boolean;
  isCheckingIn: boolean;
  isCheckingOut: boolean;
  isConfirmingRounding: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onUndoCheckIn: () => void;
  onUndoCheckOut: () => void;
  onCollectPayment: () => void;
  onCollectService: () => void;
  onAssignRoom: () => void;
  onAddService: () => void;
  onUploadDoc: () => void;
  onNoShow: () => void;
  onRemoveNoShow: () => void;
  onDirectRefund: () => void;
  onAssignOwner: () => void;
  onAddExtraCharge: () => void;
  onDeposit: (purpose: HostDepositPurpose) => void;
  onEditDeposit: (r: HostDepositRequest) => void;
  onDeleteDeposit: (r: HostDepositRequest) => void;
  onEditBooking: () => void;
  onCancelBooking: () => void;
  onAddFees: () => void;
  onConfirmRounding: (amount: number) => void;
  onCollectionComplete: () => void;
  refetch: () => void;
  initialTab?: MobileBookingTab;
}

export function MobileBookingDetailScreen(props: MobileBookingDetailProps) {
  const {
    booking, bookingId, computedAmount, paymentStatusInfo,
    noShowRecord, ownershipInfo, documents, auditLogs, auditProfiles, bookingChanges,
    hasActiveDispute, canPerformActions,
    canCheckIn, canCheckOut, canCheckInNextSegment, canCheckInSegment,
    canUndoCheckIn, canUndoCheckOut, isNoShow, canMarkNoShow,
    isManualBooking, canEditManualBooking, canCancelManualBooking,
    isCheckingIn, isCheckingOut,
    onCheckIn, onCheckOut, onUndoCheckIn, onUndoCheckOut,
    onNoShow, onRemoveNoShow, onDirectRefund,
    onAssignOwner, onEditBooking, onCancelBooking, onUploadDoc,
    hostSegments, coverageStatus, depositRequests, prepaidRequests,
    hotelCollects, serviceOrders, initialTab,
  } = props;

  const navigate = useNavigate();
  const location = useLocation();
  
  // Read tab from URL or location.state (restored after task page return)
  const searchParams = new URLSearchParams(location.search);
  const urlTab = searchParams.get("tab") as MobileBookingTab | null;
  const stateTab = (location.state as any)?.returnTab as MobileBookingTab | undefined;
  const [activeTab, setActiveTab] = useState<MobileBookingTab>(stateTab || urlTab || initialTab || "overview");
  const [showHistory, setShowHistory] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Sync tab to URL with replace (NO history entry)
  const handleTabChange = useCallback((tab: MobileBookingTab) => {
    setActiveTab(tab);
    // Build new URL preserving pathname, replacing only ?tab
    const params = new URLSearchParams(window.location.search);
    if (tab === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    // Remove action param if present (should already be cleared)
    params.delete("action");
    const qs = params.toString();
    navigate(`${location.pathname}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [navigate, location.pathname]);

  // Reset scroll to top on tab switch ONLY (skip initial mount)
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeTab]);

  const handleBack = useCallback(() => {
    const referrer = (location.state as any)?.from;
    if (referrer) {
      navigate(referrer, { replace: true });
    } else if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/bookings", { replace: true });
    }
  }, [navigate, location.state]);

  // Build overflow menu items
  const overflowItems = [];
  overflowItems.push({ label: "Xem lịch sử", icon: Clock, onClick: () => setShowHistory(true) });
  if (canUndoCheckIn) overflowItems.push({ label: "Hoàn tác nhận phòng", icon: LogIn, onClick: onUndoCheckIn });
  if (canUndoCheckOut) overflowItems.push({ label: "Hoàn tác trả phòng", icon: LogOut, onClick: onUndoCheckOut });
  if (isNoShow && props.noShowRecord) overflowItems.push({ label: "Gỡ No-show", icon: XCircle, onClick: onRemoveNoShow });
  if (canMarkNoShow) {
    overflowItems.push({ label: "Yêu cầu hoàn tiền", icon: CreditCard, onClick: onDirectRefund, separator: true });
    overflowItems.push({ label: "Đánh dấu No-show", icon: XCircle, onClick: onNoShow, destructive: true });
  }
  if (isManualBooking) {
    overflowItems.push({ label: "Sửa booking", icon: Edit, onClick: onEditBooking, disabled: !canEditManualBooking, separator: true });
    overflowItems.push({ label: "Huỷ đặt phòng", icon: XCircle, onClick: onCancelBooking, destructive: true, disabled: !canCancelManualBooking });
  }

  const bookingCode = booking.booking_type === "PMS"
    ? (booking.ota_booking_code || booking.pms_booking_id || booking.unified_booking_id).replace(/^[A-Za-z]+-/, "")
    : booking.unified_booking_id;

  const tabCounts: Partial<Record<MobileBookingTab, number>> = {
    services: serviceOrders?.length || 0,
    payments: hotelCollects?.length || 0,
  };

  const totalHostCost = coverageStatus?.totalHostCost || 0;

  // History full-screen sub-view
  if (showHistory) {
    return (
      <PageTransition variant="slide">
        <div className="h-dvh flex flex-col bg-background bd-animated">
          <div className="shrink-0 relative overflow-hidden bg-gradient-to-r from-[#0B3C5D] via-[#0E4A73] to-[#1565A0] text-white shadow-sm will-change-transform px-4 py-3">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
              <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />
            </div>
            <div className="relative flex items-center min-h-[44px] gap-1">
              <button onClick={() => setShowHistory(false)} className="w-11 h-11 flex items-center justify-center text-white shrink-0 rounded-full hover:bg-white/15 transition-colors -ml-1.5">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-base font-bold text-white">Lịch sử</h1>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <MobileHistoryTab auditLogs={auditLogs} auditProfiles={auditProfiles} bookingChanges={bookingChanges} hotelCollects={hotelCollects} onCollectionComplete={props.onCollectionComplete} />
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <div className="h-full flex flex-col bg-muted/30 bd-animated overflow-hidden">
      {/* Fixed header + tab bar — never scrolls, never transforms */}
      <div className="shrink-0 z-40">
        <MobileBookingAppBar
          bookingCode={bookingCode}
          bookingStatus={booking.booking_status}
          bookingType={booking.booking_type}
          source={booking.source || ""}
          hasActiveDispute={hasActiveDispute}
          canCheckIn={canCheckIn}
          canCheckOut={canCheckOut}
          canCheckInNextSegment={canCheckInNextSegment}
          canCheckInSegment={canCheckInSegment}
          isCheckingIn={isCheckingIn}
          isCheckingOut={isCheckingOut}
          onCheckIn={onCheckIn}
          onCheckOut={onCheckOut}
          onBack={handleBack}
          overflowItems={overflowItems}
          canPerformActions={canPerformActions}
        />
        <MobileBookingTabBar activeTab={activeTab} onTabChange={handleTabChange} counts={tabCounts} />
      </div>

      {/* Scrollable content area only */}
      <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="pb-16">
          <TabTransition tabKey={activeTab}>
            {activeTab === "overview" && (
              <MobileOverviewTab
                booking={booking}
                computedAmount={computedAmount}
                paymentStatusInfo={paymentStatusInfo}
                noShowRecord={noShowRecord}
                ownershipInfo={ownershipInfo}
                bookingId={bookingId}
                onAssignOwner={onAssignOwner}
                documents={documents}
                onUploadDoc={onUploadDoc}
                isOtaCollect={props.isOtaCollect}
              />
            )}
            {activeTab === "allocation" && (
              <MobileAllocationTab
                booking={booking}
                coverageStatus={coverageStatus}
                hostSegments={hostSegments}
                totalHostCost={totalHostCost}
                depositRequests={depositRequests}
                prepaidRequests={prepaidRequests}
                onAddSegment={props.onAssignRoom}
                onAddExtraCharge={props.onAddExtraCharge}
                onDeposit={() => props.onDeposit("HOST_DEPOSIT")}
                onPrepaid={() => props.onDeposit("HOST_PREPAID")}
                onEditDeposit={props.onEditDeposit}
                onDeleteDeposit={props.onDeleteDeposit}
              />
            )}
            {activeTab === "services" && (
              <MobileServicesTab
                unifiedBookingId={booking.unified_booking_id || ""}
                isSettled={(booking as any).is_settled === true}
                onAddService={props.onAddService}
              />
            )}
            {activeTab === "payments" && (
              <MobilePaymentsTab
                booking={booking}
                roomExpected={props.roomExpected}
                roomCollectedAmount={props.roomCollectedAmount}
                feesExpected={props.feesExpected}
                feesCollected={props.feesCollected}
                servicesExpected={props.servicesExpected}
                servicesCollected={props.servicesCollected}
                isOtaCollect={props.isOtaCollect}
                otaPayoutCount={props.otaPayoutCount}
                roomCollectionCount={props.roomCollectionCount}
                feesCollectionCount={props.feesCollectionCount}
                servicesCollectionCount={props.servicesCollectionCount}
                canAddFees={hostSegments.length > 0}
                hotelCollects={hotelCollects}
                onAddFees={props.onAddFees}
                onAddService={props.onAddService}
                onCollectionComplete={props.onCollectionComplete}
                onConfirmRounding={props.onConfirmRounding}
                isConfirmingRounding={props.isConfirmingRounding}
                computedAmount={computedAmount}
                amountOverride={props.amountOverride}
              />
            )}
          </TabTransition>
        </div>
      </div>
    </div>
  );
}
