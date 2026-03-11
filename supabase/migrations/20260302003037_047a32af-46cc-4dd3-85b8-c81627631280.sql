
-- ============================================================
-- EMAIL OAUTH: Add REAUTH_REQUIRED status + refresh lock
-- ============================================================

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

ALTER TABLE public.email_accounts
  ADD CONSTRAINT email_accounts_status_check
  CHECK (status IN ('ACTIVE', 'REVOKED', 'ERROR', 'REAUTH_REQUIRED'));

ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS token_refresh_locked_at timestamptz DEFAULT NULL;

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

GRANT SELECT (token_refresh_locked_at)
  ON public.email_accounts TO authenticated;

REVOKE EXECUTE ON FUNCTION public.acquire_refresh_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_refresh_lock(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_refresh_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_refresh_lock(uuid) TO service_role;

CREATE INDEX IF NOT EXISTS idx_email_accounts_reauth
  ON public.email_accounts (status)
  WHERE status = 'REAUTH_REQUIRED';
