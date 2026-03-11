import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useBookingDetail } from "@/hooks/useBookings";
import { useHostSupplySegments } from "@/hooks/useHostSupplySegments";
import { MobileTaskPage } from "@/components/booking-detail/mobile/MobileTaskPage";
import { CreateHostDepositForm } from "@/components/booking/forms/CreateHostDepositForm";
import type { HostDepositPurpose } from "@/hooks/useHostDepositRequests";
import { useCallback } from "react";

export default function MobileCreateDepositPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const purpose = (searchParams.get("purpose") || "HOST_DEPOSIT") as HostDepositPurpose;

  const { data: booking, isLoading } = useBookingDetail(id);
  const { data: hostSegments = [] } = useHostSupplySegments(id);

  const handleBack = useCallback(() => {
    const returnTab = (location.state as any)?.returnTab;
    const tabParam = returnTab && returnTab !== "overview" ? `?tab=${returnTab}` : "";
    navigate(`/bookings/${id}${tabParam}`, { replace: true });
  }, [navigate, id, location.state]);

  const isDeposit = purpose === "HOST_DEPOSIT";
  const title = isDeposit ? "Tạo đề xuất đặt cọc" : "Tạo đề xuất trả trước";

  if (isLoading || !booking) {
    return (
      <MobileTaskPage title={title} onBack={handleBack} hideSubmit>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </MobileTaskPage>
    );
  }

  return (
    <CreateHostDepositForm
      purpose={purpose}
      segments={hostSegments}
      unifiedBookingId={booking.unified_booking_id}
      onComplete={handleBack}
    />
  );
}