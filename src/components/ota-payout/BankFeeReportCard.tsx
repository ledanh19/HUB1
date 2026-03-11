import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase";
import { SectionCard } from "@/components/layout/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OtaBadge } from "@/components/ui/ota-badge";
import { Download, Receipt, Loader2 } from "lucide-react";
import { OTA_SOURCES, normalizeOtaSource } from "@/hooks/useOtaPayouts";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN");
};

export function BankFeeReportCard() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
  const [channelFilter, setChannelFilter] = useState("all");

  const { data: bankFeeData = [], isLoading } = useQuery({
    queryKey: ["bank_fee_report", dateFrom, dateTo],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ota_payout_reconciliation_items")
        .select(`
          id,
          amount,
          note,
          created_at,
          payout_id,
          ota_payouts!inner (
            id,
            ota_source,
            ota_property_id,
            payout_date,
            payout_period_from,
            payout_period_to,
            reconciled_at,
            gross_amount
          )
        `)
        .eq("item_type", "BANK_TRANSFER_FEE")
        .gte("created_at", dateFrom)
        .lte("created_at", dateTo + "T23:59:59");

      if (error) throw error;
      return (data || []).map((item: any) => ({
        ...item,
        ota_source: normalizeOtaSource(item.ota_payouts?.ota_source || ""),
        ota_property_id: item.ota_payouts?.ota_property_id,
        payout_date: item.ota_payouts?.payout_date,
        gross_amount: item.ota_payouts?.gross_amount,
        reconciled_at: item.ota_payouts?.reconciled_at,
      }));
    },
  });

  const filteredData = useMemo(() => {
    if (channelFilter === "all") return bankFeeData;
    return bankFeeData.filter((d: any) => d.ota_source === channelFilter);
  }, [bankFeeData, channelFilter]);

  const totalFees = filteredData.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
  const payoutCount = new Set(filteredData.map((d: any) => d.payout_id)).size;

  // Group by OTA for summary
  const byChannel = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    filteredData.forEach((d: any) => {
      const key = d.ota_source || "UNKNOWN";
      const existing = map.get(key) || { count: 0, total: 0 };
      map.set(key, { count: existing.count + 1, total: existing.total + Number(d.amount || 0) });
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [filteredData]);

  const handleExportCSV = () => {
    const headers = ["OTA", "Property ID", "Payout Date", "Gross Amount", "Bank Fee", "Note", "Created At"];
    const rows = filteredData.map((d: any) => [
      d.ota_source,
      d.ota_property_id || "",
      d.payout_date || "",
      d.gross_amount || 0,
      d.amount,
      (d.note || "").replace(/,/g, ";"),
      d.created_at,
    ]);

    const csv = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bank-fees-ota-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          Phí chuyển khoản OTA (Bank fees)
        </span>
      }
      actions={
        <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={filteredData.length === 0}>
          <Download className="h-4 w-4 mr-1" />
          CSV
        </Button>
      }
    >
      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Từ ngày</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Đến ngày</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Kênh OTA</Label>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {OTA_SOURCES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <div className="p-2 rounded-lg bg-warning/10 border border-warning/20 w-full text-center">
            <p className="text-xs text-muted-foreground">Tổng phí NH</p>
            <p className="font-bold text-warning tabular-nums">{formatCurrency(totalFees)}</p>
            <p className="text-micro text-muted-foreground">{payoutCount} payout</p>
          </div>
        </div>
      </div>

      {/* Channel breakdown */}
      {byChannel.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {byChannel.map(([channel, data]) => (
            <div key={channel} className="px-3 py-1.5 rounded-md bg-muted/50 border border-border/60 text-xs">
              <span className="font-medium">{channel}</span>: {formatCurrency(data.total)} ({data.count})
            </div>
          ))}
        </div>
      )}

      {/* Detail table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredData.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          Không có phí chuyển khoản trong khoảng thời gian này
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OTA</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Ngày payout</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Phí NH</TableHead>
              <TableHead>Ghi chú</TableHead>
              <TableHead>Ngày GN</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell><OtaBadge source={item.ota_source} /></TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{item.ota_property_id || "—"}</TableCell>
                <TableCell className="text-sm">{formatDate(item.payout_date)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{formatCurrency(item.gross_amount || 0)}</TableCell>
                <TableCell className="text-right font-semibold text-warning tabular-nums">{formatCurrency(item.amount)}</TableCell>
                <TableCell className="text-sm max-w-[150px] truncate">{item.note || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(item.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
