
-- Add missing columns to bookings_mirror for OTA property info
ALTER TABLE public.bookings_mirror 
ADD COLUMN IF NOT EXISTS booking_date DATE,
ADD COLUMN IF NOT EXISTS pms_property_id TEXT,
ADD COLUMN IF NOT EXISTS pms_property_name TEXT;

-- Add missing columns to manual_bookings
ALTER TABLE public.manual_bookings 
ADD COLUMN IF NOT EXISTS manual_property_name TEXT,
ADD COLUMN IF NOT EXISTS sold_room_type TEXT;

-- Add missing columns to stays for host assignment
ALTER TABLE public.stays 
ADD COLUMN IF NOT EXISTS host_room_type TEXT,
ADD COLUMN IF NOT EXISTS host_property_name TEXT,
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assigned_by UUID;

-- Backfill booking_date from created_at where null
UPDATE public.bookings_mirror 
SET booking_date = DATE(created_at) 
WHERE booking_date IS NULL;

UPDATE public.manual_bookings 
SET booking_date = DATE(created_at) 
WHERE booking_date IS NULL;

-- Drop and recreate unified_bookings view with all required fields
DROP VIEW IF EXISTS public.unified_bookings;

CREATE VIEW public.unified_bookings
WITH (security_invoker = true) AS
SELECT 
  bm.unified_booking_id,
  'PMS' as booking_type,
  bm.created_at,
  COALESCE(bm.booking_date, DATE(bm.created_at)) as booking_date,
  bm.check_in_date,
  bm.check_out_date,
  COALESCE(bm.nights, (bm.check_out_date::date - bm.check_in_date::date)) as nights,
  bm.guest_name,
  bm.guest_phone,
  bm.guest_email,
  bm.customer_id,
  c.nationality,
  bm.ota_source as source,
  bm.pms_property_name,
  s.host_property_name,
  bm.room_type as ota_room_type_sold,
  s.host_room_type,
  s.host_room_id,
  bm.payment_type,
  bm.total_amount_gross,
  bm.total_amount_net,
  bm.commission_rate,
  bm.commission_amount,
  bm.booking_status,
  s.stay_status,
  s.host_cost,
  bm.updated_at
FROM public.bookings_mirror bm
LEFT JOIN public.customers c ON bm.customer_id = c.id
LEFT JOIN public.stays s ON bm.unified_booking_id = s.unified_booking_id

UNION ALL

SELECT 
  mb.unified_booking_id,
  'MANUAL' as booking_type,
  mb.created_at,
  COALESCE(mb.booking_date, DATE(mb.created_at)) as booking_date,
  mb.check_in_date,
  mb.check_out_date,
  COALESCE(mb.nights, (mb.check_out_date::date - mb.check_in_date::date)) as nights,
  mb.guest_name,
  mb.guest_phone,
  mb.guest_email,
  mb.customer_id,
  c.nationality,
  mb.source,
  mb.manual_property_name as pms_property_name,
  s.host_property_name,
  COALESCE(mb.sold_room_type, mb.room_type) as ota_room_type_sold,
  s.host_room_type,
  s.host_room_id,
  mb.payment_type,
  mb.total_amount_gross,
  mb.total_amount_net,
  NULL::numeric as commission_rate,
  NULL::numeric as commission_amount,
  mb.booking_status,
  s.stay_status,
  s.host_cost,
  mb.updated_at
FROM public.manual_bookings mb
LEFT JOIN public.customers c ON mb.customer_id = c.id
LEFT JOIN public.stays s ON mb.unified_booking_id = s.unified_booking_id;
