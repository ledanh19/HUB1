/**
 * TrendComboChart Component
 * 
 * Combined bar + line chart for displaying revenue trends with ADR overlay.
 * 
 * Phase 7: Added comparison overlay support (dashed line for previous/yoy data).
 */

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { TimeSeriesRow } from '../types';
import { formatCurrency, formatCurrencyShort, CHART_COLORS } from '../constants';

interface ChartDataPoint {
  period: string;
  nights: number;
  bookings: number;
  belowThreshold: boolean;
  [key: string]: string | number | boolean | null;
}

interface TrendComboChartProps {
  data: TimeSeriesRow[];
  /** Optional comparison period data (previous period / YoY) */
  comparisonData?: TimeSeriesRow[];
  /** Label for comparison period */
  comparisonLabel?: string;
  title?: string;
  subtitle?: string;
  barDataKey?: 'revenueTotal' | 'hostCostTotal';
  barLabel?: string;
  lineDataKey?: 'revenueAdr' | 'hostAdr' | 'marginSpread';
  lineLabel?: string;
  isLoading?: boolean;
  height?: number;
}

export function TrendComboChart({
  data,
  comparisonData,
  comparisonLabel = 'Kỳ trước',
  title = 'Xu hướng doanh thu',
  subtitle,
  barDataKey = 'revenueTotal',
  barLabel = 'Doanh thu',
  lineDataKey = 'revenueAdr',
  lineLabel = 'ADR',
  isLoading = false,
  height = 300,
}: TrendComboChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
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
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
            Không có dữ liệu
          </div>
        </CardContent>
      </Card>
    );
  }

  // Merge main data with comparison data
  const hasComparison = comparisonData && comparisonData.length > 0;
  const compBarKey = `comp_${barDataKey}`;

  const chartData: ChartDataPoint[] = data.map((row, idx) => {
    const point: ChartDataPoint = {
      period: row.periodLabel,
      [barDataKey]: row[barDataKey],
      [lineDataKey]: row[lineDataKey],
      nights: row.nightsTotal,
      bookings: row.bookingsCount,
      belowThreshold: row.belowSampleThreshold,
    };

    // Overlay comparison data at matching index
    if (hasComparison && comparisonData[idx]) {
      point[compBarKey] = comparisonData[idx][barDataKey];
    }

    return point;
  });

  const barColor = barDataKey === 'hostCostTotal' ? CHART_COLORS.hostCost : CHART_COLORS.revenue;
  const lineColor = lineDataKey === 'hostAdr'
    ? CHART_COLORS.hostAdr
    : lineDataKey === 'marginSpread'
      ? CHART_COLORS.marginSpread
      : CHART_COLORS.revenueAdr;

  const compColor = '#94a3b8'; // slate-400 for comparison

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; payload: ChartDataPoint }>; label?: string }) => {
    if (!active || !payload || !payload.length) return null;

    const barValue = payload.find((p) => p.dataKey === barDataKey)?.value;
    const lineValue = payload.find((p) => p.dataKey === lineDataKey)?.value;
    const compValue = payload.find((p) => p.dataKey === compBarKey)?.value;
    const dataPayload = payload[0]?.payload;
    const nights = dataPayload?.nights;
    const bookings = dataPayload?.bookings;
    const belowThreshold = dataPayload?.belowThreshold;

    return (
      <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium mb-2">{label}</p>
        <div className="space-y-1">
          <p>
            <span className="text-muted-foreground">{barLabel}:</span>{' '}
            <span className="font-medium">{formatCurrency(barValue ?? 0)}</span>
          </p>
          {compValue !== undefined && compValue !== null && (
            <p>
              <span className="text-muted-foreground">{comparisonLabel}:</span>{' '}
              <span className="font-medium text-slate-500">{formatCurrency(compValue)}</span>
            </p>
          )}
          <p>
            <span className="text-muted-foreground">{lineLabel}:</span>{' '}
            {belowThreshold ? (
              <Badge variant="secondary" className="text-xs">Low sample</Badge>
            ) : (
              <span className="font-medium">{formatCurrency(lineValue ?? 0)}</span>
            )}
          </p>
          <p className="text-muted-foreground text-xs pt-1 border-t">
            {nights} đêm • {bookings} bookings
          </p>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="bar"
              orientation="left"
              tickFormatter={(v) => formatCurrencyShort(v)}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <YAxis
              yAxisId="line"
              orientation="right"
              tickFormatter={(v) => formatCurrencyShort(v)}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
              iconSize={10}
            />

            {/* Comparison bar (behind main, dashed outline) */}
            {hasComparison && (
              <Bar
                yAxisId="bar"
                dataKey={compBarKey}
                name={`${barLabel} (${comparisonLabel})`}
                fill={compColor}
                fillOpacity={0.25}
                stroke={compColor}
                strokeDasharray="4 2"
                radius={[4, 4, 0, 0]}
                maxBarSize={35}
              />
            )}

            {/* Main bar */}
            <Bar
              yAxisId="bar"
              dataKey={barDataKey}
              name={barLabel}
              fill={barColor}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />

            {/* Main line */}
            <Line
              yAxisId="line"
              type="monotone"
              dataKey={lineDataKey}
              name={lineLabel}
              stroke={lineColor}
              strokeWidth={2}
              dot={{ r: 3, fill: lineColor }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
