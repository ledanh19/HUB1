import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface SkeletonShimmerProps {
  className?: string;
}

/** Subtle shimmer skeleton loader — respects reduced motion */
export function SkeletonShimmer({ className }: SkeletonShimmerProps) {
  const reduced = useReducedMotion();

  return (
    <div
      className={cn(
        "rounded-lg bg-muted",
        !reduced && "animate-pulse",
        className
      )}
    />
  );
}

/** KPI card skeleton */
export function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 min-h-[110px] px-[25px] py-[25px] space-y-3">
      <div className="flex w-full items-center justify-between">
        <SkeletonShimmer className="h-3 w-16" />
        <SkeletonShimmer className="h-7 w-7 rounded-lg" />
      </div>
      <div className="space-y-1.5">
        <SkeletonShimmer className="h-8 w-12" />
        <SkeletonShimmer className="h-3 w-10" />
      </div>
    </div>
  );
}

/** Booking list card skeleton */
export function BookingCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SkeletonShimmer className="h-4 w-28" />
        <SkeletonShimmer className="h-5 w-16 rounded-full" />
      </div>
      <div className="space-y-2">
        <SkeletonShimmer className="h-3.5 w-40" />
        <SkeletonShimmer className="h-3 w-32" />
      </div>
      <div className="flex gap-2">
        <SkeletonShimmer className="h-7 w-20 rounded-md" />
        <SkeletonShimmer className="h-7 w-20 rounded-md" />
      </div>
    </div>
  );
}
