import * as React from "react";
import { cn } from "@/lib/utils";
import { MetricCard, MetricCardProps } from "@/components/ui/metric-card";

interface StatGroupProps {
  /** Array of MetricCard props */
  stats: MetricCardProps[];
  /** Grid columns: 2 | 3 | 4 (default: auto based on count) */
  columns?: 2 | 3 | 4;
  /** Compact: tighter gap */
  compact?: boolean;
  className?: string;
}

/**
 * StatGroup – renders a responsive grid of MetricCards.
 *
 * Canonical wrapper for KPI rows. Use instead of ad-hoc grid + div combos.
 * Responsive: 1 col mobile → 2 col tablet → N col desktop.
 *
 * Usage:
 * ```tsx
 * <StatGroup
 *   stats={[
 *     { title: "Tổng booking", value: totalCount, icon: Calendar },
 *     { title: "Doanh thu", value: formatVND(revenue), trend: "up", change: { value: 12, label: "vs tháng trước" } },
 *   ]}
 *   columns={4}
 * />
 * ```
 */
export function StatGroup({
  stats,
  columns,
  compact = false,
  className,
}: StatGroupProps) {
  const cols = columns ?? (stats.length <= 2 ? 2 : stats.length <= 3 ? 3 : 4);

  return (
    <div
      className={cn(
        "grid gap-4",
        cols === 2 && "grid-cols-1 sm:grid-cols-2",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        compact && "gap-3",
        className,
      )}
    >
      {stats.map((stat, i) => (
        <MetricCard key={stat.title + i} {...stat} />
      ))}
    </div>
  );
}
