import { useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterBar } from "@/components/ui/filter-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Download,
  TrendingUp,
  TrendingDown,
  DollarSign,
  RotateCcw,
  XCircle,
  Receipt,
  BarChart3,
  Loader2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { HEAVY_QUERY_OPTIONS } from "@/lib/navigation/heavyQueryOptions";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const COLORS = ["hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--destructive))"];

interface CollectionStats {
  date: string;
  collect: number;
  refund: number;
  void: number;
  net: number;
}

export default function CollectionReportsPage() {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);
  const [granularity, setGranularity] = useState<"daily" | "monthly">("daily");

  // Fetch collections data
  const collectionQuery = useQuery({
    queryKey: ["collection-reports", startDate, endDate],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    ...HEAVY_QUERY_OPTIONS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotel_collects")
        .select("*")
        .gte("collected_at", `${startDate}T00:00:00`)
        .lte("collected_at", `${endDate}T23:59:59`)
        .order("collected_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });
  const { data: collections = [], isLoading, refetch } = collectionQuery;

  usePrefetchMountLog('CollectionReportsPage', [
    { key: ['collection-reports', startDate, endDate], query: collectionQuery },
  ]);

  // Calculate summary stats
  const stats = {
    totalCollected: collections
      .filter((c) => c.collection_type === "COLLECT")
      .reduce((sum, c) => sum + Number(c.amount_collected), 0),
    totalRefunded: collections
      .filter((c) => c.collection_type === "REFUND")
      .reduce((sum, c) => sum + Math.abs(Number(c.amount_collected)), 0),
    totalVoided: collections
      .filter((c) => c.collection_type === "VOID")
      .reduce((sum, c) => sum + Number(c.amount_collected), 0),
    collectCount: collections.filter((c) => c.collection_type === "COLLECT").length,
    refundCount: collections.filter((c) => c.collection_type === "REFUND").length,
    voidCount: collections.filter((c) => c.collection_type === "VOID").length,
  };

  stats.totalVoided = collections
    .filter((c) => c.collection_type === "COLLECT")
    .filter((c) => collections.some(
      (v) => v.related_collection_id === c.id && v.collection_type === "VOID"
    ))
    .reduce((sum, c) => sum + Number(c.amount_collected), 0);

  const netCollected = stats.totalCollected - stats.totalRefunded - stats.totalVoided;

  // Group data by date/month for chart
  const chartData: CollectionStats[] = (() => {
    const groupedData: Record<string, CollectionStats> = {};

    collections.forEach((c) => {
      if (!c.collected_at) return;

      const date = new Date(c.collected_at);
      const key = granularity === "daily"
        ? date.toISOString().split("T")[0]
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!groupedData[key]) {
        groupedData[key] = { date: key, collect: 0, refund: 0, void: 0, net: 0 };
      }

      if (c.collection_type === "COLLECT") {
        groupedData[key].collect += Number(c.amount_collected);
      } else if (c.collection_type === "REFUND") {
        groupedData[key].refund += Math.abs(Number(c.amount_collected));
      }
    });

    // Calculate voids per period
    collections.forEach((c) => {
      if (c.collection_type !== "VOID" || !c.related_collection_id) return;
      const originalCollection = collections.find(
        (oc) => oc.id === c.related_collection_id
      );
      if (!originalCollection?.collected_at) return;

      const date = new Date(originalCollection.collected_at);
      const key = granularity === "daily"
        ? date.toISOString().split("T")[0]
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (groupedData[key]) {
        groupedData[key].void += Number(originalCollection.amount_collected);
      }
    });

    // Calculate net
    Object.values(groupedData).forEach((d) => {
      d.net = d.collect - d.refund - d.void;
    });

    return Object.values(groupedData).sort((a, b) => a.date.localeCompare(b.date));
  })();

  // Pie chart data
  const pieData = [
    { name: "Thu tiền", value: stats.totalCollected, color: COLORS[0] },
    { name: "Hoàn tiền", value: stats.totalRefunded, color: COLORS[1] },
    { name: "Hủy thu", value: stats.totalVoided, color: COLORS[2] },
  ].filter((d) => d.value > 0);

  // Payment method breakdown
  const paymentMethodStats = collections
    .filter((c) => c.collection_type === "COLLECT")
    .reduce((acc, c) => {
      const method = c.payment_method || "UNKNOWN";
      if (!acc[method]) acc[method] = { count: 0, amount: 0 };
      acc[method].count += 1;
      acc[method].amount += Number(c.amount_collected);
      return acc;
    }, {} as Record<string, { count: number; amount: number }>);

  return (
    <>
      <Header title="Báo cáo thu tiền" subtitle="Thống kê thu tiền theo kỳ" icon={Receipt} actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Xuất Excel
          </Button>
        </div>
      } />
      <PageContainer>
        <SectionCard>
          {/* Filters */}
          <FilterBar
            title="Bộ lọc"
            hasActiveFilters={granularity !== "daily"}
            onClearFilters={() => {
              setStartDate(firstDayOfMonth.toISOString().split("T")[0]);
              setEndDate(today.toISOString().split("T")[0]);
              setGranularity("daily");
            }}
          >
            <FilterBar.Field label="Từ ngày">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </FilterBar.Field>
            <FilterBar.Field label="Đến ngày">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </FilterBar.Field>
            <FilterBar.Field label="Nhóm theo">
              <Select value={granularity} onValueChange={(v) => setGranularity(v as "daily" | "monthly")}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Theo ngày</SelectItem>
                  <SelectItem value="monthly">Theo tháng</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>
          </FilterBar>

          {/* Summary Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Tổng thu</p>
                  <p className="text-3xl font-semibold tracking-tight">{formatCurrency(stats.totalCollected)}</p>
                  <p className="text-sm text-muted-foreground">{stats.collectCount} lần thu</p>
                </div>
                <div className="rounded-lg bg-primary/10 p-3">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Tổng hoàn</p>
                  <p className="text-3xl font-semibold tracking-tight">{formatCurrency(stats.totalRefunded)}</p>
                  <p className="text-sm text-muted-foreground">{stats.refundCount} lần hoàn</p>
                </div>
                <div className="rounded-lg bg-warning/10 p-3">
                  <RotateCcw className="h-5 w-5 text-warning" />
                </div>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Tổng hủy</p>
                  <p className="text-3xl font-semibold tracking-tight">{formatCurrency(stats.totalVoided)}</p>
                  <p className="text-sm text-muted-foreground">{stats.voidCount} lần hủy</p>
                </div>
                <div className="rounded-lg bg-destructive/10 p-3">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Ròng thực thu</p>
                  <p className="text-3xl font-semibold tracking-tight">{formatCurrency(netCollected)}</p>
                  <p className="text-sm text-muted-foreground">Thu - Hoàn - Hủy</p>
                </div>
                <div className="rounded-lg bg-primary/10 p-3">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="chart" className="space-y-4">
              <TabsList>
                <TabsTrigger value="chart">Biểu đồ</TabsTrigger>
                <TabsTrigger value="breakdown">Phân tích</TabsTrigger>
                <TabsTrigger value="details">Chi tiết</TabsTrigger>
              </TabsList>

              <TabsContent value="chart" className="space-y-4">
                {/* Bar Chart */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-lg font-semibold mb-4">Thu tiền theo thời gian</h3>
                  {chartData.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      <BarChart3 className="h-8 w-8 mr-2 opacity-50" />
                      Không có dữ liệu trong khoảng thời gian này
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) => granularity === "daily" ? formatDate(v) : v}
                          className="text-xs"
                        />
                        <YAxis
                          tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`}
                          className="text-xs"
                        />
                        <Tooltip
                          formatter={(value: number) => formatCurrency(value)}
                          labelFormatter={(v) => granularity === "daily" ? formatDate(v) : v}
                        />
                        <Legend />
                        <Bar dataKey="collect" name="Thu tiền" fill="hsl(var(--primary))" />
                        <Bar dataKey="refund" name="Hoàn tiền" fill="hsl(var(--warning))" />
                        <Bar dataKey="void" name="Hủy thu" fill="hsl(var(--destructive))" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Pie Chart */}
                {pieData.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-lg font-semibold mb-4">Tỷ lệ phân bổ</h3>
                    <div className="flex items-center gap-8">
                      <ResponsiveContainer width={300} height={300}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-3">
                        {pieData.map((entry, index) => (
                          <div key={index} className="flex items-center gap-3">
                            <div
                              className="w-4 h-4 rounded"
                              style={{ backgroundColor: entry.color }}
                            />
                            <div>
                              <p className="font-medium">{entry.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatCurrency(entry.value)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="breakdown" className="space-y-4">
                {/* Payment Method Breakdown */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-6 py-4 border-b border-border">
                    <h3 className="font-semibold">Phân tích theo phương thức thanh toán</h3>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          Phương thức
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                          Số lần
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                          Tổng tiền
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                          % Tổng
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {Object.entries(paymentMethodStats).map(([method, data]) => (
                        <tr key={method} className="hover:bg-muted/30">
                          <td className="px-6 py-4 font-medium">{method}</td>
                          <td className="px-6 py-4 text-right">{data.count}</td>
                          <td className="px-6 py-4 text-right font-medium">
                            {formatCurrency(data.amount)}
                          </td>
                          <td className="px-6 py-4 text-right text-muted-foreground">
                            {stats.totalCollected > 0
                              ? `${((data.amount / stats.totalCollected) * 100).toFixed(1)}%`
                              : "0%"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="details" className="space-y-4">
                {/* Daily/Monthly Details Table */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                          {granularity === "daily" ? "Ngày" : "Tháng"}
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                          Thu tiền
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                          Hoàn tiền
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                          Hủy thu
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                          Ròng
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {chartData.map((row) => (
                        <tr key={row.date} className="hover:bg-muted/30">
                          <td className="px-6 py-4 font-medium">
                            {granularity === "daily" ? formatDate(row.date) : row.date}
                          </td>
                          <td className="px-6 py-4 text-right text-primary">
                            {formatCurrency(row.collect)}
                          </td>
                          <td className="px-6 py-4 text-right text-warning">
                            {row.refund > 0 ? `-${formatCurrency(row.refund)}` : "—"}
                          </td>
                          <td className="px-6 py-4 text-right text-destructive">
                            {row.void > 0 ? `-${formatCurrency(row.void)}` : "—"}
                          </td>
                          <td className="px-6 py-4 text-right font-semibold">
                            {formatCurrency(row.net)}
                          </td>
                        </tr>
                      ))}
                      {chartData.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                            Không có dữ liệu
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {chartData.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                          <td className="px-6 py-4">Tổng cộng</td>
                          <td className="px-6 py-4 text-right text-primary">
                            {formatCurrency(stats.totalCollected)}
                          </td>
                          <td className="px-6 py-4 text-right text-warning">
                            {stats.totalRefunded > 0 ? `-${formatCurrency(stats.totalRefunded)}` : "—"}
                          </td>
                          <td className="px-6 py-4 text-right text-destructive">
                            {stats.totalVoided > 0 ? `-${formatCurrency(stats.totalVoided)}` : "—"}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {formatCurrency(netCollected)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </SectionCard>
      </PageContainer>
    </>
  );
}
