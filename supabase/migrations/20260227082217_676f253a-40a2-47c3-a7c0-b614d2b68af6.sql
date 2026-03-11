
-- ============================================
-- Ledger Posting for OTA Payout Bank Fees
-- ADDITIVE ONLY: new column + new RPCs
-- ============================================

-- 1) Add ledger_entry_id to reconciliation items for traceability
ALTER TABLE ota_payout_reconciliation_items
  ADD COLUMN IF NOT EXISTS ledger_entry_id uuid REFERENCES ledger_entries(id) ON DELETE SET NULL;

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_recon_items_ledger
  ON ota_payout_reconciliation_items(ledger_entry_id)
  WHERE ledger_entry_id IS NOT NULL;

-- ============================================
-- RPC 1: Post a single payout's bank fee to ledger (atomic, idempotent)
-- ============================================
CREATE OR REPLACE FUNCTION public.post_ota_payout_bank_fee_to_ledger_atomic(
  p_payout_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout RECORD;
  v_recon_item RECORD;
  v_ledger_id uuid;
  v_existing_ledger_id uuid;
  v_user_id uuid;
  v_entry_date date;
  v_cash_account_id uuid;
  v_account_snapshot jsonb;
BEGIN
  v_user_id := auth.uid();

  -- 1) Load payout
  SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id;
  IF v_payout IS NULL THEN
    RAISE EXCEPTION 'Payout % không tồn tại', p_payout_id;
  END IF;

  -- 2) Load BANK_TRANSFER_FEE reconciliation item
  SELECT * INTO v_recon_item
  FROM ota_payout_reconciliation_items
  WHERE payout_id = p_payout_id AND item_type = 'BANK_TRANSFER_FEE';

  IF v_recon_item IS NULL THEN
    RAISE EXCEPTION 'Payout % không có mục BANK_TRANSFER_FEE', p_payout_id;
  END IF;

  -- 3) Check if already posted (idempotent via recon item link)
  IF v_recon_item.ledger_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'payout_id', p_payout_id,
      'ledger_entry_id', v_recon_item.ledger_entry_id,
      'posted_amount', v_recon_item.amount,
      'already_posted', true
    );
  END IF;

  -- 4) Also check via ledger idempotent index
  SELECT id INTO v_existing_ledger_id
  FROM ledger_entries
  WHERE source_type = 'OTA_PAYOUT_BANK_FEE'
    AND source_id = p_payout_id
    AND entry_type = 'ORIGINAL'
    AND org_id = v_payout.org_id
  LIMIT 1;

  IF v_existing_ledger_id IS NOT NULL THEN
    -- Link it back to recon item and return
    UPDATE ota_payout_reconciliation_items
    SET ledger_entry_id = v_existing_ledger_id
    WHERE id = v_recon_item.id;

    RETURN jsonb_build_object(
      'payout_id', p_payout_id,
      'ledger_entry_id', v_existing_ledger_id,
      'posted_amount', v_recon_item.amount,
      'already_posted', true,
      'linked_existing', true
    );
  END IF;

  -- 5) Determine entry_date: reconciled_at > payout_period_to > created_at
  v_entry_date := COALESCE(
    v_payout.reconciled_at::date,
    v_payout.payout_period_to::date,
    v_recon_item.created_at::date
  );

  -- 6) Get default cash account (the one that received the payout)
  SELECT id INTO v_cash_account_id
  FROM cash_accounts
  WHERE is_default = true AND is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản tiền mặc định';
  END IF;

  -- Build account snapshot
  SELECT jsonb_build_object(
    'account_name', account_name,
    'account_code', account_code,
    'account_type', account_type
  ) INTO v_account_snapshot
  FROM cash_accounts WHERE id = v_cash_account_id;

  -- 7) Insert ledger entry (CREDIT = expense/money out)
  INSERT INTO ledger_entries (
    org_id, entry_date, source_type, source_id, entry_type,
    cash_account_id, account_snapshot, direction, amount,
    counterparty_type, counterparty_name,
    is_posted, note, created_by
  ) VALUES (
    v_payout.org_id,
    v_entry_date,
    'OTA_PAYOUT_BANK_FEE',
    p_payout_id,
    'ORIGINAL',
    v_cash_account_id,
    v_account_snapshot,
    'CREDIT',  -- expense = money out
    v_recon_item.amount,
    'OTA',
    v_payout.ota_source,
    true,
    format('Phí chuyển khoản NH - Payout %s (%s)', 
      COALESCE(v_payout.provider_payout_id, LEFT(p_payout_id::text, 8)),
      v_payout.ota_source
    ),
    v_user_id
  )
  RETURNING id INTO v_ledger_id;

  -- 8) Link ledger entry back to reconciliation item
  UPDATE ota_payout_reconciliation_items
  SET ledger_entry_id = v_ledger_id
  WHERE id = v_recon_item.id;

  -- 9) Audit log for ledger posting
  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES (
    'LEDGER_POST_BANK_FEE',
    'ledger_entries',
    v_ledger_id::text,
    v_user_id,
    jsonb_build_object('payout_id', p_payout_id, 'recon_item_id', v_recon_item.id),
    jsonb_build_object(
      'ledger_entry_id', v_ledger_id,
      'amount', v_recon_item.amount,
      'direction', 'CREDIT',
      'entry_date', v_entry_date,
      'source_type', 'OTA_PAYOUT_BANK_FEE',
      'ota_source', v_payout.ota_source,
      'payout_period', format('%s ~ %s', v_payout.payout_period_from, v_payout.payout_period_to),
      'evidence', v_recon_item.evidence
    )
  );

  RETURN jsonb_build_object(
    'payout_id', p_payout_id,
    'ledger_entry_id', v_ledger_id,
    'posted_amount', v_recon_item.amount,
    'entry_date', v_entry_date,
    'already_posted', false
  );
END;
$$;

-- ============================================
-- RPC 2: Backfill - post all unposted bank fees to ledger
-- ============================================
CREATE OR REPLACE FUNCTION public.backfill_post_ota_payout_bank_fees_to_ledger(
  p_limit int DEFAULT 500,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items RECORD;
  v_result jsonb;
  v_posted_count int := 0;
  v_skipped_count int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_dry_run_list jsonb := '[]'::jsonb;
BEGIN
  FOR v_items IN
    SELECT ri.id as recon_id, ri.payout_id, ri.amount, ri.ledger_entry_id,
           p.ota_source, p.provider_payout_id
    FROM ota_payout_reconciliation_items ri
    JOIN ota_payouts p ON p.id = ri.payout_id
    WHERE ri.item_type = 'BANK_TRANSFER_FEE'
      AND ri.ledger_entry_id IS NULL
    ORDER BY ri.created_at ASC
    LIMIT p_limit
  LOOP
    IF p_dry_run THEN
      v_dry_run_list := v_dry_run_list || jsonb_build_object(
        'payout_id', v_items.payout_id,
        'amount', v_items.amount,
        'ota_source', v_items.ota_source,
        'provider_payout_id', v_items.provider_payout_id
      );
      v_posted_count := v_posted_count + 1;
    ELSE
      BEGIN
        v_result := post_ota_payout_bank_fee_to_ledger_atomic(v_items.payout_id);
        v_posted_count := v_posted_count + 1;
      EXCEPTION WHEN OTHERS THEN
        v_skipped_count := v_skipped_count + 1;
        v_errors := v_errors || jsonb_build_object(
          'payout_id', v_items.payout_id,
          'error', SQLERRM
        );
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'posted_count', v_posted_count,
    'skipped_count', v_skipped_count,
    'errors', v_errors,
    'items', CASE WHEN p_dry_run THEN v_dry_run_list ELSE '[]'::jsonb END
  );
END;
$$;
