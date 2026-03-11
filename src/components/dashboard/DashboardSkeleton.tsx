import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dashboard Skeleton Components
 * 
 * Hiển thị loading state đồng đều cho các cards
 * Giúp tránh layout shift khi data load xong
 */

export function MetricCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={`flex-shrink-0 w-[140px] md:w-auto md:flex-shrink md:col-span-1 rounded-lg border border-border bg-card p-3 md:p-4 animate-pulse ${className || ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-8 w-12 mb-1" />
      <Skeleton className="h-3 w-14" />
    </div>
  );
}

export function CashCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 md:p-4 animate-pulse">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
        <div className="min-w-0">
          <Skeleton className="h-3 w-16 mb-1" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="hidden md:block h-10 w-10 rounded-lg" />
      </div>
    </div>
  );
}

export function SectionSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 lg:grid-cols-6 md:overflow-visible scrollbar-hide">
      {Array.from({ length: cards }).map((_, i) => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function CashSectionSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 md:gap-3">
      <CashCardSkeleton />
      <CashCardSkeleton />
      <CashCardSkeleton />
    </div>
  );
}

export function ForecastCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-md bg-muted/50 p-2.5 md:p-3">
            <Skeleton className="h-3 w-16 mb-1" />
            <Skeleton className="h-5 w-20 mb-1" />
            <Skeleton className="h-2 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfitGapSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-md bg-muted/50 p-2.5 md:p-3">
            <Skeleton className="h-3 w-16 mb-1" />
            <Skeleton className="h-5 w-20 mb-1" />
            <Skeleton className="h-2 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecentBookingsSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-7 w-20" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded" />
              <div>
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Full Dashboard Loading Skeleton
 * Hiển thị khi toàn bộ Dashboard đang load lần đầu
 */
export function DashboardFullSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      
      {/* Alerts */}
      <Skeleton className="h-12 w-full rounded-lg" />
      
      {/* Operations Section */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <SectionSkeleton cards={6} />
      </div>
      
      {/* Cash Section */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <CashSectionSkeleton />
      </div>
      
      {/* Profit Gap */}
      <ProfitGapSkeleton />
      
      {/* Forecast */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <ForecastCardSkeleton />
      </div>
    </div>
  );
}
