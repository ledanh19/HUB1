import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useBookingDetail } from "@/hooks/useBookings";
import { useHostSupplySegments } from "@/hooks/useHostSupplySegments";
import { MobileTaskPage } from "@/components/booking-detail/mobile/MobileTaskPage";
import { AddSegmentForm } from "@/components/booking/forms/AddSegmentForm";
import { useCallback } from "react";

export default function MobileAllocateRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: booking, isLoading } = useBookingDetail(id);
  const { data: hostSegments = [] } = useHostSupplySegments(id);

  const handleBack = useCallback(() => {
    const returnTab = (location.state as any)?.returnTab;
    const tabParam = returnTab && returnTab !== "overview" ? `?tab=${returnTab}` : "";
    navigate(`/bookings/${id}${tabParam}`, { replace: true });
  }, [navigate, id, location.state]);

  if (isLoading || !booking) {
    return (
      <MobileTaskPage title="Phân bổ phòng" onBack={handleBack} hideSubmit>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </MobileTaskPage>
    );
  }

  return (
    <AddSegmentForm
      unifiedBookingId={booking.unified_booking_id}
      checkInDate={booking.check_in_date}
      checkOutDate={booking.check_out_date}
      existingSegments={hostSegments}
      onComplete={handleBack}
    />
  );
}