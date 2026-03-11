
-- ============================================================================
-- SPRINT 2 — PAYOUT FINANCIAL HARDENING
-- ============================================================================

-- PRE-CHECK: Detect cross-payout booking duplicates
DO $$
DECLARE
  v_dup_count INT;
BEGIN
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT unified_booking_id
    FROM public.ota_payout_details
    GROUP BY unified_booking_id
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION
      'SPRINT2_GATE_A_FAIL: Found % booking(s) assigned to multiple payouts. '
      'Run Gate A query, remediate duplicates, then re-deploy.',
      v_dup_count
      USING ERRCODE = 'P0099';
  END IF;

  RAISE NOTICE 'Gate A PASS: No cross-payout booking duplicates found.';
END;
$$;

-- A. SOFT-DELETE COLUMNS ON ota_payouts
ALTER TABLE public.ota_payouts
  ADD COLUMN IF NOT EXISTS is_voided      BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_reason  TEXT,
  ADD COLUMN IF NOT EXISTS voided_by      UUID;

COMMENT ON COLUMN public.ota_payouts.is_voided IS
  'Soft-delete flag. TRUE = payout is voided (kept for audit trail).';

-- B. is_active ON ota_payout_details
ALTER TABLE public.ota_payout_details
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ota_payout_details.is_active IS
  'FALSE when parent payout is voided. Partial unique index excludes inactive rows.';

-- C. PARTIAL UNIQUE INDEX
CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_details_booking_active
  ON public.ota_payout_details (unified_booking_id)
  WHERE is_active = true;

COMMENT ON INDEX public.idx_payout_details_booking_active IS
  'Enforces: one active booking allocation across ALL payouts. '
  'Voided payout details (is_active=false) are excluded.';

-- D. VOID PAYOUT RPC
CREATE OR REPLACE FUNCTION public.void_ota_payout_secure(
  p_payout_id  UUID,
  p_reason     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_payout         RECORD;
  v_user_id        UUID;
  v_alloc_count    INT;
  v_detail_count   INT;
  v_deduction_count INT;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Must be authenticated to void a payout'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/ke_toan can void payouts'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout % không tồn tại', p_payout_id;
  END IF;

  IF v_payout.is_voided THEN
    RETURN jsonb_build_object(
      'payout_id', p_payout_id,
      'status', 'already_voided',
      'voided_at', v_payout.voided_at
    );
  END IF;

  SELECT COUNT(*) INTO v_alloc_count
    FROM collection_payout_allocations
   WHERE payout_id = p_payout_id;

  IF v_alloc_count > 0 THEN
    RAISE EXCEPTION
      'VOID_BLOCKED: Payout has % cash-in allocation(s). '
      'Reverse cash-in first via đảo bút toán thu tiền.',
      v_alloc_count
      USING ERRCODE = 'P0002';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Lý do hủy bắt buộc' USING ERRCODE = 'P0003';
  END IF;

  UPDATE ota_payouts
     SET is_voided     = true,
         voided_at     = now(),
         voided_reason = TRIM(p_reason),
         voided_by     = v_user_id,
         status        = 'PENDING',
         updated_at    = now()
   WHERE id = p_payout_id;

  UPDATE ota_payout_details
     SET is_active = false
   WHERE payout_id = p_payout_id;

  SELECT COUNT(*) INTO v_detail_count
    FROM ota_payout_details WHERE payout_id = p_payout_id;

  SELECT COUNT(*) INTO v_deduction_count
    FROM ota_payout_deductions WHERE payout_id = p_payout_id;

  INSERT INTO audit_logs (action, entity, entity_id, after_data, user_id)
  VALUES (
    'VOID_OTA_PAYOUT',
    'ota_payouts',
    p_payout_id::TEXT,
    jsonb_build_object(
      'payout_id', p_payout_id,
      'reason', TRIM(p_reason),
      'voided_by', v_user_id,
      'details_deactivated', v_detail_count,
      'deductions_preserved', v_deduction_count,
      'previous_status', v_payout.status,
      'ota_source', v_payout.ota_source,
      'total_amount', v_payout.total_amount
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'payout_id', p_payout_id,
    'status', 'voided',
    'voided_at', now(),
    'voided_by', v_user_id,
    'details_deactivated', v_detail_count,
    'deductions_preserved', v_deduction_count
  );
END;
$$;

COMMENT ON FUNCTION public.void_ota_payout_secure(UUID, TEXT) IS
  'Soft-void a payout. Blocks if cash-in exists. '
  'Deactivates details (releases booking for re-allocation). '
  'No rows are deleted. Full audit trail.';

-- E. MONITORING VIEW — Unposted Payout Ledger Items
CREATE OR REPLACE VIEW public.v_unposted_payout_items AS
SELECT
  ri.id              AS recon_item_id,
  ri.payout_id,
  ri.item_type,
  ri.adj_category,
  ri.amount,
  ri.ledger_entry_id,
  ri.created_at      AS item_created_at,
  op.status          AS payout_status,
  op.payout_date,
  op.ota_source,
  op.received_at,
  op.is_voided
FROM public.ota_payout_reconciliation_items ri
JOIN public.ota_payouts op ON op.id = ri.payout_id
WHERE ri.ledger_entry_id IS NULL
  AND ri.amount > 0
  AND op.is_voided = false
  AND op.status IN ('RECEIVED', 'PARTIAL');

COMMENT ON VIEW public.v_unposted_payout_items IS
  'Reconciliation items on non-voided RECEIVED/PARTIAL payouts '
  'that have NOT been posted to ledger.';

-- F. DIAGNOSTIC VIEW — Cross-payout Booking Duplicates
CREATE OR REPLACE VIEW public.v_payout_booking_duplicates AS
SELECT
  pd.unified_booking_id,
  COUNT(*)          AS payout_count,
  ARRAY_AGG(pd.payout_id ORDER BY pd.created_at) AS payout_ids,
  ARRAY_AGG(pd.is_active ORDER BY pd.created_at) AS active_flags
FROM public.ota_payout_details pd
GROUP BY pd.unified_booking_id
HAVING COUNT(*) > 1;

COMMENT ON VIEW public.v_payout_booking_duplicates IS
  'Bookings allocated to more than one payout. After Sprint 2 unique index, '
  'only voided (is_active=false) duplicates should appear here.';

-- VERIFICATION BLOCK
DO $$
DECLARE
  v_cols  INT;
  v_idx   INT;
  v_fn    INT;
  v_views INT;
BEGIN
  SELECT COUNT(*) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'ota_payouts'
     AND column_name IN ('is_voided', 'voided_at', 'voided_reason', 'voided_by');

  SELECT v_cols + COUNT(*) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'ota_payout_details'
     AND column_name = 'is_active';

  SELECT COUNT(*) INTO v_idx
    FROM pg_indexes
   WHERE indexname = 'idx_payout_details_booking_active';

  SELECT COUNT(*) INTO v_fn
    FROM pg_proc
   WHERE proname = 'void_ota_payout_secure';

  SELECT COUNT(*) INTO v_views
    FROM information_schema.views
   WHERE table_schema = 'public'
     AND table_name IN ('v_unposted_payout_items', 'v_payout_booking_duplicates');

  RAISE NOTICE 'Sprint 2 FINAL: columns=%, index=%, void_rpc=%, views=%',
    v_cols, v_idx, v_fn, v_views;

  IF v_cols < 5  THEN RAISE WARNING 'Expected 5 new columns, found %', v_cols; END IF;
  IF v_idx  < 1  THEN RAISE WARNING 'Expected 1 unique index, found %', v_idx; END IF;
  IF v_fn   < 1  THEN RAISE WARNING 'Expected void_ota_payout_secure, found %', v_fn; END IF;
  IF v_views < 2 THEN RAISE WARNING 'Expected 2 views, found %', v_views; END IF;
END;
$$;
