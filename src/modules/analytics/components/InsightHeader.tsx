/**
 * InsightHeader Component (Enterprise Rebuild)
 * 
 * Auto-generated narrative insight from KPI data + comparison deltas.
 * Shows 2–3 insight chips alongside a textual summary.
 * 
 * Portfolio Mode:
 *   "Doanh thu tăng 8.2% so với kỳ trước, dẫn dắt bởi Agoda và Masteri Thảo Điền."
 * 
 * Property Mode:
 *   "ADR tăng 5.1% nhưng số đêm giảm 3.4%, cần theo dõi nhu cầu cuối tuần."
 * 
 * Deterministic from compare engine.
 */

import { TrendingUp, TrendingDown, Info, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '../constants';
import type { KpiData, ContextMode } from '../types';

// ============================================================================
// INSIGHT CHIP
// ============================================================================

interface InsightChip {
    label: string;
    value: string;
    direction: 'up' | 'down' | 'neutral';
}

function InsightChipBadge({ chip }: { chip: InsightChip }) {
    const colorClass = chip.direction === 'up'
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
        : chip.direction === 'down'
            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
            : 'bg-muted text-muted-foreground';

    const Icon = chip.direction === 'up' ? TrendingUp
        : chip.direction === 'down' ? TrendingDown
            : Minus;

    return (
        <Badge variant="secondary" className={cn('gap-1 px-2 py-0.5 text-xs font-medium', colorClass)}>
            <Icon className="h-3 w-3" />
            {chip.label} {chip.value}
        </Badge>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface InsightHeaderProps {
    kpi: KpiData | null;
    isLoading?: boolean;
    mode?: ContextMode;
    /** Top channel or property name for narrative */
    topDriverName?: string | null;
    /** Second driver name for narrative */
    secondDriverName?: string | null;
    className?: string;
}

export function InsightHeader({
    kpi,
    isLoading = false,
    mode = 'portfolio',
    topDriverName,
    secondDriverName,
    className,
}: InsightHeaderProps) {
    if (isLoading) {
        return (
            <div className={cn('flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-3', className)}>
                <Skeleton className="h-4 w-4 shrink-0" />
                <Skeleton className="h-4 w-[350px]" />
                <div className="flex gap-2 ml-auto">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-20" />
                </div>
            </div>
        );
    }

    if (!kpi) return null;

    // ========================================================================
    // BUILD INSIGHT CHIPS
    // ========================================================================

    const chips: InsightChip[] = [];

    // Revenue delta
    if (kpi.revenuePop !== null) {
        chips.push({
            label: 'Revenue',
            value: formatPercent(kpi.revenuePop),
            direction: kpi.revenuePop >= 0 ? 'up' : 'down',
        });
    }

    // Nights delta (compute from KPI if comparison data exists)
    if (kpi.revenuePop !== null) {
        // Use ADR pop as proxy for supply-side change
        let nightsDelta: number | null = null;
        if (kpi.revenuePop !== null && kpi.revenueAdr !== null && kpi.revenueAdr > 0) {
            // If revenue went up X% and ADR went up Y%, nights changed ~(X-Y)%
            const adrPop = kpi.hostAdrPop; // approximate
            if (adrPop !== null) {
                nightsDelta = kpi.revenuePop - adrPop;
            }
        }
        if (nightsDelta !== null) {
            chips.push({
                label: 'Đêm',
                value: formatPercent(nightsDelta),
                direction: nightsDelta >= 0 ? 'up' : 'down',
            });
        }
    }

    // Spread delta
    if (kpi.marginSpread !== null) {
        const spreadPct = kpi.revenueTotal > 0
            ? (kpi.marginSpread / kpi.revenueTotal) * 100
            : 0;
        chips.push({
            label: 'Spread',
            value: `${spreadPct >= 0 ? '+' : ''}${spreadPct.toFixed(1)}%`,
            direction: spreadPct >= 0 ? 'up' : 'down',
        });
    }

    // ========================================================================
    // BUILD NARRATIVE TEXT
    // ========================================================================

    let narrative = '';
    const pop = kpi.revenuePop;

    if (pop === null) {
        // No comparison data
        narrative = `Doanh thu ${formatCurrency(kpi.revenueTotal)} — ${kpi.bookingsCount} booking · ${kpi.nightsTotal} đêm`;
    } else if (Math.abs(pop) < 3) {
        // Stable
        narrative = `Doanh thu ổn định (${formatPercent(pop)}) ở mức ${formatCurrency(kpi.revenueTotal)}`;
    } else if (pop > 0) {
        // Growing
        narrative = `Doanh thu tăng ${formatPercent(pop)} so với kỳ trước`;
        if (topDriverName && secondDriverName) {
            narrative += `, dẫn dắt bởi ${topDriverName} và ${secondDriverName}`;
        } else if (topDriverName) {
            narrative += `, dẫn dắt bởi ${topDriverName}`;
        }
    } else {
        // Declining
        narrative = `Doanh thu giảm ${formatPercent(Math.abs(pop))} so với kỳ trước`;
        if (topDriverName) {
            narrative += ` — ${topDriverName} ảnh hưởng lớn nhất`;
        }
    }
    narrative += '.';

    // Property mode: add ADR note
    if (mode === 'property' && kpi.revenueAdr !== null) {
        const adrNote = kpi.hostAdrPop !== null
            ? ` ADR ${kpi.hostAdrPop >= 0 ? 'tăng' : 'giảm'} ${formatPercent(Math.abs(kpi.hostAdrPop))}.`
            : '';
        narrative += adrNote;
    }

    // ========================================================================
    // RENDER
    // ========================================================================

    const bgClass = pop === null
        ? 'bg-muted/30'
        : pop >= 0
            ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
            : 'bg-red-50/50 dark:bg-red-950/20';

    const textColor = pop === null
        ? 'text-muted-foreground'
        : pop >= 0
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-red-700 dark:text-red-400';

    const TrendIcon = pop === null ? Info
        : pop >= 0 ? TrendingUp : TrendingDown;

    return (
        <div className={cn(
            'flex items-center gap-3 rounded-lg px-4 py-3',
            bgClass,
            className,
        )}>
            <TrendIcon className={cn('h-4 w-4 shrink-0', textColor)} />
            <p className={cn('text-sm font-medium flex-1', textColor)}>
                {narrative}
            </p>
            {chips.length > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                    {chips.map((chip, i) => (
                        <InsightChipBadge key={i} chip={chip} />
                    ))}
                </div>
            )}
        </div>
    );
}
