/**
 * Price Spread Decision Table Component
 * 
 * Displays EXACT Price Spread data with decision signals.
 * Uses matched segment↔room_line data for accuracy.
 * 
 * Enhanced with:
 * - Performance columns (nights sold)
 * - Signal explanation tooltips
 * - Debug mode with equation verification
 */

import { useState } from 'react';
import { ArrowUp, ArrowDown, Minus, AlertTriangle, Building, Info, Bug, CheckCircle2, XCircle } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrency, formatNumber, MIN_NIGHTS_FOR_ADR, DAY_TYPE_MIX_LABELS, PRICING_THRESHOLDS, type DayTypeMix } from '../constants';
import type { SpreadAggRow, PriceSignal } from '../hooks/usePriceSpreadMatched';

// Tolerance for equation verification (VND)
const EQUATION_TOLERANCE = 1;

interface PriceSpreadDecisionTableProps {
  data: SpreadAggRow[];
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
  sortBy?: 'revenue' | 'spread' | 'lossCount' | 'nights';
  sortDirection?: 'asc' | 'desc';
  showPerformance?: boolean;
  showDebugToggle?: boolean;
}

/**
 * Day Type Mix Badge - shows WEEKEND/WEEKDAY/MIXED based on 65% threshold
 * Replaces misleading "dominant" day type
 */
function DayTypeMixBadge({ dayTypeMix, weekdayNights, weekendNights, sundayNights }: { 
  dayTypeMix?: DayTypeMix; 
  weekdayNights: number; 
  weekendNights: number; 
  sundayNights: number;
}) {
  // Fallback to MIXED if dayTypeMix is undefined (safety)
  const mix = dayTypeMix ?? 'MIXED';
  const total = weekdayNights + weekendNights + sundayNights;
  const weekdayPct = total > 0 ? (weekdayNights / total * 100).toFixed(0) : '0';
  const weekendPct = total > 0 ? ((weekendNights + sundayNights) / total * 100).toFixed(0) : '0';
  
  const colorMap: Record<DayTypeMix, string> = {
    WEEKEND: 'bg-primary/10 text-primary',
    WEEKDAY: 'bg-info/10 text-info',
    MIXED: 'bg-muted text-muted-foreground',
  };
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className={`text-xs ${colorMap[mix]}`}>
          {DAY_TYPE_MIX_LABELS[mix]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          <strong>Phân bổ ngày (ngưỡng {PRICING_THRESHOLDS.DAY_TYPE_DOMINANT_THRESHOLD}%):</strong><br />
          Ngày thường: {weekdayNights} đêm ({weekdayPct}%)<br />
          Cuối tuần: {weekendNights + sundayNights} đêm ({weekendPct}%)<br />
          <em className="text-muted-foreground">
            {mix === 'MIXED' && 'Hỗn hợp: không loại ngày nào chiếm ≥65%'}
            {mix === 'WEEKEND' && `Cuối tuần ≥${PRICING_THRESHOLDS.DAY_TYPE_DOMINANT_THRESHOLD}% → áp dụng cap weekend`}
            {mix === 'WEEKDAY' && `Ngày thường ≥${PRICING_THRESHOLDS.DAY_TYPE_DOMINANT_THRESHOLD}% → áp dụng cap weekday`}
          </em>
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Get signal explanation with demand context
 * Now includes volume info AND velocity gating for better decision support
 * 
 * CANONICAL MARGIN FORMULA (SOT):
 *   margin_percent = (otaAdr - hostAdr) / otaAdr * 100
 */
function getSignalExplanation(row: SpreadAggRow, medianNights?: number): string {
  const spread = row.avgSpread;
  const nights = row.totalOtaNights;
  const lossCount = row.lossCount;
  const marginPct = row.marginOnRevenue;
  
  if (spread === null) return 'Không đủ dữ liệu để tính toán spread';
  
  const parts: string[] = [];
  
  // Spread quality explanation with margin % (spec compliant)
  // CANONICAL FORMULA: margin = (otaAdr - hostAdr) / otaAdr * 100
  if (marginPct !== null && marginPct >= PRICING_THRESHOLDS.TARGET_MARGIN_LOW) {
    parts.push(`🟢 Margin ${marginPct.toFixed(1)}% - biên lợi nhuận tốt (≥${PRICING_THRESHOLDS.TARGET_MARGIN_LOW}%)`);
  } else if (marginPct !== null && marginPct >= PRICING_THRESHOLDS.MIN_MARGIN_FLOOR) {
    parts.push(`🟡 Margin ${marginPct.toFixed(1)}% - biên lợi nhuận trung bình`);
  } else if (marginPct !== null && marginPct >= 0) {
    parts.push(`🟠 Margin ${marginPct.toFixed(1)}% - biên lợi nhuận thấp`);
  } else if (marginPct !== null) {
    parts.push(`🔴 Margin ${marginPct.toFixed(1)}% - đang bán lỗ`);
  }
  
  // Velocity context (NEW - P1 requirement)
  if (row.velocity !== undefined && row.velocity !== null) {
    const velocityRatio = row.velocityRatio ?? null;
    if (velocityRatio !== null) {
      const velocityEmoji = velocityRatio >= PRICING_THRESHOLDS.VELOCITY_INCREASE_MIN ? '🚀' :
                           velocityRatio <= PRICING_THRESHOLDS.VELOCITY_DECREASE_MAX ? '🐢' : '⏸️';
      parts.push(`${velocityEmoji} Velocity: ${row.velocity.toFixed(2)} đêm/ngày (${(velocityRatio * 100).toFixed(0)}% vs baseline)`);
    } else {
      parts.push(`⚠️ Velocity: ${row.velocity.toFixed(2)} đêm/ngày (chưa có baseline)`);
    }
  }
  
  // Day type context for pricing decision - use dayTypeMix
  if (row.dayTypeMix) {
    const label = DAY_TYPE_MIX_LABELS[row.dayTypeMix];
    parts.push(`📅 ${label} (threshold: ${PRICING_THRESHOLDS.DAY_TYPE_DOMINANT_THRESHOLD}%)`);
  }
  
  // Volume context with median comparison (DEMAND CONTEXT)
  if (medianNights && medianNights > 0) {
    const pctVsMedian = ((nights / medianNights) * 100).toFixed(0);
    if (nights > medianNights * 1.5) {
      parts.push(`📈 Volume cao: ${formatNumber(nights)} đêm (${pctVsMedian}% vs median)`);
    } else if (nights < medianNights * 0.5) {
      parts.push(`📉 Volume thấp: ${formatNumber(nights)} đêm (${pctVsMedian}% vs median)`);
    } else {
      parts.push(`📊 Volume: ${formatNumber(nights)} đêm (${pctVsMedian}% vs median)`);
    }
  } else {
    // Fallback: basic volume assessment
    if (nights > 100) {
      parts.push(`📈 Volume cao: ${formatNumber(nights)} đêm`);
    } else if (nights < 30) {
      parts.push(`📉 Volume thấp: ${formatNumber(nights)} đêm`);
    } else {
      parts.push(`📊 Volume: ${formatNumber(nights)} đêm`);
    }
  }
  
  // Loss context
  if (lossCount > 0) {
    const total = row.increaseCount + row.holdCount + row.decreaseCount;
    const lossPct = total > 0 ? (lossCount / total * 100).toFixed(0) : 0;
    parts.push(`⚠️ ${lossPct}% booking đang lỗ`);
  }
  
  // Review signal explanation
  if (row.reviewCount && row.reviewCount > 0) {
    parts.push(`🔍 ${row.reviewCount} booking cần review (chưa đủ data baseline)`);
  }
  
  return parts.join(' • ');
}

function SignalBadge({ signal, count }: { signal: PriceSignal; count?: number }) {
  // FIX: Changed labels from "Tăng/Giảm giá" to "Spread quality" indicators
  // Per user requirement: Signal should NOT recommend price action without demand context
  // NEW: Added 'review' signal for cases without sufficient baseline data
  switch (signal) {
    case 'increase':
      return (
        <Badge variant="default" className="bg-success hover:bg-success">
          🟢 Spread tốt {count !== undefined && `(${count})`}
        </Badge>
      );
    case 'decrease':
      return (
        <Badge variant="destructive">
          🔴 Spread kém {count !== undefined && `(${count})`}
        </Badge>
      );
    case 'review':
      return (
        <Badge variant="outline" className="border-info text-info">
          🔍 Cần review {count !== undefined && `(${count})`}
        </Badge>
      );
    case 'hold':
    default:
      return (
        <Badge variant="secondary">
          🟡 Spread TB {count !== undefined && `(${count})`}
        </Badge>
      );
  }
}

function SignalWithTooltip({ row, medianNights }: { row: SpreadAggRow; medianNights?: number }) {
  const explanation = getSignalExplanation(row, medianNights);
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 cursor-help">
          <SignalBadge signal={row.dominantSignal} />
          <Info className="h-3 w-3 text-muted-foreground" />
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-xs">{explanation}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function SignalDistribution({ row }: { row: SpreadAggRow }) {
  const reviewCount = row.reviewCount ?? 0;
  const total = row.increaseCount + row.holdCount + row.decreaseCount + reviewCount;
  if (total === 0) return <span className="text-muted-foreground">—</span>;

  const increasePct = (row.increaseCount / total) * 100;
  const holdPct = (row.holdCount / total) * 100;
  const decreasePct = (row.decreaseCount / total) * 100;
  const reviewPct = (reviewCount / total) * 100;

  return (
    <div className="flex flex-col gap-1">
      {/* Stacked bar */}
      <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted">
        {increasePct > 0 && (
          <div 
            className="h-full bg-success/100" 
            style={{ width: `${increasePct}%` }}
            title={`Tốt: ${row.increaseCount}`}
          />
        )}
        {holdPct > 0 && (
          <div 
            className="h-full bg-muted-foreground" 
            style={{ width: `${holdPct}%` }}
            title={`TB: ${row.holdCount}`}
          />
        )}
        {reviewPct > 0 && (
          <div 
            className="h-full bg-info" 
            style={{ width: `${reviewPct}%` }}
            title={`Cần review: ${reviewCount}`}
          />
        )}
        {decreasePct > 0 && (
          <div 
            className="h-full bg-destructive/100" 
            style={{ width: `${decreasePct}%` }}
            title={`Kém: ${row.decreaseCount}`}
          />
        )}
      </div>
      {/* Numbers */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="text-success">{row.increaseCount}</span>
        <span>{row.holdCount}</span>
        {reviewCount > 0 && <span className="text-info">{reviewCount}</span>}
        <span className="text-destructive">{row.decreaseCount}</span>
      </div>
    </div>
  );
}

/**
 * Equation verification for debug mode
 * Returns true if ADR calculations are consistent with spread
 */
function verifyEquations(row: SpreadAggRow): { 
  adrOtaCheck: boolean; 
  adrHostCheck: boolean; 
  spreadCheck: boolean;
  calculatedAdrOta: number | null;
  calculatedAdrHost: number | null;
  calculatedSpread: number | null;
} {
  // ADR OTA = OTA_Revenue / Nights
  const calculatedAdrOta = row.totalOtaNights >= MIN_NIGHTS_FOR_ADR 
    ? row.totalOtaRevenue / row.totalOtaNights 
    : null;
  
  // ADR Host = Host_Cost / Nights
  const calculatedAdrHost = row.totalHostNights >= MIN_NIGHTS_FOR_ADR 
    ? row.totalHostCost / row.totalHostNights 
    : null;
  
  // Spread = ADR OTA - ADR Host
  const calculatedSpread = (calculatedAdrOta !== null && calculatedAdrHost !== null) 
    ? calculatedAdrOta - calculatedAdrHost 
    : null;

  // Verify against displayed values
  const adrOtaCheck = row.otaAdr === null && calculatedAdrOta === null
    || (row.otaAdr !== null && calculatedAdrOta !== null && Math.abs(row.otaAdr - calculatedAdrOta) < EQUATION_TOLERANCE);
  
  const adrHostCheck = row.hostAdr === null && calculatedAdrHost === null
    || (row.hostAdr !== null && calculatedAdrHost !== null && Math.abs(row.hostAdr - calculatedAdrHost) < EQUATION_TOLERANCE);
  
  const spreadCheck = row.avgSpread === null && calculatedSpread === null
    || (row.avgSpread !== null && calculatedSpread !== null && Math.abs(row.avgSpread - calculatedSpread) < EQUATION_TOLERANCE);

  return {
    adrOtaCheck,
    adrHostCheck,
    spreadCheck,
    calculatedAdrOta,
    calculatedAdrHost,
    calculatedSpread,
  };
}

function EquationCheck({ passed, label }: { passed: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1 text-xs ${passed ? 'text-success' : 'text-destructive'}`}>
      {passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      <span>{label}</span>
    </div>
  );
}

export function PriceSpreadDecisionTable({
  data,
  isLoading = false,
  title = 'Price Spread Decision Table',
  subtitle,
  sortBy = 'revenue',
  sortDirection = 'desc',
  showPerformance = true,
  showDebugToggle = true,
}: PriceSpreadDecisionTableProps) {
  const [debugMode, setDebugMode] = useState(false);
  
  // Sort data
  const sortedData = [...data].sort((a, b) => {
    let aVal: number, bVal: number;
    
    switch (sortBy) {
      case 'spread':
        aVal = a.avgSpread ?? 0;
        bVal = b.avgSpread ?? 0;
        break;
      case 'lossCount':
        aVal = a.lossCount;
        bVal = b.lossCount;
        break;
      case 'nights':
        aVal = a.totalOtaNights;
        bVal = b.totalOtaNights;
        break;
      default:
        aVal = a.totalOtaRevenue;
        bVal = b.totalOtaRevenue;
    }
    
    return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
  });

  // Calculate median nights for demand context
  const nightsValues = sortedData.map(r => r.totalOtaNights).filter(n => n > 0).sort((a, b) => a - b);
  const medianNights = nightsValues.length > 0 
    ? nightsValues[Math.floor(nightsValues.length / 2)] 
    : undefined;

  // Verify all equations in debug mode
  const allVerifications = debugMode ? sortedData.map(row => ({
    row,
    verification: verifyEquations(row),
  })) : [];
  
  const failedCount = allVerifications.filter(v => 
    !v.verification.adrOtaCheck || !v.verification.adrHostCheck || !v.verification.spreadCheck
  ).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          
          {/* Debug Toggle */}
          {showDebugToggle && (
            <div className="flex items-center gap-2">
              <Switch
                id="debug-mode"
                checked={debugMode}
                onCheckedChange={setDebugMode}
              />
              <Label htmlFor="debug-mode" className="text-xs flex items-center gap-1 cursor-pointer">
                <Bug className="h-3 w-3" />
                Debug
              </Label>
            </div>
          )}
        </div>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
        
        {/* Debug Summary */}
        {debugMode && (
          <div className={`mt-2 p-2 rounded-lg text-xs ${failedCount > 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
            <div className="flex items-center gap-2">
              {failedCount > 0 ? (
                <>
                  <XCircle className="h-4 w-4" />
                  <span><strong>{failedCount}</strong> rows có equation mismatch!</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Tất cả {sortedData.length} rows pass equation verification ✓</span>
                </>
              )}
            </div>
            <p className="mt-1 opacity-75">
              Check: ADR_OTA = Revenue/Nights, ADR_Host = Cost/Nights, Spread = ADR_OTA - ADR_Host
            </p>
          </div>
        )}
        
        {/* Legend */}
        {!debugMode && (
          <div className="flex flex-wrap gap-2 mt-2">
            <SignalBadge signal="increase" />
            <span className="text-xs text-muted-foreground">Spread &gt; 50k</span>
            <SignalBadge signal="hold" />
            <span className="text-xs text-muted-foreground">Spread 0-50k</span>
            <SignalBadge signal="decrease" />
            <span className="text-xs text-muted-foreground">Spread &lt; 0</span>
          </div>
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
            <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Không có dữ liệu matched trong khoảng thời gian này.</p>
            <p className="text-xs mt-1">Kiểm tra xem host_supply_segments có room_line_index không.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nhóm</TableHead>
                  <TableHead className="text-center">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 cursor-help">
                        Loại ngày
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Loại ngày chủ đạo (dựa trên check-in date)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-right">Matched</TableHead>
                  {showPerformance && !debugMode && (
                    <TableHead className="text-right">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 cursor-help ml-auto">
                          Nights Sold
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Tổng số đêm OTA đã bán trong khoảng thời gian</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                  )}
                  {debugMode && (
                    <>
                      <TableHead className="text-right">OTA Nights</TableHead>
                      <TableHead className="text-right">Host Nights</TableHead>
                    </>
                  )}
                  <TableHead className="text-right">OTA Revenue</TableHead>
                  {debugMode && <TableHead className="text-right">Host Cost</TableHead>}
                  <TableHead className="text-right">ADR OTA</TableHead>
                  <TableHead className="text-right">ADR Host</TableHead>
                  <TableHead className="text-right">Spread</TableHead>
                  {debugMode ? (
                    <TableHead className="text-center">Equation Check</TableHead>
                  ) : (
                    <>
                      <TableHead className="text-center w-32">Signal Distribution</TableHead>
                      <TableHead className="text-center">
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 cursor-help">
                            Đề xuất
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Hover vào badge để xem giải thích chi tiết</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((row, idx) => {
                  const verification = debugMode ? verifyEquations(row) : null;
                  const hasError = verification && (!verification.adrOtaCheck || !verification.adrHostCheck || !verification.spreadCheck);
                  
                  return (
                    <TableRow 
                      key={`${row.groupKey}-${idx}`}
                      className={hasError ? 'bg-destructive/10' : row.dominantSignal === 'decrease' && !debugMode ? 'bg-destructive/10' : ''}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{row.groupName}</span>
                          {row.belowSampleThreshold && (
                            <Badge variant="secondary" className="text-xs">
                              Low sample
                            </Badge>
                          )}
                          {!debugMode && row.lossCount > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {row.lossCount} lỗ
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <DayTypeMixBadge 
                          dayTypeMix={row.dayTypeMix} 
                          weekdayNights={row.weekdayNights}
                          weekendNights={row.weekendNights}
                          sundayNights={row.sundayNights}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.matchedLineCount)}
                      </TableCell>
                      {showPerformance && !debugMode && (
                        <TableCell className="text-right tabular-nums">
                          <span className={row.totalOtaNights > 100 ? 'text-success font-medium' : row.totalOtaNights < 30 ? 'text-warning' : ''}>
                            {formatNumber(row.totalOtaNights)}
                          </span>
                        </TableCell>
                      )}
                      {debugMode && (
                        <>
                          <TableCell className="text-right tabular-nums text-xs">
                            {formatNumber(row.totalOtaNights)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {formatNumber(row.totalHostNights)}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.totalOtaRevenue)}
                      </TableCell>
                      {debugMode && (
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.totalHostCost)}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">
                        {row.otaAdr !== null ? formatCurrency(row.otaAdr) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.hostAdr !== null ? formatCurrency(row.hostAdr) : '—'}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${
                        row.avgSpread !== null && row.avgSpread < 0 
                          ? 'text-destructive font-semibold' 
                          : row.avgSpread !== null && row.avgSpread > 50000 
                          ? 'text-success' 
                          : ''
                      }`}>
                        <div className="flex flex-col">
                          <span>{row.avgSpread !== null ? formatCurrency(row.avgSpread) : '—'}</span>
                          {!debugMode && row.avgSpreadPercent !== null && (
                            <span className="text-xs text-muted-foreground">
                              ({row.avgSpreadPercent > 0 ? '+' : ''}{row.avgSpreadPercent.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {debugMode && verification ? (
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <EquationCheck passed={verification.adrOtaCheck} label="ADR_OTA = R/N" />
                            <EquationCheck passed={verification.adrHostCheck} label="ADR_Host = C/N" />
                            <EquationCheck passed={verification.spreadCheck} label="Spread = OTA-Host" />
                          </div>
                        </TableCell>
                      ) : (
                        <>
                          <TableCell className="w-32">
                            <SignalDistribution row={row} />
                          </TableCell>
                          <TableCell className="text-center">
                            <SignalWithTooltip row={row} medianNights={medianNights} />
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-muted-foreground mt-4 text-center">
          EXACT matching: host_supply_segments.room_line_index ↔ booking_room_lines_mirror.line_index.
          Spread = ADR OTA - ADR Host (dương = lãi, âm = lỗ).
          {debugMode && <strong className="block mt-1">Debug mode: Showing equation verification columns</strong>}
        </p>
      </CardContent>
    </Card>
  );
}
