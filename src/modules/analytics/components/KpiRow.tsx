/**
 * KpiRow Component
 * 
 * Horizontal row of KPI cards for displaying key metrics.
 * 
 * ENHANCED (Audit Phase 1 + Phase 2):
 * - P1-03: Fix KPI truncation with compact currency formatter + wider min-width
 * - P2-01/P2-02: Added KpiItem-based rendering to replace local KpiCard duplicates
 */

import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { KpiData } from '../types';
import { formatCurrency, formatCurrencyCompact, formatNumber, formatPercent, MIN_NIGHTS_FOR_ADR } from '../constants';

// ============================================================================
// KPI CARD COMPONENT (shared - used by all analytics pages)
// ============================================================================

interface KpiCardProps {
  label: string;
  value: string | number | null;
  change?: number | null;
  changeLabel?: string;
  belowThreshold?: boolean;
  isLoading?: boolean;
  tooltip?: string;
  variant?: 'default' | 'highlight' | 'warning' | 'success' | 'danger';
  /** Optional sub-value text (e.g. "523 segments") */
  subValue?: string;
  /** Optional icon to display next to label */
  icon?: React.ReactNode;
  /** Use compact currency formatting (e.g. 10.5B instead of 10.486.960.000 đ) */
  compact?: boolean;
}

export function KpiCard({
  label,
  value,
  change,
  changeLabel = 'vs kỳ trước',
  belowThreshold = false,
  isLoading = false,
  tooltip,
  variant = 'default',
  subValue,
  icon,
  compact = false,
}: KpiCardProps) {
  /**
   * BUG 3 FIX: Guard against absurd % changes (> 1000% or < -1000%)
   * These typically indicate division by near-zero values and should show "N/A"
   */
  const isValidChange = change !== null && change !== undefined &&
    Math.abs(change) <= 1000; // Cap at ±1000%

  const getTrendIcon = () => {
    if (!isValidChange) return null;
    if (change! > 0) return <TrendingUp className="h-3 w-3 text-success" />;
    if (change! < 0) return <TrendingDown className="h-3 w-3 text-destructive" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  const getTrendColor = () => {
    if (!isValidChange) return 'text-muted-foreground';
    if (change! > 0) return 'text-success';
    if (change! < 0) return 'text-destructive';
    return 'text-muted-foreground';
  };

  const variantStyles: Record<string, string> = {
    default: '',
    highlight: 'border-primary/50 bg-primary/5',
    warning: 'border-warning/20 bg-warning/10',
    success: 'border-success/20 bg-success/5',
    danger: 'border-destructive/20 bg-destructive/5',
  };

  // P1-03: Format value — use compact for large numbers
  const formatValue = (val: number) => {
    if (compact) return formatCurrencyCompact(val);
    return formatCurrency(val);
  };

  const content = (
    <Card className={variantStyles[variant] || ''}>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              {icon}
              <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              {belowThreshold ? (
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-xs font-normal">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Low sample
                  </Badge>
                </div>
              ) : (
                <p className="text-2xl font-bold tabular-nums tracking-tight truncate">
                  {typeof value === 'number' ? formatValue(value) : value || '—'}
                </p>
              )}
            </div>
            {!belowThreshold && subValue && (
              <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
            )}
            {!belowThreshold && isValidChange && (
              <div className="flex items-center gap-1 mt-1">
                {getTrendIcon()}
                <span className={`text-xs font-medium ${getTrendColor()}`}>
                  {formatPercent(change!)}
                </span>
                <span className="text-xs text-muted-foreground">{changeLabel}</span>
              </div>
            )}
            {/* BUG 3 FIX: Show N/A for absurd % changes instead of displaying them */}
            {!belowThreshold && change !== null && change !== undefined && !isValidChange && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-muted-foreground">vs kỳ trước: N/A</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

// ============================================================================
// P2-01/P2-02: FLEXIBLE KPI ITEMS RENDERING
// ============================================================================

/**
 * KpiItem describes a single KPI card configuration.
 * Used by KpiItems component to render a flexible grid of KPIs.
 */
export interface KpiItem {
  label: string;
  value: string | number | null;
  change?: number | null;
  changeLabel?: string;
  belowThreshold?: boolean;
  tooltip?: string;
  variant?: 'default' | 'highlight' | 'warning' | 'success' | 'danger';
  subValue?: string;
  icon?: React.ReactNode;
  compact?: boolean;
}

interface KpiItemsProps {
  items: KpiItem[];
  isLoading?: boolean;
  className?: string;
  /** Custom grid columns class, e.g. "grid-cols-2 md:grid-cols-4" */
  gridClassName?: string;
}

/**
 * Renders a flexible grid of KPI cards from an items array.
 * 
 * Usage: <KpiItems items={[{ label: '...', value: ... }]} isLoading={false} />
 */
export function KpiItems({
  items,
  isLoading = false,
  className,
  gridClassName = 'grid-cols-2 md:grid-cols-4',
}: KpiItemsProps) {
  return (
    <div className={`grid gap-4 ${gridClassName} ${className || ''}`}>
      {items.map((item, idx) => (
        <KpiCard
          key={item.label + idx}
          label={item.label}
          value={item.value}
          change={item.change}
          changeLabel={item.changeLabel}
          belowThreshold={item.belowThreshold}
          isLoading={isLoading}
          tooltip={item.tooltip}
          variant={item.variant}
          subValue={item.subValue}
          icon={item.icon}
          compact={item.compact}
        />
      ))}
    </div>
  );
}

// ============================================================================
// KPI ROW COMPONENT (original - backward compatible)
// ============================================================================

interface KpiRowProps {
  kpi: KpiData | null;
  isLoading?: boolean;
  showRevenue?: boolean;
  showHostCost?: boolean;
  showNights?: boolean;
  showBookings?: boolean;
  showRevenueAdr?: boolean;
  showHostAdr?: boolean;
  showMarginSpread?: boolean;
  className?: string;
  /** P1-03: Use compact format for large currency values */
  compact?: boolean;
}

export function KpiRow({
  kpi,
  isLoading = false,
  showRevenue = true,
  showHostCost = false,
  showNights = true,
  showBookings = true,
  showRevenueAdr = true,
  showHostAdr = true,
  showMarginSpread = true,
  className,
  compact = false,
}: KpiRowProps) {
  const belowThreshold = kpi?.belowSampleThreshold ?? false;

  return (
    <div className={`grid gap-4 ${className}`} style={{
      // P1-03: Increase min column width to prevent truncation
      gridTemplateColumns: `repeat(auto-fit, minmax(190px, 1fr))`,
    }}>
      {showRevenue && (
        <KpiCard
          label="Doanh thu (Booked)"
          value={kpi?.revenueTotal ?? null}
          change={kpi?.revenuePop}
          isLoading={isLoading}
          tooltip="SUM(total_amount_net) từ unified_bookings"
          variant="highlight"
          compact={compact}
        />
      )}
      {showHostCost && (
        <KpiCard
          label="Chi phí Host"
          value={kpi?.hostCostTotal ?? null}
          isLoading={isLoading}
          tooltip="SUM(host_cost) từ unified_bookings"
          compact={compact}
        />
      )}
      {showNights && (
        <KpiCard
          label="Số đêm"
          value={kpi ? formatNumber(kpi.nightsTotal) : null}
          isLoading={isLoading}
          tooltip="SUM(nights) - đêm lưu trú thực tế"
        />
      )}
      {showBookings && (
        <KpiCard
          label="Số booking"
          value={kpi ? formatNumber(kpi.bookingsCount) : null}
          isLoading={isLoading}
          tooltip="COUNT(DISTINCT booking_id)"
        />
      )}
      {showRevenueAdr && (
        <KpiCard
          label="ADR Doanh thu"
          value={kpi?.revenueAdr ?? null}
          belowThreshold={belowThreshold}
          isLoading={isLoading}
          tooltip={`Revenue / Nights (min ${MIN_NIGHTS_FOR_ADR} đêm)`}
        />
      )}
      {showHostAdr && (
        <KpiCard
          label="ADR Host"
          value={kpi?.hostAdr ?? null}
          change={kpi?.hostAdrPop}
          belowThreshold={belowThreshold}
          isLoading={isLoading}
          tooltip={`Host Cost / Nights (min ${MIN_NIGHTS_FOR_ADR} đêm)`}
        />
      )}
      {showMarginSpread && (
        <KpiCard
          label="Biên Spread"
          value={kpi?.marginSpread ?? null}
          change={kpi?.marginSpreadPop}
          changeLabel="vs kỳ trước"
          belowThreshold={belowThreshold}
          isLoading={isLoading}
          tooltip="Revenue ADR - Host ADR"
          variant={kpi?.marginSpread && kpi.marginSpread < 0 ? 'warning' : 'default'}
        />
      )}
    </div>
  );
}
