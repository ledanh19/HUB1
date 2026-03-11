-- ============================================================
-- OTA OPERATIONS MODULE - 003: KPI PERFORMANCE INDEX
-- ============================================================
-- Date: 2026-01-07
-- Purpose: Index for OTA KPI aggregation on bookings_mirror
-- 
-- KPI Query Pattern:
--   WHERE booking_status = 'CONFIRMED'
--   AND booking_date BETWEEN start_date AND end_date
--   GROUP BY normalize_ota_source(ota_source)
--   
-- Index Strategy:
--   Composite index on (channex_property_id, booking_status, booking_date)
--   to support property filtering + status filtering + date range
-- ============================================================

-- Create composite index for KPI RPC performance
CREATE INDEX IF NOT EXISTS idx_bookings_mirror_kpi_ota
ON public.bookings_mirror (
  channex_property_id,    -- For property filtering
  booking_status,         -- For status = 'CONFIRMED' filter
  booking_date            -- For date range filtering
)
WHERE booking_status = 'CONFIRMED';  -- Partial index for CONFIRMED only

-- Additional index for ota_source grouping (covers)
CREATE INDEX IF NOT EXISTS idx_bookings_mirror_ota_source
ON public.bookings_mirror (ota_source)
WHERE booking_status = 'CONFIRMED';

-- Comment on indexes
COMMENT ON INDEX public.idx_bookings_mirror_kpi_ota IS 
'Composite partial index for OTA KPI aggregation - filters on property, status, and date range';

COMMENT ON INDEX public.idx_bookings_mirror_ota_source IS 
'Index for GROUP BY ota_source in KPI queries - partial on CONFIRMED bookings';
