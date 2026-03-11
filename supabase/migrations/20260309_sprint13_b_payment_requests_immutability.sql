-- ============================================================================
-- SPRINT 13.B — Payment Requests Immutability Trigger
-- ============================================================================
-- Date: 2026-03-09
-- Risk: M2 — RLS allows UPDATE on payment_requests after PAID/CANCELLED
--       which could mutate financial amounts post-disbursement
-- Fix:  DB trigger rejects mutation of critical columns when status is terminal
--
-- NON-BREAKING. ADDITIVE. Does not modify RLS or schema.
-- ============================================================================


-- ============================================================================
-- PART 1: Immutability Guard Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_payment_requests_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only guard terminal statuses
  IF OLD.status NOT IN ('PAID', 'CANCELLED') THEN
    RETURN NEW;
  END IF;

  -- Allow status transition BACK from CANCELLED to PENDING only by super_admin
  -- (theoretical admin correction path — not implemented yet, reject for now)

  -- Block mutation of critical financial columns
  IF (
    NEW.payment_type IS DISTINCT FROM OLD.payment_type
    OR NEW.source_amount IS DISTINCT FROM OLD.source_amount
    OR NEW.proposed_amount IS DISTINCT FROM OLD.proposed_amount
    OR NEW.settlement_id IS DISTINCT FROM OLD.settlement_id
    OR NEW.settlement_type IS DISTINCT FROM OLD.settlement_type
    OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
    OR NEW.expense_category IS DISTINCT FROM OLD.expense_category
    OR NEW.request_code IS DISTINCT FROM OLD.request_code
  ) THEN
    RAISE EXCEPTION 'PAYMENT_REQUEST_IMMUTABLE_AFTER_TERMINAL: Cannot modify critical '
      'financial columns when status is %. Column mutation blocked. '
      'If correction is needed, create a reversal/adjustment entry instead.',
      OLD.status
      USING ERRCODE = 'P0004';
  END IF;

  -- Block status changes (except PAID → PAID is idempotent)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Allow only: status staying the same (idempotent updates)
    RAISE EXCEPTION 'PAYMENT_REQUEST_STATUS_IMMUTABLE: Cannot change status from % to % '
      'for terminal payment request %. Use reversal/adjustment instead.',
      OLD.status, NEW.status, OLD.id
      USING ERRCODE = 'P0004';
  END IF;

  -- Allow harmless field updates:
  --   note, difference_reason, updated_at, recipient_name, recipient_unit,
  --   cancelled_at, cancelled_reason, cancelled_by (set during CANCEL RPC),
  --   approved_at, approved_by (already set before PAID),
  --   expense_period, confirmed_at,
  --   is_sample_data, scenario_id
  -- These pass through because they're not in the block list above.

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_guard_payment_requests_immutable IS
  'Sprint 13.B: Prevents mutation of critical financial columns on payment_requests '
  'after status reaches PAID or CANCELLED. Blocks: payment_type, source_amount, '
  'proposed_amount, settlement_id, settlement_type, partner_id, expense_category, '
  'request_code, status. Allows: note, difference_reason, updated_at, etc.';


-- ============================================================================
-- PART 2: Apply Trigger
-- ============================================================================

DROP TRIGGER IF EXISTS trg_payment_requests_immutable ON public.payment_requests;

CREATE TRIGGER trg_payment_requests_immutable
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_payment_requests_immutable();

COMMENT ON TRIGGER trg_payment_requests_immutable ON public.payment_requests IS
  'Sprint 13.B: Immutability guard — blocks critical column changes after PAID/CANCELLED.';


-- ============================================================================
-- VERIFICATION QUERIES (run after deploy)
-- ============================================================================

-- 1. Trigger exists
-- SELECT tgname, tgrelid::regclass, tgenabled
-- FROM pg_trigger
-- WHERE tgname = 'trg_payment_requests_immutable';
-- Expected: 1 row, tgenabled = 'O' (origin)

-- 2. Test: update amount on PAID request (should fail)
-- BEGIN;
-- UPDATE payment_requests SET proposed_amount = proposed_amount + 1
-- WHERE status = 'PAID' LIMIT 1;
-- -- Expected: ERROR PAYMENT_REQUEST_IMMUTABLE_AFTER_TERMINAL
-- ROLLBACK;

-- 3. Test: update note on PAID request (should pass)
-- BEGIN;
-- UPDATE payment_requests SET note = 'test note update'
-- WHERE status = 'PAID' LIMIT 1;
-- -- Expected: success
-- ROLLBACK;
