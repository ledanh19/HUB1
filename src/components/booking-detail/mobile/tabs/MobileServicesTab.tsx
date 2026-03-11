import { Plane } from "lucide-react";
import { ServiceOrdersSection } from "@/components/booking/ServiceOrdersSection";
import { EmptyState } from "@/components/ui/empty-state";

interface MobileServicesTabProps {
  unifiedBookingId: string;
  isSettled: boolean;
  onAddService: () => void;
}

export function MobileServicesTab({ unifiedBookingId, isSettled, onAddService }: MobileServicesTabProps) {
  if (!unifiedBookingId) {
    return (
      <div className="px-4 py-3">
        <EmptyState
          icon={Plane}
          title="Chưa có dịch vụ"
          description="Booking chưa sẵn sàng để thêm dịch vụ."
          className="py-16"
        />
      </div>
    );
  }

  return (
    <div className="space-y-[1px] bg-muted/30 mobile-flat">
      <ServiceOrdersSection
        unifiedBookingId={unifiedBookingId}
        isSettled={isSettled}
        onAddService={onAddService}
      />
    </div>
  );
}
