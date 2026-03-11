import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  Loader2,
  ShieldAlert
} from "lucide-react";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Anomaly {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  impact?: string;
  count?: number;
  amount?: number;
  action: string;
  actionLabel: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

export function AnomalyDetection() {
  const { appNavigate } = useAppNavigate();
  const today = new Date().toISOString().split("T")[0];

  const { data: anomalies, isLoading } = useQuery({
    queryKey: ["ai-anomaly-detection", today],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const detectedAnomalies: Anomaly[] = [];

      // 1. Booking có nhưng chưa có dòng tiền (OTA Collect checkout > 14 days)
      const { data: oldOtaBookings } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id, total_amount_net, check_out_date")
        .eq("payment_type", "OTA_COLLECT")
        .eq("booking_status", "CHECKED_OUT")
        .lt("check_out_date", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

      const { data: payoutDetails } = await supabase
        .from("ota_payout_details")
        .select("unified_booking_id");

      const payoutBookingIds = new Set(payoutDetails?.map(p => p.unified_booking_id) || []);
      const stuckBookings = (oldOtaBookings || []).filter(b => !payoutBookingIds.has(b.unified_booking_id));

      if (stuckBookings.length > 0) {
        const totalAmount = stuckBookings.reduce((sum, b) => sum + Number(b.total_amount_net || 0), 0);
        detectedAnomalies.push({
          id: "stuck-ota-bookings",
          type: "STUCK_BOOKING",
          severity: "critical",
          title: "Booking OTA tồn đọng > 14 ngày",
          description: `${stuckBookings.length} booking đã checkout nhưng chưa có payout trong hơn 2 tuần`,
          impact: `Tổng giá trị: ${formatCurrency(totalAmount)}`,
          count: stuckBookings.length,
          amount: totalAmount,
          action: "/ota-payouts",
          actionLabel: "Xử lý ngay",
        });
      }

      // 2. Payment request APPROVED nhưng chưa có cash-out > 3 days
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data: oldApproved } = await supabase
        .from("payment_requests")
        .select("id, proposed_amount, requested_at")
        .eq("status", "APPROVED")
        .lt("requested_at", threeDaysAgo);

      if (oldApproved && oldApproved.length > 0) {
        const requestIds = oldApproved.map(r => r.id);
        const { data: cashOuts } = await supabase
          .from("cash_outs")
          .select("payment_request_id")
          .in("payment_request_id", requestIds);

        const paidIds = new Set(cashOuts?.map(c => c.payment_request_id) || []);
        const stuckRequests = oldApproved.filter(r => !paidIds.has(r.id));

        if (stuckRequests.length > 0) {
          const totalAmount = stuckRequests.reduce((sum, r) => sum + Number(r.proposed_amount || 0), 0);
          detectedAnomalies.push({
            id: "stuck-approved-requests",
            type: "APPROVED_NO_PAYOUT",
            severity: "critical",
            title: "Đề xuất đã duyệt nhưng chưa chi",
            description: `${stuckRequests.length} payment request đã APPROVED > 3 ngày nhưng chưa có cash-out`,
            impact: `Tổng giá trị: ${formatCurrency(totalAmount)}`,
            count: stuckRequests.length,
            amount: totalAmount,
            action: "/payments/cashout",
            actionLabel: "Chi tiền ngay",
          });
        }
      }

      // 3. Open disputes with high value
      const { data: disputes } = await supabase
        .from("ota_disputes")
        .select("id, amount_in_dispute")
        .in("status", ["OPEN", "IN_REVIEW"]);

      if (disputes && disputes.length > 0) {
        const highValueDisputes = disputes.filter(d => Number(d.amount_in_dispute) > 5000000);
        if (highValueDisputes.length > 0) {
          const totalAmount = highValueDisputes.reduce((sum, d) => sum + Number(d.amount_in_dispute || 0), 0);
          detectedAnomalies.push({
            id: "high-value-disputes",
            type: "HIGH_DISPUTE",
            severity: "warning",
            title: "Tranh chấp giá trị cao",
            description: `${highValueDisputes.length} tranh chấp có giá trị > 5 triệu VND cần ưu tiên xử lý`,
            impact: `Tổng giá trị: ${formatCurrency(totalAmount)}`,
            count: highValueDisputes.length,
            amount: totalAmount,
            action: "/disputes",
            actionLabel: "Xử lý tranh chấp",
          });
        }
      }

      // 4. Host settlements aging > 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: oldSettlements } = await supabase
        .from("host_settlements")
        .select("id, remaining_amount, created_at")
        .neq("status", "PAID")
        .gt("remaining_amount", 0)
        .lt("created_at", thirtyDaysAgo);

      if (oldSettlements && oldSettlements.length > 0) {
        const totalAmount = oldSettlements.reduce((sum, s) => sum + Number(s.remaining_amount || 0), 0);
        detectedAnomalies.push({
          id: "aging-settlements",
          type: "AGING_DEBT",
          severity: "warning",
          title: "Quyết toán Host tồn đọng",
          description: `${oldSettlements.length} phiếu quyết toán chưa thanh toán > 30 ngày`,
          impact: `Tổng nợ: ${formatCurrency(totalAmount)}`,
          count: oldSettlements.length,
          amount: totalAmount,
          action: "/host-payables/settlement",
          actionLabel: "Thanh toán",
        });
      }

      // 5. Pending approvals > 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: oldPending } = await supabase
        .from("payment_requests")
        .select("id, proposed_amount")
        .eq("status", "PENDING")
        .lt("requested_at", sevenDaysAgo);

      if (oldPending && oldPending.length > 0) {
        const totalAmount = oldPending.reduce((sum, r) => sum + Number(r.proposed_amount || 0), 0);
        detectedAnomalies.push({
          id: "stale-pending",
          type: "STALE_APPROVAL",
          severity: "info",
          title: "Đề xuất chờ duyệt lâu",
          description: `${oldPending.length} đề xuất chờ duyệt > 7 ngày`,
          count: oldPending.length,
          amount: totalAmount,
          action: "/payments/requests",
          actionLabel: "Review & duyệt",
        });
      }

      // Sort by severity
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      detectedAnomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      return detectedAnomalies;
    },
  });

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case "critical":
        return {
          border: "border-destructive/30",
          bg: "bg-destructive/5",
          icon: "text-destructive",
          badge: "destructive" as const,
        };
      case "warning":
        return {
          border: "border-warning/30",
          bg: "bg-warning/5",
          icon: "text-warning",
          badge: "outline" as const,
        };
      default:
        return {
          border: "border-primary/30",
          bg: "bg-primary/5",
          icon: "text-primary",
          badge: "secondary" as const,
        };
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Anomaly Detection</h3>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!anomalies || anomalies.length === 0) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5">
        <div className="p-4 border-b border-success/20">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-success" />
            <h3 className="font-medium text-success">Anomaly Detection</h3>
          </div>
        </div>
        <div className="p-6 text-center">
          <p className="text-sm text-success">✓ Không phát hiện bất thường. Hệ thống hoạt động đúng quy trình.</p>
        </div>
      </div>
    );
  }

  const criticalCount = anomalies.filter(a => a.severity === "critical").length;
  const warningCount = anomalies.filter(a => a.severity === "warning").length;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Anomaly Detection</h3>
          </div>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-micro">
                {criticalCount} Critical
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="outline" className="text-micro border-warning text-warning">
                {warningCount} Warning
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="divide-y divide-border">
        {anomalies.map((anomaly) => {
          const styles = getSeverityStyles(anomaly.severity);
          return (
            <div
              key={anomaly.id}
              onClick={() => appNavigate(anomaly.action)}
              className={cn(
                "p-4 cursor-pointer transition-all hover:shadow-sm",
                styles.bg
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn("mt-0.5", styles.icon)}>
                  {anomaly.severity === "critical" ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium">{anomaly.title}</p>
                    <Badge variant={styles.badge} className="text-micro uppercase">
                      {anomaly.type.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{anomaly.description}</p>
                  {anomaly.impact && (
                    <p className="text-xs font-medium text-foreground">{anomaly.impact}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-medium text-primary">{anomaly.actionLabel}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
