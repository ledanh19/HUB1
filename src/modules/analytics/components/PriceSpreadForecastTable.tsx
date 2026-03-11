/**
 * Price Spread Forecast Table Component
 * 
 * Displays ESTIMATED future pricing data.
 * All values are clearly labeled as "EST" (Estimated).
 * 
 * Key differences from Executed table:
 * - Shows Expected ADR (not actual)
 * - Shows Fulfillment Rate
 * - Shows Confidence badges
 * - Shows Suggested % adjustment
 * - Warning banner always visible
 */

import { useState, useMemo, useEffect } from 'react';
import { parseISO, getWeek, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Info, Search, Percent, Clock, Filter, CheckCircle2, History } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatCurrency, formatNumber, DAY_TYPE_MIX_LABELS, SIGNAL_REASON_LABELS, FORECAST_CONFIG, type DayTypeMix, type ForecastConfidence, type SignalReason } from '../constants';
import type { ForecastRow, ForecastKpi } from '../hooks/usePriceSpreadForecast';
import type { PriceSignal } from '../hooks/usePriceSpreadMatched';
import {
  useLatestAdjustments,
  useLogAdjustment,
  useAdjustmentHistory,
  needsReview,
  getReviewUrgency,
  formatAdjustment,
  type PriceAdjustment
} from '../hooks/usePriceAdjustmentTracking';

// ============================================================================
// PERIOD FORMATTING (supports month, week, day granularity)
// ============================================================================

const VIETNAMESE_MONTHS: Record<string, string> = {
  '01': 'Tháng 1',
  '02': 'Tháng 2',
  '03': 'Tháng 3',
  '04': 'Tháng 4',
  '05': 'Tháng 5',
  '06': 'Tháng 6',
  '07': 'Tháng 7',
  '08': 'Tháng 8',
  '09': 'Tháng 9',
  '10': 'Tháng 10',
  '11': 'Tháng 11',
  '12': 'Tháng 12',
};

const VIETNAMESE_DAYS: Record<number, string> = {
  0: 'CN',
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7',
};

/**
 * Format period key to Vietnamese display
 * Handles 3 formats:
 * - Month: "2026-02" → "Tháng 2, 2026"
 * - Week: "2026-W05" → "Tuần 5, 2026"
 * - Day: "2026-01-15" → "15/1 (T4)"
 */
function formatPeriodDisplay(periodKey: string): string {
  if (!periodKey) return '—';

  // Week format: "2026-W05"
  if (periodKey.includes('-W')) {
    const [year, weekPart] = periodKey.split('-W');
    const weekNum = parseInt(weekPart, 10);
    if (isNaN(weekNum)) return periodKey;
    return `Tuần ${weekNum}, ${year}`;
  }

  // Day format: "2026-01-15" (10 characters with 2 dashes)
  if (periodKey.length === 10 && periodKey.split('-').length === 3) {
    const [year, month, day] = periodKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const dayOfWeek = date.getDay();
    return `${parseInt(day)}/${parseInt(month)} (${VIETNAMESE_DAYS[dayOfWeek]})`;
  }

  // Month format: "2026-02"
  const [year, month] = periodKey.split('-');
  if (month && VIETNAMESE_MONTHS[month]) {
    return `${VIETNAMESE_MONTHS[month]}, ${year}`;
  }

  // Fallback for unexpected formats
  return periodKey;
}

/**
 * Detect granularity from period key format
 */
function detectGranularity(periodKey: string): 'month' | 'week' | 'day' {
  if (!periodKey) return 'month';
  if (periodKey.includes('-W')) return 'week';
  if (periodKey.length === 10 && periodKey.split('-').length === 3) return 'day';
  return 'month';
}

/**
 * Get period filter label based on detected granularity
 */
function getPeriodFilterLabel(granularity: 'month' | 'week' | 'day'): string {
  switch (granularity) {
    case 'day': return 'Tất cả ngày';
    case 'week': return 'Tất cả tuần';
    default: return 'Tất cả tháng';
  }
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function EstBadge() {
  return (
    <Badge variant="outline" className="text-micro px-1 py-0 bg-warning/10 text-warning border-warning/20">
      EST
    </Badge>
  );
}

function ConfidenceBadge({ confidence, hostSample, otaSample }: { confidence: ForecastConfidence; hostSample?: number; otaSample?: number }) {
  const config = {
    HIGH: { className: 'bg-success/10 text-success', label: 'Cao' },
    MED: { className: 'bg-warning/10 text-warning', label: 'TB' },
    LOW: { className: 'bg-destructive/10 text-destructive', label: 'Thấp' },
  };
  const { className, label } = config[confidence];

  // Build explanation for low confidence
  const minSample = FORECAST_CONFIG.MIN_SAMPLE_FORECAST;
  const highSample = FORECAST_CONFIG.CONFIDENCE_HIGH_SAMPLE;
  const medSample = FORECAST_CONFIG.CONFIDENCE_MED_SAMPLE;
  const hSample = hostSample ?? 0;
  const oSample = otaSample ?? 0;
  const actualMin = Math.min(hSample, oSample);

  let explanation = '';
  if (confidence === 'LOW') {
    if (actualMin < minSample) {
      explanation = `Sample quá ít: Host=${hSample}, OTA=${oSample} (cần ≥${minSample})`;
    } else {
      explanation = `Variance cao hoặc thiếu fulfillment data`;
    }
  } else if (confidence === 'MED') {
    explanation = `Sample: Host=${hSample}, OTA=${oSample} (cần ≥${highSample} để đạt Cao)`;
  } else {
    explanation = `Sample đủ: Host=${hSample}, OTA=${oSample}`;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className={`text-xs cursor-help ${className}`}>
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs font-medium">Độ tin cậy: {label}</p>
        <p className="text-xs text-muted-foreground">{explanation}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Ngưỡng: Thấp &lt;{minSample}, TB ≥{medSample}, Cao ≥{highSample}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function DayTypeMixBadge({ dayTypeMix }: { dayTypeMix?: DayTypeMix }) {
  const mix = dayTypeMix ?? 'MIXED';
  const colorMap: Record<DayTypeMix, string> = {
    WEEKEND: 'bg-primary/10 text-primary',
    WEEKDAY: 'bg-info/10 text-info',
    MIXED: 'bg-muted text-muted-foreground',
  };
  return (
    <Badge variant="secondary" className={`text-xs ${colorMap[mix]}`}>
      {DAY_TYPE_MIX_LABELS[mix]}
    </Badge>
  );
}

function ForecastSignalBadge({ signal, reason }: { signal: PriceSignal; reason?: string }) {
  // Show specific label based on reason if it's a "review" signal
  if (signal === 'review' && reason) {
    const reasonLabels: Record<string, { icon: typeof AlertTriangle; text: string; className: string }> = {
      'MISSING_HOST_ADR': { icon: AlertTriangle, text: 'Thiếu host cost', className: 'border-warning text-warning bg-warning/10' },
      'MISSING_VELOCITY_BASELINE': { icon: AlertTriangle, text: 'Thiếu baseline', className: 'border-warning text-warning bg-warning/10' },
      'LOW_CONFIDENCE': { icon: Info, text: 'Dữ liệu chưa đủ', className: 'border-info text-info bg-info/10' },
      // NEW: Margin floor violations - business language
      'BELOW_MIN_MARGIN': { icon: AlertTriangle, text: 'Biên LN < 15%', className: 'border-destructive text-destructive bg-destructive/10' },
      'NEGATIVE_MARGIN': { icon: AlertTriangle, text: 'Đang bán lỗ', className: 'border-destructive text-destructive bg-destructive/10' },
    };
    const config = reasonLabels[reason];
    if (config) {
      const IconComponent = config.icon;
      return (
        <Badge variant="outline" className={config.className}>
          <IconComponent className="h-3 w-3 mr-1" />
          {config.text}
        </Badge>
      );
    }
  }

  switch (signal) {
    case 'increase':
      return (
        <Badge variant="default" className="bg-success hover:bg-success">
          <TrendingUp className="h-3 w-3 mr-1" />
          Tăng
        </Badge>
      );
    case 'decrease':
      return (
        <Badge variant="destructive">
          <TrendingDown className="h-3 w-3 mr-1" />
          Giảm
        </Badge>
      );
    case 'review':
      return (
        <Badge variant="outline" className="border-info text-info">
          <Search className="h-3 w-3 mr-1" />
          Xem xét
        </Badge>
      );
    case 'hold':
    default:
      return (
        <Badge variant="secondary">
          <Minus className="h-3 w-3 mr-1" />
          Giữ
        </Badge>
      );
  }
}

function SuggestedAdjustment({
  value,
  factors,
  volumeScore,
  capacityScore,
  areaScore,
  marginPercent,
  velocityRatio,
  leadTimeDays,
  dayTypeMix,
}: {
  value: number | null;
  factors?: string[];
  volumeScore?: number | null;
  capacityScore?: number | null;
  areaScore?: number | null;
  marginPercent?: number | null;
  velocityRatio?: number | null;
  leadTimeDays?: number | null;
  dayTypeMix?: string;
}) {
  if (value === null) return <span className="text-muted-foreground">—</span>;

  const isPositive = value > 0;
  const isNegative = value < 0;

  // Determine pricing zone based on margin
  const getZoneInfo = (margin: number | null | undefined) => {
    if (margin === null || margin === undefined) {
      return { zone: 'N/A', color: 'text-muted-foreground', range: '—', description: 'Không có dữ liệu margin', indicator: 'neutral' as const };
    }
    if (margin < 0) {
      return {
        zone: 'LỖ',
        color: 'text-destructive font-bold',
        range: 'REVIEW NGAY',
        description: 'Margin âm - đang bán lỗ! Cần xem lại Host ADR hoặc tăng giá OTA ngay.',
        indicator: 'danger' as const
      };
    }
    if (margin < 12) {
      return {
        zone: 'DƯỚI SÀN',
        color: 'text-warning font-semibold',
        range: '+5% → +15%',
        description: `Margin ${margin.toFixed(1)}% < 12% (sàn). PHẢI tăng giá để đảm bảo lợi nhuận tối thiểu.`,
        indicator: 'warning' as const
      };
    }
    if (margin <= 20) {
      return {
        zone: 'TỐI ƯU',
        color: 'text-success',
        range: '-2% → +5%',
        description: `Margin ${margin.toFixed(1)}% trong vùng tối ưu (12-20%). Điều chỉnh nhẹ dựa trên velocity.`,
        indicator: 'success' as const
      };
    }
    if (margin <= 25) {
      return {
        zone: 'TRÊN MỤC TIÊU',
        color: 'text-info',
        range: '-5% → +3%',
        description: `Margin ${margin.toFixed(1)}% cao hơn mục tiêu. Có thể giảm giá để tăng booking nếu velocity thấp.`,
        indicator: 'info' as const
      };
    }
    return {
      zone: 'MARGIN CAO',
      color: 'text-primary',
      range: '-8% → +5%',
      description: `Margin ${margin.toFixed(1)}% > 25%. Có thể giảm mạnh để cạnh tranh nếu velocity < 0.7x.`,
      indicator: 'premium' as const
    };
  };

  const zoneInfo = getZoneInfo(marginPercent);

  // Build mini indicators for quick view (using text-based indicators, no emojis)
  type Indicator = { label: string; color: string };
  const getMiniIndicators = (): Indicator[] => {
    const indicators: Indicator[] = [];

    // Margin indicator
    if (marginPercent !== null && marginPercent !== undefined) {
      if (marginPercent < 0) indicators.push({ label: 'LỖ', color: 'bg-destructive/100 text-white' });
      else if (marginPercent < 12) indicators.push({ label: 'SÀN', color: 'bg-warning/100 text-white' });
      else if (marginPercent > 25) indicators.push({ label: 'CAO', color: 'bg-primary/100 text-white' });
    }

    // Velocity indicator
    if (velocityRatio !== null && velocityRatio !== undefined) {
      if (velocityRatio >= 1.3) indicators.push({ label: 'HOT', color: 'bg-warning/100 text-white' });
      else if (velocityRatio < 0.7) indicators.push({ label: 'CHẬM', color: 'bg-info text-white' });
    }

    // Lead time indicator
    if (leadTimeDays !== null && leadTimeDays !== undefined) {
      if (leadTimeDays <= 7) indicators.push({ label: 'GẤP', color: 'bg-destructive text-white' });
    }

    // Day type
    if (dayTypeMix === 'WEEKEND') indicators.push({ label: 'T7CN', color: 'bg-primary text-white' });

    return indicators;
  };

  const miniIndicators = getMiniIndicators();

  // Build tooltip content
  const hasFactors = factors && factors.length > 0;
  const hasScores = volumeScore !== null || capacityScore !== null || areaScore !== null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col items-end gap-0.5 cursor-help">
          {/* Main value with badge */}
          <div className="flex items-center gap-1">
            <EstBadge />
            <span className={`font-medium ${isPositive ? 'text-success' : isNegative ? 'text-destructive' : ''}`}>
              {isPositive ? '+' : ''}{value.toFixed(0)}%
            </span>
          </div>

          {/* Mini indicators row - using small badges instead of emojis */}
          {miniIndicators.length > 0 && (
            <div className="flex items-center gap-0.5">
              {miniIndicators.map((ind, i) => (
                <span key={i} className={`text-micro px-1 py-0.5 rounded font-medium ${ind.color}`}>
                  {ind.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-md p-3">
        <div className="text-xs space-y-3">
          {/* Zone Header */}
          <div className="bg-muted/50 rounded p-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Pricing Zone:</span>
              <span className={zoneInfo.color}>{zoneInfo.zone}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Phạm vi cho phép:</span>
              <span className="font-medium text-primary">{zoneInfo.range}</span>
            </div>
            <p className="text-muted-foreground mt-2 text-micro leading-relaxed">{zoneInfo.description}</p>
          </div>

          {/* Key Metrics - 2 columns */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-2">
            <div className="font-semibold col-span-2 text-muted-foreground mb-1">Chỉ số chính</div>

            {marginPercent !== null && marginPercent !== undefined && (
              <>
                <span>Margin:</span>
                <span className={`text-right font-medium ${marginPercent < 12 ? 'text-destructive' : marginPercent > 25 ? 'text-primary' : 'text-success'}`}>
                  {marginPercent.toFixed(1)}%
                </span>
              </>
            )}

            {velocityRatio !== null && velocityRatio !== undefined && (
              <>
                <span>Velocity:</span>
                <span className={`text-right font-medium ${velocityRatio >= 1.0 ? 'text-success' : velocityRatio < 0.7 ? 'text-destructive' : 'text-warning'}`}>
                  {velocityRatio.toFixed(2)}x
                </span>
              </>
            )}

            {leadTimeDays !== null && leadTimeDays !== undefined && (
              <>
                <span>Lead Time:</span>
                <span className={`text-right font-medium ${leadTimeDays <= 7 ? 'text-destructive' : leadTimeDays >= 30 ? 'text-info' : ''}`}>
                  {leadTimeDays} ngày
                </span>
              </>
            )}

            {dayTypeMix && (
              <>
                <span>Loại ngày:</span>
                <span className="text-right font-medium">
                  {dayTypeMix === 'WEEKEND' ? 'Cuối tuần' : dayTypeMix === 'WEEKDAY' ? 'Ngày thường' : 'Hỗn hợp'}
                </span>
              </>
            )}
          </div>

          {/* Scores */}
          {hasScores && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-2">
              <div className="font-semibold col-span-2 text-muted-foreground mb-1">Điểm đánh giá</div>

              {volumeScore !== null && (
                <>
                  <span>Volume (vs baseline):</span>
                  <span className={`text-right font-medium ${volumeScore >= 1.0 ? 'text-success' : volumeScore < 0.5 ? 'text-destructive' : 'text-warning'}`}>
                    {volumeScore.toFixed(2)}x
                  </span>
                </>
              )}

              {capacityScore !== null && (
                <>
                  <span>Capacity (vs peak):</span>
                  <span className={`text-right font-medium ${capacityScore >= 0.8 ? 'text-success' : capacityScore < 0.5 ? 'text-destructive' : 'text-warning'}`}>
                    {(capacityScore * 100).toFixed(0)}%
                  </span>
                </>
              )}

              {areaScore !== null && (
                <>
                  <span>Area (vs district):</span>
                  <span className={`text-right font-medium ${areaScore >= 1.0 ? 'text-success' : areaScore < 0.7 ? 'text-destructive' : 'text-warning'}`}>
                    {areaScore.toFixed(2)}x
                  </span>
                </>
              )}
            </div>
          )}

          {/* Factors - show ALL */}
          {hasFactors && (
            <div className="border-t pt-2">
              <div className="font-semibold text-muted-foreground mb-2">Logic tính toán ({factors!.length} yếu tố)</div>
              <div className="bg-muted dark:bg-muted rounded p-2 max-h-32 overflow-y-auto">
                <ol className="list-decimal list-inside space-y-1">
                  {factors!.map((f, i) => (
                    <li key={i} className="text-micro text-muted-foreground leading-relaxed">{f}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="border-t pt-2 text-micro text-muted-foreground">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-medium mr-1">Chú thích:</span>
              <span className="px-1 py-0.5 bg-destructive/100 text-white rounded text-micro">LỖ</span>
              <span className="px-1 py-0.5 bg-warning/100 text-white rounded text-micro">SÀN</span>
              <span className="px-1 py-0.5 bg-primary/100 text-white rounded text-micro">CAO</span>
              <span className="px-1 py-0.5 bg-warning/100 text-white rounded text-micro">HOT</span>
              <span className="px-1 py-0.5 bg-info text-white rounded text-micro">CHẬM</span>
              <span className="px-1 py-0.5 bg-destructive text-white rounded text-micro">GẤP</span>
              <span className="px-1 py-0.5 bg-primary text-white rounded text-micro">T7CN</span>
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function FulfillmentRateBadge({ rate }: { rate: number }) {
  const pct = (rate * 100).toFixed(0);
  const color = rate >= 0.9 ? 'text-success' : rate >= 0.75 ? 'text-warning' : 'text-destructive';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`text-xs font-medium ${color}`}>{pct}%</span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Fulfillment Rate: {pct}%</p>
        <p className="text-xs text-muted-foreground">
          Tỷ lệ booking thực tế check-in so với tổng booking
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * SourceBadge - Shows Host ADR reference source level
 * 
 * FALLBACK LADDER (accuracy decreasing):
 * - EXACT: property + roomType (most accurate)
 * - PROP_BED: property + bedroom_count (good accuracy)
 * - PROP_ALL: property only (less accurate - warning)
 * - AREA_BED: area + bedroom_count (regional fallback)
 * - GLOBAL_BED: global + bedroom_count (last resort)
 * - none: no data available
 */
function SourceBadge({ source }: { source: ForecastRow['hostAdrRefSource'] }) {
  const labels: Record<typeof source, string> = {
    'EXACT': 'Chính xác',       // property + roomType
    'PROP_BED': 'Prop+BR',      // property + bedroom count
    'PROP_ALL': 'Prop (all)',   // property only - warning
    'AREA_BED': 'Area+BR',      // area + bedroom count
    'GLOBAL_BED': 'Global+BR',  // global + bedroom count
    'none': 'N/A',
  };

  // Color coding: green=best, yellow=ok, orange=warning, red=worst
  const colorClass =
    source === 'EXACT' ? 'text-success font-medium' :
      source === 'PROP_BED' ? 'text-success' :
        source === 'PROP_ALL' ? 'text-warning' :
          source === 'AREA_BED' ? 'text-warning' :
            source === 'GLOBAL_BED' ? 'text-warning' :
              'text-muted-foreground';  // none

  return <span className={`text-micro ${colorClass}`}>{labels[source]}</span>;
}

// ============================================================================
// LAST ADJUSTED CELL COMPONENT
// ============================================================================

interface LastAdjustedCellProps {
  row: ForecastRow;
  adjustment: PriceAdjustment | undefined;
  onLogAdjustment: (adjustmentPercent: number, notes?: string) => void;
  isLogging: boolean;
}

function LastAdjustedCell({ row, adjustment, onLogAdjustment, isLogging }: LastAdjustedCellProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [inputPercent, setInputPercent] = useState<string>('');
  const [inputNotes, setInputNotes] = useState<string>('');

  const urgency = getReviewUrgency(adjustment);

  // Format time since last adjustment
  const formatTimeSince = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: vi });
    } catch {
      return dateStr;
    }
  };

  const handleSubmit = () => {
    const percent = parseFloat(inputPercent) || row.suggestedAdjustment || 0;
    onLogAdjustment(percent, inputNotes || undefined);
    setShowDialog(false);
    setInputPercent('');
    setInputNotes('');
  };

  // Urgency badge colors
  const urgencyColors = {
    'new': 'bg-info/10 text-info border-info/20',
    'due': 'bg-warning/10 text-warning border-warning/20',
    'overdue': 'bg-destructive/10 text-destructive border-destructive/20',
    'ok': 'bg-success/10 text-success border-success/20',
  };

  const urgencyLabels = {
    'new': 'Chưa điều chỉnh',
    'due': 'Cần review',
    'overdue': 'Quá hạn!',
    'ok': 'OK',
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Show last adjustment info */}
      {adjustment ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`text-xs px-2 py-0.5 rounded border cursor-help ${urgencyColors[urgency]}`}>
              {adjustment.adjustment_percent >= 0 ? '+' : ''}{adjustment.adjustment_percent}%
              <span className="ml-1 opacity-70">
                ({adjustment.days_since_adjustment}d)
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[300px]">
            <div className="text-xs space-y-1">
              <p><strong>Điều chỉnh lần cuối:</strong> {formatTimeSince(adjustment.adjusted_at)}</p>
              <p><strong>Mức điều chỉnh:</strong> {formatAdjustment(adjustment.adjustment_percent)}</p>
              {adjustment.pre_margin_percent !== null && (
                <p><strong>Margin lúc đó:</strong> {adjustment.pre_margin_percent.toFixed(1)}%</p>
              )}
              {adjustment.pre_velocity_ratio !== null && (
                <p><strong>Velocity lúc đó:</strong> {adjustment.pre_velocity_ratio.toFixed(2)}x</p>
              )}
              {adjustment.notes && <p><strong>Ghi chú:</strong> {adjustment.notes}</p>}
            </div>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Badge variant="outline" className={urgencyColors['new']}>
          {urgencyLabels['new']}
        </Badge>
      )}

      {/* Log adjustment button */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={isLogging}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {adjustment ? 'Cập nhật' : 'Đã điều chỉnh'}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Ghi nhận điều chỉnh giá</DialogTitle>
            <DialogDescription>
              {row.propertyName} - {row.roomType} - {row.periodLabel}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Current metrics */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Margin hiện tại:</div>
              <div className="font-medium">{row.expectedMarginPercent?.toFixed(1) ?? 'N/A'}%</div>
              <div>Velocity hiện tại:</div>
              <div className="font-medium">{row.futureVelocityRatioClamped?.toFixed(2) ?? 'N/A'}x</div>
              <div>Đề xuất:</div>
              <div className="font-medium text-primary">
                {row.suggestedAdjustment !== null
                  ? (row.suggestedAdjustment >= 0 ? '+' : '') + row.suggestedAdjustment + '%'
                  : 'Không có'}
              </div>
            </div>

            {/* Input for adjustment percent */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Mức điều chỉnh đã thực hiện (%):</label>
              <input
                type="number"
                step="0.5"
                placeholder={row.suggestedAdjustment?.toString() ?? '0'}
                value={inputPercent}
                onChange={(e) => setInputPercent(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Để trống sẽ dùng mức đề xuất: {row.suggestedAdjustment ?? 0}%
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Ghi chú (tuỳ chọn):</label>
              <input
                type="text"
                placeholder="VD: Đã tăng trên Booking.com"
                value={inputNotes}
                onChange={(e) => setInputNotes(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>

            {/* Submit button */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Huỷ</Button>
              <Button onClick={handleSubmit} disabled={isLogging}>
                {isLogging ? 'Đang lưu...' : 'Xác nhận'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface PriceSpreadForecastTableProps {
  data: ForecastRow[];
  kpi: ForecastKpi | null;
  isLoading?: boolean;
  title?: string;
}

export function PriceSpreadForecastTable({
  data,
  kpi,
  isLoading = false,
  title = 'Dự báo Giá (Estimated)',
}: PriceSpreadForecastTableProps) {
  // Filters state
  const [selectedPropertyName, setSelectedPropertyName] = useState<string>('all');
  const [selectedRoomType, setSelectedRoomType] = useState<string>('all');
  const [selectedDayType, setSelectedDayType] = useState<string>('all'); // NEW: Day type filter
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // NEW: Month filter (for week/day granularity)
  const [selectedWeek, setSelectedWeek] = useState<string>('all'); // NEW: Week filter (for day granularity)
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [showNeedsReview, setShowNeedsReview] = useState<boolean>(false); // NEW: Filter for rows needing review

  // Fetch adjustment tracking data
  const { data: adjustmentMap, isLoading: adjustmentsLoading } = useLatestAdjustments();
  const logAdjustment = useLogAdjustment();

  // Detect granularity from first data item
  const detectedGranularity = useMemo(() => {
    if (data.length > 0 && data[0].periodKey) {
      return detectGranularity(data[0].periodKey);
    }
    return 'month';
  }, [data]);

  // Helper: Extract month from periodKey
  const extractMonthFromPeriod = (periodKey: string): string => {
    if (periodKey.includes('W')) {
      // Week format: "2026-W05" → approximate month
      const year = periodKey.substring(0, 4);
      const weekNum = parseInt(periodKey.split('W')[1], 10);
      const approxMonth = Math.ceil(weekNum / 4.3);
      return `${year}-${approxMonth.toString().padStart(2, '0')}`;
    } else if (periodKey.length === 10) {
      // Day format: "2026-01-15" → "2026-01"
      return periodKey.substring(0, 7);
    }
    // Month format: already "2026-01"
    return periodKey;
  };

  // Helper: Extract week from day periodKey
  const extractWeekFromPeriod = (periodKey: string): string | null => {
    if (periodKey.length === 10) {
      // Day format: calculate week
      const date = parseISO(periodKey);
      const weekNum = getWeek(date, { weekStartsOn: 1 });
      const year = periodKey.substring(0, 4);
      return `${year}-W${weekNum.toString().padStart(2, '0')}`;
    }
    if (periodKey.includes('W')) {
      return periodKey;
    }
    return null; // Month format has no week
  };

  // Get unique property names from all data
  const propertyNames = useMemo(() => {
    const names = new Set<string>();
    data.forEach(row => {
      if (row.propertyName) names.add(row.propertyName);
    });
    return Array.from(names).sort();
  }, [data]);

  // Get unique months for cascading filter (when week/day granularity)
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    data.forEach(row => {
      if (row.periodKey) {
        months.add(extractMonthFromPeriod(row.periodKey));
      }
    });
    return Array.from(months).sort();
  }, [data]);

  // Get unique weeks for cascading filter (when day granularity)
  const availableWeeks = useMemo(() => {
    if (detectedGranularity !== 'day') return [];
    const weeks = new Set<string>();
    data.forEach(row => {
      if (row.periodKey) {
        // Filter by selected month first
        if (selectedMonth !== 'all') {
          const rowMonth = extractMonthFromPeriod(row.periodKey);
          if (rowMonth !== selectedMonth) return;
        }
        const week = extractWeekFromPeriod(row.periodKey);
        if (week) weeks.add(week);
      }
    });
    return Array.from(weeks).sort();
  }, [data, detectedGranularity, selectedMonth]);

  // Cascading filter: Room types depend on selected property
  const roomTypesForProperty = useMemo(() => {
    const types = new Set<string>();
    data.forEach(row => {
      // If no property selected, show all room types
      // If property selected, only show room types for that property
      if (selectedPropertyName === 'all' || row.propertyName === selectedPropertyName) {
        if (row.roomType) types.add(row.roomType);
      }
    });
    return Array.from(types).sort();
  }, [data, selectedPropertyName]);

  // Get unique periods from data (filtered by property, room type, month, week)
  const periodsForSelection = useMemo(() => {
    const periods = new Set<string>();
    data.forEach(row => {
      const matchProperty = selectedPropertyName === 'all' || row.propertyName === selectedPropertyName;
      const matchRoom = selectedRoomType === 'all' || row.roomType === selectedRoomType;

      // Month filter for week/day granularity
      let matchMonth = true;
      if (selectedMonth !== 'all' && (detectedGranularity === 'week' || detectedGranularity === 'day')) {
        const rowMonth = extractMonthFromPeriod(row.periodKey);
        matchMonth = rowMonth === selectedMonth;
      }

      // Week filter for day granularity
      let matchWeek = true;
      if (selectedWeek !== 'all' && detectedGranularity === 'day') {
        const rowWeek = extractWeekFromPeriod(row.periodKey);
        matchWeek = rowWeek === selectedWeek;
      }

      if (matchProperty && matchRoom && matchMonth && matchWeek && row.periodKey) {
        periods.add(row.periodKey);
      }
    });
    return Array.from(periods).sort();
  }, [data, selectedPropertyName, selectedRoomType, selectedMonth, selectedWeek, detectedGranularity]);

  // Reset cascading filters when parent changes
  useEffect(() => {
    if (selectedPropertyName !== 'all' && selectedRoomType !== 'all') {
      if (!roomTypesForProperty.includes(selectedRoomType)) {
        setSelectedRoomType('all');
      }
    }
  }, [selectedPropertyName, roomTypesForProperty, selectedRoomType]);

  useEffect(() => {
    if (selectedMonth !== 'all' && selectedWeek !== 'all') {
      if (!availableWeeks.includes(selectedWeek)) {
        setSelectedWeek('all');
      }
    }
  }, [selectedMonth, availableWeeks, selectedWeek]);

  useEffect(() => {
    if (selectedPeriod !== 'all') {
      if (!periodsForSelection.includes(selectedPeriod)) {
        setSelectedPeriod('all');
      }
    }
  }, [selectedPropertyName, selectedRoomType, selectedMonth, selectedWeek, periodsForSelection, selectedPeriod]);

  // Helper to build adjustment lookup key (matches forecast groupKey structure)
  const getAdjustmentKey = (row: ForecastRow): string => {
    // Extract month from periodKey for adjustment lookup
    const month = row.periodKey.length === 10
      ? row.periodKey.substring(0, 7)
      : row.periodKey.includes('W')
        ? extractMonthFromPeriod(row.periodKey)
        : row.periodKey;
    return `${row.propertyId}|||${row.roomType}|||${month}`;
  };

  // Filter data based on all selections
  const filteredData = useMemo(() => {
    return data.filter(row => {
      if (selectedPropertyName !== 'all' && row.propertyName !== selectedPropertyName) return false;
      if (selectedRoomType !== 'all' && row.roomType !== selectedRoomType) return false;
      if (selectedDayType !== 'all' && row.dayTypeMix !== selectedDayType) return false;

      // Month filter
      if (selectedMonth !== 'all' && (detectedGranularity === 'week' || detectedGranularity === 'day')) {
        const rowMonth = extractMonthFromPeriod(row.periodKey);
        if (rowMonth !== selectedMonth) return false;
      }

      // Week filter
      if (selectedWeek !== 'all' && detectedGranularity === 'day') {
        const rowWeek = extractWeekFromPeriod(row.periodKey);
        if (rowWeek !== selectedWeek) return false;
      }

      if (selectedPeriod !== 'all' && row.periodKey !== selectedPeriod) return false;

      // Needs Review filter: only show rows not adjusted in >14 days
      if (showNeedsReview && adjustmentMap) {
        const key = getAdjustmentKey(row);
        const lastAdj = adjustmentMap.get(key);
        if (!needsReview(lastAdj)) return false;
      }

      return true;
    });
  }, [data, selectedPropertyName, selectedRoomType, selectedDayType, selectedMonth, selectedWeek, selectedPeriod, detectedGranularity, showNeedsReview, adjustmentMap]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Không có dữ liệu booking tương lai trong khoảng thời gian đã chọn.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          <EstBadge />
        </CardTitle>
        <CardDescription>
          Dựa trên booking pipeline + ADR host lịch sử. Không phải dữ liệu thực tế đã thực hiện.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Warning Banner - Always visible in Forecast mode */}
        <Alert variant="default" className="bg-warning/10 border-warning/20">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-xs text-warning">
            <strong>Forecast (Estimated):</strong> Dựa trên booking pipeline + ADR host lịch sử.
            Không phải dữ liệu đã thực hiện. Không bao gồm host availability.
          </AlertDescription>
        </Alert>

        {/* KPI Summary */}
        {kpi && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-muted-foreground text-xs flex items-center gap-1">
                Đêm pipeline <EstBadge />
              </div>
              <div className="font-bold">{formatNumber(kpi.totalBookedNights)}</div>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-muted-foreground text-xs flex items-center gap-1">
                Đêm dự kiến <EstBadge />
              </div>
              <div className="font-bold">{formatNumber(Math.round(kpi.totalExpectedExecutedNights))}</div>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-muted-foreground text-xs flex items-center gap-1">
                Margin TB <EstBadge />
              </div>
              <div className={`font-bold ${(kpi.avgExpectedMarginPercent ?? 0) < 0 ? 'text-destructive' : (kpi.avgExpectedMarginPercent ?? 0) >= 20 ? 'text-success' : ''}`}>
                {kpi.avgExpectedMarginPercent !== null ? `${kpi.avgExpectedMarginPercent.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-muted-foreground text-xs">Độ tin cậy</div>
              <div className="flex gap-1 text-xs">
                <span className="text-success">{kpi.highConfidenceCount} cao</span>
                <span className="text-warning">{kpi.medConfidenceCount} TB</span>
                <span className="text-destructive">{kpi.lowConfidenceCount} thấp</span>
              </div>
            </div>
          </div>
        )}

        {/* Confidence Distribution */}
        {kpi && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Signal:</span>
            <Badge variant="default" className="bg-success">{kpi.increaseCount} Tăng</Badge>
            <Badge variant="secondary">{kpi.holdCount} Giữ</Badge>
            <Badge variant="destructive">{kpi.decreaseCount} Giảm</Badge>
            <Badge variant="outline" className="border-info text-info">{kpi.reviewCount} Xem xét</Badge>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Bộ lọc:</span>
          </div>

          {/* Property Name Filter */}
          <Select value={selectedPropertyName} onValueChange={setSelectedPropertyName}>
            <SelectTrigger className="w-[200px] h-8">
              <SelectValue placeholder="Chỗ nghỉ OTA" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả chỗ nghỉ</SelectItem>
              {propertyNames.map(name => (
                <SelectItem key={name} value={name}>
                  <span className="truncate max-w-[180px]">{name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Room Type Filter - Cascading: depends on property */}
          <Select value={selectedRoomType} onValueChange={setSelectedRoomType}>
            <SelectTrigger className="w-[180px] h-8">
              <SelectValue placeholder="Loại phòng OTA" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại phòng</SelectItem>
              {roomTypesForProperty.map(room => (
                <SelectItem key={room} value={room}>
                  <span className="truncate max-w-[160px]">{room}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Day Type Filter - Always visible */}
          <Select value={selectedDayType} onValueChange={setSelectedDayType}>
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue placeholder="Loại ngày" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả ngày</SelectItem>
              <SelectItem value="WEEKDAY">Ngày thường</SelectItem>
              <SelectItem value="WEEKEND">Cuối tuần</SelectItem>
            </SelectContent>
          </Select>

          {/* Month Filter - Only show for week/day granularity */}
          {(detectedGranularity === 'week' || detectedGranularity === 'day') && (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue placeholder="Tháng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả tháng</SelectItem>
                {availableMonths.map(month => (
                  <SelectItem key={month} value={month}>
                    Tháng {parseInt(month.substring(5, 7), 10)}/{month.substring(0, 4)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Week Filter - Only show for day granularity */}
          {detectedGranularity === 'day' && (
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue placeholder="Tuần" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả tuần</SelectItem>
                {availableWeeks.map(week => (
                  <SelectItem key={week} value={week}>
                    Tuần {week.split('W')[1]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Period Filter - Cascading: depends on property + room type + month + week */}
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px] h-8">
              <SelectValue placeholder={getPeriodFilterLabel(detectedGranularity)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{getPeriodFilterLabel(detectedGranularity)}</SelectItem>
              {periodsForSelection.map(period => (
                <SelectItem key={period} value={period}>{formatPeriodDisplay(period)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Needs Review Filter - Highlight rows not adjusted in >14 days */}
          <Button
            variant={showNeedsReview ? "default" : "outline"}
            size="sm"
            onClick={() => setShowNeedsReview(!showNeedsReview)}
            className="h-8 gap-1"
          >
            <Clock className="h-3.5 w-3.5" />
            Cần review
            {showNeedsReview && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {filteredData.length}
              </Badge>
            )}
          </Button>

          {/* Results count */}
          <span className="text-sm text-muted-foreground">
            Hiển thị {filteredData.length}/{data.length} dòng
          </span>
        </div>

        {/* Data Table */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 whitespace-nowrap">
                <TableHead className="font-semibold min-w-[150px]">Tên chỗ nghỉ OTA</TableHead>
                <TableHead className="font-semibold min-w-[100px]">Loại phòng OTA</TableHead>
                <TableHead className="text-center">Loại ngày</TableHead>
                <TableHead className="text-center">Thời gian</TableHead>
                <TableHead className="text-right">Đêm đặt</TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>OTA ADR</span>
                    <EstBadge />
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>Host ADR</span>
                    <EstBadge />
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>Margin</span>
                    <EstBadge />
                  </div>
                </TableHead>
                <TableHead className="text-center">Velocity</TableHead>
                <TableHead className="text-center">Khu vực</TableHead>
                <TableHead className="text-center">Signal</TableHead>
                <TableHead className="text-right">Đề xuất</TableHead>
                <TableHead className="text-center">Độ tin cậy</TableHead>
                <TableHead className="text-center min-w-[120px]">Đã điều chỉnh</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((row) => (
                <TableRow key={row.groupKey} className="hover:bg-muted/30">
                  {/* Property Name */}
                  <TableCell>
                    <span className="font-medium block truncate max-w-[180px]" title={row.propertyName}>{row.propertyName}</span>
                  </TableCell>

                  {/* Room Type */}
                  <TableCell>
                    <span className="block truncate max-w-[120px]" title={row.roomType}>{row.roomType}</span>
                  </TableCell>

                  {/* Day Type */}
                  <TableCell className="text-center">
                    <DayTypeMixBadge dayTypeMix={row.dayTypeMix} />
                  </TableCell>

                  {/* Period - Vietnamese format */}
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center">
                      <span className="text-sm">{formatPeriodDisplay(row.periodKey)}</span>
                      {row.leadTimeDays !== null && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {row.leadTimeDays}d
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Booked Nights */}
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col items-end cursor-help">
                          <span className="font-medium">{formatNumber(row.bookedNightsFuture)}</span>
                          <span className="text-xs text-muted-foreground">
                            → {formatNumber(Math.round(row.expectedExecutedNights))}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          <strong>Đêm đã đặt:</strong> {row.bookedNightsFuture}<br />
                          <strong>Dự kiến thực hiện:</strong> {Math.round(row.expectedExecutedNights)}<br />
                          <strong>Fulfillment Rate:</strong> {(row.fulfillmentRate * 100).toFixed(0)}%
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>

                  {/* OTA ADR Reference */}
                  <TableCell className="text-right">
                    {row.otaAdrRef !== null ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-end cursor-help">
                            <span className="tabular-nums">{formatCurrency(row.otaAdrRef)}</span>
                            <span className="text-xs text-muted-foreground">n={row.otaAdrRefSample}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            <strong>OTA ADR Reference (NET)</strong><br />
                            Sample: {row.otaAdrRefSample} bookings<br />
                            Variance: {row.otaAdrRefVariance !== null ? `${(row.otaAdrRefVariance * 100).toFixed(1)}%` : 'N/A'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Host ADR Reference */}
                  <TableCell className="text-right">
                    {row.hostAdrRef !== null ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-end cursor-help">
                            {/* Show adjusted ADR if different, else show raw */}
                            <span className="tabular-nums">
                              {formatCurrency(row.hostAdrRefAdjusted ?? row.hostAdrRef)}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">n={row.hostAdrRefSample}</span>
                              <SourceBadge source={row.hostAdrRefSource} />
                              {/* Confidence indicator */}
                              {row.hostAdrConfidence && (
                                <span className={`text-micro px-1 rounded ${row.hostAdrConfidence === 'high' ? 'bg-success/10 text-success' :
                                    row.hostAdrConfidence === 'medium' ? 'bg-warning/10 text-warning' :
                                      'bg-destructive/10 text-destructive'
                                  }`}>
                                  {row.hostAdrConfidence === 'high' ? '🎯' :
                                    row.hostAdrConfidence === 'medium' ? '⚠️' : '❓'}
                                </span>
                              )}
                              {/* Trend indicator */}
                              {row.hostAdrTrend !== null && Math.abs(row.hostAdrTrend) > 0.05 && (
                                <span className={`text-xs ${row.hostAdrTrend > 0 ? 'text-warning' : 'text-info'}`}>
                                  {row.hostAdrTrend > 0 ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs">
                            <strong>Host ADR Prediction</strong>
                            {/* Confidence badge */}
                            {row.hostAdrConfidence && (
                              <span className={`ml-2 px-1.5 py-0.5 rounded text-micro font-medium ${row.hostAdrConfidence === 'high' ? 'bg-success/10 text-success' :
                                  row.hostAdrConfidence === 'medium' ? 'bg-warning/10 text-warning' :
                                    'bg-destructive/10 text-destructive'
                                }`}>
                                {row.hostAdrConfidence === 'high' ? '🎯 High Conf' :
                                  row.hostAdrConfidence === 'medium' ? '⚠️ Medium' : '⚠️ Low'}
                              </span>
                            )}
                            <br />
                            Raw: {formatCurrency(row.hostAdrRef)}<br />
                            {row.hostAdrRefAdjusted && row.hostAdrRefAdjusted !== row.hostAdrRef && (
                              <>
                                <span className="font-medium text-info">
                                  Predicted: {formatCurrency(row.hostAdrRefAdjusted)}
                                </span>
                                {/* Show actual adjustment percentage */}
                                <span className="text-muted-foreground ml-1">
                                  ({row.hostAdrRef && row.hostAdrRefAdjusted > row.hostAdrRef ? '+' : ''}
                                  {row.hostAdrRef ? (((row.hostAdrRefAdjusted - row.hostAdrRef) / row.hostAdrRef) * 100).toFixed(1) : 0}% adj)
                                </span>
                                <br />
                              </>
                            )}
                            {/* Range estimate - always show if available */}
                            {row.hostAdrPredictedLow && row.hostAdrPredictedHigh && (
                              <>
                                <span className="text-muted-foreground">
                                  Range: {formatCurrency(row.hostAdrPredictedLow)} ~ {formatCurrency(row.hostAdrPredictedHigh)}
                                </span>
                                <br />
                              </>
                            )}
                            Source: {row.hostAdrRefSource} | Sample: {row.hostAdrRefSample}<br />
                            <hr className="my-1 border-border" />
                            <strong>Trend Analysis</strong><br />
                            {row.hostAdrTrend !== null && (
                              <>
                                Combined: {row.hostAdrTrend > 0 ? '+' : ''}{(row.hostAdrTrend * 100).toFixed(1)}%
                                <span className="text-muted-foreground ml-1">
                                  ({row.hostAdrTrendSource === 'market' ? '📊 Market' :
                                    row.hostAdrTrendSource === 'property' ? '🏢 Property' :
                                      row.hostAdrTrendSource === 'prop+room' ? '🚪 Room' : ''})
                                </span>
                                <br />
                              </>
                            )}
                            {row.hostAdrHostTrend !== null && (
                              <>└ Host: {row.hostAdrHostTrend > 0 ? '+' : ''}{(row.hostAdrHostTrend * 100).toFixed(1)}%<br /></>
                            )}
                            {row.hostAdrOtaTrend !== null && (
                              <>└ OTA: {row.hostAdrOtaTrend > 0 ? '+' : ''}{(row.hostAdrOtaTrend * 100).toFixed(1)}%<br /></>
                            )}
                            {row.hostAdrOtaDemandIndex !== null && (
                              <>
                                OTA Demand: {row.hostAdrOtaDemandIndex.toFixed(2)}x
                                <span className={row.hostAdrOtaDemandIndex > 1.2 ? 'text-warning' : row.hostAdrOtaDemandIndex < 0.8 ? 'text-info' : ''}>
                                  {row.hostAdrOtaDemandIndex > 1.2 ? ' 🔥' : row.hostAdrOtaDemandIndex < 0.8 ? ' ❄️' : ''}
                                </span>
                                <br />
                              </>
                            )}
                            {row.hostAdrSeasonalFactor !== null && (
                              <>Seasonal: ×{row.hostAdrSeasonalFactor.toFixed(2)}<br /></>
                            )}
                            <hr className="my-1 border-border" />
                            <strong>Risk Metrics</strong><br />
                            {row.hostAdrVolatility !== null && (
                              <>Volatility: {(row.hostAdrVolatility * 100).toFixed(1)}%
                                <span className={row.hostAdrVolatility > 0.3 ? 'text-destructive' : row.hostAdrVolatility < 0.15 ? 'text-success' : ''}>
                                  {row.hostAdrVolatility > 0.3 ? ' ⚠️ High' : row.hostAdrVolatility < 0.15 ? ' ✓ Low' : ''}
                                </span>
                                <br />
                              </>
                            )}
                            <span className="text-success font-medium">
                              Total Cap: ±15% (FIXED)
                            </span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground text-xs">Thiếu dữ liệu</span>
                    )}
                  </TableCell>

                  {/* Expected Margin */}
                  <TableCell className="text-right">
                    {row.expectedMarginPercent !== null ? (
                      <span className={`font-medium ${row.expectedMarginPercent < 0 ? 'text-destructive' : row.expectedMarginPercent >= 20 ? 'text-success' : ''}`}>
                        {row.expectedMarginPercent.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Future Velocity Ratio */}
                  <TableCell className="text-center">
                    {row.futureVelocityRatioClamped !== null ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`text-sm ${row.futureVelocityRatioClamped >= 1.3 ? 'text-success font-medium' : row.futureVelocityRatioClamped < 0.8 ? 'text-destructive' : ''}`}>
                            {row.futureVelocityRatioClamped.toFixed(1)}x
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            <strong>Velocity Ratio (clamped 0.2–3.0)</strong><br />
                            Raw: {row.futureVelocityRatio?.toFixed(2)}x<br />
                            Current: {row.futureVelocity?.toFixed(3)}/day<br />
                            Baseline: {row.baselineVelocity?.toFixed(3)}/day<br />
                            Sample: {row.baselineSampleSize ?? 0} bookings
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Area Score - NEW */}
                  <TableCell className="text-center">
                    {row.areaScore !== null ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`text-sm font-medium ${row.areaScore >= 1.0 ? 'text-success' : row.areaScore < 0.7 ? 'text-destructive' : 'text-warning'}`}>
                            {row.areaScore.toFixed(2)}x
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            <strong>Area Score (vs district)</strong><br />
                            Quận: {row.district || 'N/A'}<br />
                            So với trung bình khu vực:<br />
                            {row.areaScore >= 1.0 ? '✓ Cao hơn TB' : row.areaScore < 0.7 ? '✗ Thấp hơn TB nhiều' : '~ Gần TB'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground text-xs">—</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Không có dữ liệu khu vực.<br />Có thể do chưa map property với district.</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>

                  {/* Signal */}
                  <TableCell className="text-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span><ForecastSignalBadge signal={row.signal} reason={row.signalReason} /></span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {row.signalReason ? SIGNAL_REASON_LABELS[row.signalReason as SignalReason] : 'Không xác định'}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>

                  {/* Suggested Adjustment */}
                  <TableCell className="text-right">
                    <SuggestedAdjustment
                      value={row.suggestedAdjustment}
                      factors={row.comprehensiveScore?.factors}
                      volumeScore={row.volumeScore}
                      capacityScore={row.capacityScore}
                      areaScore={row.areaScore}
                      marginPercent={row.expectedMarginPercent}
                      velocityRatio={row.futureVelocityRatioClamped}
                      leadTimeDays={row.leadTimeDays}
                      dayTypeMix={row.dayTypeMix}
                    />
                  </TableCell>

                  {/* Confidence */}
                  <TableCell className="text-center">
                    <ConfidenceBadge
                      confidence={row.confidence}
                      hostSample={row.hostAdrRefSample}
                      otaSample={row.otaAdrRefSample}
                    />
                  </TableCell>

                  {/* Last Adjusted + Action Button */}
                  <TableCell className="text-center">
                    <LastAdjustedCell
                      row={row}
                      adjustment={adjustmentMap?.get(getAdjustmentKey(row))}
                      onLogAdjustment={(adjustmentPercent, notes) => {
                        logAdjustment.mutate({
                          propertyId: row.propertyId,
                          propertyName: row.propertyName,
                          roomType: row.roomType,
                          periodKey: row.periodKey.length === 10
                            ? row.periodKey.substring(0, 7)
                            : row.periodKey.includes('W')
                              ? extractMonthFromPeriod(row.periodKey)
                              : row.periodKey,
                          dayType: row.dayTypeMix,
                          adjustmentPercent,
                          preMarginPercent: row.expectedMarginPercent,
                          preVelocityRatio: row.futureVelocityRatioClamped,
                          preVolumeScore: row.volumeScore,
                          preOtaAdr: row.otaAdrRef,
                          preHostAdr: row.hostAdrRef,
                          notes,
                        });
                      }}
                      isLogging={logAdjustment.isPending}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
