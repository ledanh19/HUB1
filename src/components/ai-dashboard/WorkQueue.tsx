import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Loader2
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { cn } from "@/lib/utils";

interface QueueItem {
  id: string;
  entityId: string;
  title: string;
  subtitle: string;
  amount: number;
  dueDate?: string;
  status: string;
  riskTag?: "high" | "medium" | "low";
  priorityScore: number;
  action: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const getRiskBadge = (risk?: string) => {
  switch (risk) {
    case "high":
      return <Badge variant="destructive" className="text-micro">HIGH</Badge>;
    case "medium":
      return <Badge variant="outline" className="text-micro border-warning text-warning">MED</Badge>;
    default:
      return null;
  }
};

export function WorkQueue() {
  const { appNavigate } = useAppNavigate();
  const today = new Date().toISOString().split("T")[0];
  const [activeTab, setActiveTab] = useState("collect");

  const { data: queueData, isLoading } = useQuery({
    queryKey: ["ai-work-queue", today],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // TO COLLECT
      const collectItems: QueueItem[] = [];

      // OTA Payouts to collect
      const { data: otaBookings } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id, guest_name, total_amount_net, check_out_date, ota_source")
        .eq("payment_type", "OTA_COLLECT")
        .eq("booking_status", "CHECKED_OUT")
        .order("check_out_date", { ascending: true })
        .limit(50);

      const { data: payoutDetails } = await supabase
        .from("ota_payout_details")
        .select("unified_booking_id");

      const payoutBookingIds = new Set(payoutDetails?.map(p => p.unified_booking_id) || []);

      (otaBookings || [])
        .filter(b => !payoutBookingIds.has(b.unified_booking_id))
        .forEach((b, index) => {
          const daysSinceCheckout = Math.floor((new Date().getTime() - new Date(b.check_out_date).getTime()) / (1000 * 60 * 60 * 24));
          const amount = Number(b.total_amount_net) || 0;
          const priorityScore = Math.log(amount + 1) * 10 + daysSinceCheckout * 5;

          collectItems.push({
            id: `ota-${b.unified_booking_id}`,
            entityId: b.unified_booking_id,
            title: b.guest_name,
            subtitle: `${b.ota_source} • Checkout ${b.check_out_date}`,
            amount,
            dueDate: b.check_out_date,
            status: "Chưa tạo payout",
            riskTag: daysSinceCheckout > 14 ? "high" : daysSinceCheckout > 7 ? "medium" : undefined,
            priorityScore,
            action: "/ota-payouts",
          });
        });

      collectItems.sort((a, b) => b.priorityScore - a.priorityScore);

      // TO PAY
      const payItems: QueueItem[] = [];

      // Approved payment requests without cash-out
      const { data: approvedRequests } = await supabase
        .from("payment_requests")
        .select("id, proposed_amount, payment_type, requested_at")
        .eq("status", "APPROVED");

      const requestIds = (approvedRequests || []).map(r => r.id);
      const { data: cashOuts } = await supabase
        .from("cash_outs")
        .select("payment_request_id")
        .in("payment_request_id", requestIds.length > 0 ? requestIds : ["none"]);

      const paidRequestIds = new Set(cashOuts?.map(c => c.payment_request_id) || []);

      (approvedRequests || [])
        .filter(r => !paidRequestIds.has(r.id))
        .forEach((r) => {
          const daysSinceApproved = Math.floor((new Date().getTime() - new Date(r.requested_at).getTime()) / (1000 * 60 * 60 * 24));
          const amount = Number(r.proposed_amount) || 0;
          const priorityScore = Math.log(amount + 1) * 10 + daysSinceApproved * 5;

          payItems.push({
            id: `pay-${r.id}`,
            entityId: r.id,
            title: r.payment_type,
            subtitle: `Approved ${new Date(r.requested_at).toLocaleDateString("vi-VN")}`,
            amount,
            status: "Chờ chi tiền",
            riskTag: daysSinceApproved > 7 ? "high" : daysSinceApproved > 3 ? "medium" : undefined,
            priorityScore,
            action: "/payments/cashout",
          });
        });

      // Pending host settlements
      const { data: settlements } = await supabase
        .from("host_settlements")
        .select("id, remaining_amount, created_at")
        .neq("status", "PAID")
        .gt("remaining_amount", 0)
        .limit(20);

      (settlements || []).forEach((s) => {
        const amount = Number(s.remaining_amount) || 0;
        const priorityScore = Math.log(amount + 1) * 10;

        payItems.push({
          id: `settlement-${s.id}`,
          entityId: s.id,
          title: `Settlement #${s.id.slice(0, 8)}`,
          subtitle: `Created ${new Date(s.created_at).toLocaleDateString("vi-VN")}`,
          amount,
          status: "Chưa thanh toán",
          priorityScore,
          action: "/host-payables/settlement",
        });
      });

      payItems.sort((a, b) => b.priorityScore - a.priorityScore);

      // TO RECONCILE
      const reconcileItems: QueueItem[] = [];

      // Pending payment requests (need approval)
      const { data: pendingRequests } = await supabase
        .from("payment_requests")
        .select("id, proposed_amount, payment_type, requested_at")
        .eq("status", "PENDING")
        .limit(20);

      (pendingRequests || []).forEach((r) => {
        const amount = Number(r.proposed_amount) || 0;
        const priorityScore = Math.log(amount + 1) * 10;

        reconcileItems.push({
          id: `pending-${r.id}`,
          entityId: r.id,
          title: r.payment_type,
          subtitle: `Tạo ${new Date(r.requested_at).toLocaleDateString("vi-VN")}`,
          amount,
          status: "Chờ duyệt",
          priorityScore,
          action: "/payments/requests",
        });
      });

      reconcileItems.sort((a, b) => b.priorityScore - a.priorityScore);

      return {
        collect: collectItems,
        pay: payItems,
        reconcile: reconcileItems,
      };
    },
  });

  const renderQueueList = (items: QueueItem[]) => {
    if (items.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Không có công việc cần xử lý</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-border">
        {items.slice(0, 10).map((item) => (
          <div
            key={item.id}
            onClick={() => appNavigate(item.action)}
            className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{item.title}</p>
                {getRiskBadge(item.riskTag)}
              </div>
              <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <p className="text-sm font-medium">{formatCurrency(item.amount)}</p>
                <p className="text-xs text-muted-foreground">{item.status}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="p-4 border-b border-border">
          <h3 className="font-medium">Work Queue</h3>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Work Queue</h3>
          </div>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="collect" className="text-xs gap-1.5">
              <ArrowDownLeft className="h-3.5 w-3.5" />
              To Collect
              {(queueData?.collect.length || 0) > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-micro">
                  {queueData?.collect.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pay" className="text-xs gap-1.5">
              <ArrowUpRight className="h-3.5 w-3.5" />
              To Pay
              {(queueData?.pay.length || 0) > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-micro">
                  {queueData?.pay.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="reconcile" className="text-xs gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              To Reconcile
              {(queueData?.reconcile.length || 0) > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-micro">
                  {queueData?.reconcile.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="collect" className="m-0">
          {renderQueueList(queueData?.collect || [])}
        </TabsContent>
        <TabsContent value="pay" className="m-0">
          {renderQueueList(queueData?.pay || [])}
        </TabsContent>
        <TabsContent value="reconcile" className="m-0">
          {renderQueueList(queueData?.reconcile || [])}
        </TabsContent>
      </Tabs>
    </div>
  );
}
