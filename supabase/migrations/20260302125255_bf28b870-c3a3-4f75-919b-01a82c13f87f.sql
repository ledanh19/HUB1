CREATE OR REPLACE FUNCTION public.fn_enforce_cashflow_ledger_coupling()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_ledger_type   TEXT;
  v_enforcement   TEXT;
  v_default_org   UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  SELECT m.ledger_source_type, m.enforcement
    INTO v_ledger_type, v_enforcement
    FROM cashflow_ledger_type_map m
   WHERE m.cashflow_source_type = NEW.source_type;

  IF v_enforcement IS NULL THEN
    RAISE EXCEPTION 'CASHFLOW_UNKNOWN_SOURCE_TYPE: source_type=% is not registered in cashflow_ledger_type_map. Register it before inserting.', NEW.source_type USING ERRCODE = 'P0001';
  END IF;

  IF v_enforcement = 'WHITELISTED' THEN
    INSERT INTO cashflow_whitelist_events (cashflow_id, org_id, source_type, source_id, cash_date, amount, direction, note, created_by)
    VALUES (NEW.id, v_default_org, NEW.source_type, NEW.source_id, NEW.cash_date, NEW.amount, NEW.direction, NEW.note, NEW.created_by);
    RETURN NULL;
  END IF;

  IF NEW.source_id IS NULL THEN
    RAISE EXCEPTION 'CASHFLOW_LEDGER_INVARIANT: source_id is NULL for enforced source_type=%. Enforced types require a non-null UUID source_id.', NEW.source_type USING ERRCODE = 'P0002';
  END IF;

  IF NOT is_valid_uuid(NEW.source_id) THEN
    RAISE EXCEPTION 'NON_UUID_SOURCE_ID_FOR_ENFORCED_TYPE: source_type=%, source_id=%. Enforced cashflow entries must reference a valid UUID.', NEW.source_type, NEW.source_id USING ERRCODE = 'P0003';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ledger_entries
    WHERE source_type = v_ledger_type
      AND source_id::TEXT = NEW.source_id
      AND entry_type = 'ORIGINAL'
  ) THEN
    RAISE EXCEPTION 'CASHFLOW_LEDGER_INVARIANT: No matching ORIGINAL ledger entry. cashflow_source_type=%, source_id=%, expected_ledger_type=%.', NEW.source_type, NEW.source_id, v_ledger_type USING ERRCODE = 'P0004';
  END IF;

  RETURN NULL;
END;
$$;