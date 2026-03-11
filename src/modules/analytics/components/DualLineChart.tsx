/**
 * DualLineChart Component
 * 
 * Two-line chart for comparing Revenue ADR vs Host ADR trends.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { TimeSeriesRow } from '../types';
import { formatCurrency, CHART_COLORS } from '../constants';

interface ChartDataPoint {
  period: string;
  spread: number | null;
  nights: number;
  bookings: number;
  belowThreshold: boolean;
  [key: string]: string | number | boolean | null;
}

// Support both TimeSeriesRow and generic data types
type ChartDataRow = TimeSeriesRow | Record<string, unknown>;

interface DualLineChartProps {
  data: ChartDataRow[];
  title?: string;
  line1DataKey?: string;  // Made generic to support custom key names
  line1Label?: string;
  line2DataKey?: string;  // Made generic to support custom key names
  line2Label?: string;
  line1Key?: string;      // Alias for flexible API
  line1Color?: string;
  line2Key?: string;      // Alias for flexible API
  line2Color?: string;
  xAxisKey?: string;      // Support custom x-axis key
  showSpreadArea?: boolean;
  isLoading?: boolean;
  height?: number;
}

export function DualLineChart({
  data,
  title = 'So sánh ADR',
  line1DataKey = 'revenueAdr',
  line1Label = 'Revenue ADR',
  line2DataKey = 'hostAdr',
  line2Label = 'Host ADR',
  line1Key,
  line1Color,
  line2Key,
  line2Color,
  xAxisKey = 'periodLabel',
  showSpreadArea = false,
  isLoading = false,
  height = 300,
}: DualLineChartProps) {
  // Use aliases if provided
  const actualLine1Key = line1Key || line1DataKey;
  const actualLine2Key = line2Key || line2DataKey;

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

  // Flexible data mapping - works with any data shape
  // BUG 7 FIX: Properly map data with support for custom keys
  const chartData: ChartDataPoint[] = data.map((row: ChartDataRow) => {
    const getValue = (key: string) => (row as Record<string, unknown>)[key];
    
    // Get line values with proper key resolution
    const line1Val = getValue(actualLine1Key);
    const line2Val = getValue(actualLine2Key);
    
    return {
      period: String(getValue(xAxisKey) ?? getValue('periodLabel') ?? ''),
      [actualLine1Key]: typeof line1Val === 'number' && !isNaN(line1Val) ? line1Val : null,
      [actualLine2Key]: typeof line2Val === 'number' && !isNaN(line2Val) ? line2Val : null,
      spread: (getValue('marginSpread') ?? getValue('spread') ?? getValue('avgSpread') ?? null) as number | null,
      nights: (getValue('nightsTotal') ?? getValue('nights') ?? getValue('totalOtaNights') ?? 0) as number,
      bookings: (getValue('bookingsCount') ?? getValue('bookings') ?? getValue('matchedLineCount') ?? 0) as number,
      belowThreshold: (getValue('belowSampleThreshold') ?? getValue('belowThreshold') ?? false) as boolean,
    };
  });
  
  // BUG 7 FIX: Check if we have any valid data points
  const hasValidData = chartData.some(d => 
    (d[actualLine1Key] !== null && d[actualLine1Key] !== undefined) ||
    (d[actualLine2Key] !== null && d[actualLine2Key] !== undefined)
  );
  
  if (!hasValidData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
            Chưa đủ dữ liệu theo thời gian
          </div>
        </CardContent>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; payload: ChartDataPoint }>; label?: string }) => {
    if (!active || !payload || !payload.length) return null;

    // BUG 7 FIX: Use actual keys for tooltip lookup
    const line1Value = payload.find((p) => p.dataKey === actualLine1Key)?.value;
    const line2Value = payload.find((p) => p.dataKey === actualLine2Key)?.value;
    const dataPayload = payload[0]?.payload;
    const spread = dataPayload?.spread;
    const nights = dataPayload?.nights;
    const bookings = dataPayload?.bookings;
    const belowThreshold = dataPayload?.belowThreshold;

    return (
      <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium mb-2">{label}</p>
        {belowThreshold ? (
          <Badge variant="secondary" className="mb-2">Low sample ({nights} đêm)</Badge>
        ) : (
          <div className="space-y-1">
            <p>
              <span className="text-muted-foreground">{line1Label}:</span>{' '}
              <span className="font-medium">{formatCurrency(line1Value ?? 0)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{line2Label}:</span>{' '}
              <span className="font-medium">{formatCurrency(line2Value ?? 0)}</span>
            </p>
            {spread !== null && spread !== undefined && (
              <p>
                <span className="text-muted-foreground">Spread:</span>{' '}
                <span className={`font-medium ${spread >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(spread)}
                </span>
              </p>
            )}
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
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            <Legend 
              wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
              iconSize={10}
            />
            <ReferenceLine y={0} stroke="#888" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey={actualLine1Key}
              name={line1Label}
              stroke={line1Color || CHART_COLORS.revenueAdr}
              strokeWidth={2}
              dot={{ r: 3, fill: line1Color || CHART_COLORS.revenueAdr }}
              activeDot={{ r: 5 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey={actualLine2Key}
              name={line2Label}
              stroke={line2Color || CHART_COLORS.hostAdr}
              strokeWidth={2}
              dot={{ r: 3, fill: line2Color || CHART_COLORS.hostAdr }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
