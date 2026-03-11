-- =============================================
-- AI PRICING SHADOW VALIDATION - PHASE 1B
-- Shadow Signal Logging & Outcome Tracking
-- =============================================

-- Table 1: Shadow Signals - Ghi nhận mỗi AI signal tại thời điểm phát sinh
CREATE TABLE public.ai_pricing_shadow_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Identity
  property_id TEXT NOT NULL,
  room_type_id TEXT,
  stay_date DATE NOT NULL,
  signal_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Signal Content
  signal_class TEXT NOT NULL CHECK (signal_class IN ('SELL_OUT_RISK', 'VACANCY_RISK', 'HOLD', 'DATA_INSUFFICIENT')),
  advisory_direction TEXT NOT NULL CHECK (advisory_direction IN ('INCREASE_CANDIDATE', 'DECREASE_CANDIDATE', 'HOLD')),
  data_confidence NUMERIC NOT NULL CHECK (data_confidence >= 0 AND data_confidence <= 1),
  
  -- Market Snapshot (At-Signal) - Bằng chứng pháp lý của AI
  remaining_inventory INTEGER NOT NULL,
  total_inventory INTEGER NOT NULL,
  current_rate NUMERIC,
  days_to_checkin INTEGER NOT NULL,
  booking_velocity_24h NUMERIC,
  booking_velocity_7d NUMERIC,
  baseline_pace NUMERIC,
  lead_time_median INTEGER,
  data_freshness_minutes INTEGER,
  
  -- Flags
  has_data_lag BOOLEAN DEFAULT false,
  has_inventory_anomaly BOOLEAN DEFAULT false,
  baseline_reliability TEXT CHECK (baseline_reliability IN ('HIGH', 'MEDIUM', 'LOW')),
  
  -- Explanation
  explanation_text TEXT,
  confidence_factors JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table 2: Validation Outcomes - Ghi nhận sau khi ngày lưu trú kết thúc
CREATE TABLE public.ai_pricing_validation_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_id UUID NOT NULL REFERENCES public.ai_pricing_shadow_signals(id) ON DELETE CASCADE,
  
  -- Outcome Data
  final_occupancy_pct NUMERIC CHECK (final_occupancy_pct >= 0 AND final_occupancy_pct <= 100),
  final_remaining_inventory INTEGER,
  sold_out_at TIMESTAMPTZ,
  had_booking_surge BOOLEAN DEFAULT false,
  had_late_pickup BOOLEAN DEFAULT false,
  
  -- Graded Correctness Scores (0-1)
  sellout_risk_score NUMERIC CHECK (sellout_risk_score >= 0 AND sellout_risk_score <= 1),
  vacancy_severity_score NUMERIC CHECK (vacancy_severity_score >= 0 AND vacancy_severity_score <= 1),
  
  -- Classification
  classification TEXT CHECK (classification IN ('TRUE_POSITIVE', 'FALSE_POSITIVE', 'TRUE_NEGATIVE', 'FALSE_NEGATIVE')),
  context_tag TEXT CHECK (context_tag IN ('MARKET_SHOCK', 'EXTERNAL_EVENT', 'OTA_CAMPAIGN', 'UNKNOWN_CAUSE', 'NORMAL')),
  
  -- Scoring
  weighted_accuracy_score NUMERIC,
  
  -- Metadata
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table 3: Weekly Validation Reports
CREATE TABLE public.ai_pricing_weekly_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Report Period
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  property_id TEXT,
  
  -- Executive Summary
  total_signals INTEGER DEFAULT 0,
  accuracy_weighted NUMERIC,
  false_positive_rate NUMERIC,
  false_negative_rate NUMERIC,
  
  -- Signal Breakdown
  sellout_risk_count INTEGER DEFAULT 0,
  vacancy_risk_count INTEGER DEFAULT 0,
  hold_count INTEGER DEFAULT 0,
  
  -- Accuracy by Type
  sellout_accuracy NUMERIC,
  vacancy_accuracy NUMERIC,
  
  -- Confidence Calibration Data
  calibration_data JSONB,
  
  -- Case Reviews
  excellent_cases JSONB,
  failed_cases JSONB,
  untrusted_conditions JSONB,
  
  -- Go/No-Go Assessment
  go_nogo_status TEXT CHECK (go_nogo_status IN ('GO', 'NO_GO', 'PENDING')),
  go_nogo_reasons JSONB,
  
  -- Metadata
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(week_start, week_end, property_id)
);

-- Indexes for performance
CREATE INDEX idx_shadow_signals_property_date ON public.ai_pricing_shadow_signals(property_id, stay_date);
CREATE INDEX idx_shadow_signals_timestamp ON public.ai_pricing_shadow_signals(signal_timestamp);
CREATE INDEX idx_shadow_signals_class ON public.ai_pricing_shadow_signals(signal_class);
CREATE INDEX idx_validation_outcomes_signal ON public.ai_pricing_validation_outcomes(signal_id);
CREATE INDEX idx_validation_outcomes_classification ON public.ai_pricing_validation_outcomes(classification);
CREATE INDEX idx_weekly_reports_period ON public.ai_pricing_weekly_reports(week_start, week_end);

-- Enable RLS
ALTER TABLE public.ai_pricing_shadow_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_pricing_validation_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_pricing_weekly_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Authenticated users can view and insert
CREATE POLICY "Shadow signals viewable by authenticated"
  ON public.ai_pricing_shadow_signals FOR SELECT
  USING (true);

CREATE POLICY "Shadow signals insertable by authenticated"
  ON public.ai_pricing_shadow_signals FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Validation outcomes viewable by authenticated"
  ON public.ai_pricing_validation_outcomes FOR SELECT
  USING (true);

CREATE POLICY "Validation outcomes insertable by authenticated"
  ON public.ai_pricing_validation_outcomes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Validation outcomes updatable by authenticated"
  ON public.ai_pricing_validation_outcomes FOR UPDATE
  USING (true);

CREATE POLICY "Weekly reports viewable by authenticated"
  ON public.ai_pricing_weekly_reports FOR SELECT
  USING (true);

CREATE POLICY "Weekly reports insertable by admin"
  ON public.ai_pricing_weekly_reports FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Weekly reports updatable by admin"
  ON public.ai_pricing_weekly_reports FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));