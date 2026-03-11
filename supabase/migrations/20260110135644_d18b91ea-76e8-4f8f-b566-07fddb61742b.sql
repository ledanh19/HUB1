-- Drop the old function with text p_related_id to resolve ambiguity
DROP FUNCTION IF EXISTS public.create_collection_ledger_atomic(
  p_unified_booking_id text,
  p_amount numeric,
  p_payment_method text,
  p_collection_type text,
  p_related_type text,
  p_payer_type text,
  p_related_id text,
  p_note text
);