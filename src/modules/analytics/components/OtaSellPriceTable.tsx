/**
 * OtaSellPriceTable Component
 * 
 * Table showing OTA sell price performance by Property × Room Type × Channel.
 * Uses room-line level data from booking_room_lines_mirror.
 * 
 * Columns: Property/Room Type | Channel | Bookings | Nights | Revenue | ADR | Share%
 */

import { AlertTriangle, BarChart3, Bed } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber, formatPercentNoSign } from '../constants';
import type { OtaSellPriceAggRow } from '../hooks/useOtaSellPrice';

interface OtaSellPriceTableProps {
  data: OtaSellPriceAggRow[];
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
  sortBy?: 'revenue' | 'nights' | 'adr' | 'share';
  sortDirection?: 'asc' | 'desc';
  groupByLabel?: string;
}

export function OtaSellPriceTable({
  data,
  isLoading = false,
  title = 'OTA Sell Price Performance',
  subtitle,
  sortBy = 'revenue',
  sortDirection = 'desc',
  groupByLabel = 'Nhóm',
}: OtaSellPriceTableProps) {
  // Sort data
  const sortedData = [...data].sort((a, b) => {
    let aVal: number, bVal: number;
    
    switch (sortBy) {
      case 'nights':
        aVal = a.totalNights;
        bVal = b.totalNights;
        break;
      case 'adr':
        aVal = a.otaAdr ?? 0;
        bVal = b.otaAdr ?? 0;
        break;
      case 'share':
        aVal = a.sharePct;
        bVal = b.sharePct;
        break;
      default:
        aVal = a.totalRevenue;
        bVal = b.totalRevenue;
    }
    
    return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {subtitle && (
          <CardDescription>{subtitle}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Bed className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Không có dữ liệu trong khoảng thời gian này.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{groupByLabel}</TableHead>
                  <TableHead className="text-right">Room Lines</TableHead>
                  <TableHead className="text-right">Số đêm</TableHead>
                  <TableHead className="text-right">Doanh thu OTA</TableHead>
                  <TableHead className="text-right">ADR OTA</TableHead>
                  <TableHead className="text-right">Tỷ trọng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((row, idx) => (
                  <TableRow key={row.groupKey || idx}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{row.groupName}</span>
                        {row.belowSampleThreshold && (
                          <Badge variant="secondary" className="text-xs">
                            Low sample
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.lineCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={row.totalNights > 100 ? 'text-success font-medium' : row.totalNights < 30 ? 'text-warning' : ''}>
                        {formatNumber(row.totalNights)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(row.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.otaAdr !== null ? formatCurrency(row.otaAdr) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatPercentNoSign(row.sharePct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-muted-foreground mt-4 text-center">
          SOT: booking_room_lines_mirror.amount (OTA revenue per room line).
          ADR = Revenue / Nights.
        </p>
      </CardContent>
    </Card>
  );
}
