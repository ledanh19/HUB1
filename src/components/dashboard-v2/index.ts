// Dashboard V2 — Component barrel exports

// Colors
export { chartColors, channelColors, CHART_OPACITY, FALLBACK_CHANNEL_COLORS, BAR_RADIUS, BAR_RADIUS_TOP } from "./chartColors";

// UI
export { KpiCardV2 } from "./ui/KpiCardV2";
export type { KpiCardV2Props, KpiSeverity } from "./ui/KpiCardV2";
export { SectionHeaderV2 } from "./ui/SectionHeaderV2";
export { HealthBar } from "./ui/HealthBar";
export type { HealthAlert } from "./ui/HealthBar";
export { ProjectedNetCard } from "./ui/ProjectedNetCard";

// Charts
export { RevenueTrendChart } from "./charts/RevenueTrendChart";
export { ChannelDonutChart } from "./charts/ChannelDonutChart";
export { FinancialWaterfallChart } from "./charts/FinancialWaterfallChart";
export { ForecastLineChart } from "./charts/ForecastLineChart";
export { ForecastRevenueChart } from "./charts/ForecastRevenueChart";
export { ExpenseBreakdownChart } from "./charts/ExpenseBreakdownChart";
export { CashflowChart } from "./charts/CashflowChart";
export { ProfitCashComparisonChart } from "./charts/ProfitCashComparisonChart";
export { OtaReceivableAgingChart } from "./charts/OtaReceivableAgingChart";
export { HostSettlementProgressChart } from "./charts/HostSettlementProgressChart";
export { ForecastExpensesChart } from "./charts/ForecastExpensesChart";
export { GuestOriginSection } from "./charts/GuestOriginSection";
export { AreaRankingChart } from "./charts/AreaRankingChart";
export { HostRankingChart, TrendBadge } from "./charts/HostRankingChart";

// Tables
export { OtaPerformanceTable } from "./tables/OtaPerformanceTable";
export { PropertyPerformanceTable } from "./tables/PropertyPerformanceTable";
