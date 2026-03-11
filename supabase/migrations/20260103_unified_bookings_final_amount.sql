-- =====================================================
-- VIEW: unified_bookings_with_final_amount
-- SSOT for P&L / Dashboard revenue calculations
-- 
-- Logic (CHÍNH XÁC theo computeBookingAmount() trong useBookingAmountOverrides.ts):
-- 1. CANCELLED / NO_SHOW → 0 (luôn luôn, kể cả có override)
-- 2. Override amount → dùng override (kể cả IMPORTED đã confirm)
-- 3. IMPORTED chưa có override → 0 (cần xác nhận thủ công)
-- 4. Otherwise → total_amount_net từ OTA
-- =====================================================

-- Drop existing view if exists
DROP VIEW IF EXISTS public.unified_bookings_with_final_amount;

-- Create new view that joins with booking_amount_overrides
CREATE VIEW public.unified_bookings_with_final_amount AS
SELECT 
  ub.*,
  bao.amount AS override_amount,
  bao.confirmed_at AS override_confirmed_at,
  bao.note AS override_note,
  -- Computed final_amount (SSOT for P&L)
  CASE
    -- Priority 1: CANCELLED / NO_SHOW → always 0 (kể cả có override)
    WHEN UPPER(ub.booking_status::text) IN ('CANCELLED', 'CANCELED', 'NO_SHOW', 'CANCELLED_BY_GUEST') THEN 0
    -- Priority 2: Override exists → use override amount (works for IMPORTED confirmed too)
    WHEN bao.amount IS NOT NULL THEN bao.amount
    -- Priority 3: IMPORTED booking WITHOUT override → 0 (needs manual confirmation)
    WHEN ub.booking_type = 'IMPORTED' THEN 0
    -- Priority 4: Normal booking → use total_amount_net from OTA
    ELSE COALESCE(ub.total_amount_net, 0)
  END AS final_amount,
  -- Amount status for debugging
  CASE
    WHEN UPPER(ub.booking_status::text) IN ('CANCELLED', 'CANCELED', 'NO_SHOW', 'CANCELLED_BY_GUEST') THEN 'CANCELLED'
    WHEN bao.amount IS NOT NULL AND ub.booking_type = 'IMPORTED' THEN 'IMPORT_CONFIRMED'
    WHEN bao.amount IS NOT NULL THEN 'OVERRIDE'
    WHEN ub.booking_type = 'IMPORTED' THEN 'UNCONFIRMED'
    ELSE 'OTA'
  END AS amount_source
FROM public.unified_bookings ub
LEFT JOIN public.booking_amount_overrides bao 
  ON ub.unified_booking_id = bao.unified_booking_id;

-- Add comment for documentation
COMMENT ON VIEW public.unified_bookings_with_final_amount IS 
'Unified bookings with computed final_amount for P&L reporting. 
Applies computeBookingAmount() logic: CANCELLED=0, Override>OTA, IMPORTED=0.
This is the SSOT for all financial reporting (P&L, Dashboard).';

-- Grant permissions
GRANT SELECT ON public.unified_bookings_with_final_amount TO authenticated;
GRANT SELECT ON public.unified_bookings_with_final_amount TO anon;
