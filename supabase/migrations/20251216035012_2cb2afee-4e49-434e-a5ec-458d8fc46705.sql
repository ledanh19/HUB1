-- Drop old constraint and add new one with additional allowed values
ALTER TABLE public.cashflow_entries DROP CONSTRAINT IF EXISTS cashflow_entries_source_type_check;

ALTER TABLE public.cashflow_entries ADD CONSTRAINT cashflow_entries_source_type_check 
CHECK (source_type = ANY (ARRAY[
  'PAYMENT'::text, 
  'PAYABLE_PAYMENT'::text, 
  'OPEX'::text, 
  'ADJUSTMENT'::text,
  'HOST_SETTLEMENT_PAYMENT'::text,
  'SERVICE_SETTLEMENT_PAYMENT'::text,
  'INTERNAL_EXPENSE'::text
]));