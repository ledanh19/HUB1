
-- ============================================
-- OTA Payout Reconciliation: Schema + RPC + Backfill
-- 100% ADDITIVE, NON-BREAKING, IDEMPOTENT
-- ============================================

-- ─── A) ADD COLUMNS TO ota_payouts ───
ALTER TABLE ota_payouts ADD COLUMN IF NOT EXISTS bank_fee_total numeric NOT NULL DEFAULT 0;
ALTER TABLE ota_payouts ADD COLUMN IF NOT EXISTS adjustment_total numeric NOT NULL DEFAULT 0;
ALTER TABLE ota_payouts ADD COLUMN IF NOT EXISTS is_reconciled boolean NOT NULL DEFAULT false;

-- ─── B) CREATE RECONCILIATION ITEMS TABLE ───
CREATE TABLE IF NOT EXISTS ota_payout_reconciliation_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id uuid NOT NULL REFERENCES ota_payouts(id) ON DELETE CASCADE,
    item_type text NOT NULL,
    amount numeric NOT NULL,
    note text,
    evidence jsonb,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_item_type CHECK (item_type IN (
        'BANK_TRANSFER_FEE', 'DISPUTE', 'UNDERPAYMENT', 'MANUAL_ADJUSTMENT', 'OTHER'
    )),
    CONSTRAINT chk_amount_positive CHECK (amount > 0),
    CONSTRAINT uq_payout_item_type UNIQUE (payout_id, item_type)
);

CREATE INDEX IF NOT EXISTS idx_payout_reconcile_payout_id 
ON ota_payout_reconciliation_items(payout_id);

ALTER TABLE ota_payout_reconciliation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read reconciliation_items"
ON ota_payout_reconciliation_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert reconciliation_items"
ON ota_payout_reconciliation_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update reconciliation_items"
ON ota_payout_reconciliation_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ─── C) RECONCILIATION RPC ───
CREATE OR REPLACE FUNCTION public.create_ota_payout_reconciliation_item_atomic(
    p_payout_id uuid,
    p_item_type text,
    p_amount numeric,
    p_note text DEFAULT NULL,
    p_evidence jsonb DEFAULT NULL
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

    INSERT INTO ota_payout_reconciliation_items (payout_id, item_type, amount, note, evidence, created_by)
    VALUES (p_payout_id, p_item_type, p_amount, p_note, p_evidence, v_user_id)
    ON CONFLICT (payout_id, item_type)
    DO UPDATE SET amount = EXCLUDED.amount, note = EXCLUDED.note, evidence = EXCLUDED.evidence
    RETURNING id INTO v_item_id;

    SELECT COALESCE(SUM(CASE WHEN item_type = 'BANK_TRANSFER_FEE' THEN amount ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN item_type IN ('MANUAL_ADJUSTMENT', 'OTHER', 'DISPUTE') THEN amount ELSE 0 END), 0)
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

-- ─── D) UPDATE recalculate_ota_payout_status_v2 ───
CREATE OR REPLACE FUNCTION public.recalculate_ota_payout_status_v2(
    p_payout_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payout RECORD;
    v_total_received NUMERIC;
    v_expected_amount NUMERIC;
    v_bank_fee NUMERIC;
    v_adj_total NUMERIC;
    v_new_status TEXT;
    v_is_settled BOOLEAN;
BEGIN
    SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id;
    IF v_payout IS NULL THEN RETURN; END IF;

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

    SELECT COALESCE(SUM(CASE WHEN item_type = 'BANK_TRANSFER_FEE' THEN amount ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN item_type IN ('MANUAL_ADJUSTMENT', 'OTHER', 'DISPUTE') THEN amount ELSE 0 END), 0)
    INTO v_bank_fee, v_adj_total
    FROM ota_payout_reconciliation_items WHERE payout_id = p_payout_id;

    v_expected_amount := COALESCE(v_payout.net_payout_amount, v_payout.total_amount, 0);
    v_is_settled := (v_total_received + v_bank_fee + v_adj_total) >= (v_expected_amount - 1);

    IF v_total_received <= 0 THEN
        v_new_status := 'PENDING';
    ELSIF v_is_settled THEN
        v_new_status := 'RECEIVED';
    ELSE
        v_new_status := 'PARTIAL';
    END IF;

    UPDATE ota_payouts SET
        bank_fee_total = v_bank_fee, adjustment_total = v_adj_total,
        is_reconciled = v_is_settled,
        status = v_new_status::payout_status,
        reconciled_at = CASE WHEN v_new_status = 'RECEIVED' THEN COALESCE(reconciled_at, now()) ELSE reconciled_at END,
        updated_at = now()
    WHERE id = p_payout_id;
END;
$$;

-- ─── E) BACKFILL ───
DO $$
DECLARE
    v_rec RECORD;
    v_updated int := 0;
BEGIN
    FOR v_rec IN
        SELECT sub.payout_id, sub.diff
        FROM (
            SELECT p.id as payout_id,
                   p.net_payout_amount - COALESCE(alloc.total_received, 0) as diff
            FROM ota_payouts p
            LEFT JOIN (
                SELECT cpa.payout_id, SUM(cpa.allocated_amount) as total_received
                FROM collection_payout_allocations cpa
                INNER JOIN hotel_collects hc ON hc.id = cpa.collection_id AND hc.collection_type = 'COLLECT'
                GROUP BY cpa.payout_id
            ) alloc ON alloc.payout_id = p.id
            WHERE p.status = 'PARTIAL'
              AND p.created_at < now() - interval '24 hours'
        ) sub
        WHERE sub.diff BETWEEN 1 AND 10000
          AND NOT EXISTS (SELECT 1 FROM ota_payout_reconciliation_items ri WHERE ri.payout_id = sub.payout_id)
    LOOP
        INSERT INTO ota_payout_reconciliation_items (payout_id, item_type, amount, note)
        VALUES (v_rec.payout_id, 'BANK_TRANSFER_FEE', v_rec.diff, 'AUTO_BACKFILL_BANK_FEE')
        ON CONFLICT (payout_id, item_type) DO NOTHING;

        PERFORM recalculate_ota_payout_status_v2(v_rec.payout_id);

        INSERT INTO audit_logs (action, entity, entity_id, before_data, after_data)
        VALUES ('OTA_PAYOUT_RECONCILIATION_BACKFILL', 'ota_payouts', v_rec.payout_id::text,
            jsonb_build_object('status', 'PARTIAL', 'diff', v_rec.diff),
            jsonb_build_object('item_type', 'BANK_TRANSFER_FEE', 'amount', v_rec.diff));

        v_updated := v_updated + 1;
    END LOOP;
END $$;
