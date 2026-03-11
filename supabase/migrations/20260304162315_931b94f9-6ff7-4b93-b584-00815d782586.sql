-- Drop the existing FK that only references host_settlements
-- settlement_id is polymorphic: references host_settlements (HOST payments) or service_settlements (SERVICE_PARTNER payments)
ALTER TABLE public.payment_requests DROP CONSTRAINT fk_host_settlement;

COMMENT ON COLUMN public.payment_requests.settlement_id IS 'Polymorphic reference: host_settlements.id (HOST payments) or service_settlements.id (SERVICE_PARTNER payments). No single FK due to dual-table reference.';