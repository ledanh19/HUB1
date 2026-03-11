-- ============================================
-- OTA Payout Adjustment Reporting
-- Schema Evolution + Classification + Ledger Posting RPCs
-- 100% ADDITIVE, NON-BREAKING, IDEMPOTENT
-- ============================================

-- ─── PHASE 1A: DROP UNIQUE CONSTRAINT ───
ALTER TABLE ota_payout_reconciliation_items
  DROP CONSTRAINT IF EXISTS uq_payout_item_type;

-- ─── PHASE 1B: ADD NEW COLUMNS ───
ALTER TABLE ota_payout_reconciliation_items
  ADD COLUMN IF NOT EXISTS adj_category TEXT,
  ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES ota_disputes(id),
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'CREDIT',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Add CHECK constraint for direction
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_recon_direction'
  ) THEN
    ALTER TABLE ota_payout_reconciliation_items
      ADD CONSTRAINT chk_recon_direction CHECK (direction IN ('DEBIT', 'CREDIT'));
  END IF;
END $$;

-- Idempotency unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_recon_items_idempotency
  ON ota_payout_reconciliation_items(payout_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recon_items_adj_category
  ON ota_payout_reconciliation_items(adj_category)
  WHERE adj_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recon_items_dispute_id
  ON ota_payout_reconciliation_items(dispute_id)
  WHERE dispute_id IS NOT NULL;

-- ─── PHASE 2A: CREATE/REPLACE RPCs ───
CREATE OR REPLACE FUNCTION public.create_ota_payout_reconciliation_item_atomic(
    p_payout_id uuid,
    p_item_type text,
    p_amount numeric,
    p_note text DEFAULT NULL,
    p_evidence jsonb DEFAULT NULL,
    p_direction text DEFAULT 'CREDIT',
    p_dispute_id uuid DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payout RECORD;
    v_before jsonb;
    v_item_id uuid;
    v_bank_fee numeric;
    v_adj_total numeric;
    v_total_received numeric;
    v_expected numeric;
    v_is_settled boolean;
    v_new_status text;
    v_user_id uuid;
    v_existing_id uuid;
BEGIN
    v_user_id := auth.uid();
    SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id;
    IF v_payout IS NULL THEN
        RAISE EXCEPTION 'Payout % không tồn tại', p_payout_id;
    END IF;
    v_before := to_jsonb(v_payout);
    IF p_item_type NOT IN ('BANK_TRANSFER_FEE', 'DISPUTE', 'UNDERPAYMENT', 'MANUAL_ADJUSTMENT', 'OTHER') THEN
        RAISE EXCEPTION 'item_type không hợp lệ: %', p_item_type;
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Số tiền phải lớn hơn 0';
    END IF;
    IF p_direction NOT IN ('DEBIT', 'CREDIT') THEN
        RAISE EXCEPTION 'direction không hợp lệ: %', p_direction;
    END IF;
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_id
        FROM ota_payout_reconciliation_items
        WHERE payout_id = p_payout_id AND idempotency_key = p_idempotency_key;
        IF v_existing_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'item_id', v_existing_id,
                'already_exists', true,
                'idempotency_key', p_idempotency_key
            );
        END IF;
    END IF;
    INSERT INTO ota_payout_reconciliation_items (
        payout_id, item_type, amount, note, evidence, created_by,
        direction, dispute_id, idempotency_key
    )
    VALUES (
        p_payout_id, p_item_type, p_amount, p_note, p_evidence, v_user_id,
        p_direction, p_dispute_id, p_idempotency_key
    )
    RETURNING id INTO v_item_id;
    PERFORM classify_ota_payout_adjustment(v_item_id);
    SELECT COALESCE(SUM(CASE WHEN item_type = 'BANK_TRANSFER_FEE' THEN amount ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN item_type IN ('MANUAL_ADJUSTMENT', 'OTHER', 'DISPUTE', 'UNDERPAYMENT') THEN amount ELSE 0 END), 0)
    INTO v_bank_fee, v_adj_total
    FROM ota_payout_reconciliation_items WHERE payout_id = p_payout_id;
    WITH voided_originals AS (
        SELECT hc.related_collection_id
        FROM hotel_collects hc
        WHERE hc.collection_type = 'VOID'
          AND hc.related_collection_id IS NOT NULL
          AND hc.related_collection_id IN (
              SELECT cpa.collection_id FROM collection_payout_allocations cpa WHERE cpa.payout_id = p_payout_id
          )
    )
    SELECT COALESCE(SUM(cpa.allocated_amount), 0)
    INTO v_total_received
    FROM collection_payout_allocations cpa
    INNER JOIN hotel_collects hc ON hc.id = cpa.collection_id
    WHERE cpa.payout_id = p_payout_id
      AND hc.collection_type = 'COLLECT'
      AND hc.id NOT IN (SELECT related_collection_id FROM voided_originals);
    v_expected := COALESCE(v_payout.net_payout_amount, v_payout.total_amount, 0);
    v_is_settled := (v_total_received + v_bank_fee + v_adj_total) >= (v_expected - 1);
    IF v_total_received <= 0 THEN
        v_new_status := 'PENDING';
    ELSIF v_is_settled THEN
        v_new_status := 'RECEIVED';
    ELSE
        v_new_status := 'PARTIAL';
    END IF;
    UPDATE ota_payouts SET
        bank_fee_total = v_bank_fee,
        adjustment_total = v_adj_total,
        is_reconciled = v_is_settled,
        status = v_new_status::payout_status,
        reconciled_at = CASE WHEN v_new_status = 'RECEIVED' THEN COALESCE(reconciled_at, now()) ELSE reconciled_at END,
        updated_at = now()
    WHERE id = p_payout_id;
    INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
    VALUES (
        'OTA_PAYOUT_RECONCILIATION', 'ota_payout_reconciliation_items', v_item_id::text, v_user_id,
        v_before,
        jsonb_build_object(
            'payout_id', p_payout_id, 'item_type', p_item_type, 'amount', p_amount,
            'direction', p_direction, 'dispute_id', p_dispute_id,
            'bank_fee_total', v_bank_fee, 'adjustment_total', v_adj_total,
            'total_received', v_total_received, 'expected', v_expected,
            'new_status', v_new_status, 'is_reconciled', v_is_settled
        )
    );
    RETURN jsonb_build_object(
        'item_id', v_item_id, 'new_status', v_new_status, 'is_reconciled', v_is_settled,
        'bank_fee_total', v_bank_fee, 'adjustment_total', v_adj_total,
        'total_received', v_total_received, 'expected', v_expected
    );
END;
$$;

-- ─── PHASE 2B: CLASSIFY ADJUSTMENT ───
CREATE OR REPLACE FUNCTION public.classify_ota_payout_adjustment(
    p_item_id uuid
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
    v_category TEXT;
BEGIN
    SELECT * INTO v_item
    FROM ota_payout_reconciliation_items
    WHERE id = p_item_id;
    IF v_item IS NULL THEN
        RAISE EXCEPTION 'Reconciliation item % không tồn tại', p_item_id;
    END IF;
    IF v_item.item_type = 'BANK_TRANSFER_FEE' THEN
        v_category := 'BANK_FEE';
    ELSIF v_item.item_type = 'DISPUTE' OR v_item.dispute_id IS NOT NULL THEN
        IF v_item.direction = 'DEBIT' THEN
            v_category := 'DISPUTE_WIN';
        ELSE
            v_category := 'DISPUTE_LOSS';
        END IF;
    ELSIF v_item.note ILIKE '%penalty%'
       OR v_item.note ILIKE '%phạt%'
       OR v_item.note ILIKE '%chargeback%' THEN
        v_category := 'OTA_PENALTY';
    ELSIF v_item.note ILIKE '%compensation%'
       OR v_item.note ILIKE '%bồi thường%' THEN
        v_category := 'OTA_COMPENSATION';
    ELSIF v_item.note ILIKE '%rounding%'
       OR v_item.note ILIKE '%fx%'
       OR v_item.note ILIKE '%quy đổi%' THEN
        v_category := 'OTA_ROUNDING_FX';
    ELSIF v_item.item_type = 'UNDERPAYMENT' THEN
        v_category := 'OTA_UNDERPAYMENT';
    ELSE
        v_category := 'OTA_ADJUSTMENT_OTHER';
    END IF;
    UPDATE ota_payout_reconciliation_items
    SET adj_category = v_category
    WHERE id = p_item_id;
    RETURN v_category;
END;
$$;

-- ─── PHASE 2C: POST ADJUSTMENT TO LEDGER ───
CREATE OR REPLACE FUNCTION public.post_ota_payout_adjustment_to_ledger_atomic(
    p_recon_item_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
    v_payout RECORD;
    v_ledger_id uuid;
    v_existing_ledger_id uuid;
    v_user_id uuid;
    v_entry_date date;
    v_cash_account_id uuid;
    v_account_snapshot jsonb;
    v_category TEXT;
BEGIN
    v_user_id := auth.uid();
    SELECT * INTO v_item
    FROM ota_payout_reconciliation_items
    WHERE id = p_recon_item_id;
    IF v_item IS NULL THEN
        RAISE EXCEPTION 'Reconciliation item % không tồn tại', p_recon_item_id;
    END IF;
    IF v_item.item_type = 'BANK_TRANSFER_FEE' THEN
        RETURN jsonb_build_object(
            'recon_item_id', p_recon_item_id,
            'skipped', true,
            'reason', 'BANK_TRANSFER_FEE uses separate posting path'
        );
    END IF;
    IF v_item.ledger_entry_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'recon_item_id', p_recon_item_id,
            'ledger_entry_id', v_item.ledger_entry_id,
            'already_posted', true
        );
    END IF;
    SELECT id INTO v_existing_ledger_id
    FROM ledger_entries
    WHERE source_type = 'OTA_PAYOUT_ADJUSTMENT'
      AND source_id = p_recon_item_id
      AND entry_type = 'ORIGINAL'
    LIMIT 1;
    IF v_existing_ledger_id IS NOT NULL THEN
        UPDATE ota_payout_reconciliation_items
        SET ledger_entry_id = v_existing_ledger_id
        WHERE id = p_recon_item_id;
        RETURN jsonb_build_object(
            'recon_item_id', p_recon_item_id,
            'ledger_entry_id', v_existing_ledger_id,
            'already_posted', true,
            'linked_existing', true
        );
    END IF;
    IF v_item.adj_category IS NULL THEN
        v_category := classify_ota_payout_adjustment(p_recon_item_id);
    ELSE
        v_category := v_item.adj_category;
    END IF;
    SELECT * INTO v_payout FROM ota_payouts WHERE id = v_item.payout_id;
    IF v_payout IS NULL THEN
        RAISE EXCEPTION 'Payout % không tồn tại', v_item.payout_id;
    END IF;
    v_entry_date := COALESCE(
        v_payout.payout_date,
        v_payout.payout_period_to::date,
        v_item.created_at::date
    );
    SELECT id INTO v_cash_account_id
    FROM cash_accounts
    WHERE is_default = true AND is_active = true
    ORDER BY created_at
    LIMIT 1;
    IF v_cash_account_id IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy tài khoản tiền mặc định';
    END IF;
    SELECT jsonb_build_object(
        'account_name', account_name,
        'account_code', account_code,
        'account_type', account_type
    ) INTO v_account_snapshot
    FROM cash_accounts WHERE id = v_cash_account_id;
    INSERT INTO ledger_entries (
        org_id, entry_date, source_type, source_id, entry_type,
        cash_account_id, account_snapshot, direction, amount,
        counterparty_type, counterparty_name,
        is_posted, note, created_by
    ) VALUES (
        COALESCE(v_payout.org_id, '00000000-0000-0000-0000-000000000001'::uuid),
        v_entry_date,
        'OTA_PAYOUT_ADJUSTMENT',
        p_recon_item_id,
        'ORIGINAL',
        v_cash_account_id,
        v_account_snapshot,
        v_item.direction,
        v_item.amount,
        'OTA',
        v_payout.ota_source,
        true,
        format('OTA Adjustment [%s] - %s - Payout %s (%s)',
            v_category,
            COALESCE(v_item.note, v_item.item_type),
            COALESCE(v_payout.provider_payout_id, LEFT(v_item.payout_id::text, 8)),
            v_payout.ota_source
        ),
        v_user_id
    )
    RETURNING id INTO v_ledger_id;
    UPDATE ota_payout_reconciliation_items
    SET ledger_entry_id = v_ledger_id
    WHERE id = p_recon_item_id;
    INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
    VALUES (
        'LEDGER_POST_OTA_ADJUSTMENT',
        'ledger_entries',
        v_ledger_id::text,
        v_user_id,
        jsonb_build_object('recon_item_id', p_recon_item_id, 'payout_id', v_item.payout_id),
        jsonb_build_object(
            'ledger_entry_id', v_ledger_id,
            'amount', v_item.amount,
            'direction', v_item.direction,
            'adj_category', v_category,
            'entry_date', v_entry_date,
            'source_type', 'OTA_PAYOUT_ADJUSTMENT',
            'item_type', v_item.item_type,
            'dispute_id', v_item.dispute_id
        )
    );
    RETURN jsonb_build_object(
        'recon_item_id', p_recon_item_id,
        'ledger_entry_id', v_ledger_id,
        'posted_amount', v_item.amount,
        'direction', v_item.direction,
        'adj_category', v_category,
        'entry_date', v_entry_date,
        'already_posted', false
    );
END;
$$;

-- ─── PHASE 2D: BACKFILL CLASSIFY + POST ───
CREATE OR REPLACE FUNCTION public.backfill_classify_and_post_adjustments(
    p_limit int DEFAULT 500,
    p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
    v_result jsonb;
    v_posted_count int := 0;
    v_classified_count int := 0;
    v_skipped_count int := 0;
    v_errors jsonb := '[]'::jsonb;
    v_dry_run_list jsonb := '[]'::jsonb;
    v_category TEXT;
BEGIN
    FOR v_item IN
        SELECT ri.id, ri.payout_id, ri.item_type, ri.amount, ri.direction,
               ri.adj_category, ri.ledger_entry_id, ri.note,
               p.ota_source, p.provider_payout_id
        FROM ota_payout_reconciliation_items ri
        JOIN ota_payouts p ON p.id = ri.payout_id
        WHERE ri.item_type != 'BANK_TRANSFER_FEE'
        ORDER BY ri.created_at ASC
        LIMIT p_limit
    LOOP
        IF p_dry_run THEN
            v_dry_run_list := v_dry_run_list || jsonb_build_object(
                'id', v_item.id,
                'payout_id', v_item.payout_id,
                'item_type', v_item.item_type,
                'amount', v_item.amount,
                'direction', v_item.direction,
                'current_category', v_item.adj_category,
                'has_ledger', v_item.ledger_entry_id IS NOT NULL,
                'ota_source', v_item.ota_source
            );
            v_posted_count := v_posted_count + 1;
        ELSE
            BEGIN
                v_category := classify_ota_payout_adjustment(v_item.id);
                v_classified_count := v_classified_count + 1;
                IF v_item.ledger_entry_id IS NULL THEN
                    v_result := post_ota_payout_adjustment_to_ledger_atomic(v_item.id);
                    v_posted_count := v_posted_count + 1;
                ELSE
                    v_skipped_count := v_skipped_count + 1;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                v_skipped_count := v_skipped_count + 1;
                v_errors := v_errors || jsonb_build_object(
                    'id', v_item.id,
                    'payout_id', v_item.payout_id,
                    'error', SQLERRM
                );
            END;
        END IF;
    END LOOP;
    RETURN jsonb_build_object(
        'dry_run', p_dry_run,
        'classified_count', v_classified_count,
        'posted_count', v_posted_count,
        'skipped_count', v_skipped_count,
        'errors', v_errors,
        'items', CASE WHEN p_dry_run THEN v_dry_run_list ELSE '[]'::jsonb END
    );
END;
$$;

-- ─── GRANTS ───
GRANT EXECUTE ON FUNCTION public.classify_ota_payout_adjustment TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_ota_payout_adjustment_to_ledger_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_classify_and_post_adjustments TO authenticated;

-- ─── BACKFILL: Classify existing items ───
DO $$
DECLARE
    v_item RECORD;
BEGIN
    FOR v_item IN
        SELECT id FROM ota_payout_reconciliation_items
        WHERE adj_category IS NULL
    LOOP
        PERFORM classify_ota_payout_adjustment(v_item.id);
    END LOOP;
END $$;