-- Option B: Denormalize property_group_id into service_orders for server-side scoping
-- This eliminates the client-side fan-out of fetchAnGiaBookingIds()

ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS property_group_id text;

-- Composite index for the primary query pattern: filter by group + sort by date
CREATE INDEX IF NOT EXISTS idx_service_orders_group_created
ON public.service_orders(property_group_id, created_at DESC);

-- Backfill existing rows: set property_group_id from bookings_mirror → channex_property_groups
UPDATE public.service_orders so
SET property_group_id = cpg.channex_group_id
FROM public.bookings_mirror bm
JOIN public.channex_property_groups cpg ON cpg.channex_property_id = bm.channex_property_id
WHERE bm.unified_booking_id = so.unified_booking_id
  AND so.property_group_id IS NULL;

-- Fallback: for any service orders linked to MANUAL/OTA/channex bookings not in mirror,
-- set to An Gia group ID directly (single-tenant system)
UPDATE public.service_orders
SET property_group_id = '72e58e1b-1e34-4678-9100-71c778ecf6d0'
WHERE property_group_id IS NULL;