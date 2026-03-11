-- Drop the existing check constraint and add new one with CLOSED status
ALTER TABLE public.host_settlements DROP CONSTRAINT IF EXISTS host_settlements_status_check;

ALTER TABLE public.host_settlements 
ADD CONSTRAINT host_settlements_status_check 
CHECK (status IN ('DRAFT', 'PARTIALLY_PAID', 'SETTLED', 'CLOSED'));