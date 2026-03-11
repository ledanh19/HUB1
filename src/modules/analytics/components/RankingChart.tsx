/**
 * RankingChart Component
 * 
 * Horizontal bar chart for displaying top/bottom items by metric.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { PivotRankingRow } from '../types';
import { formatCurrency, formatCurrencyShort, formatPercentNoSign, CHART_COLORS } from '../constants';

interface ChartDataItem {
  name: string;
  fullName: string;
  value: number;
  share: number;
  nights: number;
  bookings: number;
  revenueAdr: number | null;
  hostAdr: number | null;
  marginSpread: number | null;
  belowThreshold: boolean;
}

// Support both PivotRankingRow and generic data types
type RankingDataRow = PivotRankingRow | Record<string, unknown>;

interface RankingChartProps {
  data: RankingDataRow[];
  title?: string;
  subtitle?: string;
  metric?: 'revenue' | 'hostCost' | 'revenueAdr' | 'hostAdr' | 'marginSpread';
  isLoading?: boolean;
  height?: number;
  showTop?: boolean;
  // Flexible API for custom data shapes
  labelKey?: string;
  valueKey?: string;
  color?: string;
  formatValue?: (value: number) => string;
}

export function RankingChart({
  data,
  title = 'Top 10 theo doanh thu',
  subtitle,
  metric = 'revenue',
  isLoading = false,
  height = 350,
  showTop = true,
  labelKey,
  valueKey,
  color,
  formatValue: customFormatValue,
}: RankingChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle && <CardDescription>{subtitle}</CardDescription>}
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full" style={{ height }} />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle && <CardDescription>{subtitle}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
            Không có dữ liệu
          </div>
        </CardContent>
      </Card>
    );
  }

  // Helper to get value from row (works with PivotRankingRow or generic objects)
  const getRowValue = (row: RankingDataRow, key: string): unknown => {
    return (row as Record<string, unknown>)[key];
  };

  const getValue = (row: RankingDataRow): number => {
    // If using custom valueKey, use that
    if (valueKey) {
      return (getRowValue(row, valueKey) as number) ?? 0;
    }
    // Otherwise use metric-based lookup for PivotRankingRow
    const typedRow = row as PivotRankingRow;
    switch (metric) {
      case 'revenue': return typedRow.revenueTotal ?? 0;
      case 'hostCost': return typedRow.hostCostTotal ?? 0;
      case 'revenueAdr': return typedRow.revenueAdr ?? 0;
      case 'hostAdr': return typedRow.hostAdr ?? 0;
      case 'marginSpread': return typedRow.marginSpread ?? 0;
      default: return typedRow.revenueTotal ?? 0;
    }
  };

  const getName = (row: RankingDataRow): string => {
    if (labelKey) {
      return String(getRowValue(row, labelKey) ?? '');
    }
    return String(getRowValue(row, 'pivotName') ?? '');
  };

  const chartData: ChartDataItem[] = data.map((row) => {
    const name = getName(row);
    const value = getValue(row);
    
    // BUG 11 FIX: Use proper field extraction with fallbacks
    return {
      name: name.length > 20 ? name.slice(0, 20) + '...' : name,
      fullName: name,
      value,
      share: (getRowValue(row, 'sharePct') as number) ?? 0,
      nights: (getRowValue(row, 'nightsTotal') as number) ?? (getRowValue(row, 'totalOtaNights') as number) ?? (getRowValue(row, 'nights') as number) ?? 0,
      bookings: (getRowValue(row, 'bookingsCount') as number) ?? (getRowValue(row, 'matchedLineCount') as number) ?? (getRowValue(row, 'bookings') as number) ?? 0,
      revenueAdr: (getRowValue(row, 'revenueAdr') as number | null) ?? (getRowValue(row, 'otaAdr') as number | null) ?? null,
      hostAdr: (getRowValue(row, 'hostAdr') as number | null) ?? null,
      marginSpread: (getRowValue(row, 'marginSpread') as number | null) ?? (getRowValue(row, 'avgSpread') as number | null) ?? null,
      belowThreshold: (getRowValue(row, 'belowSampleThreshold') as boolean) ?? false,
    };
  });

  const getBarColor = (value: number) => {
    // Use custom color if provided
    if (color) return color;
    if (metric === 'marginSpread') {
      return value >= 0 ? CHART_COLORS.positive : CHART_COLORS.negative;
    }
    if (metric === 'hostCost' || metric === 'hostAdr') {
      return CHART_COLORS.hostCost;
    }
    return CHART_COLORS.revenue;
  };

  const formatValueFn = (value: number) => {
    // Use custom format function if provided
    if (customFormatValue) return customFormatValue(value);
    if (metric === 'revenue' || metric === 'hostCost') {
      return formatCurrencyShort(value);
    }
    return formatCurrency(value);
  };

  /**
   * BUG 11 FIX: Tooltip must use the correct format based on metric type.
   * - For margin%: show as percentage
   * - For currency values: show as currency
   */
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataItem }> }) => {
    if (!active || !payload || !payload.length) return null;

    const item = payload[0]?.payload;
    if (!item) return null;
    
    // Determine if this is a percentage metric
    const isPercentMetric = metric === 'marginSpread' || customFormatValue?.toString().includes('%');
    
    // Format the main value appropriately
    const formattedValue = customFormatValue 
      ? customFormatValue(item.value)
      : isPercentMetric 
        ? `${item.value >= 0 ? '+' : ''}${item.value.toFixed(1)}%`
        : formatCurrency(item.value);

    return (
      <div className="bg-background border rounded-lg shadow-lg p-3 text-sm max-w-[250px]">
        <p className="font-medium mb-2 break-words">{item.fullName}</p>
        <div className="space-y-1">
          <p>
            <span className="text-muted-foreground">Giá trị:</span>{' '}
            <span className="font-medium">{formattedValue}</span>
          </p>
          {item.share > 0 && (
            <p>
              <span className="text-muted-foreground">Tỷ trọng:</span>{' '}
              <span className="font-medium">{formatPercentNoSign(item.share)}</span>
            </p>
          )}
          {item.belowThreshold ? (
            <Badge variant="secondary" className="text-xs">Low sample</Badge>
          ) : (
            <>
              {item.revenueAdr !== null && item.revenueAdr !== 0 && (
                <p>
                  <span className="text-muted-foreground">Revenue ADR:</span>{' '}
                  <span className="font-medium">{formatCurrency(item.revenueAdr)}</span>
                </p>
              )}
              {item.hostAdr !== null && item.hostAdr !== 0 && (
                <p>
                  <span className="text-muted-foreground">Host ADR:</span>{' '}
                  <span className="font-medium">{formatCurrency(item.hostAdr)}</span>
                </p>
              )}
            </>
          )}
          {(item.nights > 0 || item.bookings > 0) && (
            <p className="text-muted-foreground text-xs pt-1 border-t">
              {item.nights} đêm • {item.bookings} bookings
            </p>
          )}
        </div>
      </div>
    );
  };

  const dynamicHeight = Math.max(height, data.length * 35 + 60);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={dynamicHeight}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) => formatValueFn(v)}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`}
                  fill={entry.belowThreshold ? CHART_COLORS.neutral : getBarColor(entry.value)}
                  opacity={entry.belowThreshold ? 0.4 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
