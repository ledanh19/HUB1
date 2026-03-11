
-- ============================================================================
-- SPRINT 13B — PAYMENT REQUESTS IMMUTABILITY TRIGGER
-- ============================================================================
-- Prevents modification of financial fields on PAID/REJECTED/CANCELLED requests.
-- Only 'note' and 'updated_at' may be changed on non-PENDING/APPROVED records.
-- NON-BREAKING: existing RPC flows already enforce this at app level;
-- this adds a DB-level safety net.
-- ============================================================================

-- Guard function
CREATE OR REPLACE FUNCTION public.fn_guard_payment_requests_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_immutable_statuses TEXT[] := ARRAY['PAID', 'REJECTED', 'CANCELLED'];
  v_changed_fields TEXT[] := '{}';
BEGIN
  -- Only guard rows that are in immutable status BEFORE the update
  IF NOT (OLD.status = ANY(v_immutable_statuses)) THEN
    RETURN NEW;
  END IF;

  -- Build list of changed fields (excluding allowed ones)
  IF NEW.proposed_amount IS DISTINCT FROM OLD.proposed_amount THEN
    v_changed_fields := v_changed_fields || 'proposed_amount';
  END IF;
  IF NEW.source_amount IS DISTINCT FROM OLD.source_amount THEN
    v_changed_fields := v_changed_fields || 'source_amount';
  END IF;
  IF NEW.difference_amount IS DISTINCT FROM OLD.difference_amount THEN
    v_changed_fields := v_changed_fields || 'difference_amount';
  END IF;
  IF NEW.difference_reason IS DISTINCT FROM OLD.difference_reason THEN
    v_changed_fields := v_changed_fields || 'difference_reason';
  END IF;
  IF NEW.payment_type IS DISTINCT FROM OLD.payment_type THEN
    v_changed_fields := v_changed_fields || 'payment_type';
  END IF;
  IF NEW.settlement_id IS DISTINCT FROM OLD.settlement_id THEN
    v_changed_fields := v_changed_fields || 'settlement_id';
  END IF;
  IF NEW.settlement_type IS DISTINCT FROM OLD.settlement_type THEN
    v_changed_fields := v_changed_fields || 'settlement_type';
  END IF;
  IF NEW.expense_category IS DISTINCT FROM OLD.expense_category THEN
    v_changed_fields := v_changed_fields || 'expense_category';
  END IF;
  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id THEN
    v_changed_fields := v_changed_fields || 'partner_id';
  END IF;
  IF NEW.recipient_name IS DISTINCT FROM OLD.recipient_name THEN
    v_changed_fields := v_changed_fields || 'recipient_name';
  END IF;
  IF NEW.recipient_unit IS DISTINCT FROM OLD.recipient_unit THEN
    v_changed_fields := v_changed_fields || 'recipient_unit';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_changed_fields := v_changed_fields || 'status';
  END IF;
  IF NEW.request_code IS DISTINCT FROM OLD.request_code THEN
    v_changed_fields := v_changed_fields || 'request_code';
  END IF;
  IF NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
    v_changed_fields := v_changed_fields || 'requested_by';
  END IF;

  IF array_length(v_changed_fields, 1) > 0 THEN
    RAISE EXCEPTION 'IMMUTABLE_PAYMENT_REQUEST: Cannot modify fields [%] on % payment request %',
      array_to_string(v_changed_fields, ', '), OLD.status, OLD.request_code
      USING ERRCODE = 'P0004';
  END IF;

  -- Allowed: note, updated_at pass through
  RETURN NEW;
END;
$$;

-- Drop trigger if exists (idempotent)
DROP TRIGGER IF EXISTS trg_payment_requests_immutable ON payment_requests;

-- Create trigger
CREATE TRIGGER trg_payment_requests_immutable
  BEFORE UPDATE ON payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION fn_guard_payment_requests_immutable();

COMMENT ON FUNCTION public.fn_guard_payment_requests_immutable IS
  'Sprint 13B: DB-level immutability guard for PAID/REJECTED/CANCELLED payment requests. '
  'Only note and updated_at may be changed. All financial fields are frozen.';
