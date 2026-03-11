/**
 * StackedAreaChart Component
 * 
 * Stacked area chart showing channel revenue mix over time.
 * Used in Overview and Revenue pages for structural demand shift visualization.
 * 
 * Features:
 * - Top N channels + "Khác" grouping
 * - Consistent color palette
 * - Custom tooltip with percentages
 */

import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrencyShort, formatCurrency } from '../constants';

// Curated palette for stacked areas (4 channels + Other)
const AREA_COLORS = [
    '#6366f1', // indigo
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#94a3b8', // slate (Other)
];

export interface ChannelTimePoint {
    period: string;
    [channelName: string]: string | number;
}

interface StackedAreaChartProps {
    /** Pre-pivoted data: each row = { period, channel1: value, channel2: value, ... } */
    data: ChannelTimePoint[];
    /** Channel names in display order (top channels first) */
    channels: string[];
    title?: string;
    subtitle?: string;
    isLoading?: boolean;
    height?: number;
}

export function StackedAreaChart({
    data,
    channels,
    title = 'Tỷ trọng doanh thu theo kênh',
    subtitle,
    isLoading = false,
    height = 340,
}: StackedAreaChartProps) {
    if (isLoading) {
        return (
            <Card>
                <CardHeader className="pb-2">
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
                <CardHeader className="pb-2">
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;
        const total = payload.reduce((s: number, p: { value: number }) => s + (p.value || 0), 0);
        return (
            <div className="bg-background border rounded-lg shadow-lg p-3 text-sm min-w-[180px]">
                <p className="font-medium mb-2 text-foreground">{label}</p>
                <div className="space-y-1">
                    {payload.reverse().map((p: { name: string; value: number; color: string }, i: number) => (
                        <div key={i} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                                <span className="text-muted-foreground">{p.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="font-medium tabular-nums">{formatCurrencyShort(p.value)}</span>
                                <span className="text-muted-foreground text-xs tabular-nums">
                                    {total > 0 ? `${((p.value / total) * 100).toFixed(1)}%` : '—'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="pt-1 mt-1 border-t flex justify-between text-xs text-muted-foreground">
                    <span>Tổng</span>
                    <span className="font-medium">{formatCurrency(total)}</span>
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
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                            dataKey="period"
                            tick={{ fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
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
                        {channels.map((channel, idx) => (
                            <Area
                                key={channel}
                                type="monotone"
                                dataKey={channel}
                                name={channel}
                                stackId="1"
                                fill={AREA_COLORS[idx % AREA_COLORS.length]}
                                stroke={AREA_COLORS[idx % AREA_COLORS.length]}
                                fillOpacity={0.6}
                                strokeWidth={1.5}
                            />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
