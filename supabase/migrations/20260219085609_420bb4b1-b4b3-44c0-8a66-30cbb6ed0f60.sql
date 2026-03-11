
-- ============================================================
-- WhatsApp Integration Tables
-- ============================================================

-- Table: whatsapp_integrations
CREATE TABLE IF NOT EXISTS public.whatsapp_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL,
  waba_id TEXT NOT NULL,
  display_phone TEXT,
  verify_token TEXT NOT NULL,
  app_secret_ref TEXT NOT NULL DEFAULT 'WHATSAPP_APP_SECRET',
  access_token_ref TEXT NOT NULL DEFAULT 'WHATSAPP_ACCESS_TOKEN',
  status TEXT NOT NULL DEFAULT 'active',
  webhook_url TEXT,
  last_webhook_received_at TIMESTAMPTZ,
  last_error TEXT,
  last_health_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone_number_id)
);

-- Enable RLS
ALTER TABLE public.whatsapp_integrations ENABLE ROW LEVEL SECURITY;

-- RLS: Users can read their own integrations
CREATE POLICY "Users can view own whatsapp integrations"
  ON public.whatsapp_integrations FOR SELECT
  USING (auth.uid() = tenant_id);

-- RLS: Users can insert their own integrations  
CREATE POLICY "Users can create own whatsapp integrations"
  ON public.whatsapp_integrations FOR INSERT
  WITH CHECK (auth.uid() = tenant_id);

-- RLS: Users can update their own integrations
CREATE POLICY "Users can update own whatsapp integrations"
  ON public.whatsapp_integrations FOR UPDATE
  USING (auth.uid() = tenant_id);

-- RLS: Users can delete their own integrations
CREATE POLICY "Users can delete own whatsapp integrations"
  ON public.whatsapp_integrations FOR DELETE
  USING (auth.uid() = tenant_id);

-- RLS: Service role can access all (for webhook edge function)
CREATE POLICY "Service role full access whatsapp integrations"
  ON public.whatsapp_integrations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Table: webhook_events_log
CREATE TABLE IF NOT EXISTS public.webhook_events_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  phone_number_id TEXT,
  payload_json JSONB,
  signature_valid BOOLEAN DEFAULT false,
  processing_status TEXT DEFAULT 'received',
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS  
ALTER TABLE public.webhook_events_log ENABLE ROW LEVEL SECURITY;

-- RLS: Only service role can write (webhook edge functions)
CREATE POLICY "Service role full access webhook_events_log"
  ON public.webhook_events_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS: Authenticated users can read their own tenant logs
CREATE POLICY "Users can view own webhook logs"
  ON public.webhook_events_log FOR SELECT
  USING (auth.uid() = tenant_id);

-- Index for health queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_phone_received 
  ON public.webhook_events_log(phone_number_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant
  ON public.webhook_events_log(tenant_id, received_at DESC);

-- Trigger for updated_at on whatsapp_integrations
CREATE TRIGGER update_whatsapp_integrations_updated_at
  BEFORE UPDATE ON public.whatsapp_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
