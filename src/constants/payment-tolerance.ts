/**
 * Payment Rounding Tolerance (VND)
 *
 * When the outstanding room payment is > 0 AND <= this threshold,
 * the system allows marking the booking as "paid" via a rounding write-off.
 *
 * This does NOT modify booking revenue — it inserts a balancing hotel_collects
 * record so that roomRemaining naturally becomes 0.
 *
 * Business rule: Host-collected bookings often have rounding differences
 * (e.g., 1,552,235 expected → 1,552,000 collected → 235đ outstanding).
 */
export const PAYMENT_TOLERANCE_VND = 1000;
