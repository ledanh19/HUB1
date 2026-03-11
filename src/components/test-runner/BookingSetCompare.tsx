/**
 * BookingSetCompare - Debug Component
 * So sánh booking_id sets giữa Booking Center và P&L để chứng minh mismatch
 * 
 * Purpose: Evidence-based debugging - không đoán, chỉ fix khi có bằng chứng
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, startOfQuarter, startOfYear, startOfDay } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, ArrowRight } from "lucide-react";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

interface BookingSetItem {
  unified_booking_id: string;
  guest_name: string | null;
  check_in_date: string;
  check_out_date: string;
  booking_date: string;
  booking_status: string;
  stay_status: string | null;
  total_amount_net: number | null;
  source: string;
}

type DateBasis = "check_out" | "check_in" | "booking_date";

export function BookingSetCompare() {
  const [period, setPeriod] = useState("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [dateBasis, setDateBasis] = useState<DateBasis>("check_out");
  const [showOnlyMismatch, setShowOnlyMismatch] = useState(false);

  // Calculate date range
  const dateRange = useMemo(() => {
    if (period === "custom" && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }

    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "today":
        startDate = startOfDay(now);
        break;
      case "week":
        startDate = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
        break;
      case "month":
        startDate = startOfMonth(now);
        break;
      case "quarter":
        startDate = startOfQuarter(now);
        break;
      case "year":
        startDate = startOfYear(now);
        break;
      case "jan_mar":
        // Specific test: 01/01 - 03/01/2026
        return { start: "2026-01-01", end: "2026-01-03" };
      default:
        startDate = startOfMonth(now);
    }

    return {
      start: format(startDate, "yyyy-MM-dd"),
      end: format(now, "yyyy-MM-dd"),
    };
  }, [period, customStart, customEnd]);

  // Get date field for query based on basis
  const getDateField = (basis: DateBasis) => {
    switch (basis) {
      case "check_out": return "check_out_date";
      case "check_in": return "check_in_date";
      case "booking_date": return "booking_date";
    }
  };

  // Query P&L Set (P&L logic: check_out_date, CONFIRMED, CHECKED_OUT or past due)
  const { data: pnlSet = [], isLoading: pnlLoading, refetch: refetchPnl } = useQuery({
    queryKey: ["set-compare-pnl", dateRange, dateBasis],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const dateField = getDateField(dateBasis);

      // Use RPC or manual query based on dateBasis
      // P&L always filters: booking_status=CONFIRMED, stay_status=CHECKED_OUT or check_out_date <= today
      let query = supabase
        .from("unified_bookings")
        .select("unified_booking_id, guest_name, check_in_date, check_out_date, booking_date, booking_status, stay_status, total_amount_net, source")
        .eq("booking_status", "CONFIRMED");

      // Apply date filter
      query = query.gte(dateField, dateRange.start).lte(dateField, dateRange.end);

      const { data, error } = await query;
      if (error) throw error;

      // Client-side filter: CHECKED_OUT or check_out_date <= today
      return (data || []).filter((b) => {
        return b.stay_status === "CHECKED_OUT" || b.check_out_date <= today;
      }) as BookingSetItem[];
    },
  });

  // Query Booking Center Set (all bookings, dateFilterType selectable)
  const { data: bcSet = [], isLoading: bcLoading, refetch: refetchBc } = useQuery({
    queryKey: ["set-compare-bc", dateRange, dateBasis],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const dateField = getDateField(dateBasis);

      // Booking Center: NO status filter, NO stay_status filter
      const { data, error } = await supabase
        .from("unified_bookings")
        .select("unified_booking_id, guest_name, check_in_date, check_out_date, booking_date, booking_status, stay_status, total_amount_net, source");

      if (error) throw error;

      // Client-side date filter (matching Booking Center behavior)
      return (data || []).filter((b) => {
        const dateValue = b[dateField];
        return dateValue && dateValue >= dateRange.start && dateValue <= dateRange.end;
      }) as BookingSetItem[];
    },
  });

  // Compute set differences
  const analysis = useMemo(() => {
    const pnlIds = new Set(pnlSet.map(b => b.unified_booking_id));
    const bcIds = new Set(bcSet.map(b => b.unified_booking_id));

    // In P&L but not in Booking Center (shouldn't happen normally)
    const onlyInPnl = pnlSet.filter(b => !bcIds.has(b.unified_booking_id));

    // In Booking Center but not in P&L (expected: CANCELLED, not CHECKED_OUT, etc.)
    const onlyInBc = bcSet.filter(b => !pnlIds.has(b.unified_booking_id));

    // In both
    const inBoth = pnlSet.filter(b => bcIds.has(b.unified_booking_id));

    // Categorize why bookings are only in BC (not in P&L)
    const bcCategories = {
      cancelled: onlyInBc.filter(b => b.booking_status === "CANCELLED"),
      pending: onlyInBc.filter(b => b.booking_status === "PENDING"),
      notCheckedOut: onlyInBc.filter(b =>
        b.booking_status === "CONFIRMED" &&
        b.stay_status !== "CHECKED_OUT" &&
        b.check_out_date > format(new Date(), "yyyy-MM-dd")
      ),
      other: onlyInBc.filter(b =>
        b.booking_status === "CONFIRMED" &&
        b.stay_status !== "CHECKED_OUT" &&
        b.check_out_date <= format(new Date(), "yyyy-MM-dd") &&
        !pnlIds.has(b.unified_booking_id)
      ),
    };

    // Totals
    const pnlTotal = pnlSet.reduce((sum, b) => sum + (b.total_amount_net || 0), 0);
    const bcTotal = bcSet.reduce((sum, b) => sum + (b.total_amount_net || 0), 0);
    const bcConfirmedTotal = bcSet
      .filter(b => b.booking_status === "CONFIRMED")
      .reduce((sum, b) => sum + (b.total_amount_net || 0), 0);

    return {
      pnlIds,
      bcIds,
      onlyInPnl,
      onlyInBc,
      inBoth,
      bcCategories,
      pnlTotal,
      bcTotal,
      bcConfirmedTotal,
      matchRate: bcIds.size > 0 ? (inBoth.length / bcIds.size * 100).toFixed(1) : "0",
    };
  }, [pnlSet, bcSet]);

  const handleRefresh = () => {
    refetchPnl();
    refetchBc();
  };

  const isLoading = pnlLoading || bcLoading;
  const isMatch = analysis.onlyInPnl.length === 0 && analysis.onlyInBc.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Booking Set Compare
            <Badge variant="outline">Debug Tool</Badge>
          </CardTitle>
          <CardDescription>
            So sánh booking_id giữa Booking Center và P&L để chứng minh mismatch
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Period Select */}
            <div className="space-y-2">
              <Label>Kỳ báo cáo</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hôm nay</SelectItem>
                  <SelectItem value="week">7 ngày qua</SelectItem>
                  <SelectItem value="month">Tháng này</SelectItem>
                  <SelectItem value="quarter">Quý này</SelectItem>
                  <SelectItem value="year">Năm nay</SelectItem>
                  <SelectItem value="jan_mar">Test: 01/01 - 03/01</SelectItem>
                  <SelectItem value="custom">Tuỳ chọn</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Basis */}
            <div className="space-y-2">
              <Label>Tính theo ngày</Label>
              <Select value={dateBasis} onValueChange={(v) => setDateBasis(v as DateBasis)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="check_out">Trả phòng (P&L mặc định)</SelectItem>
                  <SelectItem value="check_in">Nhận phòng</SelectItem>
                  <SelectItem value="booking_date">Ngày đặt (BC mặc định)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Date Range */}
            {period === "custom" && (
              <>
                <div className="space-y-2">
                  <Label>Từ ngày</Label>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Đến ngày</Label>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Refresh Button */}
            <div className="space-y-2 flex items-end">
              <Button onClick={handleRefresh} disabled={isLoading} variant="outline" className="gap-2">
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                Làm mới
              </Button>
            </div>
          </div>

          {/* Date Range Display */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm">
            <span className="font-medium">Kỳ phân tích:</span>{" "}
            {format(new Date(dateRange.start), "dd/MM/yyyy", { locale: vi })} -{" "}
            {format(new Date(dateRange.end), "dd/MM/yyyy", { locale: vi })}{" "}
            <span className="text-muted-foreground">| Tính theo: {
              dateBasis === "check_out" ? "Ngày Trả phòng" :
                dateBasis === "check_in" ? "Ngày Nhận phòng" : "Ngày đặt phòng"
            }</span>
          </div>
        </CardContent>
      </Card>

      {/* Summary Result */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* P&L Set */}
        <Card className="border-info/20 bg-info/10/50">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">P&L Set</div>
            <div className="text-2xl font-bold text-info">{pnlSet.length} bookings</div>
            <div className="text-sm text-info mt-1">
              Tổng: {formatCurrency(analysis.pnlTotal)}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Filter: CONFIRMED + (CHECKED_OUT or past due)
            </div>
          </CardContent>
        </Card>

        {/* Booking Center Set */}
        <Card className="border-success/20 bg-success/10/50">
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">Booking Center Set</div>
            <div className="text-2xl font-bold text-success">{bcSet.length} bookings</div>
            <div className="text-sm text-success mt-1">
              Tổng: {formatCurrency(analysis.bcTotal)}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              CONFIRMED only: {formatCurrency(analysis.bcConfirmedTotal)}
            </div>
          </CardContent>
        </Card>

        {/* Match Status */}
        <Card className={isMatch ? "border-success/20 bg-success/10/50" : "border-warning/20 bg-warning/10/50"}>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground mb-1">Kết quả đối chiếu</div>
            <div className={`text-2xl font-bold ${isMatch ? "text-success" : "text-warning"}`}>
              {isMatch ? (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6" /> KHỚP
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6" /> LỆCH
                </span>
              )}
            </div>
            <div className="text-sm mt-1">
              Match rate: {analysis.matchRate}%
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Chung: {analysis.inBoth.length} | Chỉ P&L: {analysis.onlyInPnl.length} | Chỉ BC: {analysis.onlyInBc.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mismatch Analysis */}
      {!isMatch && (
        <Card className="border-warning/20">
          <CardHeader>
            <CardTitle className="text-warning">Phân tích lệch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Only in P&L (rare) */}
            {analysis.onlyInPnl.length > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Chỉ có trong P&L ({analysis.onlyInPnl.length})</AlertTitle>
                <AlertDescription>
                  Các booking này có trong P&L nhưng không thấy ở Booking Center - cần kiểm tra!
                </AlertDescription>
              </Alert>
            )}

            {/* Only in Booking Center */}
            {analysis.onlyInBc.length > 0 && (
              <div className="space-y-3">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Chỉ có trong Booking Center ({analysis.onlyInBc.length})</AlertTitle>
                  <AlertDescription>
                    Các booking này có trong Booking Center nhưng không tính vào P&L
                  </AlertDescription>
                </Alert>

                {/* Breakdown by reason */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-destructive/10 rounded-lg text-center">
                    <div className="text-2xl font-bold text-destructive">{analysis.bcCategories.cancelled.length}</div>
                    <div className="text-xs text-destructive">Đã huỷ (CANCELLED)</div>
                  </div>
                  <div className="p-3 bg-warning/10 rounded-lg text-center">
                    <div className="text-2xl font-bold text-warning">{analysis.bcCategories.pending.length}</div>
                    <div className="text-xs text-warning">Chờ xác nhận (PENDING)</div>
                  </div>
                  <div className="p-3 bg-info/10 rounded-lg text-center">
                    <div className="text-2xl font-bold text-info">{analysis.bcCategories.notCheckedOut.length}</div>
                    <div className="text-xs text-info">Chưa checkout (tương lai)</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="text-2xl font-bold text-muted-foreground">{analysis.bcCategories.other.length}</div>
                    <div className="text-xs text-muted-foreground">Khác</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sample Bookings Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Chi tiết Booking (10 mẫu)</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="mismatch-only" className="text-sm">Chỉ hiện lệch</Label>
              <input
                id="mismatch-only"
                type="checkbox"
                checked={showOnlyMismatch}
                onChange={(e) => setShowOnlyMismatch(e.target.checked)}
                className="h-4 w-4"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="text-left p-2">Booking ID</th>
                  <th className="text-left p-2">Khách</th>
                  <th className="text-left p-2">Trả phòng</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Stay Status</th>
                  <th className="text-right p-2">Amount</th>
                  <th className="text-center p-2">P&L</th>
                  <th className="text-center p-2">BC</th>
                </tr>
              </thead>
              <tbody>
                {bcSet
                  .filter(b => !showOnlyMismatch || !analysis.pnlIds.has(b.unified_booking_id))
                  .slice(0, 50)
                  .map((booking) => {
                    const inPnl = analysis.pnlIds.has(booking.unified_booking_id);
                    return (
                      <tr key={booking.unified_booking_id} className={`border-b ${!inPnl ? "bg-warning/10" : ""}`}>
                        <td className="p-2 font-mono text-xs">{booking.unified_booking_id.slice(0, 8)}...</td>
                        <td className="p-2">{booking.guest_name || "—"}</td>
                        <td className="p-2">{booking.check_out_date}</td>
                        <td className="p-2">
                          <Badge variant={
                            booking.booking_status === "CONFIRMED" ? "default" :
                              booking.booking_status === "CANCELLED" ? "destructive" : "secondary"
                          }>
                            {booking.booking_status}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <Badge variant={booking.stay_status === "CHECKED_OUT" ? "default" : "outline"}>
                            {booking.stay_status || "—"}
                          </Badge>
                        </td>
                        <td className="p-2 text-right">{formatCurrency(booking.total_amount_net || 0)}</td>
                        <td className="p-2 text-center">
                          {inPnl ? <CheckCircle2 className="h-4 w-4 text-success mx-auto" /> : <XCircle className="h-4 w-4 text-destructive mx-auto" />}
                        </td>
                        <td className="p-2 text-center">
                          <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Conclusion */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground space-y-2">
            <p><strong>Kết luận Root Cause:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Booking Center mặc định filter theo <code>booking_date</code>, P&L filter theo <code>check_out_date</code></li>
              <li>Booking Center hiện TẤT CẢ status (CONFIRMED, CANCELLED, PENDING), P&L chỉ lấy CONFIRMED</li>
              <li>P&L chỉ tính booking đã CHECKED_OUT hoặc quá ngày checkout</li>
            </ul>
            <p className="mt-3">
              <ArrowRight className="inline h-4 w-4" />
              <strong>Fix đề xuất:</strong> Khi chọn cùng date basis (check_out) và filter status = CONFIRMED + stay_status = CHECKED_OUT,
              số Booking Center sẽ khớp với P&L.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
