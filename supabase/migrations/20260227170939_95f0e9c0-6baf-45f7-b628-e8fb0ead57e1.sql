
-- Fix: remove ::text casts on source_id comparisons (source_id is UUID)
CREATE OR REPLACE FUNCTION public.post_ota_payout_adjustment_to_ledger_atomic(p_recon_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    v_default_org_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
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
    -- Check existing ledger entry (idempotent)
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
    -- Insert ledger entry (source_id is UUID, no text cast)
    INSERT INTO ledger_entries (
        org_id, entry_date, source_type, source_id, entry_type,
        cash_account_id, account_snapshot, direction, amount,
        counterparty_type, counterparty_name,
        is_posted, note, created_by
    ) VALUES (
        v_default_org_id,
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
        'payout_id', v_item.payout_id,
        'already_posted', false
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.post_ota_payout_adjustment_to_ledger_atomic(UUID) TO authenticated;
