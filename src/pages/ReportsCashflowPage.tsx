import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { MetricCard } from "@/components/ui/metric-card";
import { InlineKpiValue } from "@/components/kpi/InlineKpiValue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertTriangle,
  Building2,
  Users,
  Plane,
  CreditCard,
  Banknote,
  BookOpen,
  ExternalLink,
  CalendarIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatShortCurrency = (amount: number) => {
  if (amount >= 1000000000) return `${(amount / 1000000000).toFixed(1)}B`;
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toString();
};

export default function ReportsCashflowPage() {
  const navigate = useNavigate();
  const [directionFilter, setDirectionFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  // Date range state - default to current month
  const [startDate, setStartDate] = useState<Date>(() => startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => new Date());
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  // Calculate date range
  const dateRange = useMemo(() => {
    return {
      start: format(startDate, "yyyy-MM-dd"),
      end: format(endDate, "yyyy-MM-dd"),
      startDate,
      endDate,
    };
  }, [startDate, endDate]);

  // Fetch Cash IN from hotel_collects (only ROOMRISE as payee)
  const cashInQuery = useQuery({
    queryKey: ["cashflow-in", dateRange],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotel_collects")
        .select("id, amount_collected, collected_at, payment_method, related_type, payee_type, collection_type, unified_booking_id")
        .eq("payee_type", "ROOMRISE")
        .eq("collection_type", "COLLECT")
        .neq("status", "VOIDED")
        .gte("collected_at", `${dateRange.start}T00:00:00`)
        .lte("collected_at", `${dateRange.end}T23:59:59`)
        .order("collected_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
  const { data: cashInData, isLoading: cashInLoading, refetch: refetchCashIn } = cashInQuery;

  // Fetch bank fees from ledger_entries
  const bankFeeQuery = useQuery({
    queryKey: ["cashflow-bank-fees", dateRange],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id, amount, entry_date, counterparty_name, note")
        .eq("source_type", "OTA_PAYOUT_BANK_FEE")
        .eq("entry_type", "ORIGINAL")
        .eq("is_reversed", false)
        .gte("entry_date", dateRange.start)
        .lte("entry_date", dateRange.end);
      if (error) throw error;
      return data || [];
    },
  });
  const { data: bankFeeData = [], isLoading: bankFeeLoading } = bankFeeQuery;

  // Fetch Cash OUT from cash_outs
  const cashOutQuery = useQuery({
    queryKey: ["cashflow-out", dateRange],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_outs")
        .select("id, amount, paid_at, payment_method, payment_request_id")
        .eq("is_sample_data", false)
        .gte("paid_at", `${dateRange.start}T00:00:00`)
        .lte("paid_at", `${dateRange.end}T23:59:59`)
        .order("paid_at", { ascending: false });

      if (error) throw error;

      // Fetch payment request details for categorization
      if (data && data.length > 0) {
        const requestIds = data.map(d => d.payment_request_id).filter(Boolean);
        if (requestIds.length > 0) {
          const { data: requests } = await supabase
            .from("payment_requests")
            .select("id, payment_type, expense_category")
            .in("id", requestIds);

          const requestMap = new Map(requests?.map(r => [r.id, r]) || []);
          return data.map(d => ({
            ...d,
            payment_type: requestMap.get(d.payment_request_id)?.payment_type || "UNKNOWN",
            expense_category: requestMap.get(d.payment_request_id)?.expense_category,
          }));
        }
      }

      return data?.map(d => ({ ...d, payment_type: "UNKNOWN", expense_category: null })) || [];
    },
  });
  const { data: cashOutData, isLoading: cashOutLoading, refetch: refetchCashOut } = cashOutQuery;

  usePrefetchMountLog('ReportsCashflowPage', [
    { key: ['cashflow-in', dateRange], query: cashInQuery },
    { key: ['cashflow-out', dateRange], query: cashOutQuery },
  ]);

  const isLoading = cashInLoading || cashOutLoading || bankFeeLoading;

  // Calculate totals
  const totalCashIn = cashInData?.reduce((sum, e) => sum + Number(e.amount_collected || 0), 0) || 0;
  const totalBankFees = bankFeeData.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalCashOut = (cashOutData?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0) + totalBankFees;
  const netCashflow = totalCashIn - totalCashOut;

  // Group Cash IN by source
  const cashInBySource = useMemo(() => {
    if (!cashInData) return {};
    const grouped: Record<string, number> = {
      ROOM: 0,
      EXTRA: 0,
      SERVICE: 0,
    };
    cashInData.forEach(e => {
      const type = e.related_type || "ROOM";
      grouped[type] = (grouped[type] || 0) + Number(e.amount_collected || 0);
    });
    return grouped;
  }, [cashInData]);

  // Group Cash OUT by type
  const cashOutByType = useMemo(() => {
    if (!cashOutData) return {};
    const grouped: Record<string, number> = {
      HOST_PAYMENT: 0,
      SERVICE_PARTNER_PAYMENT: 0,
      INTERNAL_EXPENSE: 0,
      OTA_COMMISSION: 0,
      GUEST_REFUND: 0,
      OTA_BANK_FEE: totalBankFees,
    };
    cashOutData.forEach((e: any) => {
      const type = e.payment_type || "INTERNAL_EXPENSE";
      grouped[type] = (grouped[type] || 0) + Number(e.amount || 0);
    });
    return grouped;
  }, [cashOutData, totalBankFees]);

  // Prepare timeline data
  const timelineData = useMemo(() => {
    const dailyData: Record<string, { date: string; cashIn: number; cashOut: number; net: number }> = {};

    cashInData?.forEach(e => {
      const date = format(new Date(e.collected_at || ""), "dd/MM");
      if (!dailyData[date]) {
        dailyData[date] = { date, cashIn: 0, cashOut: 0, net: 0 };
      }
      dailyData[date].cashIn += Number(e.amount_collected || 0);
    });

    cashOutData?.forEach(e => {
      const date = format(new Date(e.paid_at || ""), "dd/MM");
      if (!dailyData[date]) {
        dailyData[date] = { date, cashIn: 0, cashOut: 0, net: 0 };
      }
      dailyData[date].cashOut += Number(e.amount || 0);
    });

    // Calculate net for each day
    Object.values(dailyData).forEach(d => {
      d.net = d.cashIn - d.cashOut;
    });

    return Object.values(dailyData).sort((a, b) => {
      const [dayA, monthA] = a.date.split("/").map(Number);
      const [dayB, monthB] = b.date.split("/").map(Number);
      return monthA !== monthB ? monthA - monthB : dayA - dayB;
    });
  }, [cashInData, cashOutData]);

  const handleRefresh = () => {
    refetchCashIn();
    refetchCashOut();
  };

  const cashInSourceLabels: Record<string, { label: string; icon: any }> = {
    ROOM: { label: "Tiền phòng", icon: Building2 },
    EXTRA: { label: "Phụ phí", icon: CreditCard },
    SERVICE: { label: "Dịch vụ", icon: Plane },
  };

  const cashOutTypeLabels: Record<string, { label: string; icon: any }> = {
    HOST_PAYMENT: { label: "Trả Host", icon: Users },
    SERVICE_PARTNER_PAYMENT: { label: "Trả đối tác DV", icon: Plane },
    INTERNAL_EXPENSE: { label: "Chi phí nội bộ", icon: Banknote },
    OTA_COMMISSION: { label: "Hoa hồng OTA", icon: CreditCard },
    GUEST_REFUND: { label: "Hoàn tiền khách", icon: Users },
    OTA_BANK_FEE: { label: "Phí NH (OTA Payout)", icon: CreditCard },
  };

  // Format date range for display
  const dateRangeDisplay = useMemo(() => {
    const fromStr = format(dateRange.startDate, "dd/MM/yyyy");
    const toStr = format(dateRange.endDate, "dd/MM/yyyy");
    return fromStr === toStr ? fromStr : `${fromStr} → ${toStr}`;
  }, [dateRange]);


  return (
    <>
      <Header
        title="Báo cáo Cashflow"
        subtitle="Dòng tiền thực tế vào/ra theo kỳ"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date Range Picker */}
            <div className="flex items-center gap-1 text-sm">
              <span className="text-muted-foreground hidden sm:inline">Kỳ dòng tiền:</span>
              <Popover open={startOpen} onOpenChange={setStartOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[140px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(startDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      if (date) {
                        setStartDate(date);
                        if (date > endDate) setEndDate(date);
                      }
                      setStartOpen(false);
                    }}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">→</span>
              <Popover open={endOpen} onOpenChange={setEndOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[140px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(endDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => {
                      if (date) {
                        setEndDate(date);
                        if (date < startDate) setStartDate(date);
                      }
                      setEndOpen(false);
                    }}
                    disabled={(date) => date < startDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        }
      />

      <PageContainer><SectionCard>
        {/* Basis Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              Kỳ dòng tiền: <span className="font-medium text-foreground">{dateRangeDisplay}</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
            <Wallet className="h-3 w-3" />
            <span>Đang tính theo: <span className="font-medium">collected_at / paid_at</span></span>
          </div>
        </div>

        {/* Warning Banner */}
        <Alert className="border-warning/50 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-sm">
            Cashflow phản ánh <strong>tiền đã thu – đã chi thực tế</strong>.
            Không bao gồm công nợ chưa thanh toán, OTA payout chưa nhận, hoặc nghĩa vụ phải trả trong tương lai.
          </AlertDescription>
        </Alert>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="Tổng tiền vào"
                value={formatCurrency(totalCashIn)}
                icon={ArrowDownLeft}
                className="border-success/50"
              />
              <MetricCard
                title="Tổng tiền ra"
                value={formatCurrency(totalCashOut)}
                icon={ArrowUpRight}
                className="border-destructive/50"
              />
              <MetricCard
                title="Net Cashflow"
                value={formatCurrency(netCashflow)}
                icon={netCashflow >= 0 ? TrendingUp : TrendingDown}
                className={netCashflow >= 0 ? "border-success/50" : "border-destructive/50"}
              />
              <MetricCard
                title="Số giao dịch"
                value={(cashInData?.length || 0) + (cashOutData?.length || 0)}
                subtitle="giao dịch"
                icon={Wallet}
              />
            </div>

            {/* Cash In & Out Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Cash In Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-success">
                    <ArrowDownLeft className="h-5 w-5" />
                    Phân tích Tiền vào (Cash-in)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(cashInBySource).map(([key, amount]) => {
                    const config = cashInSourceLabels[key] || { label: key, icon: Wallet };
                    const Icon = config.icon;
                    const percentage = totalCashIn > 0 ? ((amount / totalCashIn) * 100).toFixed(1) : 0;

                    return (
                      <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
                            <Icon className="h-4 w-4 text-success" />
                          </div>
                          <div>
                            <p className="font-medium">{config.label}</p>
                            <p className="text-xs text-muted-foreground">{percentage}%</p>
                          </div>
                        </div>
                        <p className="font-semibold text-success">+{formatCurrency(amount)}</p>
                      </div>
                    );
                  })}

                  <div className="pt-3 border-t border-border flex items-center justify-between">
                    <span className="font-semibold">Tổng tiền vào</span>
                    <InlineKpiValue value={`+${formatCurrency(totalCashIn)}`} tone="success" />
                  </div>
                </CardContent>
              </Card>

              {/* Cash Out Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <ArrowUpRight className="h-5 w-5" />
                    Phân tích Tiền ra (Cash-out)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(cashOutByType).map(([key, amount]) => {
                    if (amount === 0) return null;
                    const config = cashOutTypeLabels[key] || { label: key, icon: Wallet };
                    const Icon = config.icon;
                    const percentage = totalCashOut > 0 ? ((amount / totalCashOut) * 100).toFixed(1) : 0;

                    return (
                      <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                            <Icon className="h-4 w-4 text-destructive" />
                          </div>
                          <div>
                            <p className="font-medium">{config.label}</p>
                            <p className="text-xs text-muted-foreground">{percentage}%</p>
                          </div>
                        </div>
                        <p className="font-semibold text-destructive">-{formatCurrency(amount)}</p>
                      </div>
                    );
                  })}

                  {Object.values(cashOutByType).every(v => v === 0) && (
                    <p className="text-center text-muted-foreground py-4">Chưa có chi tiêu</p>
                  )}

                  <div className="pt-3 border-t border-border flex items-center justify-between">
                    <span className="font-semibold">Tổng tiền ra</span>
                    <InlineKpiValue value={`-${formatCurrency(totalCashOut)}`} tone="danger" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Timeline Chart */}
            {timelineData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Dòng tiền theo thời gian
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={timelineData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis
                          className="text-xs"
                          tickFormatter={(value) => formatShortCurrency(value)}
                        />
                        <Tooltip
                          formatter={(value: number) => formatCurrency(value)}
                          labelFormatter={(label) => `Ngày ${label}`}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                        <Legend />
                        <Bar
                          dataKey="cashIn"
                          name="Tiền vào"
                          fill="hsl(var(--success))"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="cashOut"
                          name="Tiền ra"
                          fill="hsl(var(--destructive))"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Net Cashflow Summary */}
            <Card className={netCashflow >= 0 ? "border-success/50 bg-success/5" : "border-destructive/50 bg-destructive/5"}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${netCashflow >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                      {netCashflow >= 0 ? (
                        <TrendingUp className="h-6 w-6 text-success" />
                      ) : (
                        <TrendingDown className="h-6 w-6 text-destructive" />
                      )}
                    </div>
                    <div>
                      <p className="text-lg font-semibold">Net Cashflow</p>
                      <p className="text-sm text-muted-foreground">
                        = Tiền vào ({formatCurrency(totalCashIn)}) - Tiền ra ({formatCurrency(totalCashOut)})
                      </p>
                    </div>
                  </div>
                  <p className={`text-[2.5rem] font-bold tabular-nums tracking-tight ${netCashflow >= 0 ? "text-success" : "text-destructive"}`}>
                    {netCashflow >= 0 ? "+" : ""}{formatCurrency(netCashflow)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* PHASE III: Drill-down to Ledger */}
            <Card className="border-dashed">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Chi tiết bút toán (Ledger)</p>
                      <p className="text-sm text-muted-foreground">
                        Xem tất cả bút toán kế toán trong kỳ - nguồn dữ liệu chính thức
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/settings/ledger-entries?from=${dateRange.start}&to=${dateRange.end}`)}
                    className="gap-2"
                  >
                    <BookOpen className="h-4 w-4" />
                    Xem Sổ cái
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </SectionCard></PageContainer>
    </>
  );
}
