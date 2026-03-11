import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { StatusBadge } from "@/components/ui/status-badge";
import { getHostPayableStatusVariant } from "@/constants/status-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/ui/filter-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  PiggyBank,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Download,
  Building2,
  FileSpreadsheet,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { KPIGrid } from "@/components/kpi/KPIGrid";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { vi } from "date-fns/locale";
import * as XLSX from "xlsx";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Settlement aging item - represents a SETTLED settlement with remaining balance
interface SettlementAgingItem {
  id: string;
  settlementCode: string;
  partnerId: string;
  partnerName: string;
  settlementDate: string; // finalized_at
  totalPayableAmount: number;
  totalPaidAmount: number;
  remainingAmount: number;
  totalHostCollected: number; // Host direct collection from guests
  agingDays: number;
  bucket: string;
  status: "UNPAID" | "PARTIALLY_PAID";
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN");
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "UNPAID":
      return "Chưa TT";
    case "PARTIALLY_PAID":
      return "Một phần";
    default:
      return status;
  }
};

// Calculate aging days from settlement_date (finalized_at) to as_of_date
const calculateAgingDays = (settlementDate: string, asOfDate: Date): number => {
  const refDate = new Date(settlementDate);
  const diffTime = asOfDate.getTime() - refDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

// Get aging bucket label
const getAgingBucket = (days: number): string => {
  if (days <= 7) return "0-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  return ">30";
};

const getAgingBucketVariant = (bucket: string) => {
  switch (bucket) {
    case "0-7":
      return "success";
    case "8-14":
      return "info";
    case "15-30":
      return "warning";
    case ">30":
      return "danger";
    default:
      return "default";
  }
};

type SortField = "partnerName" | "totalPayableAmount" | "totalPaidAmount" | "remainingAmount" | "agingDays" | "bucket" | "status";
type SortDirection = "asc" | "desc";

const ITEMS_PER_PAGE = 10;

export default function HostPayablesAgingPage() {
  const [hostFilter, setHostFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Date filter for settlement date range - default to undefined to show ALL data
  // Users can apply date filter if needed
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // As of date for aging calculation
  const [asOfDate, setAsOfDate] = useState<Date>(new Date());

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("agingDays");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch FINALIZED settlements with remaining balance
  // Only show settlements that have been finalized (not DRAFT) and have balance > 0
  const { data: settlements = [], isLoading } = useQuery({
    queryKey: ["settlements_aging_finalized"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // 1. Fetch only FINALIZED settlements (exclude DRAFT)
      const { data: rawSettlements, error } = await supabase
        .from("host_settlements")
        .select(`
          id,
          settlement_code,
          partner_id,
          status,
          total_payable_amount,
          total_host_collected,
          total_deposits_applied,
          total_prepaids_applied,
          finalized_at,
          created_at,
          partners(partner_name)
        `)
        .in("status", ["FINALIZED", "SETTLED", "PARTIALLY_PAID", "CLOSED"])
        .not("finalized_at", "is", null)
        .order("finalized_at", { ascending: false });

      if (error) throw error;
      if (!rawSettlements?.length) return [];

      const settlementIds = rawSettlements.map(s => s.id);

      // 2. COMPUTED: Get paid amounts from cashflow_entries
      const { data: cashflows } = await supabase
        .from("cashflow_entries")
        .select("source_id, amount")
        .eq("source_type", "HOST_SETTLEMENT_PAYMENT")
        .eq("direction", "OUT")
        .in("source_id", settlementIds);

      const paidBySettlement = new Map<string, number>();
      cashflows?.forEach((cf) => {
        const current = paidBySettlement.get(cf.source_id || "") || 0;
        paidBySettlement.set(cf.source_id || "", current + Number(cf.amount || 0));
      });

      // 3. Build settlements with computed values, filter those with remaining > 0
      return rawSettlements.map((s: any) => {
        // SOT: snapshot is authoritative for finalized settlements
        const snapshotNet = Number(s.remaining_amount ?? null);
        const recomputedNet = (s.total_payable_amount || 0) - (s.total_host_collected || 0)
          - (s.total_deposits_applied || 0) - (s.total_prepaids_applied || 0);
        const netAmount = (snapshotNet != null) ? snapshotNet : recomputedNet;
        const paidAmount = paidBySettlement.get(s.id) || 0;
        const remaining = Math.max(0, Math.abs(netAmount) - paidAmount);

        return {
          ...s,
          total_paid_amount: paidAmount, // COMPUTED value
          remaining_amount: remaining,   // COMPUTED value
          total_host_collected: s.total_host_collected || 0,
        };
      }).filter((s: any) => s.remaining_amount > 0); // Only show settlements with remaining balance
    },
  });

  // Fetch host partners for filter dropdown
  const { data: hosts = [] } = useQuery({
    queryKey: ["partners_for_aging_filter"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, partner_name")
        .in("partner_type", ["HOST_LANDLORD", "HOST_OPERATOR"])
        .eq("status", "active")
        .order("partner_name");

      if (error) throw error;
      return data || [];
    },
  });

  // Transform settlements to aging items
  const agingItems = useMemo((): SettlementAgingItem[] => {
    return settlements.map((s: any) => {
      // Use finalized_at if available, otherwise use created_at
      const referenceDate = s.finalized_at || s.created_at;
      const agingDays = referenceDate ? calculateAgingDays(referenceDate, asOfDate) : 0;
      const bucket = getAgingBucket(agingDays);
      const totalPaid = Number(s.total_paid_amount || 0);
      const remaining = Number(s.remaining_amount || 0);
      const totalHostCollected = Number(s.total_host_collected || 0);

      // Determine status based on payment
      let status: "UNPAID" | "PARTIALLY_PAID" = "UNPAID";
      if (totalPaid > 0 && remaining > 0) {
        status = "PARTIALLY_PAID";
      }

      return {
        id: s.id,
        settlementCode: s.settlement_code,
        partnerId: s.partner_id,
        partnerName: s.partners?.partner_name || "Unknown",
        settlementDate: referenceDate, // Use reference date
        totalPayableAmount: Number(s.total_payable_amount || 0),
        totalPaidAmount: totalPaid,
        remainingAmount: remaining,
        totalHostCollected,
        agingDays,
        bucket,
        status,
      };
    });
  }, [settlements, asOfDate]);

  // Apply filters
  const filteredItems = useMemo(() => {
    return agingItems.filter((item) => {
      const matchesSearch =
        item.settlementCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.partnerName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesHost = hostFilter === "all" || item.partnerId === hostFilter;
      const matchesBucket = bucketFilter === "all" || item.bucket === bucketFilter;

      // Date filter based on settlement date (finalized_at)
      let matchesDate = true;
      if (dateFrom || dateTo) {
        const settlementDate = new Date(item.settlementDate);
        if (dateFrom && settlementDate < dateFrom) matchesDate = false;
        if (dateTo) {
          const endOfDay = new Date(dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (settlementDate > endOfDay) matchesDate = false;
        }
      }

      return matchesSearch && matchesStatus && matchesHost && matchesBucket && matchesDate;
    });
  }, [agingItems, searchTerm, statusFilter, hostFilter, bucketFilter, dateFrom, dateTo]);

  // Sort filtered items
  const sortedItems = useMemo(() => {
    const bucketOrder: Record<string, number> = { "0-7": 1, "8-14": 2, "15-30": 3, ">30": 4 };

    return [...filteredItems].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "partnerName":
          comparison = a.partnerName.localeCompare(b.partnerName);
          break;
        case "totalPayableAmount":
          comparison = a.totalPayableAmount - b.totalPayableAmount;
          break;
        case "totalPaidAmount":
          comparison = a.totalPaidAmount - b.totalPaidAmount;
          break;
        case "remainingAmount":
          comparison = a.remainingAmount - b.remainingAmount;
          break;
        case "agingDays":
          comparison = a.agingDays - b.agingDays;
          break;
        case "bucket":
          comparison = (bucketOrder[a.bucket] || 0) - (bucketOrder[b.bucket] || 0);
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
        default:
          comparison = 0;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredItems, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedItems.length / ITEMS_PER_PAGE);
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedItems, currentPage]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, hostFilter, bucketFilter, dateFrom, dateTo]);

  // Handle sort click
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setCurrentPage(1);
  };

  // Sort icon component
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />;
    }
    return sortDirection === "asc"
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  // Calculate KPIs from filtered data - ALL based on remaining_amount
  const kpis = useMemo(() => {
    const totalRemaining = filteredItems.reduce((sum, p) => sum + p.remainingAmount, 0);
    const totalPaid = filteredItems.reduce((sum, p) => sum + p.totalPaidAmount, 0);
    const totalHostCollected = filteredItems.reduce((sum, p) => sum + p.totalHostCollected, 0);
    const overdueAmount = filteredItems
      .filter((p) => p.bucket === ">30")
      .reduce((sum, p) => sum + p.remainingAmount, 0);
    const overdueCount = filteredItems.filter((p) => p.bucket === ">30").length;

    return { totalRemaining, totalPaid, totalHostCollected, overdueAmount, overdueCount };
  }, [filteredItems]);

  // Summary by Host
  const hostSummary = useMemo(() => {
    const summary: Record<string, {
      hostName: string;
      total: number;
      bucket0_7: number;
      bucket8_14: number;
      bucket15_30: number;
      bucketOver30: number;
    }> = {};

    filteredItems.forEach((item) => {
      const hostId = item.partnerId;
      const hostName = item.partnerName;

      if (!summary[hostId]) {
        summary[hostId] = {
          hostName,
          total: 0,
          bucket0_7: 0,
          bucket8_14: 0,
          bucket15_30: 0,
          bucketOver30: 0,
        };
      }

      summary[hostId].total += item.remainingAmount;

      switch (item.bucket) {
        case "0-7":
          summary[hostId].bucket0_7 += item.remainingAmount;
          break;
        case "8-14":
          summary[hostId].bucket8_14 += item.remainingAmount;
          break;
        case "15-30":
          summary[hostId].bucket15_30 += item.remainingAmount;
          break;
        case ">30":
          summary[hostId].bucketOver30 += item.remainingAmount;
          break;
      }
    });

    return Object.values(summary).sort((a, b) => b.total - a.total);
  }, [filteredItems]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      "HOST AGING REPORT – SETTLED ONLY",
      `As of date: ${format(asOfDate, "dd/MM/yyyy", { locale: vi })}`,
      "",
      "Host,Mã quyết toán,Ngày quyết toán,Phải trả,Đã trả Host,Host thu từ khách,Còn lại,Tuổi nợ (ngày),Bucket,Trạng thái",
    ];

    const rows = filteredItems.map((p) =>
      [
        p.partnerName,
        p.settlementCode,
        formatDate(p.settlementDate),
        p.totalPayableAmount,
        p.totalPaidAmount,
        p.totalHostCollected,
        p.remainingAmount,
        p.agingDays,
        p.bucket,
        getStatusLabel(p.status),
      ].join(",")
    );

    const csvContent = [...headers, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `host_aging_settled_${format(asOfDate, "yyyyMMdd")}.csv`;
    link.click();

    toast.success("Đã xuất báo cáo CSV");
  };

  // Export to Excel with formatting
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Prepare detail data
    const detailData = [
      ["HOST AGING REPORT – SETTLED SETTLEMENTS ONLY"],
      [`Ngày chụp báo cáo (As of date): ${format(asOfDate, "dd/MM/yyyy", { locale: vi })}`],
      [`Kỳ quyết toán: ${dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: vi }) : "Tất cả"} - ${dateTo ? format(dateTo, "dd/MM/yyyy", { locale: vi }) : "Tất cả"}`],
      [],
      ["Host", "Mã quyết toán", "Ngày quyết toán", "Phải trả", "Đã trả Host", "Host thu từ khách", "Còn lại", "Tuổi nợ (ngày)", "Bucket", "Trạng thái"],
      ...filteredItems.map((p) => [
        p.partnerName,
        p.settlementCode,
        formatDate(p.settlementDate),
        p.totalPayableAmount,
        p.totalPaidAmount,
        p.totalHostCollected,
        p.remainingAmount,
        p.agingDays,
        p.bucket,
        getStatusLabel(p.status),
      ]),
    ];

    const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
    wsDetail["!cols"] = [
      { wch: 25 }, // Host
      { wch: 18 }, // Mã quyết toán
      { wch: 15 }, // Ngày QT
      { wch: 18 }, // Phải trả
      { wch: 18 }, // Đã trả
      { wch: 18 }, // Host thu
      { wch: 18 }, // Còn lại
      { wch: 15 }, // Tuổi nợ
      { wch: 10 }, // Bucket
      { wch: 15 }, // Trạng thái
    ];

    XLSX.utils.book_append_sheet(wb, wsDetail, "Chi tiết tuổi nợ");

    // Prepare summary data
    const summaryData = [
      ["HOST AGING REPORT – SETTLED SETTLEMENTS ONLY"],
      ["TỔNG HỢP THEO HOST"],
      [`Ngày chụp báo cáo: ${format(asOfDate, "dd/MM/yyyy", { locale: vi })}`],
      [],
      ["Host", "Tổng còn lại", "0-7 ngày", "8-14 ngày", "15-30 ngày", ">30 ngày"],
      ...hostSummary.map((row) => [
        row.hostName,
        row.total,
        row.bucket0_7,
        row.bucket8_14,
        row.bucket15_30,
        row.bucketOver30,
      ]),
      [],
      ["TỔNG KPI"],
      ["Tổng còn lại (chưa thanh toán)", kpis.totalRemaining],
      ["Tổng đã trả Host", kpis.totalPaid],
      ["Tổng Host thu từ khách", kpis.totalHostCollected],
      ["Quá hạn >30 ngày", kpis.overdueAmount],
      ["Số khoản quá hạn", kpis.overdueCount],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary["!cols"] = [
      { wch: 25 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
    ];

    XLSX.utils.book_append_sheet(wb, wsSummary, "Tổng hợp theo Host");

    XLSX.writeFile(wb, `host_aging_settled_${format(asOfDate, "yyyyMMdd")}.xlsx`);

    toast.success("Đã xuất báo cáo Excel");
  };

  return (
    <>
      <Header
        title="Báo cáo tuổi nợ Host"
        subtitle="AGING REPORT – CHỈ HIỂN THỊ NỢ ĐÃ QUYẾT TOÁN"
      />

      <PageContainer><SectionCard>
        {/* Info Banner - READ ONLY + COMPUTED */}
        <Alert className="border-primary/20 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-primary">
            <strong>Trang này chỉ dùng để XEM & BÁO CÁO.</strong> Chỉ hiển thị các quyết toán đã SETTLED có còn nợ.
            Tuổi nợ tính từ <strong>ngày quyết toán</strong>. Các chỉ số <em>Đã TT / Còn lại</em> được{" "}
            <strong>tính tự động từ các giao dịch chi tiền</strong>, không lưu trùng trong DB.
          </AlertDescription>
        </Alert>

        {/* KPIs - All based on remaining_amount */}
        <KPIGrid columns={4}>
          <MetricCard
            title="🔴 Tổng còn lại"
            value={formatCurrency(kpis.totalRemaining)}
            icon={PiggyBank}
            tone="danger"
            subtitle="Nợ đã quyết toán chưa thanh toán"
            className="border-2 border-destructive/40 bg-gradient-to-br from-destructive/5 to-destructive/10"
          />
          <MetricCard
            title="🟢 Tổng đã trả"
            value={formatCurrency(kpis.totalPaid)}
            icon={CheckCircle}
            tone="success"
            subtitle="Đã thanh toán"
            className="border-2 border-success/40 bg-gradient-to-br from-success/5 to-success/10"
          />
          <MetricCard
            title="🔴 Quá hạn >30 ngày"
            value={formatCurrency(kpis.overdueAmount)}
            icon={AlertTriangle}
            tone={kpis.overdueCount > 0 ? 'danger' : 'neutral'}
            subtitle={`${kpis.overdueCount} khoản ${kpis.overdueCount > 0 ? '⚠️ CẦN Xử LÝ GẤP' : ''}`}
            className={kpis.overdueCount > 0 ? 'border-2 border-destructive bg-gradient-to-br from-destructive/10 to-destructive/20 shadow-lg shadow-destructive/20' : 'border-2 border-border bg-muted'}
          />
          <MetricCard
            title="🟠 Số khoản còn nợ"
            value={filteredItems.length}
            icon={Clock}
            tone="warning"
            subtitle="Quyết toán chưa thanh toán đủ"
            className="border-2 border-warning/40 bg-gradient-to-br from-warning/5 to-warning/10"
          />
        </KPIGrid>

        {/* Filters */}
        <FilterBar
          title="Bộ lọc"
          subtitle="Lọc tuổi nợ phải trả host"
          hasActiveFilters={searchTerm !== "" || hostFilter !== "all" || statusFilter !== "all" || bucketFilter !== "all" || !!dateFrom || !!dateTo}
          onClearFilters={() => {
            setSearchTerm("");
            setHostFilter("all");
            setStatusFilter("all");
            setBucketFilter("all");
            setDateFrom(undefined);
            setDateTo(undefined);
          }}
        >
          <FilterBar.Field label="Tìm kiếm" colSpan={2}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm theo mã QT, host..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </FilterBar.Field>
          <FilterBar.Field label="Host">
            <Select value={hostFilter} onValueChange={setHostFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả Host" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả Host</SelectItem>
                {hosts.map((host) => (
                  <SelectItem key={host.id} value={host.id}>
                    {host.partner_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBar.Field>
          <FilterBar.Field label="Trạng thái TT">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả TT" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả TT</SelectItem>
                <SelectItem value="UNPAID">Chưa thanh toán</SelectItem>
                <SelectItem value="PARTIALLY_PAID">Một phần</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>
          <FilterBar.Field label="Bucket tuổi nợ">
            <Select value={bucketFilter} onValueChange={setBucketFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả bucket" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả bucket</SelectItem>
                <SelectItem value="0-7">0-7 ngày</SelectItem>
                <SelectItem value="8-14">8-14 ngày</SelectItem>
                <SelectItem value="15-30">15-30 ngày</SelectItem>
                <SelectItem value=">30">&gt;30 ngày</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>
          <FilterBar.Field label="Ngày quyết toán">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Calendar className="h-4 w-4" />
                  {!dateFrom && !dateTo
                    ? "Tất cả ngày"
                    : `${dateFrom ? format(dateFrom, "dd/MM/yy", { locale: vi }) : "Từ"} - ${dateTo ? format(dateTo, "dd/MM/yy", { locale: vi }) : "Đến"}`
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3 space-y-3">
                  <p className="text-xs text-muted-foreground font-medium">Khoảng ngày quyết toán</p>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Từ ngày</p>
                    <CalendarComponent
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      locale={vi}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Đến ngày</p>
                    <CalendarComponent
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      locale={vi}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setDateFrom(undefined);
                      setDateTo(undefined);
                    }}
                  >
                    Xoá bộ lọc ngày
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </FilterBar.Field>
          <FilterBar.Field label="As of date">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start bg-warning/10 border-warning/30 gap-2 text-warning hover:bg-warning/20">
                  <Clock className="h-4 w-4" />
                  {format(asOfDate, "dd/MM/yyyy", { locale: vi })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3 space-y-3">
                  <p className="text-xs text-muted-foreground font-medium">Ngày chụp báo cáo (As of date)</p>
                  <CalendarComponent
                    mode="single"
                    selected={asOfDate}
                    onSelect={(d) => d && setAsOfDate(d)}
                    locale={vi}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setAsOfDate(new Date())}
                  >
                    Đặt về hôm nay
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </FilterBar.Field>
        </FilterBar>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </Button>
        </div>

        {/* Summary by Host Table */}
        {hostSummary.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tổng hợp theo Host</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Host</TableHead>
                    <TableHead className="text-right font-semibold text-destructive">Tổng còn lại</TableHead>
                    <TableHead className="text-right text-success">0-7 ngày</TableHead>
                    <TableHead className="text-right text-info">8-14 ngày</TableHead>
                    <TableHead className="text-right text-warning">15-30 ngày</TableHead>
                    <TableHead className="text-right text-destructive">&gt;30 ngày</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hostSummary.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-right font-medium">{row.hostName}</TableCell>
                      <TableCell className="text-right font-bold text-destructive">{formatCurrency(row.total)}</TableCell>
                      <TableCell className="text-right text-success">{formatCurrency(row.bucket0_7)}</TableCell>
                      <TableCell className="text-right text-info">{formatCurrency(row.bucket8_14)}</TableCell>
                      <TableCell className="text-right text-warning">{formatCurrency(row.bucket15_30)}</TableCell>
                      <TableCell className="text-right text-destructive font-semibold">{formatCurrency(row.bucketOver30)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Detail Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Chi tiết tuổi nợ</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : paginatedItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Không có quyết toán nào còn nợ trong kỳ báo cáo
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("partnerName")}
                      >
                        <div className="flex items-center">
                          Host
                          <SortIcon field="partnerName" />
                        </div>
                      </TableHead>
                      <TableHead>Mã quyết toán</TableHead>
                      <TableHead>Ngày quyết toán</TableHead>
                      <TableHead
                        className="text-right cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("totalPayableAmount")}
                      >
                        <div className="flex items-center justify-end">
                          Phải trả
                          <SortIcon field="totalPayableAmount" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-right cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("totalPaidAmount")}
                      >
                        <div className="flex items-center justify-end">
                          Đã trả Host
                          <SortIcon field="totalPaidAmount" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right text-warning">
                        Host thu từ khách
                      </TableHead>
                      <TableHead
                        className="text-right cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("remainingAmount")}
                      >
                        <div className="flex items-center justify-end">
                          Còn lại
                          <SortIcon field="remainingAmount" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="text-right cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("agingDays")}
                      >
                        <div className="flex items-center justify-end">
                          Tuổi nợ
                          <SortIcon field="agingDays" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("bucket")}
                      >
                        <div className="flex items-center">
                          Bucket
                          <SortIcon field="bucket" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("status")}
                      >
                        <div className="flex items-center">
                          Trạng thái
                          <SortIcon field="status" />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.partnerName}</TableCell>
                        <TableCell className="font-mono text-sm">{item.settlementCode}</TableCell>
                        <TableCell className="text-right">{formatDate(item.settlementDate)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.totalPayableAmount)}</TableCell>
                        <TableCell className="text-right text-success">{formatCurrency(item.totalPaidAmount)}</TableCell>
                        <TableCell className="text-right text-warning">{formatCurrency(item.totalHostCollected)}</TableCell>
                        <TableCell className="text-right font-bold text-destructive">{formatCurrency(item.remainingAmount)}</TableCell>
                        <TableCell className="text-right">{item.agingDays} ngày</TableCell>
                        <TableCell>
                          <StatusBadge variant={getAgingBucketVariant(item.bucket)}>
                            {item.bucket} ngày
                          </StatusBadge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge variant={getHostPayableStatusVariant(item.status) as any}>
                            {getStatusLabel(item.status)}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Hiển thị {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, sortedItems.length)} / {sortedItems.length} khoản
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="flex items-center px-3 text-sm">
                        Trang {currentPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </SectionCard></PageContainer>
    </>
  );
}
