-- =====================================================
-- PHASE 2: Fix Security Definer Views
-- Convert to SECURITY INVOKER (default for new views)
-- =====================================================

-- Drop and recreate unified_bookings view without SECURITY DEFINER
DROP VIEW IF EXISTS public.unified_bookings;
CREATE VIEW public.unified_bookings AS
SELECT bm.unified_booking_id,
    COALESCE(bm.booking_type, 'PMS'::text) AS booking_type,
    bm.created_at,
    COALESCE(bm.booking_date, date(bm.created_at)) AS booking_date,
    bm.check_in_date,
    bm.check_out_date,
    COALESCE(bm.nights, (bm.check_out_date - bm.check_in_date)) AS nights,
    bm.guest_name,
    bm.guest_phone,
    bm.guest_email,
    bm.customer_id,
    c.nationality,
    bm.ota_source AS source,
    bm.pms_property_name,
    bm.pms_property_id,
    bm.ota_booking_code,
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
   FROM (((bookings_mirror bm
     LEFT JOIN customers c ON ((bm.customer_id = c.id)))
     LEFT JOIN stays s ON ((bm.unified_booking_id = s.unified_booking_id)))
     LEFT JOIN LATERAL ( SELECT seg.host_property_name,
            seg.host_room_type,
            seg.room_code,
            seg.host_room_id
           FROM host_supply_segments seg
          WHERE (seg.unified_booking_id = bm.unified_booking_id)
          ORDER BY seg.date_from
         LIMIT 1) hss ON (true))
UNION ALL
 SELECT mb.unified_booking_id,
    'MANUAL'::text AS booking_type,
    mb.created_at,
    COALESCE(mb.booking_date, date(mb.created_at)) AS booking_date,
    mb.check_in_date,
    mb.check_out_date,
    COALESCE(mb.nights, (mb.check_out_date - mb.check_in_date)) AS nights,
    mb.guest_name,
    mb.guest_phone,
    mb.guest_email,
    mb.customer_id,
    c.nationality,
    mb.source,
    mb.manual_property_name AS pms_property_name,
    NULL::text AS pms_property_id,
    NULL::text AS ota_booking_code,
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
   FROM (((manual_bookings mb
     LEFT JOIN customers c ON ((mb.customer_id = c.id)))
     LEFT JOIN stays s ON ((mb.unified_booking_id = s.unified_booking_id)))
     LEFT JOIN LATERAL ( SELECT seg.host_property_name,
            seg.host_room_type,
            seg.room_code,
            seg.host_room_id
           FROM host_supply_segments seg
          WHERE (seg.unified_booking_id = mb.unified_booking_id)
          ORDER BY seg.date_from
         LIMIT 1) hss ON (true));

-- Drop and recreate unified_payments view without SECURITY DEFINER  
DROP VIEW IF EXISTS public.unified_payments;
CREATE VIEW public.unified_payments AS
SELECT hc.id AS unified_payment_id,
    hc.unified_booking_id,
    'HOTEL_COLLECT'::text AS payment_channel,
    hc.payer_type,
    hc.payee_type,
    hc.related_type,
    hc.related_id,
    hc.amount_collected AS amount,
    'VND'::text AS currency,
    hc.collected_at AS received_at,
    'hotel_collects'::text AS source_table,
    (hc.id)::text AS source_id,
    hc.payment_method,
    hc.note,
    hc.receipt,
    hc.collected_by AS processed_by
   FROM hotel_collects hc
UNION ALL
 SELECT sp.id AS unified_payment_id,
    so.unified_booking_id,
    'SERVICE_COLLECT'::text AS payment_channel,
    sp.payer_type,
    sp.payee_type,
    'SERVICE'::text AS related_type,
    (sp.service_order_id)::text AS related_id,
    sp.amount_collected AS amount,
    'VND'::text AS currency,
    sp.collected_at AS received_at,
    'service_payments'::text AS source_table,
    (sp.id)::text AS source_id,
    sp.payment_method,
    NULL::text AS note,
    sp.receipt,
    sp.collected_by AS processed_by
   FROM (service_payments sp
     LEFT JOIN service_orders so ON ((sp.service_order_id = so.id)))
UNION ALL
 SELECT op.id AS unified_payment_id,
    NULL::text AS unified_booking_id,
    'OTA_COLLECT'::text AS payment_channel,
    'OTA'::text AS payer_type,
    'ROOMRISE'::text AS payee_type,
    'ROOM'::text AS related_type,
    NULL::text AS related_id,
    op.total_amount AS amount,
    'VND'::text AS currency,
    op.reconciled_at AS received_at,
    'ota_payouts'::text AS source_table,
    (op.id)::text AS source_id,
    'BANK_TRANSFER'::text AS payment_method,
    op.note,
    op.bank_reference AS receipt,
    op.reconciled_by AS processed_by
   FROM ota_payouts op
  WHERE (op.status = 'RECEIVED'::payout_status);