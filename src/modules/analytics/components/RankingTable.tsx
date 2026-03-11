/**
 * RankingTable Component
 * 
 * Data table for ranking analytics with export to CSV functionality.
 */

import { useState, useMemo } from 'react';
import { Download, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PivotRankingRow } from '../types';
import { formatCurrency, formatNumber, formatPercentNoSign } from '../constants';

type SortField = 'revenueTotal' | 'hostCostTotal' | 'nightsTotal' | 'bookingsCount' | 'revenueAdr' | 'hostAdr' | 'marginSpread' | 'sharePct';
type SortDirection = 'asc' | 'desc';

interface RankingTableProps {
  data: PivotRankingRow[];
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
  showRevenue?: boolean;
  showHostCost?: boolean;
  showNights?: boolean;
  showBookings?: boolean;
  showRevenueAdr?: boolean;
  showHostAdr?: boolean;
  showMarginSpread?: boolean;
  showShare?: boolean;
}

export function RankingTable({
  data,
  title = 'Bảng xếp hạng',
  subtitle,
  isLoading = false,
  showRevenue = true,
  showHostCost = false,
  showNights = true,
  showBookings = true,
  showRevenueAdr = true,
  showHostAdr = false,
  showMarginSpread = false,
  showShare = true,
}: RankingTableProps) {
  const [sortField, setSortField] = useState<SortField>('revenueTotal');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedData = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;
      const diff = Number(bVal) - Number(aVal);
      return sortDirection === 'desc' ? diff : -diff;
    });
  }, [data, sortField, sortDirection]);

  const exportToCSV = () => {
    if (!data || data.length === 0) return;

    const headers = [
      'Rank',
      'Name',
      showRevenue && 'Revenue',
      showHostCost && 'Host Cost',
      showNights && 'Nights',
      showBookings && 'Bookings',
      showRevenueAdr && 'Revenue ADR',
      showHostAdr && 'Host ADR',
      showMarginSpread && 'Margin Spread',
      showShare && 'Share %',
    ].filter(Boolean);

    const rows = sortedData.map((row, index) => [
      index + 1,
      row.pivotName,
      showRevenue && row.revenueTotal,
      showHostCost && row.hostCostTotal,
      showNights && row.nightsTotal,
      showBookings && row.bookingsCount,
      showRevenueAdr && (row.revenueAdr ?? ''),
      showHostAdr && (row.hostAdr ?? ''),
      showMarginSpread && (row.marginSpread ?? ''),
      showShare && row.sharePct.toFixed(2),
    ].filter((_, i) => headers[i]));

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-ranking-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field ? (
          sortDirection === 'desc' ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
        )}
      </div>
    </TableHead>
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {subtitle && <CardDescription>{subtitle}</CardDescription>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle && <CardDescription>{subtitle}</CardDescription>}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportToCSV}
          disabled={!data || data.length === 0}
        >
          <Download className="h-4 w-4 mr-1" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Không có dữ liệu
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead className="min-w-[150px]">Tên</TableHead>
                  {showRevenue && <SortableHeader field="revenueTotal">Doanh thu</SortableHeader>}
                  {showHostCost && <SortableHeader field="hostCostTotal">Chi phí Host</SortableHeader>}
                  {showNights && <SortableHeader field="nightsTotal">Đêm</SortableHeader>}
                  {showBookings && <SortableHeader field="bookingsCount">Bookings</SortableHeader>}
                  {showRevenueAdr && <SortableHeader field="revenueAdr">ADR Doanh thu</SortableHeader>}
                  {showHostAdr && <SortableHeader field="hostAdr">ADR Host</SortableHeader>}
                  {showMarginSpread && <SortableHeader field="marginSpread">Spread</SortableHeader>}
                  {showShare && <SortableHeader field="sharePct">Tỷ trọng</SortableHeader>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((row, index) => (
                  <TableRow key={row.pivotId}>
                    <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-medium truncate max-w-[200px]" title={row.pivotName}>
                      {row.pivotName}
                    </TableCell>
                    {showRevenue && (
                      <TableCell className="tabular-nums">{formatCurrency(row.revenueTotal)}</TableCell>
                    )}
                    {showHostCost && (
                      <TableCell className="tabular-nums">{formatCurrency(row.hostCostTotal)}</TableCell>
                    )}
                    {showNights && (
                      <TableCell className="tabular-nums">{formatNumber(row.nightsTotal)}</TableCell>
                    )}
                    {showBookings && (
                      <TableCell className="tabular-nums">{formatNumber(row.bookingsCount)}</TableCell>
                    )}
                    {showRevenueAdr && (
                      <TableCell className="tabular-nums">
                        {row.belowSampleThreshold ? (
                          <Badge variant="secondary" className="text-xs font-normal">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Low
                          </Badge>
                        ) : (
                          formatCurrency(row.revenueAdr)
                        )}
                      </TableCell>
                    )}
                    {showHostAdr && (
                      <TableCell className="tabular-nums">
                        {row.belowSampleThreshold ? (
                          <Badge variant="secondary" className="text-xs font-normal">Low</Badge>
                        ) : (
                          formatCurrency(row.hostAdr)
                        )}
                      </TableCell>
                    )}
                    {showMarginSpread && (
                      <TableCell className="tabular-nums">
                        {row.belowSampleThreshold ? (
                          <Badge variant="secondary" className="text-xs font-normal">Low</Badge>
                        ) : (
                          <span className={row.marginSpread && row.marginSpread >= 0 ? 'text-success' : 'text-destructive'}>
                            {formatCurrency(row.marginSpread)}
                          </span>
                        )}
                      </TableCell>
                    )}
                    {showShare && (
                      <TableCell className="tabular-nums">{formatPercentNoSign(row.sharePct)}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
