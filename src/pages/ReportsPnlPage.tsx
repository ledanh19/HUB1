import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { MetricCard } from "@/components/ui/metric-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Building2,
  Plane,
  Loader2,
  AlertTriangle,
  Users,
  Briefcase,
  Megaphone,
  Settings,
  BookOpen,
  ExternalLink,
  CalendarIcon,
  Scale,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
// SOT: Shared P&L calculator (same as Dashboard)
import { usePLCalculator } from "@/hooks/usePLCalculator";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";
import { formatCurrencyVND, formatMargin } from "@/lib/finance-formatters";
import { OtaAdjustmentDrilldownDialog } from "@/components/ota-payout/OtaAdjustmentDrilldownDialog";
import { PnlAuditDialog } from "@/components/reports/PnlAuditDialog";

export default function ReportsPnlPage() {
  const navigate = useNavigate();

  // Date range state - default to current month
  const [startDate, setStartDate] = useState<Date>(() => startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => new Date());
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  // Drilldown state
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownCategory, setDrilldownCategory] = useState<string | null>(null);

  // OTA adjustment date mode toggle
  const [adjDateMode, setAdjDateMode] = useState<"SETTLEMENT" | "ACCRUAL">("SETTLEMENT");

  // SOT: Use shared P&L calculator (same codepath as Dashboard)
  // Uses bookings_mirror.check_out_date + stay_status='CHECKED_OUT' as time key
  const plQuery = usePLCalculator({

    startDate,
    endDate,
    adjDateMode,
  });
  const { data: pl, isLoading, refetch: handleRefresh } = plQuery;

  usePrefetchMountLog('ReportsPnlPage', [
    { key: ['pl-calculator-room-revenue'], query: { status: plQuery.isLoading ? 'loading' : plQuery.isError ? 'error' : 'success', isFetching: plQuery.isLoading, dataUpdatedAt: Date.now() } },
  ]);

  // Derive values from contract for rendering
  const totalRevenue = pl.accrual.revenue;
  const roomRevenue = pl.accrual.revenue_room;
  const serviceRevenue = pl.accrual.revenue_service;
  const noShowRevenue = pl.accrual.revenue_no_show;
  const hostCost = pl.accrual.cogs_host;
  const serviceCost = pl.accrual.cogs_service;
  const totalCOGS = pl.accrual.cogs;
  const grossProfit = pl.accrual.gross_profit;
  const grossMargin = pl.accrual.gross_margin ?? 0;
  const opex = pl.accrual.opex;
  const netProfit = pl.accrual.net_profit;
  const netMargin = pl.accrual.net_margin ?? 0;
  const opexData = pl.accrual.opex_categories;

  // OTA adjustments
  const otaAdjNet = pl.accrual.ota_adjustments_net;
  const otaDisputeNet = pl.accrual.ota_dispute_net;
  const otaPenalties = pl.accrual.ota_penalties;
  const otaCompensation = pl.accrual.ota_compensation;
  const otaRoundingFx = pl.accrual.ota_rounding_fx_net;
  const otaUnderpayment = pl.accrual.ota_underpayment;
  const otaOther = pl.accrual.ota_adjustments_other_net;
  const hasOtaAdj = otaAdjNet !== 0 || otaDisputeNet !== 0 || otaPenalties !== 0 || otaCompensation !== 0 || otaRoundingFx !== 0 || otaUnderpayment !== 0 || otaOther !== 0;

  // Adjusted net profit = net_profit + OTA adjustments (shown transparently)
  const adjustedNetProfit = netProfit + otaAdjNet;

  const opexCategories = [
    { key: "SALARY", label: "Lương nhân sự", icon: Users },
    { key: "BHXH", label: "BHXH", icon: Users },
    { key: "OTA_COMMISSION", label: "Hoa hồng OTA", icon: Plane },
    { key: "OFFICE", label: "Văn phòng", icon: Briefcase },
    { key: "MARKETING", label: "Marketing", icon: Megaphone },
    { key: "BANK_FEE", label: "Phí ngân hàng", icon: DollarSign },
    { key: "TECHNOLOGY", label: "Chi phí hệ thống", icon: Settings },
    { key: "OTHER", label: "Chi phí khác", icon: TrendingDown },
  ];

  // Format date range for display
  const dateRangeDisplay = useMemo(() => {
    const fromStr = format(startDate, "dd/MM/yyyy");
    const toStr = format(endDate, "dd/MM/yyyy");
    return fromStr === toStr ? fromStr : `${fromStr} → ${toStr}`;
  }, [startDate, endDate]);

  // Date range for drilldown (yyyy-MM-dd format)
  const drilldownDateRange = useMemo(() => ({
    start: format(startDate, "yyyy-MM-dd"),
    end: format(endDate, "yyyy-MM-dd"),
  }), [startDate, endDate]);

  const openDrilldown = (category: string | null) => {
    setDrilldownCategory(category);
    setDrilldownOpen(true);
  };

  return (
    <>
      <Header
        title="Báo cáo P&L"
        subtitle="Profit & Loss theo kỳ kinh doanh"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date Range Picker */}
            <div className="flex items-center gap-1 text-sm">
              <span className="text-muted-foreground hidden sm:inline">Kỳ kinh doanh:</span>
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
              Kỳ kinh doanh: <span className="font-medium text-foreground">{dateRangeDisplay}</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
            <BookOpen className="h-3 w-3" />
            <span>Đang tính theo: <span className="font-medium">Ngày Trả phòng (Booking) + Đã trả phòng</span></span>
          </div>
        </div>

        {/* Warning Banner */}
        <Alert className="border-warning/50 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-sm">
            Báo cáo P&L phản ánh kết quả kinh doanh theo kỳ, không phản ánh số tiền thực có trong tài khoản.
            Vui lòng xem <span className="font-medium">Báo cáo Cashflow</span> để biết dòng tiền.
          </AlertDescription>
        </Alert>



        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard
                title="Tổng doanh thu"
                value={formatCurrencyVND(totalRevenue)}
                icon={DollarSign}
              />
              <MetricCard
                title="Tổng giá vốn"
                value={formatCurrencyVND(totalCOGS)}
                icon={TrendingDown}
              />
              <MetricCard
                title="Tổng chi phí"
                value={formatCurrencyVND(opex)}
                icon={TrendingDown}
              />
              <MetricCard
                title="Lợi nhuận thuần"
                value={formatCurrencyVND(netProfit)}
                icon={netProfit >= 0 ? TrendingUp : TrendingDown}
                className={netProfit >= 0 ? "border-success/50" : "border-destructive/50"}
              />
              <MetricCard
                title="Biên lợi nhuận"
                value={`${netMargin.toFixed(1)}%`}
                icon={Percent}
                className={netMargin >= 0 ? "border-success/50" : "border-destructive/50"}
              />
            </div>

            {/* A. DOANH THU */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-success" />
                </div>
                <h2 className="text-lg font-semibold">A. DOANH THU</h2>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Doanh thu phòng</p>
                      <p className="text-sm text-muted-foreground">OTA + Thu tại KS</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">{formatCurrencyVND(roomRevenue)}</p>
                    <p className="text-sm text-muted-foreground">
                      {totalRevenue > 0 ? ((roomRevenue / totalRevenue) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Plane className="h-5 w-5 text-info" />
                    <div>
                      <p className="font-medium">Doanh thu dịch vụ</p>
                      <p className="text-sm text-muted-foreground">Tour, Pickup, Addon</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">{formatCurrencyVND(serviceRevenue)}</p>
                    <p className="text-sm text-muted-foreground">
                      {totalRevenue > 0 ? ((serviceRevenue / totalRevenue) * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                </div>

                {noShowRevenue > 0 && (
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-warning" />
                      <div>
                        <p className="font-medium">Doanh thu No-show</p>
                        <p className="text-sm text-muted-foreground">Phí no-show đã ghi nhận (Ledger)</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">{formatCurrencyVND(noShowRevenue)}</p>
                      <p className="text-sm text-muted-foreground">
                        {totalRevenue > 0 ? ((noShowRevenue / totalRevenue) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <span className="font-semibold">Tổng doanh thu</span>
                  <span className="text-kpi font-semibold tabular-nums tracking-tight text-success">{formatCurrencyVND(totalRevenue)}</span>
                </div>
              </div>
            </div>

            {/* B. GIÁ VỐN (COGS) */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center">
                  <TrendingDown className="h-5 w-5 text-warning" />
                </div>
                <h2 className="text-lg font-semibold">B. GIÁ VỐN (COGS)</h2>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium">Giá vốn phòng</p>
                    <p className="text-sm text-muted-foreground">Trả Host</p>
                  </div>
                  <p className="text-lg font-semibold text-warning">-{formatCurrencyVND(Math.abs(hostCost))}</p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium">Giá vốn dịch vụ</p>
                    <p className="text-sm text-muted-foreground">Trả đối tác</p>
                  </div>
                  <p className="text-lg font-semibold text-warning">-{formatCurrencyVND(Math.abs(serviceCost))}</p>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <span className="font-semibold">Tổng giá vốn</span>
                  <span className="text-kpi font-semibold tabular-nums tracking-tight text-warning">-{formatCurrencyVND(Math.abs(totalCOGS))}</span>
                </div>

                <div className="pt-3 border-t border-dashed border-border flex items-center justify-between bg-success/5 p-4 rounded-lg -mx-2">
                  <span className="font-semibold">Lợi nhuận gộp = Doanh thu - Giá vốn</span>
                  <div className="text-right">
                    <span className={`text-kpi font-semibold tabular-nums tracking-tight ${grossProfit >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrencyVND(grossProfit)}
                    </span>
                    <p className="text-sm text-muted-foreground">Margin: {grossMargin.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* C. CHI PHÍ HOẠT ĐỘNG */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <TrendingDown className="h-5 w-5 text-destructive" />
                </div>
                <h2 className="text-lg font-semibold">C. CHI PHÍ HOẠT ĐỘNG (OPEX)</h2>
              </div>

              <div className="space-y-3">
                {opexCategories.map(({ key, label, icon: Icon }) => {
                  const amount = opexData?.[key] || 0;
                  if (amount === 0 && key !== "OTHER") return null;
                  return (
                    <div key={key} className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <p className="font-medium">{label}</p>
                      </div>
                      <p className="text-lg font-semibold text-destructive">-{formatCurrencyVND(Math.abs(amount))}</p>
                    </div>
                  );
                })}

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <span className="font-semibold">Tổng chi phí hoạt động</span>
                  <span className="text-kpi font-semibold tabular-nums tracking-tight text-destructive">-{formatCurrencyVND(Math.abs(opex))}</span>
                </div>
              </div>
            </div>

            {/* D. ĐIỀU CHỈNH OTA PAYOUT */}
            {hasOtaAdj && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-info/10 flex items-center justify-center">
                      <Scale className="h-5 w-5 text-info" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">D. ĐIỀU CHỈNH OTA PAYOUT</h2>
                      <p className="text-xs text-muted-foreground">
                        Tranh chấp, phạt, bồi thường, làm tròn — {adjDateMode === "ACCRUAL" ? "theo ngày phát sinh" : "theo ngày payout"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Settlement vs Accrual toggle */}
                    <div className="flex items-center border rounded-md overflow-hidden text-xs">
                      <button
                        className={`px-3 py-1.5 transition-colors ${adjDateMode === "SETTLEMENT" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                          }`}
                        onClick={() => setAdjDateMode("SETTLEMENT")}
                        title="Hiển thị theo ngày payout/settlement (entry_date)"
                      >
                        Theo payout
                      </button>
                      <button
                        className={`px-3 py-1.5 transition-colors ${adjDateMode === "ACCRUAL" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                          }`}
                        onClick={() => setAdjDateMode("ACCRUAL")}
                        title="Hiển thị theo ngày kinh tế phát sinh (economic_date, fallback entry_date)"
                      >
                        Theo phát sinh
                      </button>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => openDrilldown(null)}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Chi tiết tất cả
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {otaDisputeNet !== 0 && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openDrilldown(otaDisputeNet >= 0 ? "DISPUTE_WIN" : "DISPUTE_LOSS")}>
                      <div>
                        <p className="font-medium">Tranh chấp (net)</p>
                        <p className="text-sm text-muted-foreground">Thắng - Thua</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className={`text-lg font-semibold ${otaDisputeNet >= 0 ? "text-success" : "text-destructive"}`}>
                          {otaDisputeNet >= 0 ? "+" : ""}{formatCurrencyVND(otaDisputeNet)}
                        </p>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  )}

                  {otaPenalties !== 0 && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openDrilldown("OTA_PENALTY")}>
                      <div>
                        <p className="font-medium">Phạt OTA</p>
                        <p className="text-sm text-muted-foreground">Chargeback, penalty</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-semibold text-destructive">-{formatCurrencyVND(Math.abs(otaPenalties))}</p>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  )}

                  {otaCompensation !== 0 && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openDrilldown("OTA_COMPENSATION")}>
                      <div>
                        <p className="font-medium">Bồi thường OTA</p>
                        <p className="text-sm text-muted-foreground">Compensation nhận được</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-semibold text-success">+{formatCurrencyVND(Math.abs(otaCompensation))}</p>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  )}

                  {otaRoundingFx !== 0 && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openDrilldown("OTA_ROUNDING_FX")}>
                      <div>
                        <p className="font-medium">Làm tròn / FX</p>
                        <p className="text-sm text-muted-foreground">Rounding, tỉ giá</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className={`text-lg font-semibold ${otaRoundingFx >= 0 ? "text-success" : "text-warning"}`}>
                          {otaRoundingFx >= 0 ? "+" : ""}{formatCurrencyVND(otaRoundingFx)}
                        </p>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  )}

                  {otaUnderpayment !== 0 && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openDrilldown("OTA_UNDERPAYMENT")}>
                      <div>
                        <p className="font-medium">Thiếu tiền</p>
                        <p className="text-sm text-muted-foreground">Underpayment từ OTA</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-semibold text-destructive">-{formatCurrencyVND(Math.abs(otaUnderpayment))}</p>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  )}

                  {otaOther !== 0 && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => openDrilldown("OTA_ADJUSTMENT_OTHER")}>
                      <div>
                        <p className="font-medium">Điều chỉnh khác</p>
                        <p className="text-sm text-muted-foreground">Other adjustments</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className={`text-lg font-semibold ${otaOther >= 0 ? "text-success" : "text-warning"}`}>
                          {otaOther >= 0 ? "+" : ""}{formatCurrencyVND(otaOther)}
                        </p>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-border flex items-center justify-between">
                    <span className="font-semibold">Tổng điều chỉnh OTA</span>
                    <span className={`text-kpi font-semibold tabular-nums tracking-tight ${otaAdjNet >= 0 ? "text-success" : "text-destructive"}`}>
                      {otaAdjNet >= 0 ? "+" : ""}{formatCurrencyVND(otaAdjNet)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* E. LỢI NHUẬN */}
            <div className={`rounded-xl border-2 p-4 ${netProfit >= 0 ? "border-success/50 bg-success/5" : "border-destructive/50 bg-destructive/5"}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${netProfit >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                  {netProfit >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-success" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-destructive" />
                  )}
                </div>
                <h2 className="text-lg font-semibold">E. LỢI NHUẬN</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-card">
                  <p className="text-sm text-muted-foreground mb-2">Lợi nhuận gộp</p>
                  <p className={`text-hero-kpi font-bold tabular-nums tracking-tight ${grossProfit >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrencyVND(grossProfit)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Gross Margin: {grossMargin.toFixed(1)}%
                  </p>
                </div>

                <div className="text-center p-4 rounded-lg bg-card">
                  <p className="text-sm text-muted-foreground mb-2">Lợi nhuận thuần</p>
                  <p className={`text-[2.5rem] font-bold tabular-nums tracking-tight ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrencyVND(netProfit)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Net Margin: {netMargin.toFixed(1)}%
                  </p>
                </div>

                <div className="text-center p-4 rounded-lg bg-card">
                  <p className="text-sm text-muted-foreground mb-2">Biên lợi nhuận</p>
                  <p className={`text-[2.5rem] font-bold tabular-nums tracking-tight ${netMargin >= 0 ? "text-success" : "text-destructive"}`}>
                    {netMargin.toFixed(1)}%
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {netMargin >= 20 ? "Tốt" : netMargin >= 10 ? "Khá" : netMargin >= 0 ? "Thấp" : "Lỗ"}
                  </p>
                </div>
              </div>

              {/* Adjusted net profit when OTA adjustments exist */}
              {hasOtaAdj && otaAdjNet !== 0 && (
                <div className="mt-4 pt-4 border-t border-dashed border-border">
                  <div className="flex items-center justify-between px-4">
                    <div>
                      <p className="font-semibold text-sm">Lợi nhuận sau điều chỉnh OTA</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        = Lợi nhuận thuần ({formatCurrencyVND(netProfit)}) {otaAdjNet >= 0 ? "+" : ""} Điều chỉnh OTA ({otaAdjNet >= 0 ? "+" : ""}{formatCurrencyVND(otaAdjNet)})
                      </p>
                    </div>
                    <p className={`text-2xl font-bold tabular-nums tracking-tight ${adjustedNetProfit >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrencyVND(adjustedNetProfit)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* PHASE III: Drill-down to Ledger */}
            <Card className="border-dashed">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Trace bút toán (Ledger)</p>
                      <p className="text-sm text-muted-foreground">
                        Xem chi tiết các bút toán thu/chi trong kỳ để đối chiếu với P&L
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <PnlAuditDialog plData={pl} />
                    <Button
                      variant="outline"
                      onClick={() => navigate(`/settings/ledger-entries?from=${format(startDate, 'yyyy-MM-dd')}&to=${format(endDate, 'yyyy-MM-dd')}`)}
                      className="gap-2"
                    >
                      <BookOpen className="h-4 w-4" />
                      Xem Sổ cái
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Empty state */}
            {totalRevenue === 0 && totalCOGS === 0 && opex === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Chưa có dữ liệu doanh thu/chi phí trong kỳ này.</p>
                <p className="text-sm mt-1">
                  Dữ liệu được tính từ booking đã check-out (doanh thu), quyết toán Host/Dịch vụ (giá vốn),
                  và chi phí nội bộ đã xác nhận (OPEX).
                </p>
              </div>
            )}
          </>
        )}
      </SectionCard></PageContainer>

      {/* OTA Adjustment Drilldown Dialog */}
      <OtaAdjustmentDrilldownDialog
        open={drilldownOpen}
        onOpenChange={setDrilldownOpen}
        dateRange={drilldownDateRange}
        defaultCategory={drilldownCategory}
        plTotals={{ otaAdjNet: otaAdjNet }}
      />
    </>
  );
}
