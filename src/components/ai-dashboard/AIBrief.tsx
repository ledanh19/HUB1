import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, AlertCircle, Info, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { cn } from "@/lib/utils";

interface BriefItem {
  id: string;
  severity: "critical" | "attention" | "info";
  message: string;
  count?: number;
  amount?: number;
  action?: string;
  actionLabel?: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

export function AIBrief() {
  const { appNavigate } = useAppNavigate();
  const today = new Date().toISOString().split("T")[0];

  // Fetch data for AI brief generation
  const { data: briefItems, isLoading } = useQuery({
    queryKey: ["ai-brief-items", today],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const items: BriefItem[] = [];

      // 1. OTA payouts eligible but no payment request
      const { data: otaEligible } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id, total_amount_net")
        .eq("payment_type", "OTA_COLLECT")
        .eq("booking_status", "CHECKED_OUT")
        .lte("check_out_date", today);

      if (otaEligible && otaEligible.length > 0) {
        // Check which ones don't have payout
        const { data: payoutDetails } = await supabase
          .from("ota_payout_details")
          .select("unified_booking_id");

        const payoutBookingIds = new Set(payoutDetails?.map(p => p.unified_booking_id) || []);
        const eligibleWithoutPayout = otaEligible.filter(b => !payoutBookingIds.has(b.unified_booking_id));

        if (eligibleWithoutPayout.length > 0) {
          const totalAmount = eligibleWithoutPayout.reduce((sum, b) => sum + Number(b.total_amount_net || 0), 0);
          items.push({
            id: "ota-no-payout",
            severity: "critical",
            message: `${eligibleWithoutPayout.length} OTA booking đã checkout nhưng chưa tạo payout`,
            count: eligibleWithoutPayout.length,
            amount: totalAmount,
            action: "/ota-payouts",
            actionLabel: "Tạo payout",
          });
        }
      }

      // 2. Payment requests APPROVED but no cash-out
      const { data: approvedRequests } = await supabase
        .from("payment_requests")
        .select("id, proposed_amount")
        .eq("status", "APPROVED");

      if (approvedRequests && approvedRequests.length > 0) {
        const requestIds = approvedRequests.map(r => r.id);
        const { data: cashOuts } = await supabase
          .from("cash_outs")
          .select("payment_request_id")
          .in("payment_request_id", requestIds);

        const paidRequestIds = new Set(cashOuts?.map(c => c.payment_request_id) || []);
        const unpaidRequests = approvedRequests.filter(r => !paidRequestIds.has(r.id));

        if (unpaidRequests.length > 0) {
          const totalAmount = unpaidRequests.reduce((sum, r) => sum + Number(r.proposed_amount || 0), 0);
          items.push({
            id: "approved-no-cashout",
            severity: "critical",
            message: `${unpaidRequests.length} payment request đã duyệt nhưng chưa chi tiền`,
            count: unpaidRequests.length,
            amount: totalAmount,
            action: "/payments/requests",
            actionLabel: "Chi tiền",
          });
        }
      }

      // 3. Pending payment requests
      const { data: pendingRequests } = await supabase
        .from("payment_requests")
        .select("id, proposed_amount")
        .eq("status", "PENDING");

      if (pendingRequests && pendingRequests.length > 0) {
        const totalAmount = pendingRequests.reduce((sum, r) => sum + Number(r.proposed_amount || 0), 0);
        items.push({
          id: "pending-approval",
          severity: "attention",
          message: `${pendingRequests.length} đề xuất thanh toán đang chờ duyệt`,
          count: pendingRequests.length,
          amount: totalAmount,
          action: "/payments/requests",
          actionLabel: "Xem & duyệt",
        });
      }

      // 4. Open disputes
      const { data: disputes } = await supabase
        .from("ota_disputes")
        .select("id, amount_in_dispute")
        .in("status", ["OPEN", "IN_REVIEW"]);

      if (disputes && disputes.length > 0) {
        const totalAmount = disputes.reduce((sum, d) => sum + Number(d.amount_in_dispute || 0), 0);
        items.push({
          id: "open-disputes",
          severity: "critical",
          message: `${disputes.length} tranh chấp OTA cần xử lý`,
          count: disputes.length,
          amount: totalAmount,
          action: "/disputes",
          actionLabel: "Xử lý tranh chấp",
        });
      }

      // 5. Overdue host settlements
      const { data: overdueSettlements } = await supabase
        .from("host_settlements")
        .select("id, remaining_amount")
        .neq("status", "PAID")
        .gt("remaining_amount", 0);

      if (overdueSettlements && overdueSettlements.length > 0) {
        const totalAmount = overdueSettlements.reduce((sum, s) => sum + Number(s.remaining_amount || 0), 0);
        items.push({
          id: "overdue-settlements",
          severity: "attention",
          message: `${overdueSettlements.length} phiếu quyết toán Host chưa thanh toán`,
          count: overdueSettlements.length,
          amount: totalAmount,
          action: "/host-payables/settlement",
          actionLabel: "Thanh toán",
        });
      }

      // 6. Bookings pending room assignment
      const { data: bookings } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id")
        .neq("booking_status", "CANCELLED")
        .neq("booking_status", "NO_SHOW");

      if (bookings && bookings.length > 0) {
        const bookingIds = bookings.map(b => b.unified_booking_id);
        const { data: segments } = await supabase
          .from("host_supply_segments")
          .select("unified_booking_id")
          .in("unified_booking_id", bookingIds);

        const segmentBookingIds = new Set(segments?.map(s => s.unified_booking_id) || []);
        const pendingRooms = bookings.filter(b => !segmentBookingIds.has(b.unified_booking_id));

        if (pendingRooms.length > 0) {
          items.push({
            id: "pending-rooms",
            severity: "attention",
            message: `${pendingRooms.length} booking chưa được phân bổ phòng/host`,
            count: pendingRooms.length,
            action: "/bookings",
            actionLabel: "Phân bổ phòng",
          });
        }
      }

      // 7. Info: Today's check-ins
      const { data: todayCheckIns } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id")
        .eq("check_in_date", today)
        .neq("booking_status", "CANCELLED");

      if (todayCheckIns && todayCheckIns.length > 0) {
        items.push({
          id: "today-checkins",
          severity: "info",
          message: `${todayCheckIns.length} khách check-in hôm nay`,
          count: todayCheckIns.length,
          action: "/stays",
          actionLabel: "Xem danh sách",
        });
      }

      // Sort by severity: critical > attention > info
      const severityOrder = { critical: 0, attention: 1, info: 2 };
      items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      return items;
    },
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="h-4 w-4" />;
      case "attention":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-destructive/10 border-destructive/30 text-destructive";
      case "attention":
        return "bg-warning/10 border-warning/30 text-warning";
      default:
        return "bg-primary/10 border-primary/30 text-primary";
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-medium">AI Daily Brief</h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!briefItems || briefItems.length === 0) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-success" />
          <h3 className="font-medium text-success">AI Daily Brief</h3>
        </div>
        <p className="text-sm text-success">✓ Không có vấn đề cần xử lý ngay. Hệ thống hoạt động bình thường.</p>
      </div>
    );
  }

  const criticalCount = briefItems.filter(i => i.severity === "critical").length;
  const attentionCount = briefItems.filter(i => i.severity === "attention").length;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-medium">AI Daily Brief</h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {criticalCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {criticalCount} Critical
            </span>
          )}
          {attentionCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning">
              <AlertCircle className="h-3 w-3" />
              {attentionCount} Attention
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {briefItems.map((item) => (
          <div
            key={item.id}
            onClick={() => item.action && appNavigate(item.action)}
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm",
              getSeverityStyles(item.severity)
            )}
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {getSeverityIcon(item.severity)}
              </div>
              <div>
                <p className="text-sm font-medium">{item.message}</p>
                {item.amount && (
                  <p className="text-xs opacity-80">{formatCurrency(item.amount)}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {item.actionLabel && (
                <span className="text-xs font-medium hidden sm:inline">{item.actionLabel}</span>
              )}
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
