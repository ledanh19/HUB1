import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useBookingDetail } from "@/hooks/useBookings";
import { MobileTaskPage } from "@/components/booking-detail/mobile/MobileTaskPage";
import { AddServiceForm } from "@/components/booking/forms/AddServiceForm";
import { useCallback } from "react";

export default function MobileAddServicePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: booking, isLoading } = useBookingDetail(id);

  const handleBack = useCallback(() => {
    const returnTab = (location.state as any)?.returnTab;
    const tabParam = returnTab && returnTab !== "overview" ? `?tab=${returnTab}` : "";
    navigate(`/bookings/${id}${tabParam}`, { replace: true });
  }, [navigate, id, location.state]);

  if (isLoading || !booking) {
    return (
      <MobileTaskPage title="Thêm dịch vụ" onBack={handleBack} hideSubmit>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </MobileTaskPage>
    );
  }

  return (
    <AddServiceForm
      unifiedBookingId={booking.unified_booking_id}
      onComplete={handleBack}
    />
  );
}