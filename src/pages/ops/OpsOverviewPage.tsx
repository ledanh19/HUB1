/**
 * OpsOverviewPage — Layer 1: KPI Overview
 * 
 * Mobile-native 3-layer navigation:
 *   Layer 1: /ops → KPI cards + greeting
 *   Layer 2: /ops/list/:status → filtered booking list
 *   Layer 3: /bookings/:id → booking detail (existing)
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PlaneLanding,
  PlaneTakeoff,
  Users,
  Plus,
  Home,
  AlertTriangle,
  ClipboardList } from
"lucide-react";

import { PageContainer } from "@/components/layout/PageContainer";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { fetchStaysOperations, type StayWithBooking } from "@/lib/stays/fetchStaysOperations";
import { DASHBOARD_STALE_TIMES } from "@/hooks/useDashboardData";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useOpsKpis, type OpsStatusKey } from "./useOpsKpis";
import { PageTransition } from "@/components/motion/PageTransition";
import { PressableCard } from "@/components/motion/PressableCard";

import { KpiCardSkeleton } from "@/components/ui/skeleton-shimmer";

// Local date helper
const toLocalDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatDateVN = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
};

export default function OpsOverviewPage() {
  const { appNavigate } = useAppNavigate();
  const { user } = useAuth();
  const today = useMemo(() => toLocalDateKey(new Date()), []);

  const displayName = user?.user_metadata?.full_name ||
  user?.email?.split("@")[0] ||
  "bạn";

  const { data: staysData = [], isLoading } = useQuery<StayWithBooking[]>({
    queryKey: ["stays_operations", today],
    staleTime: DASHBOARD_STALE_TIMES.operations,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: () => fetchStaysOperations(today)
  });

  const kpis = useOpsKpis(staysData, today);

  const kpiCards: Array<{
    key: OpsStatusKey;
    label: string;
    value: number;
    sub: string;
    icon: typeof PlaneLanding;
    color: string;
    bgColor: string;
  }> = [
  { key: "checkin_all", label: "Khách đến", value: kpis.checkinAll.length, sub: formatDateVN(today), icon: PlaneLanding, color: "text-primary", bgColor: "bg-primary/10" },
  { key: "inhouse", label: "Đang lưu trú", value: kpis.inHouseList.length, sub: "In-house", icon: Users, color: "text-success", bgColor: "bg-success/10" },
  { key: "checkout", label: "Trả phòng", value: kpis.checkoutAll.length, sub: formatDateVN(today), icon: PlaneTakeoff, color: "text-warning", bgColor: "bg-warning/10" },
  { key: "new_booking", label: "Đặt phòng mới", value: kpis.newBookings.length, sub: formatDateVN(today), icon: Plus, color: "text-info", bgColor: "bg-info/10" },
  { key: "upcoming", label: "Chưa phân bổ", value: kpis.filteredNoRoom.length, sub: "cần xử lý", icon: Home, color: "text-destructive", bgColor: "bg-destructive/10" },
  { key: "overdue", label: "Quá hạn thu", value: kpis.overdueAll.length, sub: "cần thu", icon: AlertTriangle, color: "text-warning", bgColor: "bg-warning/10" }];


  return (
    <PageTransition variant="fade">
      <PageContainer className="!px-0 sm:!px-4 !py-2 !my-0 flex flex-col h-[calc(100dvh-theme(spacing.14)-theme(spacing.14))] sm:h-auto">
        {/* Greeting Header */}
        <div className="px-4 sm:px-0 pt-2 pb-2 shrink-0">
          <h1 className="text-lg font-bold text-foreground leading-tight">
            Xin chào {displayName}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tổng quan hoạt động ngày {formatDateVN(today)}
          </p>
        </div>

        {/* KPI Section - fills remaining space */}
        <div className="px-3 sm:px-0 flex flex-col min-h-0">
          <h2 className="text-sm font-semibold text-foreground mb-2 px-1 shrink-0">
            Khách hôm nay
          </h2>

          {isLoading ?
          <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <KpiCardSkeleton key={i} />
              ))}
            </div> :

          <div className="grid grid-cols-2 gap-2">
              {kpiCards.map((kpi) => {
              const Icon = kpi.icon;
              return (
                  <PressableCard
                    key={kpi.key}
                    onClick={() => appNavigate(`/ops/list/${kpi.key}`)}
                    className="flex flex-col justify-between rounded-xl border border-border bg-card px-3 py-2 text-left aspect-[4/3]"
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${kpi.color}`}>
                        {kpi.label}
                      </span>
                      <div className={`rounded-lg p-1.5 ${kpi.bgColor}`}>
                        <Icon className={`h-4 w-4 ${kpi.color}`} />
                      </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <span className={`text-4xl font-bold tabular-nums leading-none ${kpi.color}`}>
                        {kpi.value}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {kpi.sub}
                    </p>
                  </PressableCard>);
            })}
            </div>
          }
        </div>

        {/* CTA Button */}
        <div className="px-4 sm:px-0 pt-8 pb-2 shrink-0">
          <Button
            variant="outline"
            className="w-full rounded-xl h-10 text-sm font-medium"
            onClick={() => appNavigate("/bookings")}>
            <ClipboardList className="h-4 w-4 mr-2" />
            Xem tất cả đặt phòng
          </Button>
        </div>
      </PageContainer>
    </PageTransition>);
}
