/**
 * DynamicPivotTable Component
 * 
 * Collapsible, sortable table with CSV export for analytics data.
 * Columns adapt based on context mode (Portfolio vs Property).
 * 
 * Features:
 * - Collapsible by default
 * - Sortable columns
 * - CSV export button
 * - Consistent formatting with KPI cards
 */

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ChevronDown, ChevronUp, Download, ArrowUpDown } from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '../constants';
import type { PivotRankingRow } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface PivotColumn {
    key: string;
    label: string;
    format: 'currency' | 'number' | 'percent' | 'text';
    align?: 'left' | 'right';
    sortable?: boolean;
}

interface DynamicPivotTableProps {
    data: PivotRankingRow[];
    columns: PivotColumn[];
    title?: string;
    subtitle?: string;
    isLoading?: boolean;
    /** Start collapsed by default */
    defaultCollapsed?: boolean;
    nameKey?: string;
    nameLabel?: string;
}

// ============================================================================
// FORMATTERS
// ============================================================================

function formatCellValue(value: unknown, format: PivotColumn['format']): string {
    if (value === null || value === undefined) return '—';
    const num = Number(value);
    if (isNaN(num)) return String(value);
    switch (format) {
        case 'currency': return formatCurrency(num);
        case 'number': return formatNumber(num);
        case 'percent': return formatPercent(num);
        case 'text': return String(value);
        default: return String(value);
    }
}

// ============================================================================
// CSV EXPORT
// ============================================================================

function exportToCsv(
    data: PivotRankingRow[],
    columns: PivotColumn[],
    nameKey: string,
    nameLabel: string,
    filename: string,
) {
    const headers = [nameLabel, ...columns.map(c => c.label)];
    const rows = data.map(row => {
        const name = String((row as unknown as Record<string, unknown>)[nameKey] ?? '');
        const values = columns.map(col => {
            const val = (row as unknown as Record<string, unknown>)[col.key];
            return val === null || val === undefined ? '' : String(val);
        });
        return [name, ...values];
    });

    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(v => `"${v}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DynamicPivotTable({
    data,
    columns,
    title = 'Bảng phân tích chi tiết',
    subtitle,
    isLoading = false,
    defaultCollapsed = true,
    nameKey = 'pivotName',
    nameLabel = 'Tên',
}: DynamicPivotTableProps) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const handleSort = useCallback((key: string) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    }, [sortKey]);

    const sortedData = useMemo(() => {
        if (!sortKey) return data;
        return [...data].sort((a, b) => {
            const aVal = Number((a as unknown as Record<string, unknown>)[sortKey] ?? 0);
            const bVal = Number((b as unknown as Record<string, unknown>)[sortKey] ?? 0);
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });
    }, [data, sortKey, sortDir]);

    const handleExport = useCallback(() => {
        exportToCsv(data, columns, nameKey, nameLabel, title.replace(/\s+/g, '_'));
    }, [data, columns, nameKey, nameLabel, title]);

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            {title}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => setCollapsed(!collapsed)}
                            >
                                {collapsed ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronUp className="h-4 w-4" />
                                )}
                            </Button>
                        </CardTitle>
                        {subtitle && <CardDescription>{subtitle}</CardDescription>}
                    </div>
                    {!collapsed && data.length > 0 && (
                        <Button variant="outline" size="sm" className="gap-2 h-8" onClick={handleExport}>
                            <Download className="h-3.5 w-3.5" />
                            CSV
                        </Button>
                    )}
                </div>
            </CardHeader>

            {!collapsed && (
                <CardContent className="pt-0">
                    {isLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))}
                        </div>
                    ) : data.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">
                            Không có dữ liệu
                        </div>
                    ) : (
                        <div className="rounded-md border overflow-auto max-h-[400px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">
                                            {nameLabel}
                                        </TableHead>
                                        {columns.map(col => (
                                            <TableHead
                                                key={col.key}
                                                className={`${col.align === 'left' ? 'text-left' : 'text-right'} ${col.sortable !== false ? 'cursor-pointer hover:bg-muted/50 select-none' : ''}`}
                                                onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                                            >
                                                <div className={`flex items-center gap-1 ${col.align === 'left' ? '' : 'justify-end'}`}>
                                                    {col.label}
                                                    {col.sortable !== false && (
                                                        <ArrowUpDown className={`h-3 w-3 ${sortKey === col.key ? 'text-primary' : 'text-muted-foreground/50'}`} />
                                                    )}
                                                </div>
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedData.map((row, i) => {
                                        const name = String((row as unknown as Record<string, unknown>)[nameKey] ?? '');
                                        return (
                                            <TableRow key={i}>
                                                <TableCell className="sticky left-0 bg-background z-10 font-medium">
                                                    {name}
                                                </TableCell>
                                                {columns.map(col => (
                                                    <TableCell
                                                        key={col.key}
                                                        className={`tabular-nums ${col.align === 'left' ? 'text-left' : 'text-right'}`}
                                                    >
                                                        {formatCellValue((row as unknown as Record<string, unknown>)[col.key], col.format)}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
