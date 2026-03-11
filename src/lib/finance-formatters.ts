/**
 * Finance Formatters - Shared formatting utilities for financial values
 * 
 * Single Source formatting for:
 * - Report P&L page
 * - Dashboard cards
 * - Cashflow reports
 * 
 * @see docs/AUDIT_SOT_PL_DASHBOARD.md
 */

/**
 * Format currency in VND style
 * - Uses Vietnamese number formatting (grouping by 3 digits)
 * - No decimal places (VND doesn't use decimals)
 * - Includes "₫" symbol
 * 
 * @example
 * formatCurrencyVND(1234567) // "1.234.567 ₫"
 * formatCurrencyVND(-500000) // "-500.000 ₫"
 * formatCurrencyVND(0) // "0 ₫"
 */
export function formatCurrencyVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format currency in short form for dashboard displays
 * - B for billions
 * - M for millions
 * - K for thousands
 * 
 * @example
 * formatShortCurrency(1234567890) // "1.2B"
 * formatShortCurrency(5678000) // "5.7M"
 * formatShortCurrency(12345) // "12K"
 * formatShortCurrency(999) // "999"
 */
export function formatShortCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  
  if (abs >= 1000000000) {
    return `${sign}${(abs / 1000000000).toFixed(1)}B`;
  }
  if (abs >= 1000000) {
    return `${sign}${(abs / 1000000).toFixed(1)}M`;
  }
  if (abs >= 1000) {
    return `${sign}${(abs / 1000).toFixed(0)}K`;
  }
  return `${sign}${abs}`;
}

/**
 * Format percentage with specified decimal places
 * 
 * @example
 * formatPercent(25.5) // "25.5%"
 * formatPercent(25.5, 0) // "26%"
 * formatPercent(null) // "—"
 */
export function formatPercent(
  value: number | null,
  decimals: number = 1,
  nullDisplay: string = "—"
): string {
  if (value === null || value === undefined) {
    return nullDisplay;
  }
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format margin value with appropriate sign
 * - Positive margin: green indicator
 * - Negative margin: red indicator
 * - Zero/null: neutral
 * 
 * @example
 * formatMargin(25.5) // "25.5%"
 * formatMargin(-10) // "-10.0%"
 * formatMargin(null) // "—"
 */
export function formatMargin(
  value: number | null,
  decimals: number = 1
): string {
  return formatPercent(value, decimals, "—");
}

/**
 * Format the profit vs cash gap with appropriate interpretation
 * 
 * @example
 * formatProfitCashGap(5000000) // "+5.000.000 ₫"
 * formatProfitCashGap(-2000000) // "-2.000.000 ₫"
 * formatProfitCashGap(0) // "0 ₫"
 */
export function formatProfitCashGap(gap: number): string {
  const sign = gap > 0 ? "+" : "";
  return `${sign}${formatCurrencyVND(gap)}`;
}

/**
 * Get the interpretation text for profit vs cash gap
 * 
 * @example
 * getProfitCashGapLabel(5000000) // "Chưa thu hết"
 * getProfitCashGapLabel(-2000000) // "Thu hơn LN"
 * getProfitCashGapLabel(0) // "Cân bằng"
 */
export function getProfitCashGapLabel(gap: number): string {
  if (gap > 0) return "Chưa thu hết";
  if (gap < 0) return "Thu hơn LN";
  return "Cân bằng";
}

/**
 * Get CSS class for profit/loss coloring
 * 
 * @example
 * getProfitLossClass(5000000) // "text-success"
 * getProfitLossClass(-2000000) // "text-destructive"
 * getProfitLossClass(0) // ""
 */
export function getProfitLossClass(value: number): string {
  if (value > 0) return "text-success";
  if (value < 0) return "text-destructive";
  return "";
}

/**
 * Get CSS class for profit vs cash gap coloring
 * 
 * @example
 * getProfitCashGapClass(5000000) // "text-warning"
 * getProfitCashGapClass(-2000000) // "text-info"
 * getProfitCashGapClass(0) // ""
 */
export function getProfitCashGapClass(gap: number): string {
  if (gap > 0) return "text-warning";
  if (gap < 0) return "text-info";
  return "";
}

/**
 * Get CSS class for profit vs cash gap background
 */
export function getProfitCashGapBgClass(gap: number): string {
  if (gap > 0) return "bg-warning/10 border border-warning/30";
  if (gap < 0) return "bg-info/10 border border-info/30";
  return "bg-muted/50";
}

/**
 * Format a date range for display
 * 
 * @example
 * formatDateRange(new Date('2026-02-01'), new Date('2026-02-28')) // "01/02/2026 → 28/02/2026"
 * formatDateRange(new Date('2026-02-15'), new Date('2026-02-15')) // "15/02/2026"
 */
export function formatDateRange(from: Date, to: Date): string {
  const formatDate = (d: Date) =>
    `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
      .toString()
      .padStart(2, "0")}/${d.getFullYear()}`;

  const fromStr = formatDate(from);
  const toStr = formatDate(to);

  return fromStr === toStr ? fromStr : `${fromStr} → ${toStr}`;
}
