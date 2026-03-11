/**
 * SpreadBarChart Component
 * 
 * Bar chart showing margin spread by period with positive/negative coloring.
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
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { TimeSeriesRow } from '../types';
import { formatCurrency, CHART_COLORS } from '../constants';

interface ChartDataItem {
  period: string;
  spread: number | null;
  revenueAdr: number | null;
  hostAdr: number | null;
  nights: number;
  bookings: number;
  belowThreshold: boolean;
}

interface SpreadBarChartProps {
  data: TimeSeriesRow[];
  title?: string;
  isLoading?: boolean;
  height?: number;
}

export function SpreadBarChart({
  data,
  title = 'Biên Spread theo kỳ',
  isLoading = false,
  height = 250,
}: SpreadBarChartProps) {
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

  const chartData: ChartDataItem[] = data.map((row) => ({
    period: row.periodLabel,
    spread: row.marginSpread,
    revenueAdr: row.revenueAdr,
    hostAdr: row.hostAdr,
    nights: row.nightsTotal,
    bookings: row.bookingsCount,
    belowThreshold: row.belowSampleThreshold,
  }));

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: ChartDataItem }>; label?: string }) => {
    if (!active || !payload || !payload.length) return null;

    const item = payload[0]?.payload;
    if (!item) return null;

    const { spread, revenueAdr, hostAdr, nights, bookings, belowThreshold } = item;

    return (
      <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium mb-2">{label}</p>
        {belowThreshold ? (
          <Badge variant="secondary">Low sample ({nights} đêm)</Badge>
        ) : (
          <div className="space-y-1">
            <p>
              <span className="text-muted-foreground">Revenue ADR:</span>{' '}
              <span className="font-medium">{formatCurrency(revenueAdr ?? 0)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Host ADR:</span>{' '}
              <span className="font-medium">{formatCurrency(hostAdr ?? 0)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Spread:</span>{' '}
              <span className={`font-bold ${(spread ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(spread ?? 0)}
              </span>
            </p>
          </div>
        )}
        <p className="text-muted-foreground text-xs pt-1 border-t mt-2">
          {nights} đêm • {bookings} bookings
        </p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="period" 
              tick={{ fontSize: 11 }} 
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#888" strokeWidth={1} />
            <Bar dataKey="spread" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`}
                  fill={
                    entry.belowThreshold
                      ? CHART_COLORS.neutral
                      : (entry.spread ?? 0) >= 0 
                        ? CHART_COLORS.positive 
                        : CHART_COLORS.negative
                  }
                  opacity={entry.belowThreshold ? 0.3 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
