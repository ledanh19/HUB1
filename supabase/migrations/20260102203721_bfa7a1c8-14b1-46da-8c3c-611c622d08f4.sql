-- Fix push idempotency to be per-subscription (avoid treating multiple devices for same user as duplicates)

BEGIN;

-- 1) Update unique constraint to include subscription_id
ALTER TABLE public.push_deliveries
  DROP CONSTRAINT IF EXISTS unique_push_delivery;

ALTER TABLE public.push_deliveries
  ADD CONSTRAINT unique_push_delivery_per_subscription
  UNIQUE (event_type, idempotency_key, recipient_user_id, subscription_id);

-- 2) Update idempotency helper to match the new constraint
CREATE OR REPLACE FUNCTION public.try_record_push_delivery(
  p_event_type text,
  p_idempotency_key text,
  p_recipient_user_id uuid,
  p_subscription_id uuid DEFAULT NULL::uuid,
  p_source_table text DEFAULT NULL::text,
  p_source_record_id text DEFAULT NULL::text,
  p_payload_hash text DEFAULT NULL::text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted_count integer;
BEGIN
  INSERT INTO public.push_deliveries (
    event_type,
    idempotency_key,
    recipient_user_id,
    subscription_id,
    source_table,
    source_record_id,
    payload_hash
  )
  VALUES (
    p_event_type,
    p_idempotency_key,
    p_recipient_user_id,
    p_subscription_id,
    p_source_table,
    p_source_record_id,
    p_payload_hash
  )
  ON CONFLICT (event_type, idempotency_key, recipient_user_id, subscription_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  IF v_inserted_count > 0 THEN
    RETURN 'SENT';
  ELSE
    RETURN 'DUPLICATE';
  END IF;
END;
$$;

COMMIT;
