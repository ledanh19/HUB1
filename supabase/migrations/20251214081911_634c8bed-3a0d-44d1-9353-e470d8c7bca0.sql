
-- =============================================
-- PROMPT 2: BACKFILL related_id cho hotel_collects
-- Link hotel_collects -> stays (supply assignment)
-- =============================================

-- Update hotel_collects.related_id = stays.id dựa trên unified_booking_id
UPDATE public.hotel_collects hc
SET related_id = s.id::TEXT
FROM public.stays s
WHERE hc.unified_booking_id = s.unified_booking_id
AND hc.related_id IS NULL;

-- =============================================
-- PROMPT 3: AUTO-GENERATION ENGINE
-- Tạo bảng generation_rules để cấu hình
-- =============================================

-- Bảng cấu hình commission rate theo partner
CREATE TABLE IF NOT EXISTS public.partner_commission_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID NOT NULL,
  commission_type TEXT NOT NULL CHECK (commission_type IN ('ROOM', 'SERVICE')),
  commission_rate NUMERIC NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NULL
);

ALTER TABLE public.partner_commission_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner commission config viewable by authenticated"
ON public.partner_commission_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Partner commission config insertable by authenticated"
ON public.partner_commission_config FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Partner commission config updatable by authenticated"
ON public.partner_commission_config FOR UPDATE TO authenticated USING (true);

CREATE INDEX idx_partner_commission_partner ON public.partner_commission_config(partner_id);

-- =============================================
-- PROMPT 4: FINANCIAL PERIOD LOCK
-- =============================================

CREATE TABLE IF NOT EXISTS public.financial_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  closed_at TIMESTAMP WITH TIME ZONE NULL,
  closed_by UUID NULL,
  note TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(period_year, period_month)
);

ALTER TABLE public.financial_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Financial periods viewable by authenticated"
ON public.financial_periods FOR SELECT TO authenticated USING (true);

CREATE POLICY "Financial periods insertable by admin"
ON public.financial_periods FOR INSERT TO authenticated 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Financial periods updatable by admin"
ON public.financial_periods FOR UPDATE TO authenticated 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Function kiểm tra kỳ có mở không
CREATE OR REPLACE FUNCTION public.is_period_open(check_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.financial_periods
    WHERE period_year = EXTRACT(YEAR FROM check_date)
    AND period_month = EXTRACT(MONTH FROM check_date)
    AND status = 'CLOSED'
  )
$$;

-- =============================================
-- PROMPT 8: DATA HEALTH / ANOMALY DETECTION
-- =============================================

-- Thêm các loại anomaly vào booking_data_health
ALTER TABLE public.booking_data_health 
ADD COLUMN IF NOT EXISTS anomaly_type TEXT NULL,
ADD COLUMN IF NOT EXISTS severity TEXT NULL DEFAULT 'WARNING' CHECK (severity IN ('INFO', 'WARNING', 'ERROR')),
ADD COLUMN IF NOT EXISTS assigned_to UUID NULL,
ADD COLUMN IF NOT EXISTS resolution_note TEXT NULL;

-- =============================================
-- PROMPT 11: AUDIT LOG ENHANCEMENTS
-- =============================================

-- Thêm export tracking
CREATE TABLE IF NOT EXISTS public.export_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  export_type TEXT NOT NULL,
  entity TEXT NOT NULL,
  filter_criteria JSONB NULL,
  record_count INTEGER NULL,
  exported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Export logs viewable by admin"
ON public.export_logs FOR SELECT TO authenticated 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Export logs insertable by authenticated"
ON public.export_logs FOR INSERT TO authenticated WITH CHECK (true);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_financial_periods_status ON public.financial_periods(status);
CREATE INDEX IF NOT EXISTS idx_booking_health_anomaly ON public.booking_data_health(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_export_logs_user ON public.export_logs(user_id);
