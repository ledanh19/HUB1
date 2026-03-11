-- ============================================================================
-- Sprint 17 — Per-User Filter State Persistence
-- ADDITIVE ONLY — Does NOT modify any existing table.
-- ============================================================================

-- 1. TABLE
-- Stores per-user, per-scope filter state.
-- Unique constraint on (org_id, user_id, scope_key) ensures exactly 1 row per user per scope.
create table if not exists public.user_filter_state (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null,
  state jsonb not null default '{}'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  constraint uq_user_filter_state unique (org_id, user_id, scope_key),
  constraint chk_scope_key_format check (scope_key ~ '^[a-z0-9]+(\.[a-z0-9-]+)*$')
);

-- Index for fast lookups by (user_id, org_id)
create index if not exists idx_user_filter_state_user_org
  on public.user_filter_state(user_id, org_id);

-- 2. RLS
alter table public.user_filter_state enable row level security;

-- SELECT: user can only read their own rows in their org
create policy "user_filter_state_select"
  on public.user_filter_state
  for select to authenticated
  using (
    auth.uid() = user_id
  );

-- INSERT: user can only insert for themselves, org_id locked to single-tenant constant
-- SYSTEM: Hard-coupled to single-org. Update org_id check when multi-org is implemented.
create policy "user_filter_state_insert"
  on public.user_filter_state
  for insert to authenticated
  with check (
    auth.uid() = user_id
    AND org_id = '00000000-0000-0000-0000-000000000001'::uuid
  );

-- UPDATE: user can only update their own rows
create policy "user_filter_state_update"
  on public.user_filter_state
  for update to authenticated
  using (
    auth.uid() = user_id
  )
  with check (
    auth.uid() = user_id
  );

-- 3. UPSERT RPC — Deterministic, idempotent, no duplicate rows
-- SYSTEM: org_id hardcoded server-side (single-tenant). Change v_org_id when multi-org.
create or replace function public.upsert_user_filter_state(
  p_scope_key text,
  p_state jsonb,
  p_version int default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_org_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Validate scope_key format
  if p_scope_key !~ '^[a-z0-9]+(\.[a-z0-9-]+)*$' then
    raise exception 'Invalid scope_key format: %', p_scope_key;
  end if;

  insert into public.user_filter_state (org_id, user_id, scope_key, state, version, updated_at)
  values (v_org_id, v_user_id, p_scope_key, p_state, p_version, now())
  on conflict (org_id, user_id, scope_key)
  do update set
    state = excluded.state,
    version = excluded.version,
    updated_at = now();
end;
$$;

comment on function public.upsert_user_filter_state is
  'Upsert per-user filter state. Auth-gated via auth.uid(). Idempotent on (org_id, user_id, scope_key).';

-- 4. GET RPC — Server-authoritative read
-- SYSTEM: org_id hardcoded server-side (single-tenant). Change v_org_id when multi-org.
create or replace function public.get_user_filter_state(
  p_scope_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_org_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_result jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select jsonb_build_object(
    'state', ufs.state,
    'version', ufs.version,
    'updated_at', ufs.updated_at
  )
  into v_result
  from public.user_filter_state ufs
  where ufs.org_id = v_org_id
    and ufs.user_id = v_user_id
    and ufs.scope_key = p_scope_key;

  return coalesce(v_result, null);
end;
$$;

comment on function public.get_user_filter_state is
  'Get per-user filter state. Auth-gated via auth.uid(). Returns null if no state saved.';
