
-- ═══════════════════════════════════════════════════════════
-- HARDENING: Per-user notification read state + RLS fix
-- NON-BREAKING, ADDITIVE ONLY
-- ═══════════════════════════════════════════════════════════

-- 1. Per-user read state table (separates read state from notification event)
CREATE TABLE IF NOT EXISTS public.notification_read_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_notification_user_read UNIQUE (notification_id, user_id)
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_notification_read_states_user 
  ON public.notification_read_states (user_id, notification_id);

-- RLS for notification_read_states
ALTER TABLE public.notification_read_states ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own read states
CREATE POLICY "read_states_select_own" ON public.notification_read_states
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "read_states_insert_own" ON public.notification_read_states
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "read_states_delete_own" ON public.notification_read_states
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Service role full access
CREATE POLICY "read_states_service_all" ON public.notification_read_states
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. Fix notifications RLS: allow all authenticated users to see notifications
-- (matches pattern of booking_changes, messages tables which don't filter by tenant)
-- Old policy was tenant_id = auth.uid() which only worked for the super_admin
DROP POLICY IF EXISTS "notifications_select_own_tenant" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own_tenant" ON public.notifications;

-- All authenticated users can read notifications
CREATE POLICY "notifications_select_authenticated" ON public.notifications
  FOR SELECT TO authenticated
  USING (true);

-- All authenticated users can update (for legacy read_at, archive)
CREATE POLICY "notifications_update_authenticated" ON public.notifications
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
