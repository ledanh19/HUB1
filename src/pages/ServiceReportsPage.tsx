import { useState, useMemo } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Receipt,
  TrendingUp,
  CreditCard,
  PieChart,
  BarChart3,
  Plane,
  Car,
  Sparkles,
} from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { KPIGrid } from "@/components/kpi/KPIGrid";
import { useServiceOrderStats } from "@/hooks/useServiceOrders";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const SERVICE_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  TOUR: { label: "Tour", icon: Plane, color: "bg-primary/10 text-primary" },
  PICKUP: { label: "Đưa đón", icon: Car, color: "bg-success/10 text-success" },
  ADDON: { label: "Dịch vụ thêm", icon: Sparkles, color: "bg-primary/100/10 text-primary" },
};

export default function ServiceReportsPage() {
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  const { data: stats, isLoading } = useServiceOrderStats({ dateFrom, dateTo });

  const sortedByType = useMemo(() => {
    if (!stats?.byType) return [];
    return Object.entries(stats.byType)
      .sort((a, b) => b[1].value - a[1].value);
  }, [stats?.byType]);

  const sortedByPartner = useMemo(() => {
    if (!stats?.byPartner) return [];
    return Object.entries(stats.byPartner)
      .sort((a, b) => b[1].value - a[1].value);
  }, [stats?.byPartner]);

  const sortedByMonth = useMemo(() => {
    if (!stats?.byMonth) return [];
    return Object.entries(stats.byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [stats?.byMonth]);

  return (
    <>
      <Header title="Báo cáo Dịch vụ" subtitle="Thống kê tổng quan đơn dịch vụ" />

      <PageContainer><SectionCard>
        {/* Date Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Từ ngày:</span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-auto"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Đến ngày:</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-auto"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard
            title="Tổng đơn dịch vụ"
            value={stats?.total || 0}
            icon={Receipt}
          />
          <MetricCard
            title="Tổng doanh thu"
            value={formatCurrency(stats?.totalValue || 0)}
            icon={CreditCard}
          />
          <MetricCard
            title="Tổng chi phí"
            value={formatCurrency(stats?.totalCost || 0)}
            icon={TrendingUp}
          />
          <MetricCard
            title="Lợi nhuận"
            value={formatCurrency(stats?.margin || 0)}
            icon={TrendingUp}
            className="border-success/20"
          />
        </div>

        {/* Payment Status */}
        <KPIGrid columns={2}>
          <MetricCard title="Đã thu tiền" value={stats?.paidCount || 0} tone="success" />
          <MetricCard title="Chưa thu tiền" value={stats?.unpaidCount || 0} tone="warning" />
        </KPIGrid>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* By Type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <PieChart className="h-4 w-4" />
                Theo loại dịch vụ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sortedByType.length > 0 ? (
                sortedByType.map(([type, data]) => {
                  const config = SERVICE_TYPE_CONFIG[type] || {
                    label: type,
                    icon: Sparkles,
                    color: "bg-muted text-muted-foreground",
                  };
                  const Icon = config.icon;

                  return (
                    <div
                      key={type}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded ${config.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium">{config.label}</p>
                          <p className="text-xs text-muted-foreground">{data.count} đơn</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(data.value)}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-muted-foreground py-4">Chưa có dữ liệu</p>
              )}
            </CardContent>
          </Card>

          {/* By Partner */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Theo đối tác
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sortedByPartner.length > 0 ? (
                sortedByPartner.slice(0, 10).map(([partner, data]) => (
                  <div
                    key={partner}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">{partner}</p>
                      <p className="text-xs text-muted-foreground">{data.count} đơn</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(data.value)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">Chưa có dữ liệu</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* By Month */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Theo tháng
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sortedByMonth.length > 0 ? (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-2">
                  {sortedByMonth.map(([month, data]) => (
                    <div key={month} className="flex items-center justify-between p-3 rounded-lg border border-border/60">
                      <div>
                        <p className="text-sm font-medium">{month}</p>
                        <p className="text-xs text-muted-foreground">{data.count} đơn</p>
                      </div>
                      <p className="font-semibold text-sm tabular-nums">{formatCurrency(data.value)}</p>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 text-sm font-medium text-muted-foreground">Tháng</th>
                        <th className="text-right p-2 text-sm font-medium text-muted-foreground">Số đơn</th>
                        <th className="text-right p-2 text-sm font-medium text-muted-foreground">Doanh thu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedByMonth.map(([month, data]) => (
                        <tr key={month} className="border-b last:border-0">
                          <td className="p-2 font-medium">{month}</td>
                          <td className="p-2 text-right">{data.count}</td>
                          <td className="p-2 text-right font-semibold">{formatCurrency(data.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-4">Chưa có dữ liệu</p>
            )}
          </CardContent>
        </Card>
      </SectionCard></PageContainer>
    </>
  );
}
