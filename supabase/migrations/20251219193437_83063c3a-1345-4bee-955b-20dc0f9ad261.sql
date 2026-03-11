-- Create inventory_system_version table for tracking inventory data versions
CREATE TABLE public.inventory_system_version (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_system_version ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view inventory_system_version"
  ON public.inventory_system_version FOR SELECT
  USING (true);

CREATE POLICY "Admins can modify inventory_system_version"
  ON public.inventory_system_version FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert initial version
INSERT INTO public.inventory_system_version (version, description, is_active)
VALUES (1, 'Initial inventory system version', true);

-- Create inventory_edit_locks table for multi-user editing
CREATE TABLE public.inventory_edit_locks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL,
  cell_key text NOT NULL,
  locked_by uuid NOT NULL,
  locked_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(property_id, cell_key)
);

-- Enable RLS
ALTER TABLE public.inventory_edit_locks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view edit_locks"
  ON public.inventory_edit_locks FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert edit_locks"
  ON public.inventory_edit_locks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own edit_locks"
  ON public.inventory_edit_locks FOR UPDATE
  USING (locked_by = auth.uid());

CREATE POLICY "Users can delete own edit_locks"
  ON public.inventory_edit_locks FOR DELETE
  USING (locked_by = auth.uid());

-- Create inventory_sync_metrics table for tracking sync performance
CREATE TABLE public.inventory_sync_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL,
  metric_date date NOT NULL DEFAULT CURRENT_DATE,
  total_syncs integer NOT NULL DEFAULT 0,
  successful_syncs integer NOT NULL DEFAULT 0,
  failed_syncs integer NOT NULL DEFAULT 0,
  avg_sync_duration_ms integer,
  last_sync_at timestamp with time zone,
  last_sync_status text,
  cells_updated integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(property_id, metric_date)
);

-- Enable RLS
ALTER TABLE public.inventory_sync_metrics ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view sync_metrics"
  ON public.inventory_sync_metrics FOR SELECT
  USING (true);

CREATE POLICY "Admins can modify sync_metrics"
  ON public.inventory_sync_metrics FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create inventory_alert_config table for alert thresholds
CREATE TABLE public.inventory_alert_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type text NOT NULL,
  threshold_value numeric NOT NULL,
  is_active boolean DEFAULT true,
  property_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_alert_config ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view alert_config"
  ON public.inventory_alert_config FOR SELECT
  USING (true);

CREATE POLICY "Admins can modify alert_config"
  ON public.inventory_alert_config FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default alert configs
INSERT INTO public.inventory_alert_config (alert_type, threshold_value, is_active)
VALUES 
  ('sync_fail_rate', 10, true),
  ('stale_data_hours', 24, true),
  ('low_availability', 5, true);

-- Create inventory_alerts table for storing alerts
CREATE TABLE public.inventory_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  message text NOT NULL,
  details jsonb,
  is_acknowledged boolean DEFAULT false,
  acknowledged_by uuid,
  acknowledged_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_alerts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view alerts"
  ON public.inventory_alerts FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert alerts"
  ON public.inventory_alerts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update alerts"
  ON public.inventory_alerts FOR UPDATE
  USING (true);

-- Create indexes for performance
CREATE INDEX idx_inventory_edit_locks_property ON public.inventory_edit_locks(property_id);
CREATE INDEX idx_inventory_edit_locks_expires ON public.inventory_edit_locks(expires_at);
CREATE INDEX idx_inventory_sync_metrics_property_date ON public.inventory_sync_metrics(property_id, metric_date);
CREATE INDEX idx_inventory_alerts_property ON public.inventory_alerts(property_id);
CREATE INDEX idx_inventory_alerts_unack ON public.inventory_alerts(property_id) WHERE is_acknowledged = false;

-- Add update triggers
CREATE TRIGGER update_inventory_system_version_updated_at
  BEFORE UPDATE ON public.inventory_system_version
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_sync_metrics_updated_at
  BEFORE UPDATE ON public.inventory_sync_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_alert_config_updated_at
  BEFORE UPDATE ON public.inventory_alert_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();