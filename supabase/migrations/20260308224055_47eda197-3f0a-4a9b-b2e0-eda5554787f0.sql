
-- ═══════════════════════════════════════════════════════════
-- Unified Notifications Table
-- Single event layer for bell + PWA push delivery
-- NON-BREAKING, ADDITIVE ONLY
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  
  -- Source identification
  source_module text NOT NULL CHECK (source_module IN ('BOOKING', 'EMAIL', 'MESSAGE')),
  event_type text NOT NULL,
  
  -- Dedupe: unique per logical event
  dedupe_key text NOT NULL,
  
  -- Display content
  title text NOT NULL,
  body text,
  icon text,
  deep_link text NOT NULL DEFAULT '/',
  
  -- Source traceability
  source_table text,
  source_record_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Priority
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  
  -- Read / archive state (per notification, not per user — v1 single-tenant-user model)
  read_at timestamptz,
  is_archived boolean NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Dedupe constraint: one notification per logical event
ALTER TABLE public.notifications ADD CONSTRAINT notifications_dedupe_key_unique UNIQUE (dedupe_key);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created 
  ON public.notifications (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_source_module 
  ON public.notifications (source_module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread 
  ON public.notifications (tenant_id, created_at DESC) WHERE read_at IS NULL AND is_archived = false;

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own_tenant" ON public.notifications
  FOR SELECT TO authenticated
  USING (tenant_id = auth.uid());

CREATE POLICY "notifications_update_own_tenant" ON public.notifications
  FOR UPDATE TO authenticated
  USING (tenant_id = auth.uid())
  WITH CHECK (tenant_id = auth.uid());

-- Service role can insert (from edge functions)
CREATE POLICY "notifications_insert_service" ON public.notifications
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "notifications_select_service" ON public.notifications
  FOR SELECT TO service_role
  USING (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
