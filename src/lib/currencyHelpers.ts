/**
 * PMS-aligned currency formatting
 * SOT: TRANSFER_SPEC_INVENTORY_RATESETUP.md §6.6
 *
 * Zero-decimal currencies (VND, JPY, KRW): integer, no decimals.
 * Others (USD, EUR …): 2 decimal places.
 */

const ZERO_DECIMAL_CURRENCIES = ['VND', 'JPY', 'KRW'];

/**
 * Format a monetary amount for Channex API payloads.
 * VND → integer (rounded). USD → 2dp float.
 */
export function formatCurrencyForChannex(
  amount: number,
  currency: string = 'VND'
): number {
  if (ZERO_DECIMAL_CURRENCIES.includes(currency.toUpperCase())) {
    return Math.round(amount);
  }
  return Math.round(amount * 100) / 100;
}

/**
 * Human-readable display string.
 * VND ≥ 1M → "1,50 Tr"
 * VND < 1M → "500.000"
 * Other → currency-formatted
 */
export function formatRateDisplay(
  rate: number | null | undefined,
  currency: string = 'VND'
): string {
  if (rate === null || rate === undefined) return '—';

  if (ZERO_DECIMAL_CURRENCIES.includes(currency.toUpperCase())) {
    if (Math.abs(rate) >= 1_000_000) {
      const millions = rate / 1_000_000;
      return (
        new Intl.NumberFormat('vi-VN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(millions) + ' Tr'
      );
    }
    return new Intl.NumberFormat('vi-VN').format(Math.round(rate));
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(rate);
}

/**
 * Check whether a currency uses zero-decimal formatting.
 */
export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.includes(currency.toUpperCase());
}
