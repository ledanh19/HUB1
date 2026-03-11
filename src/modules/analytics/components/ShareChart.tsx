/**
 * ShareChart Component
 * 
 * Pie/Donut chart for displaying channel revenue share.
 */

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChannelShareRow } from '../types';
import { formatCurrency, formatPercentNoSign } from '../constants';

// Color palette for pie chart
const PIE_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(220 70% 50%)',
  'hsl(160 60% 45%)',
  'hsl(30 80% 55%)',
  'hsl(var(--muted-foreground))',
];

interface ChartDataItem {
  name: string;
  value: number;
  share: number;
  color: string;
}

interface ShareChartProps {
  data: ChannelShareRow[];
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
  height?: number;
}

export function ShareChart({
  data,
  title = 'Tỷ trọng theo kênh',
  subtitle,
  isLoading = false,
  height = 300,
}: ShareChartProps) {
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

  /**
   * BUG 2 FIX: Properly group "Others" into a single item.
   * 1. Take top 8 channels by value
   * 2. Group all remaining into a single "Khác" entry
   */
  const SHARE_LIMIT = 8;
  
  // Sort by revenue descending and take top N
  const sortedData = [...data].sort((a, b) => b.revenueTotal - a.revenueTotal);
  const topChannels = sortedData.slice(0, SHARE_LIMIT);
  const otherChannels = sortedData.slice(SHARE_LIMIT);
  
  // Calculate "Others" totals
  const othersTotal = otherChannels.reduce((sum, r) => sum + r.revenueTotal, 0);
  const othersShare = otherChannels.reduce((sum, r) => sum + r.sharePct, 0);
  
  // Build final chart data
  const chartData: ChartDataItem[] = topChannels.map((row, index) => ({
    name: row.channelName,
    value: row.revenueTotal,
    share: row.sharePct,
    color: PIE_COLORS[index % PIE_COLORS.length],
  }));
  
  // Add consolidated "Khác" if there are other channels
  if (otherChannels.length > 0 && othersTotal > 0) {
    chartData.push({
      name: `Khác (${otherChannels.length} kênh)`,
      value: othersTotal,
      share: othersShare,
      color: PIE_COLORS[SHARE_LIMIT % PIE_COLORS.length],
    });
  }

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataItem }> }) => {
    if (!active || !payload || !payload.length) return null;

    const item = payload[0]?.payload;
    if (!item) return null;

    return (
      <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium mb-1">{item.name}</p>
        <p>
          <span className="text-muted-foreground">Doanh thu:</span>{' '}
          <span className="font-medium">{formatCurrency(item.value)}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Tỷ trọng:</span>{' '}
          <span className="font-medium">{formatPercentNoSign(item.share)}</span>
        </p>
      </div>
    );
  };

  const renderLegend = ({ payload }: { payload?: Array<{ value: string; color: string }> }) => {
    return (
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs mt-2">
        {payload?.map((entry, index: number) => (
          <li key={`legend-${index}`} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground truncate max-w-[100px]">
              {entry.value}
            </span>
            <span className="font-medium">
              {formatPercentNoSign(chartData[index]?.share ?? 0)}
            </span>
          </li>
        ))}
      </ul>
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
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="45%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={renderLegend} verticalAlign="bottom" />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
