/**
 * Rate calculation engine — PMS-aligned
 * SOT: TRANSFER_SPEC_INVENTORY_RATESETUP.md §6.3
 *
 * Implements all 5 rate change types from BulkUpdate:
 *   exact, increase_amount, decrease_amount,
 *   increase_percent, decrease_percent
 *
 * Plus the percent-mode guard (skip when base rate is null/0).
 */

export type RateChangeType =
  | 'exact'
  | 'increase_amount'
  | 'decrease_amount'
  | 'increase_percent'
  | 'decrease_percent';

export interface RateCalculationResult {
  /** The computed new rate, or null if skipped. */
  afterValue: number | null;
  /** True when the cell was intentionally skipped (e.g. % on null base). */
  skipped: boolean;
  /** Human-readable reason when skipped. */
  skipReason?: string;
}

/**
 * Compute the after-value for a rate change.
 *
 * @param baseRate  Current effective rate (inventory → history → default)
 * @param changeType  One of the 5 PMS change types
 * @param value  The magnitude supplied by the user (absolute or percentage)
 */
export function calculateRate(
  baseRate: number | null | undefined,
  changeType: RateChangeType,
  value: number
): RateCalculationResult {
  // §8.1 Percent mode guard: skip if base rate is null / 0 / NaN
  if (
    (changeType === 'increase_percent' || changeType === 'decrease_percent') &&
    (baseRate === null || baseRate === undefined || baseRate === 0 || isNaN(baseRate))
  ) {
    return {
      afterValue: null,
      skipped: true,
      skipReason: 'BULK_PERCENT_SKIP_NO_BASE',
    };
  }

  const base = baseRate ?? 0;

  switch (changeType) {
    case 'exact':
      return { afterValue: value, skipped: false };

    case 'increase_amount':
      return { afterValue: base + value, skipped: false };

    case 'decrease_amount':
      // §8.1 auto-mode floor: rate never < 0
      return { afterValue: Math.max(0, base - value), skipped: false };

    case 'increase_percent':
      return {
        afterValue: Math.round(base * (1 + value / 100)),
        skipped: false,
      };

    case 'decrease_percent':
      return {
        afterValue: Math.round(base * (1 - value / 100)),
        skipped: false,
      };

    default:
      return { afterValue: value, skipped: false };
  }
}

/**
 * Resolve the "base rate" for a given cell, following PMS priority chain:
 *   1. inventory_cells.rate  (daily override)
 *   2. rate_plans_mirror.base_rate  (default from Channex mirror)
 *
 * Note: PMS also has rateplan_history which CH does not replicate.
 *       This is documented in GAPS.md.
 */
export function resolveBaseRate(
  cellRate: number | null | undefined,
  mirrorBaseRate: number | null | undefined
): number | null {
  if (cellRate !== null && cellRate !== undefined && !isNaN(cellRate) && cellRate > 0) {
    return cellRate;
  }
  if (
    mirrorBaseRate !== null &&
    mirrorBaseRate !== undefined &&
    !isNaN(mirrorBaseRate) &&
    mirrorBaseRate > 0
  ) {
    return mirrorBaseRate;
  }
  return null;
}

/**
 * Map legacy UI change types to PMS canonical types.
 */
export function mapLegacyChangeType(
  uiType: string
): RateChangeType {
  switch (uiType) {
    case 'set':
      return 'exact';
    case 'increase':
      return 'increase_percent';
    case 'decrease':
      return 'decrease_percent';
    default:
      return 'exact';
  }
}
