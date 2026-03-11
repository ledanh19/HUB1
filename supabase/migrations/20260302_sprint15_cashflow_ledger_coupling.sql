-- ============================================================================
-- SPRINT 1.5 — CASHFLOW / LEDGER HARD COUPLING + PERIOD LOCK GUARDS
-- ============================================================================
-- Date:     2026-03-02
-- Revision: FINAL (production-ready)
-- Depends:  20260102_finance_ledger_system.sql
--           20260103_phase3_finance_hardening.sql  (is_period_locked)
--           20260104_fix_cashflow_source_type.sql   (source_type CHECK)
--
-- Objects created (18 + 4 RLS policies):
--   2 tables   — cashflow_ledger_type_map, cashflow_whitelist_events
--   7 functions — is_valid_uuid, resolve_cashflow_ledger_mapping,
--                 fn_enforce_cashflow_ledger_coupling,
--                 fn_guard_ledger_period_lock, fn_guard_cashflow_period_lock,
--                 fn_guard_hotel_collects_period_lock, fn_guard_cash_outs_period_lock
--   5 triggers — trg_cashflow_ledger_coupling (CONSTRAINT DEFERRABLE),
--                 trg_guard_ledger_period_lock, trg_guard_cashflow_period_lock,
--                 trg_guard_hotel_collects_period_lock, trg_guard_cash_outs_period_lock
--   2 indexes  — idx_ledger_coupling_check, idx_whitelist_events_date_type
--   2 views    — v_orphan_cashflow_enforced, v_cashflow_whitelist_volume_daily
--   4 policies — RLS on mapping + telemetry tables
--   15 seed rows in cashflow_ledger_type_map
--
-- Hard rules applied:
--   • NON-BREAKING + ADDITIVE only
--   • Every statement idempotent (IF NOT EXISTS / OR REPLACE / ON CONFLICT)
--   • No CREATE INDEX CONCURRENTLY (runs inside Supabase migration txn)
--   • Trigger functions do not leak data (EXISTS checks only)
--   • Tenant-safe: org_id constrained where available
-- ============================================================================


-- ============================================================================
-- A. UTILITY — SAFE UUID VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_valid_uuid(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_text IS NULL THEN RETURN FALSE; END IF;
  PERFORM p_text::UUID;
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.is_valid_uuid(TEXT) IS
  'Returns TRUE if input is a syntactically valid UUID. Never throws.';


-- ============================================================================
-- B. CANONICAL MAPPING TABLE
-- ============================================================================
-- Governs the coupling constraint trigger.
-- enforcement = ENFORCED   → cashflow INSERT must have matching ORIGINAL ledger entry
-- enforcement = WHITELISTED → allowed without ledger; telemetry recorded
-- To tighten: UPDATE enforcement to ENFORCED + set ledger_source_type.

CREATE TABLE IF NOT EXISTS public.cashflow_ledger_type_map (
  cashflow_source_type  TEXT PRIMARY KEY,
  ledger_source_type    TEXT,
  enforcement           TEXT NOT NULL DEFAULT 'WHITELISTED'
                        CHECK (enforcement IN ('ENFORCED', 'WHITELISTED')),
  migration_target      TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cashflow_ledger_type_map IS
  'Canonical mapping: cashflow source_type → ledger source_type + enforcement class. '
  'Single source of truth for the coupling constraint trigger.';

-- Seed data (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO public.cashflow_ledger_type_map
  (cashflow_source_type, ledger_source_type, enforcement, migration_target, notes)
VALUES
  ('CASH_OUT',           'CASH_OUT',     'ENFORCED', NULL,
   'create_cash_out_atomic: ledger=CASH_OUT, cashflow=CASH_OUT, same source_id (cash_out_id)'),
  ('OTA_PAYOUT_CASH_IN', 'OTA_PAYOUT',   'ENFORCED', NULL,
   'create_multi_payout_cashin_atomic: ledger=OTA_PAYOUT, cashflow=OTA_PAYOUT_CASH_IN, same source_id (collection_id)'),
  ('INTERNAL_EXPENSE',   'CASH_OUT',     'ENFORCED', NULL,
   'create_cash_out_atomic: ledger=CASH_OUT, cashflow=INTERNAL_EXPENSE, same source_id (cash_out_id)'),
  ('OTA_COMMISSION',     'CASH_OUT',     'ENFORCED', NULL,
   'create_cash_out_atomic: ledger=CASH_OUT, cashflow=OTA_COMMISSION, same source_id (cash_out_id)'),
  ('HOTEL_COLLECT',      'HOTEL_COLLECT','WHITELISTED','useBookings.ts → create_collection_ledger_atomic',
   'Dual-path: RPC creates ledger, but legacy useBookings.ts inserts cashflow without ledger'),
  ('OTA_PAYOUT',          NULL,          'WHITELISTED','useOtaPayoutCashIn.ts → atomic RPC',
   'Legacy sync path inserts cashflow OTA_PAYOUT without ledger'),
  ('HOST_PAYMENT',        NULL,          'WHITELISTED','useHostPayments.ts → new atomic RPC',
   'Client-side direct INSERT, no atomic RPC exists'),
  ('HOST_PAYMENT_BATCH',  NULL,          'WHITELISTED','useHostPayablesEnhanced.ts → new atomic RPC',
   'Client-side direct INSERT, no atomic RPC exists'),
  ('HOST_DEPOSIT',        NULL,          'WHITELISTED','useHostDeposits.ts → new atomic RPC',
   'Client-side direct INSERT, no atomic RPC exists'),
  ('HOST_PREPAID',        NULL,          'WHITELISTED','useHostDeposits.ts → new atomic RPC',
   'Client-side direct INSERT, no atomic RPC exists'),
  ('HOST_DEPOSIT_REFUND', NULL,          'WHITELISTED','useHostDeposits.ts → new atomic RPC',
   'Client-side direct INSERT, no atomic RPC exists'),
  ('HOST_SETTLEMENT_PAYMENT',NULL,       'WHITELISTED','useOutgoingPayments.ts → normalize source_id',
   'RPC creates ledger(CASH_OUT,cash_out_id) but cashflow uses (HOST_SETTLEMENT_PAYMENT,settlement_id) — key mismatch'),
  ('SERVICE_SETTLEMENT_PAYMENT',NULL,    'WHITELISTED','useOutgoingPayments.ts → normalize source_id',
   'Same key mismatch as HOST_SETTLEMENT_PAYMENT'),
  ('REFUND',              NULL,          'WHITELISTED', NULL,
   'Legacy refund operations'),
  ('VOID',                NULL,          'WHITELISTED', NULL,
   'Legacy void operations')
ON CONFLICT (cashflow_source_type) DO NOTHING;

ALTER TABLE public.cashflow_ledger_type_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "type_map_select_authenticated" ON public.cashflow_ledger_type_map;
CREATE POLICY "type_map_select_authenticated" ON public.cashflow_ledger_type_map
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "type_map_admin_modify" ON public.cashflow_ledger_type_map;
CREATE POLICY "type_map_admin_modify" ON public.cashflow_ledger_type_map
  FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Resolver function (ad-hoc + trigger use)
CREATE OR REPLACE FUNCTION public.resolve_cashflow_ledger_mapping(p_source_type TEXT)
RETURNS TABLE(ledger_source_type TEXT, enforcement TEXT, migration_target TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT m.ledger_source_type, m.enforcement, m.migration_target
  FROM cashflow_ledger_type_map m
  WHERE m.cashflow_source_type = p_source_type;
$$;

COMMENT ON FUNCTION public.resolve_cashflow_ledger_mapping(TEXT) IS
  'Looks up the canonical ledger mapping for a cashflow source_type. '
  'Returns empty set if source_type is not registered.';


-- ============================================================================
-- C. WHITELIST TELEMETRY TABLE (append-only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cashflow_whitelist_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashflow_id UUID NOT NULL,
  org_id      UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  source_type TEXT NOT NULL,
  source_id   TEXT,
  cash_date   DATE NOT NULL,
  amount      NUMERIC NOT NULL,
  direction   TEXT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID
);

CREATE INDEX IF NOT EXISTS idx_whitelist_events_date_type
  ON public.cashflow_whitelist_events (cash_date, source_type);

COMMENT ON TABLE public.cashflow_whitelist_events IS
  'Append-only telemetry: every cashflow INSERT that bypassed coupling because '
  'its source_type is WHITELISTED. Monitor via v_cashflow_whitelist_volume_daily. '
  'Volume per source_type should trend to zero as each is migrated to an atomic RPC.';

ALTER TABLE public.cashflow_whitelist_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whitelist_events_insert_authenticated" ON public.cashflow_whitelist_events;
CREATE POLICY "whitelist_events_insert_authenticated"
  ON public.cashflow_whitelist_events FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "whitelist_events_select_finance" ON public.cashflow_whitelist_events;
CREATE POLICY "whitelist_events_select_finance"
  ON public.cashflow_whitelist_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid()
                   AND role IN ('admin', 'ke_toan')));


-- ============================================================================
-- D. SUPPORTING INDEX FOR COUPLING LOOKUP
-- ============================================================================
-- Trigger checks: le.source_type = X AND le.source_id::TEXT = Y
--                 AND le.entry_type = 'ORIGINAL'
-- Expression index with partial filter on the SAFE cast direction (UUID→TEXT).

CREATE INDEX IF NOT EXISTS idx_ledger_coupling_check
  ON public.ledger_entries (source_type, (source_id::TEXT))
  WHERE entry_type = 'ORIGINAL';


-- ============================================================================
-- E. COUPLING CONSTRAINT TRIGGER (DEFERRABLE INITIALLY DEFERRED)
-- ============================================================================
-- WHY DEFERRABLE:
--   create_collection_ledger_atomic inserts cashflow BEFORE ledger in the same
--   transaction. A standard trigger would not see the ledger row. Deferred fires
--   at COMMIT when all rows are visible.
--
-- CAST SAFETY:
--   Lookup uses le.source_id::TEXT = NEW.source_id  (UUID→TEXT never fails).
--   For enforced types we pre-validate is_valid_uuid(NEW.source_id) so the
--   diagnostic error name is deterministic.
--
-- TENANT SAFETY:
--   cashflow_entries has NO org_id column. We constrain via the system-wide
--   default org '00000000-0000-0000-0000-000000000001'. ledger_entries.org_id
--   is included in the EXISTS check.
--
-- SECURITY:
--   SECURITY DEFINER so the function can read cashflow_ledger_type_map and
--   write to cashflow_whitelist_events regardless of calling context.
--   No rows are returned to the caller (EXISTS only).

CREATE OR REPLACE FUNCTION public.fn_enforce_cashflow_ledger_coupling()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_ledger_type   TEXT;
  v_enforcement   TEXT;
  v_default_org   UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  -- 1. Resolve mapping
  SELECT m.ledger_source_type, m.enforcement
    INTO v_ledger_type, v_enforcement
    FROM cashflow_ledger_type_map m
   WHERE m.cashflow_source_type = NEW.source_type;

  -- 2. Unknown → hard reject
  IF v_enforcement IS NULL THEN
    RAISE EXCEPTION 'CASHFLOW_UNKNOWN_SOURCE_TYPE: source_type=% is not registered '
      'in cashflow_ledger_type_map. Register it before inserting.',
      NEW.source_type
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Whitelisted → record telemetry, allow
  IF v_enforcement = 'WHITELISTED' THEN
    INSERT INTO cashflow_whitelist_events
           (cashflow_id, org_id, source_type, source_id,
            cash_date, amount, direction, note, created_by)
    VALUES (NEW.id, v_default_org, NEW.source_type, NEW.source_id,
            NEW.cash_date, NEW.amount, NEW.direction, NEW.note, NEW.created_by);
    RETURN NULL;
  END IF;

  -- 4. Enforced — source_id must be a non-null UUID
  IF NEW.source_id IS NULL THEN
    RAISE EXCEPTION 'CASHFLOW_LEDGER_INVARIANT: source_id is NULL for enforced '
      'source_type=%. Enforced types require a non-null UUID source_id.',
      NEW.source_type
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT is_valid_uuid(NEW.source_id) THEN
    RAISE EXCEPTION 'NON_UUID_SOURCE_ID_FOR_ENFORCED_TYPE: source_type=%, source_id=%. '
      'Enforced cashflow entries must reference a valid UUID.',
      NEW.source_type, NEW.source_id
      USING ERRCODE = 'P0003';
  END IF;

  -- 5. Check ledger coupling (safe cast: UUID→TEXT; uses idx_ledger_coupling_check)
  IF NOT EXISTS (
    SELECT 1 FROM ledger_entries
    WHERE org_id      = v_default_org
      AND source_type = v_ledger_type
      AND source_id::TEXT = NEW.source_id
      AND entry_type  = 'ORIGINAL'
  ) THEN
    RAISE EXCEPTION 'CASHFLOW_LEDGER_INVARIANT: No matching ORIGINAL ledger entry. '
      'cashflow_source_type=%, source_id=%, expected_ledger_type=%.',
      NEW.source_type, NEW.source_id, v_ledger_type
      USING ERRCODE = 'P0004';
  END IF;

  RETURN NULL;  -- AFTER constraint trigger: return value ignored
END;
$$;

COMMENT ON FUNCTION public.fn_enforce_cashflow_ledger_coupling() IS
  'Deferred constraint trigger. Maps via cashflow_ledger_type_map. '
  'ENFORCED types must have matching ORIGINAL ledger entry at COMMIT. '
  'WHITELISTED types are recorded in cashflow_whitelist_events.';

DROP TRIGGER IF EXISTS trg_cashflow_ledger_coupling ON public.cashflow_entries;

CREATE CONSTRAINT TRIGGER trg_cashflow_ledger_coupling
  AFTER INSERT ON public.cashflow_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_cashflow_ledger_coupling();


-- ============================================================================
-- F1. PERIOD LOCK — ledger_entries  (entry_date DATE, org from row)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_ledger_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_period_locked(NEW.org_id, NEW.entry_date) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: Cannot write ledger_entries for date %. '
      'source_type=%, source_id=%',
      NEW.entry_date, NEW.source_type, NEW.source_id
      USING ERRCODE = 'P0010';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_ledger_period_lock ON public.ledger_entries;

CREATE TRIGGER trg_guard_ledger_period_lock
  BEFORE INSERT OR UPDATE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_ledger_period_lock();


-- ============================================================================
-- F2. PERIOD LOCK — cashflow_entries  (cash_date DATE, no org_id column)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_cashflow_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_org UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF public.is_period_locked(v_org, NEW.cash_date) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: Cannot write cashflow_entries for date %. '
      'source_type=%, source_id=%',
      NEW.cash_date, NEW.source_type, NEW.source_id
      USING ERRCODE = 'P0010';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_cashflow_period_lock ON public.cashflow_entries;

CREATE TRIGGER trg_guard_cashflow_period_lock
  BEFORE INSERT OR UPDATE ON public.cashflow_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_cashflow_period_lock();


-- ============================================================================
-- F3. PERIOD LOCK — hotel_collects  (collected_at TIMESTAMPTZ DEFAULT now())
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_hotel_collects_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_org UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_dt  DATE;
BEGIN
  v_dt := COALESCE(NEW.collected_at::DATE, CURRENT_DATE);
  IF public.is_period_locked(v_org, v_dt) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: Cannot write hotel_collects for date %. '
      'booking=%, type=%',
      v_dt, NEW.unified_booking_id, NEW.collection_type
      USING ERRCODE = 'P0010';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_hotel_collects_period_lock ON public.hotel_collects;

CREATE TRIGGER trg_guard_hotel_collects_period_lock
  BEFORE INSERT OR UPDATE ON public.hotel_collects
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_hotel_collects_period_lock();


-- ============================================================================
-- F4. PERIOD LOCK — cash_outs  (paid_at TIMESTAMPTZ NOT NULL DEFAULT now())
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_cash_outs_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_org UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF public.is_period_locked(v_org, NEW.paid_at::DATE) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: Cannot write cash_outs for date %. '
      'payment_request=%, amount=%',
      NEW.paid_at::DATE, NEW.payment_request_id, NEW.amount
      USING ERRCODE = 'P0010';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_cash_outs_period_lock ON public.cash_outs;

CREATE TRIGGER trg_guard_cash_outs_period_lock
  BEFORE INSERT OR UPDATE ON public.cash_outs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_cash_outs_period_lock();


-- ============================================================================
-- G1. VIEW — ORPHAN DETECTION (enforced types only)
-- ============================================================================

CREATE OR REPLACE VIEW public.v_orphan_cashflow_enforced AS
SELECT cf.id          AS cashflow_id,
       cf.cash_date,
       cf.source_type,
       cf.source_id,
       cf.amount,
       cf.direction,
       cf.created_at,
       cf.created_by,
       m.ledger_source_type AS expected_ledger_type
  FROM public.cashflow_entries cf
  JOIN public.cashflow_ledger_type_map m
    ON m.cashflow_source_type = cf.source_type
   AND m.enforcement = 'ENFORCED'
 WHERE cf.source_id IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM public.ledger_entries le
          WHERE le.source_type    = m.ledger_source_type
            AND le.source_id::TEXT = cf.source_id
            AND le.entry_type     = 'ORIGINAL'
       );

COMMENT ON VIEW public.v_orphan_cashflow_enforced IS
  'ENFORCED cashflow rows without a matching ORIGINAL ledger entry. '
  'Post-deployment this should return 0 new rows. '
  'Pre-existing orphans require Sprint 2 backfill.';


-- ============================================================================
-- G2. VIEW — WHITELIST DAILY VOLUME
-- ============================================================================

CREATE OR REPLACE VIEW public.v_cashflow_whitelist_volume_daily AS
SELECT e.cash_date,
       e.source_type,
       COUNT(*)      AS event_count,
       SUM(e.amount) AS total_amount,
       m.migration_target
  FROM public.cashflow_whitelist_events e
  LEFT JOIN public.cashflow_ledger_type_map m
    ON m.cashflow_source_type = e.source_type
 GROUP BY e.cash_date, e.source_type, m.migration_target
 ORDER BY e.cash_date DESC, event_count DESC;

COMMENT ON VIEW public.v_cashflow_whitelist_volume_daily IS
  'Daily volume of cashflow inserts that bypassed coupling (whitelisted). '
  'Use to prioritise migration. Each source_type should trend to zero.';


-- ============================================================================
-- VERIFICATION BLOCK
-- ============================================================================
DO $$
DECLARE
  v_trg INT; v_map INT; v_idx INT;
BEGIN
  SELECT count(*) INTO v_trg
    FROM information_schema.triggers
   WHERE trigger_name IN (
     'trg_cashflow_ledger_coupling',
     'trg_guard_cashflow_period_lock',
     'trg_guard_hotel_collects_period_lock',
     'trg_guard_cash_outs_period_lock',
     'trg_guard_ledger_period_lock');

  SELECT count(*) INTO v_map FROM cashflow_ledger_type_map;

  SELECT count(*) INTO v_idx
    FROM pg_indexes
   WHERE indexname IN ('idx_ledger_coupling_check','idx_whitelist_events_date_type');

  RAISE NOTICE 'Sprint 1.5 FINAL: triggers=%, mapping_rows=%, indexes=%', v_trg, v_map, v_idx;

  IF v_trg < 5 THEN RAISE WARNING 'Expected 5 triggers, found %', v_trg; END IF;
  IF v_map < 15 THEN RAISE WARNING 'Expected >=15 mapping rows, found %', v_map; END IF;
  IF v_idx < 2  THEN RAISE WARNING 'Expected 2 indexes, found %', v_idx; END IF;
END;
$$;
