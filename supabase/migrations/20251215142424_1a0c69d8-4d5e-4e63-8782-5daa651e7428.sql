-- Fix unified_bookings view to include ota_room_type_sold
DROP VIEW IF EXISTS unified_bookings;

CREATE OR REPLACE VIEW unified_bookings AS
-- PMS Bookings from bookings_mirror
SELECT 
    bm.unified_booking_id,
    'PMS'::text AS booking_type,
    bm.created_at,
    COALESCE(bm.booking_date, date(bm.created_at)) AS booking_date,
    bm.check_in_date,
    bm.check_out_date,
    COALESCE(bm.nights, bm.check_out_date - bm.check_in_date) AS nights,
    bm.guest_name,
    bm.guest_phone,
    bm.guest_email,
    bm.customer_id,
    c.nationality,
    bm.ota_source AS source,
    bm.pms_property_name,
    hss.host_property_name,
    bm.room_type AS ota_room_type_sold,
    hss.host_room_type,
    hss.room_code AS host_room_code,
    hss.host_room_id,
    bm.payment_type,
    bm.total_amount_gross,
    bm.total_amount_net,
    bm.commission_rate,
    bm.commission_amount,
    bm.booking_status,
    s.stay_status,
    s.host_cost,
    bm.updated_at
FROM bookings_mirror bm
LEFT JOIN customers c ON bm.customer_id = c.id
LEFT JOIN stays s ON bm.unified_booking_id = s.unified_booking_id
LEFT JOIN LATERAL (
    SELECT 
        seg.host_property_name,
        seg.host_room_type,
        seg.room_code,
        seg.host_room_id
    FROM host_supply_segments seg
    WHERE seg.unified_booking_id = bm.unified_booking_id
    ORDER BY seg.date_from ASC
    LIMIT 1
) hss ON true

UNION ALL

-- Manual Bookings
SELECT 
    mb.unified_booking_id,
    'MANUAL'::text AS booking_type,
    mb.created_at,
    COALESCE(mb.booking_date, date(mb.created_at)) AS booking_date,
    mb.check_in_date,
    mb.check_out_date,
    COALESCE(mb.nights, mb.check_out_date - mb.check_in_date) AS nights,
    mb.guest_name,
    mb.guest_phone,
    mb.guest_email,
    mb.customer_id,
    c.nationality,
    mb.source,
    mb.manual_property_name AS pms_property_name,
    hss.host_property_name,
    COALESCE(mb.sold_room_type, mb.room_type) AS ota_room_type_sold,
    hss.host_room_type,
    hss.room_code AS host_room_code,
    hss.host_room_id,
    mb.payment_type,
    mb.total_amount_gross,
    mb.total_amount_net,
    NULL::numeric AS commission_rate,
    NULL::numeric AS commission_amount,
    mb.booking_status,
    s.stay_status,
    s.host_cost,
    mb.updated_at
FROM manual_bookings mb
LEFT JOIN customers c ON mb.customer_id = c.id
LEFT JOIN stays s ON mb.unified_booking_id = s.unified_booking_id
LEFT JOIN LATERAL (
    SELECT 
        seg.host_property_name,
        seg.host_room_type,
        seg.room_code,
        seg.host_room_id
    FROM host_supply_segments seg
    WHERE seg.unified_booking_id = mb.unified_booking_id
    ORDER BY seg.date_from ASC
    LIMIT 1
) hss ON true;