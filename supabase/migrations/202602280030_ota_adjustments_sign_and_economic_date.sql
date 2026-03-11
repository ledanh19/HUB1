-- ============================================================================
-- OTA Adjustments — Fix Sign + Economic Date + Backfill + Reporting RPC
-- Phases B/C/D/E — 100% ADDITIVE, NON-BREAKING, IDEMPOTENT
-- ============================================================================

-- ─── PHASE B: SCHEMA ───────────────────────────────────────────────────────

-- B1) ota_payout_reconciliation_items: economic date fields
ALTER TABLE public.ota_payout_reconciliation_items
  ADD COLUMN IF NOT EXISTS economic_date DATE NULL,
  ADD COLUMN IF NOT EXISTS related_period TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_prior_period BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_recon_items_economic_date
  ON public.ota_payout_reconciliation_items(economic_date)
  WHERE economic_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recon_items_related_period
  ON public.ota_payout_reconciliation_items(related_period)
  WHERE related_period IS NOT NULL;

-- B2) ledger_entries: economic date fields
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS economic_date DATE NULL,
  ADD COLUMN IF NOT EXISTS economic_period TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_economic_date
  ON public.ledger_entries(economic_date)
  WHERE economic_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_economic_period
  ON public.ledger_entries(economic_period)
  WHERE economic_period IS NOT NULL;

COMMENT ON COLUMN public.ota_payout_reconciliation_items.economic_date IS 'Date the economic event occurred (dispute, penalty, etc). Used for accrual P&L view.';
COMMENT ON COLUMN public.ota_payout_reconciliation_items.related_period IS 'YYYY-MM of economic_date, for period grouping.';
COMMENT ON COLUMN public.ota_payout_reconciliation_items.is_prior_period IS 'True if economic_date is in a different period from the payout/settlement date.';
COMMENT ON COLUMN public.ledger_entries.economic_date IS 'Economic event date for accrual view. Nullable; report uses COALESCE(economic_date, entry_date).';
COMMENT ON COLUMN public.ledger_entries.economic_period IS 'YYYY-MM of economic_date.';


-- ─── PHASE C+D: CLASSIFY WITH DIRECTION ENFORCEMENT ────────────────────────

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
    v_correct_direction TEXT;
BEGIN
    SELECT * INTO v_item
    FROM ota_payout_reconciliation_items
    WHERE id = p_item_id;

    IF v_item IS NULL THEN
        RAISE EXCEPTION 'Reconciliation item % không tồn tại', p_item_id;
    END IF;

    -- ── Classification rules (deterministic, priority-ordered) ──
    IF v_item.item_type = 'BANK_TRANSFER_FEE' THEN
        v_category := 'BANK_FEE';
        v_correct_direction := 'CREDIT';

    ELSIF v_item.item_type = 'DISPUTE' OR v_item.dispute_id IS NOT NULL THEN
        IF v_item.direction = 'DEBIT' THEN
            v_category := 'DISPUTE_WIN';
            v_correct_direction := 'DEBIT';
        ELSE
            v_category := 'DISPUTE_LOSS';
            v_correct_direction := 'CREDIT';
        END IF;

    ELSIF v_item.note ILIKE '%penalty%'
       OR v_item.note ILIKE '%phạt%'
       OR v_item.note ILIKE '%chargeback%' THEN
        v_category := 'OTA_PENALTY';
        v_correct_direction := 'CREDIT';   -- ← MUST be expense

    ELSIF v_item.note ILIKE '%compensation%'
       OR v_item.note ILIKE '%bồi thường%' THEN
        v_category := 'OTA_COMPENSATION';
        v_correct_direction := 'DEBIT';    -- ← income

    ELSIF v_item.note ILIKE '%rounding%'
       OR v_item.note ILIKE '%fx%'
       OR v_item.note ILIKE '%quy đổi%' THEN
        v_category := 'OTA_ROUNDING_FX';
        -- FX/rounding keeps explicit direction
        v_correct_direction := v_item.direction;

    ELSIF v_item.item_type = 'UNDERPAYMENT' THEN
        v_category := 'OTA_UNDERPAYMENT';
        v_correct_direction := 'CREDIT';   -- ← expense

    ELSE
        v_category := 'OTA_ADJUSTMENT_OTHER';
        v_correct_direction := COALESCE(v_item.direction, 'CREDIT');
    END IF;

    -- ── Persist classification + direction fix ──
    UPDATE ota_payout_reconciliation_items
    SET adj_category = v_category,
        direction = v_correct_direction
    WHERE id = p_item_id;

    RETURN v_category;
END;
$$;


-- ─── PHASE D: POST TO LEDGER WITH ECONOMIC DATE ────────────────────────────

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
    v_economic_date date;
    v_economic_period text;
    v_related_period text;
    v_is_prior boolean;
    v_cash_account_id uuid;
    v_account_snapshot jsonb;
    v_category TEXT;
BEGIN
    v_user_id := auth.uid();

    -- 1) Load reconciliation item
    SELECT * INTO v_item
    FROM ota_payout_reconciliation_items
    WHERE id = p_recon_item_id;

    IF v_item IS NULL THEN
        RAISE EXCEPTION 'Reconciliation item % không tồn tại', p_recon_item_id;
    END IF;

    -- Skip bank fees
    IF v_item.item_type = 'BANK_TRANSFER_FEE' THEN
        RETURN jsonb_build_object(
            'recon_item_id', p_recon_item_id,
            'skipped', true,
            'reason', 'BANK_TRANSFER_FEE uses separate posting path'
        );
    END IF;

    -- 2) Already posted? (idempotent)
    IF v_item.ledger_entry_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'recon_item_id', p_recon_item_id,
            'ledger_entry_id', v_item.ledger_entry_id,
            'already_posted', true
        );
    END IF;

    -- 3) Check via ledger idempotent index
    SELECT id INTO v_existing_ledger_id
    FROM ledger_entries
    WHERE source_type = 'OTA_PAYOUT_ADJUSTMENT'
      AND source_id = p_recon_item_id
      AND entry_type = 'ORIGINAL'
      AND is_reversed = false
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

    -- 4) Ensure classification (also fixes direction)
    IF v_item.adj_category IS NULL THEN
        v_category := classify_ota_payout_adjustment(p_recon_item_id);
        -- Re-read after classify (direction may have changed)
        SELECT * INTO v_item FROM ota_payout_reconciliation_items WHERE id = p_recon_item_id;
    ELSE
        v_category := v_item.adj_category;
    END IF;

    -- 5) Get payout for entry_date
    SELECT * INTO v_payout FROM ota_payouts WHERE id = v_item.payout_id;
    IF v_payout IS NULL THEN
        RAISE EXCEPTION 'Payout % không tồn tại', v_item.payout_id;
    END IF;

    v_entry_date := COALESCE(
        v_payout.payout_date,
        v_payout.payout_period_to::date,
        v_item.created_at::date
    );

    -- ── 5b) Compute economic_date (Phase C2 rules) ──
    v_economic_date := NULL;

    -- Rule 1: dispute-linked → recon_item.created_at (optimal proxy)
    IF v_item.dispute_id IS NOT NULL THEN
        v_economic_date := v_item.created_at::date;
    END IF;

    -- Rule 2: OTA_ROUNDING_FX → settlement date
    IF v_economic_date IS NULL AND v_category = 'OTA_ROUNDING_FX' THEN
        v_economic_date := v_entry_date;
    END IF;

    -- Rule 3: else NULL → report fallback

    -- Compute derived fields
    v_economic_period := NULL;
    v_related_period := NULL;
    v_is_prior := false;
    IF v_economic_date IS NOT NULL THEN
        v_economic_period := to_char(v_economic_date, 'YYYY-MM');
        v_related_period := v_economic_period;
        v_is_prior := (v_economic_period != to_char(v_entry_date, 'YYYY-MM'));
    END IF;

    -- Update recon item with economic fields
    UPDATE ota_payout_reconciliation_items
    SET economic_date = v_economic_date,
        related_period = v_related_period,
        is_prior_period = v_is_prior
    WHERE id = p_recon_item_id;

    -- 6) Get default cash account
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

    -- 7) Insert ledger entry with economic fields
    INSERT INTO ledger_entries (
        org_id, entry_date, source_type, source_id, entry_type,
        cash_account_id, account_snapshot, direction, amount,
        counterparty_type, counterparty_name,
        is_posted, note, created_by,
        economic_date, economic_period
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
        v_user_id,
        v_economic_date,
        v_economic_period
    )
    RETURNING id INTO v_ledger_id;

    -- 8) Link back
    UPDATE ota_payout_reconciliation_items
    SET ledger_entry_id = v_ledger_id
    WHERE id = p_recon_item_id;

    -- 9) Audit
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
            'economic_date', v_economic_date,
            'economic_period', v_economic_period,
            'is_prior_period', v_is_prior,
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
        'economic_date', v_economic_date,
        'is_prior_period', v_is_prior,
        'already_posted', false
    );
END;
$$;


-- ─── PHASE E: NORMALIZE + BACKFILL ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.backfill_normalize_ota_adjustments(
    p_limit int DEFAULT 500,
    p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
    v_ledger RECORD;
    v_new_category TEXT;
    v_correct_direction TEXT;
    v_old_direction TEXT;
    v_economic_date DATE;
    v_entry_date DATE;
    v_economic_period TEXT;
    v_related_period TEXT;
    v_is_prior BOOLEAN;
    v_payout RECORD;
    v_reverse_result JSONB;
    v_post_result JSONB;
    v_processed_count INT := 0;
    v_direction_fixed_count INT := 0;
    v_reversed_count INT := 0;
    v_reposted_count INT := 0;
    v_ecodate_filled_count INT := 0;
    v_skipped_count INT := 0;
    v_error_count INT := 0;
    v_errors JSONB := '[]'::jsonb;
    v_dry_items JSONB := '[]'::jsonb;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    FOR v_item IN
        SELECT ri.*,
               p.payout_date, p.payout_period_to, p.ota_source
        FROM ota_payout_reconciliation_items ri
        JOIN ota_payouts p ON p.id = ri.payout_id
        WHERE ri.item_type != 'BANK_TRANSFER_FEE'
          AND ri.amount > 0
        ORDER BY ri.created_at ASC
        LIMIT p_limit
    LOOP
        BEGIN
            v_processed_count := v_processed_count + 1;

            -- Step 1: Reclassify to get correct category + direction
            v_new_category := classify_ota_payout_adjustment(v_item.id);

            -- Re-read to get enforced direction
            SELECT direction INTO v_correct_direction
            FROM ota_payout_reconciliation_items WHERE id = v_item.id;

            v_old_direction := v_item.direction;

            -- Step 2: Compute economic_date
            v_entry_date := COALESCE(
                v_item.payout_date,
                v_item.payout_period_to::date,
                v_item.created_at::date
            );

            v_economic_date := NULL;
            IF v_item.dispute_id IS NOT NULL THEN
                v_economic_date := v_item.created_at::date;
            ELSIF v_new_category = 'OTA_ROUNDING_FX' THEN
                v_economic_date := v_entry_date;
            END IF;

            v_economic_period := NULL;
            v_related_period := NULL;
            v_is_prior := false;
            IF v_economic_date IS NOT NULL THEN
                v_economic_period := to_char(v_economic_date, 'YYYY-MM');
                v_related_period := v_economic_period;
                v_is_prior := (v_economic_period != to_char(v_entry_date, 'YYYY-MM'));
            END IF;

            IF p_dry_run THEN
                v_dry_items := v_dry_items || jsonb_build_object(
                    'id', v_item.id,
                    'payout_id', v_item.payout_id,
                    'item_type', v_item.item_type,
                    'amount', v_item.amount,
                    'old_category', v_item.adj_category,
                    'new_category', v_new_category,
                    'old_direction', v_old_direction,
                    'new_direction', v_correct_direction,
                    'direction_changed', v_old_direction != v_correct_direction,
                    'economic_date', v_economic_date,
                    'has_ledger', v_item.ledger_entry_id IS NOT NULL,
                    'needs_reverse', v_item.ledger_entry_id IS NOT NULL AND v_old_direction != v_correct_direction
                );
            ELSE
                -- Update recon item economic fields
                UPDATE ota_payout_reconciliation_items
                SET economic_date = v_economic_date,
                    related_period = v_related_period,
                    is_prior_period = v_is_prior
                WHERE id = v_item.id;

                IF v_economic_date IS NOT NULL THEN
                    v_ecodate_filled_count := v_ecodate_filled_count + 1;
                END IF;

                -- Handle ledger entries
                IF v_item.ledger_entry_id IS NOT NULL THEN
                    -- Check if direction mismatch requires reverse+repost
                    SELECT * INTO v_ledger FROM ledger_entries WHERE id = v_item.ledger_entry_id;

                    IF v_ledger IS NOT NULL AND v_old_direction != v_correct_direction THEN
                        -- Reverse the wrong entry
                        v_direction_fixed_count := v_direction_fixed_count + 1;

                        -- Create reversal entry
                        INSERT INTO ledger_entries (
                            org_id, entry_date, source_type, source_id, entry_type,
                            cash_account_id, account_snapshot, direction, amount,
                            counterparty_type, counterparty_name,
                            is_posted, is_reversed, note, created_by
                        ) VALUES (
                            v_ledger.org_id, v_ledger.entry_date,
                            v_ledger.source_type, v_ledger.source_id, 'REVERSAL',
                            v_ledger.cash_account_id, v_ledger.account_snapshot,
                            CASE WHEN v_ledger.direction = 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END,
                            v_ledger.amount,
                            v_ledger.counterparty_type, v_ledger.counterparty_name,
                            true, false,
                            format('REVERSAL: NORMALIZE_OTA_ADJ — was %s, should be %s', v_old_direction, v_correct_direction),
                            v_user_id
                        );

                        -- Mark original as reversed
                        UPDATE ledger_entries SET is_reversed = true WHERE id = v_item.ledger_entry_id;
                        v_reversed_count := v_reversed_count + 1;

                        -- Clear ledger link to allow repost
                        UPDATE ota_payout_reconciliation_items
                        SET ledger_entry_id = NULL
                        WHERE id = v_item.id;

                        -- Repost with correct direction + economic_date
                        v_post_result := post_ota_payout_adjustment_to_ledger_atomic(v_item.id);
                        v_reposted_count := v_reposted_count + 1;

                    ELSIF v_ledger IS NOT NULL AND v_ledger.economic_date IS NULL AND v_economic_date IS NOT NULL THEN
                        -- Only fill economic_date (no reversal needed)
                        UPDATE ledger_entries
                        SET economic_date = v_economic_date,
                            economic_period = v_economic_period
                        WHERE id = v_item.ledger_entry_id;
                        v_ecodate_filled_count := v_ecodate_filled_count + 1;
                    ELSE
                        v_skipped_count := v_skipped_count + 1;
                    END IF;
                ELSE
                    -- No ledger entry yet: post new one
                    v_post_result := post_ota_payout_adjustment_to_ledger_atomic(v_item.id);
                    v_reposted_count := v_reposted_count + 1;
                END IF;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_error_count := v_error_count + 1;
            v_errors := v_errors || jsonb_build_object(
                'id', v_item.id,
                'error', SQLERRM
            );
        END;
    END LOOP;

    -- Audit log (real run only)
    IF NOT p_dry_run AND v_processed_count > 0 THEN
        INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
        VALUES (
            'BACKFILL_NORMALIZE_OTA_ADJUSTMENTS',
            'SYSTEM_JOB',
            'normalize_' || now()::text,
            v_user_id,
            jsonb_build_object(
                'processed', v_processed_count,
                'direction_fixed', v_direction_fixed_count,
                'reversed', v_reversed_count,
                'reposted', v_reposted_count,
                'ecodate_filled', v_ecodate_filled_count,
                'skipped', v_skipped_count,
                'errors', v_error_count,
                'errors_sample', v_errors
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'dry_run', p_dry_run,
        'processed', v_processed_count,
        'direction_fixed', v_direction_fixed_count,
        'reversed', v_reversed_count,
        'reposted', v_reposted_count,
        'ecodate_filled', v_ecodate_filled_count,
        'skipped', v_skipped_count,
        'errors', v_error_count,
        'errors_sample', v_errors,
        'items', CASE WHEN p_dry_run THEN v_dry_items ELSE '[]'::jsonb END
    );
END;
$$;


-- ─── PHASE F: REPORTING RPC (SETTLEMENT/ACCRUAL MODE) ──────────────────────

CREATE OR REPLACE FUNCTION public.rpc_get_ota_adjustments_net(
    p_start DATE,
    p_end DATE,
    p_mode TEXT DEFAULT 'SETTLEMENT'  -- 'SETTLEMENT' or 'ACCRUAL'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    WITH filtered AS (
        SELECT le.id, le.amount, le.direction, le.source_id,
               le.entry_date, le.economic_date,
               ri.adj_category, ri.is_prior_period,
               ri.dispute_id, ri.note AS recon_note,
               ri.payout_id,
               p.ota_source, p.provider_payout_id
        FROM ledger_entries le
        LEFT JOIN ota_payout_reconciliation_items ri ON ri.id = le.source_id
        LEFT JOIN ota_payouts p ON p.id = ri.payout_id
        WHERE le.source_type = 'OTA_PAYOUT_ADJUSTMENT'
          AND le.entry_type = 'ORIGINAL'
          AND le.is_reversed = false
          AND CASE
                WHEN p_mode = 'ACCRUAL' THEN
                    COALESCE(le.economic_date, le.entry_date) BETWEEN p_start AND p_end
                ELSE
                    le.entry_date BETWEEN p_start AND p_end
              END
    ),
    by_category AS (
        SELECT
            COALESCE(adj_category, 'OTA_ADJUSTMENT_OTHER') AS cat,
            SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END) AS debit_total,
            SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS credit_total,
            COUNT(*) AS cnt
        FROM filtered
        GROUP BY COALESCE(adj_category, 'OTA_ADJUSTMENT_OTHER')
    )
    SELECT jsonb_build_object(
        'mode', p_mode,
        'period_start', p_start,
        'period_end', p_end,
        'categories', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'category', cat,
                'debit', debit_total,
                'credit', credit_total,
                'net', debit_total - credit_total,
                'count', cnt
            )) FROM by_category),
            '[]'::jsonb
        ),
        'dispute_net', COALESCE((
            SELECT SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END)
            FROM filtered WHERE adj_category IN ('DISPUTE_WIN','DISPUTE_LOSS')
        ), 0),
        'penalties', COALESCE((
            SELECT SUM(amount) FROM filtered WHERE adj_category='OTA_PENALTY'
        ), 0),
        'compensation', COALESCE((
            SELECT SUM(amount) FROM filtered WHERE adj_category='OTA_COMPENSATION'
        ), 0),
        'rounding_fx_net', COALESCE((
            SELECT SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END)
            FROM filtered WHERE adj_category='OTA_ROUNDING_FX'
        ), 0),
        'underpayment', COALESCE((
            SELECT SUM(amount) FROM filtered WHERE adj_category='OTA_UNDERPAYMENT'
        ), 0),
        'other_net', COALESCE((
            SELECT SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END)
            FROM filtered WHERE adj_category NOT IN ('DISPUTE_WIN','DISPUTE_LOSS','OTA_PENALTY','OTA_COMPENSATION','OTA_ROUNDING_FX','OTA_UNDERPAYMENT') OR adj_category IS NULL
        ), 0),
        'total_net', COALESCE((
            SELECT SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END) FROM filtered
        ), 0),
        'prior_period_count', COALESCE((
            SELECT COUNT(*) FROM filtered WHERE is_prior_period = true
        ), 0),
        'rows', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'ledger_id', id,
                'entry_date', entry_date,
                'economic_date', economic_date,
                'adj_category', adj_category,
                'direction', direction,
                'amount', amount,
                'is_prior_period', is_prior_period,
                'note', recon_note,
                'dispute_id', dispute_id,
                'payout_id', payout_id,
                'ota_source', ota_source,
                'provider_payout_id', provider_payout_id
            ) ORDER BY COALESCE(economic_date, entry_date) DESC)
            FROM filtered),
            '[]'::jsonb
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;


-- ─── GRANTS ────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.classify_ota_payout_adjustment TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_ota_payout_adjustment_to_ledger_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_normalize_ota_adjustments TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_ota_adjustments_net TO authenticated;

COMMENT ON FUNCTION public.backfill_normalize_ota_adjustments IS
    'Normalize category+direction, reverse+repost wrong ledger, fill economic_date. Idempotent, audited.';
COMMENT ON FUNCTION public.rpc_get_ota_adjustments_net IS
    'P&L reporting RPC for OTA adjustments. Supports SETTLEMENT (entry_date) and ACCRUAL (COALESCE(economic_date,entry_date)) modes.';
