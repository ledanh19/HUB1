import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useBookingDetail } from "@/hooks/useBookings";
import { useHotelCollects } from "@/hooks/useBookings";
import { useHostSupplySegments, useHostExtraCharges } from "@/hooks/useHostSupplySegments";
import { useBookingAmountOverride, computeBookingAmount } from "@/hooks/useBookingAmountOverrides";
import { useOtaPayoutCashInForBooking } from "@/hooks/useOtaPayouts";
import { useServiceOrdersByBooking } from "@/hooks/useServiceOrders";
import { MobileTaskPage } from "@/components/booking-detail/mobile/MobileTaskPage";
import { CollectPaymentForm } from "@/components/booking/forms/CollectPaymentForm";
import { PAYMENT_TOLERANCE_VND } from "@/constants/payment-tolerance";
import { useMemo, useCallback } from "react";

export default function MobileCollectPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const category = searchParams.get("category") as "ROOM" | "EXTRA" | "SERVICE" | null;
  const lockCategory = searchParams.get("lock") === "1";

  const { data: booking, isLoading } = useBookingDetail(id);
  const { data: hotelCollects = [] } = useHotelCollects(id);
  const { data: amountOverride } = useBookingAmountOverride(id);
  const { data: hostSegments = [] } = useHostSupplySegments(id);
  const { data: extraCharges = [] } = useHostExtraCharges(id);
  const { data: otaPayoutCashIn } = useOtaPayoutCashInForBooking(id);
  const { data: serviceOrders = [] } = useServiceOrdersByBooking(id);

  const isOtaCollect = booking?.payment_type === "OTA_COLLECT";

  const computedAmount = useMemo(() => {
    return computeBookingAmount(booking, amountOverride || null);
  }, [booking, amountOverride]);

  const roomExpected = computedAmount.amount || 0;
  const roomCollections = hotelCollects.filter(c => c.status !== "VOIDED" && (c as any).related_type === "ROOM");
  const hotelCollectRoomAmount = roomCollections.reduce((sum, c) => sum + (c.amount_collected || 0), 0);
  const otaCashIn = otaPayoutCashIn?.totalCashIn || 0;
  const roomCollectedAmount = isOtaCollect ? otaCashIn : hotelCollectRoomAmount;
  const roomRemaining = roomExpected - roomCollectedAmount;

  const feesExpected = extraCharges.reduce((sum, c) => sum + (c.amount || 0), 0);
  const feeCollections = hotelCollects.filter(c => c.status !== "VOIDED" && (c as any).related_type === "EXTRA");
  const feesCollected = feeCollections.reduce((sum, c) => sum + (c.amount_collected || 0), 0);

  const servicesExpected = serviceOrders
    .filter((s: any) => s.collector_type === "ROOMRISE" || !s.collector_type)
    .reduce((sum: number, s: any) => sum + (s.sale_price || 0), 0);
  const serviceCollections = hotelCollects.filter(c => c.status !== "VOIDED" && (c as any).related_type === "SERVICE");
  const servicesCollected = serviceCollections.reduce((sum, c) => sum + (c.amount_collected || 0), 0);

  const feesRemaining = feesExpected - feesCollected;
  const servicesRemaining = servicesExpected - servicesCollected;
  const totalRemaining = (roomExpected + feesExpected + servicesExpected) - (roomCollectedAmount + feesCollected + servicesCollected);
  const hotelCollectRemaining = isOtaCollect ? (feesRemaining + servicesRemaining) : totalRemaining;
  const remainingAmount = category === "SERVICE" ? servicesRemaining : hotelCollectRemaining;

  // Smart back: restore parent booking detail with correct tab
  const handleBack = useCallback(() => {
    const returnTab = (location.state as any)?.returnTab;
    const tabParam = returnTab && returnTab !== "overview" ? `?tab=${returnTab}` : "";
    navigate(`/bookings/${id}${tabParam}`, { replace: true });
  }, [navigate, id, location.state]);

  if (isLoading || !booking) {
    return (
      <MobileTaskPage title="Thu tiền" onBack={handleBack} hideSubmit>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </MobileTaskPage>
    );
  }

  return (
    <CollectPaymentForm
      unifiedBookingId={booking.unified_booking_id}
      remainingAmount={remainingAmount}
      bookingStatus={booking.booking_status || undefined}
      stayStatus={booking.stay_status || undefined}
      paymentType={booking.payment_type}
      defaultCategory={category || undefined}
      lockCategory={lockCategory}
      onComplete={handleBack}
    />
  );
}