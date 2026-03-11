-- ===========================================
-- BACKFILL: Lock orphaned surcharges/extras to their booking's settlement
-- ===========================================
-- Problem: Older finalize code didn't set settlement_id on host_surcharges
-- and host_extra_charges. These items remain with settlement_id = NULL
-- even though their bookings are fully settled, causing them to appear
-- in new settlements (double-counting).
--
-- Fix: For each surcharge/extra with settlement_id IS NULL, find the
-- settlement that locked the booking's segments, and apply the same
-- settlement_id.
-- ===========================================

-- 1. Backfill host_surcharges
UPDATE host_surcharges s
SET settlement_id = seg.settlement_id,
    locked_at = COALESCE(s.locked_at, NOW())
FROM (
  SELECT DISTINCT ON (unified_booking_id)
    unified_booking_id,
    settlement_id
  FROM host_supply_segments
  WHERE settlement_id IS NOT NULL
  ORDER BY unified_booking_id, locked_at DESC NULLS LAST
) seg
WHERE s.settlement_id IS NULL
  AND s.unified_booking_id = seg.unified_booking_id;

-- 2. Backfill host_extra_charges
UPDATE host_extra_charges e
SET settlement_id = seg.settlement_id,
    locked_at = COALESCE(e.locked_at, NOW())
FROM (
  SELECT DISTINCT ON (unified_booking_id)
    unified_booking_id,
    settlement_id
  FROM host_supply_segments
  WHERE settlement_id IS NOT NULL
  ORDER BY unified_booking_id, locked_at DESC NULLS LAST
) seg
WHERE e.settlement_id IS NULL
  AND e.unified_booking_id = seg.unified_booking_id;
