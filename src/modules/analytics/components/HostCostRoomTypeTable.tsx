/**
 * HostCostRoomTypeTable Component
 * 
 * Table showing host cost performance by Property × Room Type.
 * Uses segment-level data from host_supply_segments (TRUE SOT).
 * 
 * PURE SUPPLY-SIDE: No OTA comparison here.
 * For Price Spread analysis, use the dedicated Price Spread page.
 */

import { AlertTriangle, Building, Bed } from 'lucide-react';
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
import type { HostCostRoomTypeRow } from '../hooks/useHostCostSegments';

interface HostCostRoomTypeTableProps {
  data: HostCostRoomTypeRow[];
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
  sortBy?: 'hostCost' | 'adrHost';
  sortDirection?: 'asc' | 'desc';
}

export function HostCostRoomTypeTable({
  data,
  isLoading = false,
  title = 'Chi phí Host theo loại phòng',
  subtitle,
  sortBy = 'hostCost',
  sortDirection = 'desc',
}: HostCostRoomTypeTableProps) {
  // Sort data
  const sortedData = [...data].sort((a, b) => {
    let aVal: number, bVal: number;
    
    switch (sortBy) {
      case 'adrHost':
        aVal = a.adrHost ?? 0;
        bVal = b.adrHost ?? 0;
        break;
      default:
        aVal = a.totalHostCost;
        bVal = b.totalHostCost;
    }
    
    return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Building className="h-5 w-5 text-muted-foreground" />
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
            <p>Không có dữ liệu segment trong khoảng thời gian này.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chỗ nghỉ</TableHead>
                  <TableHead>Loại phòng</TableHead>
                  <TableHead className="text-right">Số đêm</TableHead>
                  <TableHead className="text-right">Chi phí Host</TableHead>
                  <TableHead className="text-right">ADR Host</TableHead>
                  <TableHead className="text-right">Tỷ trọng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((row, idx) => (
                  <TableRow key={`${row.propertyName}-${row.roomType}-${idx}`}>
                    <TableCell className="font-medium">
                      {row.propertyName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{row.roomType}</span>
                        {row.belowSampleThreshold && (
                          <Badge variant="secondary" className="text-xs">
                            Low sample
                          </Badge>
                        )}
                        {row.hasZeroCost && (
                          <Badge variant="outline" className="text-xs text-warning border-warning/20">
                            Cost=0
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.totalStayNights)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.totalHostCost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.adrHost !== null ? formatCurrency(row.adrHost) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
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
          SOT: host_supply_segments. ADR Host = Chi phí Host / Số đêm.
          Xem trang Price Spread để so sánh với giá OTA.
        </p>
      </CardContent>
    </Card>
  );
}
