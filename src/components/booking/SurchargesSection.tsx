import { StatusBadge } from "@/components/ui/status-badge";
import { useServiceOrders } from "@/hooks/useBookings";
import {
  Truck,
  CheckCircle,
  Loader2,
} from "lucide-react";

interface SurchargesSectionProps {
  unifiedBookingId: string;
  hostPartnerId?: string | null;
}

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

export function SurchargesSection({ unifiedBookingId }: SurchargesSectionProps) {
  const { data: serviceOrders = [], isLoading: loadingService } = useServiceOrders(unifiedBookingId);


  // Calculate totals
  const serviceTotal = serviceOrders.reduce((sum, s) => sum + (s.sale_price || 0), 0);
  const servicePendingCount = serviceOrders.filter(s => s.collector_type === "ROOMRISE" && s.status !== "DONE" && s.status !== "CANCELLED").length;

  // Only show if there are service orders
  if (loadingService) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (serviceOrders.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Chưa có dịch vụ</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-section="services">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Truck className="h-4 w-4 text-info" />
          Dịch vụ
          {serviceTotal > 0 && (
            <span className="text-muted-foreground">({formatCurrency(serviceTotal)})</span>
          )}
          {servicePendingCount > 0 && (
            <StatusBadge variant="warning" size="sm">
              {servicePendingCount} cần thu
            </StatusBadge>
          )}
        </h3>
      </div>
      <div className="space-y-2">
        {serviceOrders.map((order: any) => (
          <div
            key={order.id}
            className="flex items-center justify-between p-3 rounded-lg border bg-card"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {order.service_catalog?.service_name || "Dịch vụ"}
                </span>
                <StatusBadge
                  variant={order.status === "DONE" ? "success" : order.status === "CANCELLED" ? "cancelled" : "warning"}
                  size="sm"
                >
                  {order.status === "DONE" ? "Hoàn thành" : order.status === "CANCELLED" ? "Huỷ" : order.status}
                </StatusBadge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <span>{order.partners?.partner_name || "—"}</span>
                <span>•</span>
                <span>{order.collector_type === "ROOMRISE" ? "Roomrise thu" : "Đối tác thu"}</span>
                {order.pax && <span>• {order.pax} pax</span>}
              </div>
              {order.note && (
                <p className="text-sm text-muted-foreground mt-1">{order.note}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium">{formatCurrency(order.sale_price)}</span>
              {order.status === "DONE" && (
                <CheckCircle className="h-5 w-5 text-success" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
