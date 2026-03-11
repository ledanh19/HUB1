/**
 * Finance Types - Shared contracts for P&L and Cashflow calculations
 * 
 * Single Source of Truth for:
 * - Report P&L page
 * - Dashboard "Lợi nhuận vs Dòng tiền" card
 * 
 * @see docs/AUDIT_SOT_PL_DASHBOARD.md
 */

/**
 * OPEX Categories enumeration
 */
export type OpexCategory =
  | "SALARY"
  | "BHXH"
  | "OTA_COMMISSION"
  | "OFFICE"
  | "MARKETING"
  | "BANK_FEE"
  | "TECHNOLOGY"
  | "OTHER";

/**
 * PLContract - Unified contract for P&L and Cashflow data
 * 
 * This interface defines the single source of truth for financial metrics
 * used by both Dashboard and Report P&L pages.
 */
export interface PLContract {
  /**
   * Period specification
   */
  period: {
    /** Start date in YYYY-MM-DD format */
    from: string;
    /** End date in YYYY-MM-DD format */
    to: string;
    /** Timezone offset, e.g., "+07:00" for Vietnam */
    timezone: string;
  };

  /** Currency code - always VND for this system */
  currency: "VND";

  /**
   * Accrual-based metrics (P&L)
   * Revenue recognized when service is delivered (checkout date)
   */
  accrual: {
    /** Total revenue = room + service + no_show */
    revenue: number;
    /** Room revenue from checked-out bookings */
    revenue_room: number;
    /** Service revenue from completed service orders */
    revenue_service: number;
    /** NO_SHOW revenue from ledger entries (recognized on snapshot confirmation) */
    revenue_no_show: number;

    /** Total COGS = host cost + service cost */
    cogs: number;
    /** Host supply cost */
    cogs_host: number;
    /** Service order cost */
    cogs_service: number;

    /** Total OPEX including OTA commission */
    opex: number;
    /** OTA Commission component (auto-calculated from HOTEL_COLLECT) */
    opex_ota_commission: number;
    /** OPEX breakdown by category */
    opex_categories: Record<OpexCategory, number>;

    /** Gross profit = revenue - cogs */
    gross_profit: number;
    /** Net profit = gross_profit - opex */
    net_profit: number;

    /** 
     * Gross margin = (gross_profit / revenue) * 100
     * null if revenue = 0
     */
    gross_margin: number | null;
    /** 
     * Net margin = (net_profit / revenue) * 100
     * null if revenue = 0
     */
    net_margin: number | null;

    /** OTA payout adjustments — net total (positive = income, negative = expense) */
    ota_adjustments_net: number;
    /** Dispute net: DISPUTE_WIN - DISPUTE_LOSS */
    ota_dispute_net: number;
    /** OTA penalties (chargeback, deductions) */
    ota_penalties: number;
    /** OTA compensation received */
    ota_compensation: number;
    /** Rounding / FX differences */
    ota_rounding_fx_net: number;
    /** Underpayment adjustments */
    ota_underpayment: number;
    /** Other uncategorized adjustments */
    ota_adjustments_other_net: number;
  };

  /**
   * Cash-basis metrics (Cashflow)
   * Recognized when cash is actually received/paid
   */
  cash: {
    /** Cash received (hotel_collects) */
    cash_in: number;
    /** Cash paid (cash_outs) */
    cash_out: number;
    /** Net cash = cash_in - cash_out */
    net_cash: number;
  };

  /**
   * Difference between accrual and cash
   */
  difference: {
    /** 
     * net_profit - net_cash
     * Positive: Profit recognized but cash not collected ("Chưa thu hết")
     * Negative: Cash collected but profit not yet recognized ("Thu hơn LN")
     */
    profit_minus_cash: number;
  };

  /**
   * Metadata about the calculation
   */
  meta: {
    /** Data sources used for each metric */
    sources: {
      revenue_room: string;
      revenue_service: string;
      cogs_host: string;
      cogs_service: string;
      opex: string;
      cash_in: string;
      cash_out: string;
    };
    /** Time keys used for date filtering */
    time_keys: {
      accrual_room: string;
      accrual_service: string;
      cash_in: string;
      cash_out: string;
    };
    /** Decimal places for rounding (0 for VND) */
    rounding: number;
    /** Sign convention: positive amounts mean benefit */
    sign_convention: "positive_is_benefit";
    /** How to handle margin when revenue is zero */
    null_margin_rule: "revenue_zero_returns_null";
  };

  /**
   * Debug information (optional, for development/troubleshooting)
   */
  debug?: {
    /** Total bookings considered */
    booking_count: number;
    /** Bookings with CHECKED_OUT status */
    checked_out_count: number;
    /** HOTEL_COLLECT bookings with valid collection */
    hotel_collect_count: number;
    /** Completed service orders */
    service_order_count: number;
    /** OPEX payment requests */
    opex_request_count: number;
  };
}

/**
 * Input parameters for P&L calculation
 */
export interface PLCalculatorInput {
  /** Start date of the period */
  startDate: Date;
  /** End date of the period */
  endDate: Date;
  /** Timezone offset (default: "+07:00" for Vietnam) */
  timezone?: string;
  /** OTA adjustment date mode: SETTLEMENT (entry_date) or ACCRUAL (economic_date fallback entry_date). Default: SETTLEMENT */
  adjDateMode?: "SETTLEMENT" | "ACCRUAL";
  /** Whether queries should be enabled. Default: true. Set to false to defer fetching. */
  enabled?: boolean;
}

/**
 * Default metadata for PLContract
 */
export const PL_CONTRACT_META: PLContract["meta"] = {
  sources: {
    revenue_room: "bookings_mirror + stays + booking_amount_overrides",
    revenue_service: "service_orders (status=DONE)",
    cogs_host: "host_supply_segments",
    cogs_service: "service_orders (cost_price)",
    opex: "payment_requests (expense_category)",
    cash_in: "hotel_collects (payee_type=ROOMRISE, collection_type=COLLECT)",
    cash_out: "cash_outs",
  },
  time_keys: {
    accrual_room: "stays.actual_check_out_at",
    accrual_service: "service_orders.service_date_time",
    cash_in: "hotel_collects.collected_at",
    cash_out: "cash_outs.paid_at",
  },
  rounding: 0,
  sign_convention: "positive_is_benefit",
  null_margin_rule: "revenue_zero_returns_null",
};

/**
 * Default empty OPEX categories
 */
export const EMPTY_OPEX_CATEGORIES: Record<OpexCategory, number> = {
  SALARY: 0,
  BHXH: 0,
  OTA_COMMISSION: 0,
  OFFICE: 0,
  MARKETING: 0,
  BANK_FEE: 0,
  TECHNOLOGY: 0,
  OTHER: 0,
};

/**
 * Create an empty PLContract with default values
 */
export function createEmptyPLContract(
  from: string,
  to: string,
  timezone: string = "+07:00"
): PLContract {
  return {
    period: { from, to, timezone },
    currency: "VND",
    accrual: {
      revenue: 0,
      revenue_room: 0,
      revenue_service: 0,
      revenue_no_show: 0,
      cogs: 0,
      cogs_host: 0,
      cogs_service: 0,
      opex: 0,
      opex_ota_commission: 0,
      opex_categories: { ...EMPTY_OPEX_CATEGORIES },
      gross_profit: 0,
      net_profit: 0,
      gross_margin: null,
      net_margin: null,
      ota_adjustments_net: 0,
      ota_dispute_net: 0,
      ota_penalties: 0,
      ota_compensation: 0,
      ota_rounding_fx_net: 0,
      ota_underpayment: 0,
      ota_adjustments_other_net: 0,
    },
    cash: {
      cash_in: 0,
      cash_out: 0,
      net_cash: 0,
    },
    difference: {
      profit_minus_cash: 0,
    },
    meta: PL_CONTRACT_META,
  };
}
