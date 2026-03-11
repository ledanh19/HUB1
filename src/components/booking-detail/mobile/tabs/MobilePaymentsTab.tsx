import { DollarSign } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";
import { getPaymentMethodLabel } from "@/constants/paymentMethods";
import { PaymentBucketsSection } from "@/components/booking/PaymentBucketsSection";
import { CollectionTableActions } from "@/components/booking/CollectionTableActions";
import { MobileDetailRow, MobileSection } from "../MobileDetailRow";
import type { HotelCollect } from "@/hooks/useCollections";

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
};
const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

interface MobilePaymentsTabProps {
  booking: any;
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
  canAddFees: boolean;
  hotelCollects: any[];
  onAddFees: () => void;
  onAddService: () => void;
  onCollectionComplete: () => void;
  onConfirmRounding: (amount: number) => void;
  isConfirmingRounding: boolean;
  computedAmount: { amount: number | null; status: string };
  amountOverride: any;
}

export function MobilePaymentsTab({
  booking,
  roomExpected,
  roomCollectedAmount,
  feesExpected,
  feesCollected,
  servicesExpected,
  servicesCollected,
  isOtaCollect,
  otaPayoutCount,
  roomCollectionCount,
  feesCollectionCount,
  servicesCollectionCount,
  canAddFees,
  hotelCollects,
  onAddFees,
  onAddService,
  onCollectionComplete,
  onConfirmRounding,
  isConfirmingRounding,
  computedAmount,
  amountOverride,
}: MobilePaymentsTabProps) {
  return (
    <div className="space-y-[1px] bg-muted/30">
      {/* Buckets section */}
      <div className="bg-card mobile-flat">
        <PaymentBucketsSection
          booking={{
            unified_booking_id: booking.unified_booking_id,
            payment_type: booking.payment_type || "HOTEL_COLLECT",
            booking_type: booking.booking_type,
            total_amount_net: booking.total_amount_net,
            guest_name: booking.guest_name || "",
            booking_status: booking.booking_status,
          }}
          roomExpected={roomExpected}
          roomCollectedAmount={roomCollectedAmount}
          feesExpected={feesExpected}
          feesCollected={feesCollected}
          servicesExpected={servicesExpected}
          servicesCollected={servicesCollected}
          isOtaCollect={isOtaCollect}
          otaPayoutCount={otaPayoutCount}
          roomCollectionCount={roomCollectionCount}
          feesCollectionCount={feesCollectionCount}
          servicesCollectionCount={servicesCollectionCount}
          canAddFees={canAddFees}
          onAddFees={onAddFees}
          onAddService={onAddService}
          onCollectionComplete={onCollectionComplete}
          onConfirmRounding={onConfirmRounding}
          isConfirmingRounding={isConfirmingRounding}
          hideSummary
          hideAddButtons
        />
      </div>
    </div>
  );
}
