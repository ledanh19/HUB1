import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  DollarSign,
  HelpCircle,
  Loader2,
  TrendingDown,
  TrendingUp,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { cn } from "@/lib/utils";

interface KPIData {
  receivables: { total: number; count: number; items: any[] };
  payables: { total: number; count: number; items: any[] };
  pendingApprovals: { total: number; count: number; items: any[] };
  cashForecast: { inflow: number; outflow: number; net: number };
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

interface ExplainModalProps {
  title: string;
  definition: string;
  dataSource: string;
  logic: string;
  onClose: () => void;
}

function ExplainModal({ title, definition, dataSource, logic, onClose }: ExplainModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Định nghĩa</p>
            <p>{definition}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Nguồn dữ liệu</p>
            <p className="font-mono text-xs bg-muted px-2 py-1 rounded">{dataSource}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Logic tính</p>
            <p className="text-muted-foreground">{logic}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Loại</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">Rule-based</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function KPIControlCards() {
  const { appNavigate } = useAppNavigate();
  const today = new Date().toISOString().split("T")[0];
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [explainModal, setExplainModal] = useState<string | null>(null);

  const { data: kpiData, isLoading } = useQuery({
    queryKey: ["ai-dashboard-kpis", today],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<KPIData> => {
      // 1. RECEIVABLES - OTA Collect đã checkout nhưng chưa thu
      const { data: otaBookings } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id, guest_name, total_amount_net, check_out_date, ota_source")
        .eq("payment_type", "OTA_COLLECT")
        .eq("booking_status", "CHECKED_OUT")
        .lte("check_out_date", today);

      const { data: payoutDetails } = await supabase
        .from("ota_payout_details")
        .select("unified_booking_id");

      const payoutBookingIds = new Set(payoutDetails?.map(p => p.unified_booking_id) || []);
      const receivableItems = (otaBookings || []).filter(b => !payoutBookingIds.has(b.unified_booking_id));
      const receivablesTotal = receivableItems.reduce((sum, b) => sum + Number(b.total_amount_net || 0), 0);

      // 2. PAYABLES - Host settlements chưa thanh toán
      const { data: settlements } = await supabase
        .from("host_settlements")
        .select("id, partner_id, remaining_amount, created_at")
        .neq("status", "PAID")
        .gt("remaining_amount", 0);

      const payableItems = settlements || [];
      const payablesTotal = payableItems.reduce((sum, s) => sum + Number(s.remaining_amount || 0), 0);

      // 3. PENDING APPROVALS
      const { data: pendingRequests } = await supabase
        .from("payment_requests")
        .select("id, proposed_amount, payment_type, requested_at, status")
        .eq("status", "PENDING");

      const pendingItems = (pendingRequests || []).map(r => ({ ...r, amount: r.proposed_amount, created_at: r.requested_at }));
      const pendingTotal = pendingItems.reduce((sum, r) => sum + Number(r.amount || 0), 0);

      // 4. CASH FORECAST (7 days)
      const next7Days = new Date();
      next7Days.setDate(next7Days.getDate() + 7);
      const next7DaysStr = next7Days.toISOString().split("T")[0];

      // Inflow: receivables
      const inflow = receivablesTotal;

      // Outflow: payables
      const outflow = payablesTotal;

      return {
        receivables: { total: receivablesTotal, count: receivableItems.length, items: receivableItems },
        payables: { total: payablesTotal, count: payableItems.length, items: payableItems },
        pendingApprovals: { total: pendingTotal, count: pendingItems.length, items: pendingItems },
        cashForecast: { inflow, outflow, net: inflow - outflow },
      };
    },
  });

  const explainContent: Record<string, { title: string; definition: string; dataSource: string; logic: string }> = {
    receivables: {
      title: "Receivables - Khoản cần thu",
      definition: "Tổng số tiền Roomrise có quyền thu nhưng chưa thu. Bao gồm OTA Collect đã checkout nhưng chưa tạo payout.",
      dataSource: "bookings_mirror, ota_payout_details",
      logic: "payment_type = OTA_COLLECT AND booking_status = CHECKED_OUT AND NOT EXISTS payout",
    },
    payables: {
      title: "Payables - Khoản cần chi",
      definition: "Tổng số tiền Roomrise phải trả cho host/đối tác đã xác nhận nghĩa vụ.",
      dataSource: "host_settlements",
      logic: "status != PAID AND remaining_amount > 0",
    },
    pending: {
      title: "Pending Approvals - Chờ duyệt",
      definition: "Các đề xuất thanh toán đang chờ phê duyệt.",
      dataSource: "payment_requests",
      logic: "status = PENDING",
    },
    forecast: {
      title: "Cash Forecast - Dự báo dòng tiền",
      definition: "Dự kiến thu/chi trong 7 ngày tới dựa trên receivables và payables hiện tại.",
      dataSource: "bookings_mirror, host_settlements",
      logic: "Inflow = Receivables due, Outflow = Payables due",
    },
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse">
            <div className="h-4 w-24 bg-muted rounded mb-3" />
            <div className="h-8 w-32 bg-muted rounded mb-2" />
            <div className="h-3 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      id: "receivables",
      title: "Receivables",
      subtitle: "Khoản cần thu",
      value: kpiData?.receivables.total || 0,
      count: kpiData?.receivables.count || 0,
      icon: ArrowDownLeft,
      color: "text-success",
      bgColor: "bg-success/10",
      borderColor: "border-success/30",
    },
    {
      id: "payables",
      title: "Payables",
      subtitle: "Khoản cần chi",
      value: kpiData?.payables.total || 0,
      count: kpiData?.payables.count || 0,
      icon: ArrowUpRight,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      borderColor: "border-destructive/30",
    },
    {
      id: "pending",
      title: "Pending",
      subtitle: "Chờ duyệt",
      value: kpiData?.pendingApprovals.total || 0,
      count: kpiData?.pendingApprovals.count || 0,
      icon: Clock,
      color: "text-warning",
      bgColor: "bg-warning/10",
      borderColor: "border-warning/30",
    },
    {
      id: "forecast",
      title: "Cash Position",
      subtitle: "7 ngày tới",
      value: kpiData?.cashForecast.net || 0,
      inflow: kpiData?.cashForecast.inflow || 0,
      outflow: kpiData?.cashForecast.outflow || 0,
      icon: DollarSign,
      color: (kpiData?.cashForecast.net || 0) >= 0 ? "text-success" : "text-destructive",
      bgColor: (kpiData?.cashForecast.net || 0) >= 0 ? "bg-success/10" : "bg-destructive/10",
      borderColor: (kpiData?.cashForecast.net || 0) >= 0 ? "border-success/30" : "border-destructive/30",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div
            key={card.id}
            onClick={() => setActivePanel(card.id)}
            className={cn(
              "relative rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md",
              card.borderColor
            )}
          >
            {/* Explain button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExplainModal(card.id);
              }}
              className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <div className={cn("p-1.5 rounded-md", card.bgColor)}>
                <card.icon className={cn("h-4 w-4", card.color)} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{card.title}</p>
                <p className="text-micro text-muted-foreground/70">{card.subtitle}</p>
              </div>
            </div>

            <p className={cn("text-xl font-bold", card.color)}>
              {formatCurrency(card.value)}
            </p>

            {card.id === "forecast" ? (
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <TrendingUp className="h-3 w-3 text-success" />
                  {formatCurrency(card.inflow || 0)}
                </span>
                <span className="flex items-center gap-0.5">
                  <TrendingDown className="h-3 w-3 text-destructive" />
                  {formatCurrency(card.outflow || 0)}
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                {card.count} {card.id === "pending" ? "đề xuất" : "khoản"}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Quick Panel Sheet */}
      <Sheet open={!!activePanel} onOpenChange={() => setActivePanel(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {activePanel === "receivables" && "Receivables - Khoản cần thu"}
              {activePanel === "payables" && "Payables - Khoản cần chi"}
              {activePanel === "pending" && "Pending Approvals"}
              {activePanel === "forecast" && "Cash Position Forecast"}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {activePanel === "receivables" && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tổng cộng</span>
                  <span className="text-lg font-bold text-success">{formatCurrency(kpiData?.receivables.total || 0)}</span>
                </div>
                <div className="space-y-2">
                  {kpiData?.receivables.items.slice(0, 10).map((item: any) => (
                    <div key={item.unified_booking_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">{item.guest_name}</p>
                        <p className="text-xs text-muted-foreground">{item.ota_source} • {item.check_out_date}</p>
                      </div>
                      <p className="text-sm font-medium">{formatCurrency(Number(item.total_amount_net || 0))}</p>
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={() => { setActivePanel(null); appNavigate("/ota-payouts"); }}>
                  Tạo Payout Request
                </Button>
              </>
            )}

            {activePanel === "payables" && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tổng cộng</span>
                  <span className="text-lg font-bold text-destructive">{formatCurrency(kpiData?.payables.total || 0)}</span>
                </div>
                <div className="space-y-2">
                  {kpiData?.payables.items.slice(0, 10).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">Settlement #{item.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString("vi-VN")}</p>
                      </div>
                      <p className="text-sm font-medium">{formatCurrency(Number(item.remaining_amount || 0))}</p>
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={() => { setActivePanel(null); appNavigate("/payments/requests"); }}>
                  Tạo Payment Request
                </Button>
              </>
            )}

            {activePanel === "pending" && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tổng cộng</span>
                  <span className="text-lg font-bold text-warning">{formatCurrency(kpiData?.pendingApprovals.total || 0)}</span>
                </div>
                <div className="space-y-2">
                  {kpiData?.pendingApprovals.items.slice(0, 10).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">{item.payment_type}</p>
                        <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString("vi-VN")}</p>
                      </div>
                      <p className="text-sm font-medium">{formatCurrency(Number(item.amount || 0))}</p>
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={() => { setActivePanel(null); appNavigate("/payments/requests"); }}>
                  Xem & Duyệt
                </Button>
              </>
            )}

            {activePanel === "forecast" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-success/10 border border-success/30">
                    <p className="text-xs text-success font-medium">Dự kiến thu</p>
                    <p className="text-xl font-bold text-success">{formatCurrency(kpiData?.cashForecast.inflow || 0)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <p className="text-xs text-destructive font-medium">Dự kiến chi</p>
                    <p className="text-xl font-bold text-destructive">{formatCurrency(kpiData?.cashForecast.outflow || 0)}</p>
                  </div>
                </div>
                <div className={cn(
                  "p-4 rounded-lg border",
                  (kpiData?.cashForecast.net || 0) >= 0
                    ? "bg-success/5 border-success/30"
                    : "bg-destructive/5 border-destructive/30"
                )}>
                  <p className="text-xs text-muted-foreground">Net Position (7 ngày)</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    (kpiData?.cashForecast.net || 0) >= 0 ? "text-success" : "text-destructive"
                  )}>
                    {formatCurrency(kpiData?.cashForecast.net || 0)}
                  </p>
                </div>
                <Button variant="outline" className="w-full" onClick={() => { setActivePanel(null); appNavigate("/reports/cashflow"); }}>
                  Xem Cashflow Report
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Explain Modal */}
      {explainModal && explainContent[explainModal] && (
        <ExplainModal
          {...explainContent[explainModal]}
          onClose={() => setExplainModal(null)}
        />
      )}
    </>
  );
}
