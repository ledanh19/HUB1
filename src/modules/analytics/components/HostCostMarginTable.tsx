/**
 * HostCostMarginTable Component
 * 
 * Table showing host cost margin analysis by Property × Room Type.
 * Uses EXACT matched data from usePriceSpreadByGroup (matched stayed nights).
 * 
 * DEMAND-DRIVEN: Host Cost is allocated per stayed night using segment ADR.
 * Columns: Property | Room Type | Nights | OTA Revenue | ADR OTA | Host Cost | ADR Host | Spread | Margin% | Share%
 */

import { AlertTriangle, Building, Bed, TrendingUp, TrendingDown, Minus } from 'lucide-react';
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
import type { SpreadAggRow, PriceSignal } from '../hooks/usePriceSpreadMatched';

interface HostCostMarginTableProps {
  data: SpreadAggRow[];
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
  sortBy?: 'hostCost' | 'marginOnRevenue' | 'otaRevenue' | 'grossProfit';
  sortDirection?: 'asc' | 'desc';
}

function getSignalIcon(signal: PriceSignal) {
  switch (signal) {
    case 'increase':
      return <TrendingUp className="h-3 w-3 text-success" />;
    case 'decrease':
      return <TrendingDown className="h-3 w-3 text-destructive" />;
    default:
      return <Minus className="h-3 w-3 text-muted-foreground" />;
  }
}

function getMarginColor(margin: number | null): string {
  if (margin === null) return 'text-muted-foreground';
  if (margin < 0) return 'text-destructive font-semibold';
  if (margin < 10) return 'text-warning';
  if (margin > 30) return 'text-success font-semibold';
  return '';
}

export function HostCostMarginTable({
  data,
  isLoading = false,
  title = 'Phân tích biên lợi nhuận theo Chỗ nghỉ × Loại phòng',
  subtitle,
  sortBy = 'grossProfit',
  sortDirection = 'desc',
}: HostCostMarginTableProps) {
  // Sort data
  const sortedData = [...data].sort((a, b) => {
    let aVal: number, bVal: number;
    
    switch (sortBy) {
      case 'marginOnRevenue':
        aVal = a.marginOnRevenue ?? -999;
        bVal = b.marginOnRevenue ?? -999;
        break;
      case 'otaRevenue':
        aVal = a.totalOtaRevenue;
        bVal = b.totalOtaRevenue;
        break;
      case 'hostCost':
        aVal = a.totalHostCost;
        bVal = b.totalHostCost;
        break;
      default:
        aVal = a.grossProfit;
        bVal = b.grossProfit;
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
            <p>Không có dữ liệu matched trong khoảng thời gian này.</p>
            <p className="text-xs mt-1">Kiểm tra xem room_line_index đã được populate trong host_supply_segments chưa.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chỗ nghỉ</TableHead>
                  <TableHead>Loại phòng</TableHead>
                  <TableHead className="text-right">Số đêm</TableHead>
                  <TableHead className="text-right">OTA Revenue</TableHead>
                  <TableHead className="text-right">ADR OTA</TableHead>
                  <TableHead className="text-right">Host Cost</TableHead>
                  <TableHead className="text-right">ADR Host</TableHead>
                  <TableHead className="text-right">Spread</TableHead>
                  <TableHead className="text-right">Margin%</TableHead>
                  <TableHead className="text-right">Tỷ trọng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((row, idx) => {
                  /**
                   * BUG 10 FIX: Detect partially matched rows.
                   * If we have Host Cost but no ADR Host, show warning badge.
                   */
                  const hasHostCostNoAdr = row.totalHostCost > 0 && row.hostAdr === null;
                  const hasOtaRevenueNoAdr = row.totalOtaRevenue > 0 && row.otaAdr === null;
                  
                  /**
                   * BUG 12 FIX: Calculate displayable spread.
                   * If both ADRs exist, show calculated spread for verification.
                   */
                  const calculatedSpread = (row.otaAdr !== null && row.hostAdr !== null) 
                    ? row.otaAdr - row.hostAdr 
                    : null;
                  
                  return (
                    <TableRow key={row.groupKey || idx}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {row.propertyName || row.groupName.split(' - ')[0]}
                          {row.lossCount > 0 && (
                            <Badge variant="destructive" className="text-micro px-1">
                              {row.lossCount} lỗ
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{row.roomType || row.groupName.split(' - ')[1] || row.groupName}</span>
                          {row.belowSampleThreshold && (
                            <Badge variant="secondary" className="text-xs">
                              Low sample
                            </Badge>
                          )}
                          {/* BUG 10 FIX: Show warning if data is partially available */}
                          {hasHostCostNoAdr && (
                            <Badge variant="outline" className="text-xs text-warning border-warning/20">
                              ADR N/A
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.totalOtaNights)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.totalOtaRevenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.otaAdr !== null ? formatCurrency(row.otaAdr) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.totalHostCost)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.hostAdr !== null ? formatCurrency(row.hostAdr) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div className="flex items-center justify-end gap-1">
                          {calculatedSpread !== null && getSignalIcon(row.dominantSignal)}
                          <span className={calculatedSpread !== null && calculatedSpread < 0 ? 'text-destructive' : ''}>
                            {/* BUG 8 FIX: Use calculated spread (ADR_OTA - ADR_HOST) for display */}
                            {calculatedSpread !== null ? formatCurrency(calculatedSpread) : '—'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${getMarginColor(row.marginOnRevenue)}`}>
                        {row.marginOnRevenue !== null 
                          ? `${row.marginOnRevenue > 0 ? '+' : ''}${row.marginOnRevenue.toFixed(1)}%`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatPercentNoSign(row.sharePct)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Footer - BUG 8 FIX: Clarify the formula */}
        <p className="text-xs text-muted-foreground mt-4 text-center">
          EXACT Matching: host_supply_segments.room_line_index ↔ booking_room_lines_mirror.line_index.
          <br />
          <strong>Spread = ADR OTA - ADR Host</strong> | Margin% = Spread / ADR OTA
        </p>
      </CardContent>
    </Card>
  );
}
