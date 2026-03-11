-- ============================================================
-- EMAIL OAUTH: Add REAUTH_REQUIRED status + refresh lock
-- Created: 2026-03-01
-- NON-BREAKING, ADDITIVE ONLY
-- ============================================================

-- ─── Step 1: Drop existing CHECK constraint on status ───────
-- Introspect pg_catalog to find the real constraint name
-- (inline constraints get auto-generated names)
DO $$
DECLARE
  _conname text;
BEGIN
  SELECT con.conname INTO _conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  JOIN pg_attribute att ON att.attrelid = rel.oid
       AND att.attnum = ANY(con.conkey)
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'email_accounts'
    AND att.attname = 'status'
    AND con.contype = 'c';

  IF _conname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.email_accounts DROP CONSTRAINT %I',
      _conname
    );
    RAISE NOTICE 'Dropped constraint: %', _conname;
  ELSE
    RAISE NOTICE 'No CHECK constraint found on status column';
  END IF;
END;
$$;

-- ─── Step 2: Re-add with REAUTH_REQUIRED included ──────────
ALTER TABLE public.email_accounts
  ADD CONSTRAINT email_accounts_status_check
  CHECK (status IN ('ACTIVE', 'REVOKED', 'ERROR', 'REAUTH_REQUIRED'));

-- ─── Step 3: Advisory refresh lock column ───────────────────
-- TTL-based: 2-min stale threshold, self-healing on crash
ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS token_refresh_locked_at timestamptz DEFAULT NULL;

-- ─── Step 4: RPC for atomic lock acquisition ────────────────
-- Safer than Supabase .or() string parsing
CREATE OR REPLACE FUNCTION public.acquire_refresh_lock(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _acquired boolean;
BEGIN
  UPDATE public.email_accounts
  SET token_refresh_locked_at = now()
  WHERE id = p_account_id
    AND (
      token_refresh_locked_at IS NULL
      OR token_refresh_locked_at < now() - interval '2 minutes'
    )
  RETURNING true INTO _acquired;

  RETURN COALESCE(_acquired, false);
END;
$$;

-- ─── Step 5: RPC for lock release ───────────────────────────
CREATE OR REPLACE FUNCTION public.release_refresh_lock(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.email_accounts
  SET token_refresh_locked_at = NULL
  WHERE id = p_account_id;
END;
$$;

-- ─── Step 6: Grants ────────────────────────────────────────
-- New column readable by authenticated
GRANT SELECT (token_refresh_locked_at)
  ON public.email_accounts TO authenticated;

-- RPCs executable by service_role only (backend)
REVOKE EXECUTE ON FUNCTION public.acquire_refresh_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_refresh_lock(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_refresh_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_refresh_lock(uuid) TO service_role;

-- ─── Step 7: Partial index for fast REAUTH queries ──────────
CREATE INDEX IF NOT EXISTS idx_email_accounts_reauth
  ON public.email_accounts (status)
  WHERE status = 'REAUTH_REQUIRED';

-- ─── Step 8: BACKFILL — fix existing accounts already broken ─
-- These accounts have status='ACTIVE' but error_code shows token is dead.
-- Without this, they stay "green" forever until next refresh attempt.
UPDATE public.email_accounts
SET
  status = 'REAUTH_REQUIRED',
  expiry_at = NULL,
  error_at = COALESCE(error_at, now())
WHERE status = 'ACTIVE'
  AND error_code IS NOT NULL
  AND (
    lower(error_code) LIKE '%token has been expired or revoked%'
    OR lower(error_code) LIKE '%token has been revoked%'
    OR lower(error_code) LIKE '%invalid_grant%'
    OR lower(error_code) LIKE '%invalid_client%'
    OR lower(error_code) LIKE '%unauthorized_client%'
    OR lower(error_code) LIKE '%access_denied%'
  );

-- ─── Done ───────────────────────────────────────────────────
