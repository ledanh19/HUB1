
-- =============================================
-- PART A: ALTER EXISTING TABLES (SAFE CHANGES)
-- =============================================

-- 1) Add ownership columns to hotel_collects
ALTER TABLE public.hotel_collects 
ADD COLUMN IF NOT EXISTS payer_type TEXT NOT NULL DEFAULT 'GUEST',
ADD COLUMN IF NOT EXISTS payee_type TEXT NOT NULL DEFAULT 'ROOMRISE',
ADD COLUMN IF NOT EXISTS related_type TEXT NOT NULL DEFAULT 'ROOM',
ADD COLUMN IF NOT EXISTS related_id TEXT NULL;

-- 2) Add ownership columns to service_payments
ALTER TABLE public.service_payments
ADD COLUMN IF NOT EXISTS payer_type TEXT NOT NULL DEFAULT 'GUEST',
ADD COLUMN IF NOT EXISTS payee_type TEXT NOT NULL DEFAULT 'ROOMRISE';

-- =============================================
-- PART B: CREATE NEW FINANCIAL TABLES
-- =============================================

-- 3) Create commission_receivables table
CREATE TABLE public.commission_receivables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unified_booking_id TEXT NOT NULL,
  partner_id UUID NOT NULL,
  receivable_type TEXT NOT NULL CHECK (receivable_type IN ('ROOM_COMMISSION', 'SERVICE_COMMISSION')),
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'VND',
  status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PAID')),
  due_date DATE NULL,
  paid_at TIMESTAMP WITH TIME ZONE NULL,
  note TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NULL
);

-- 4) Create revenue_entries table (Accrual basis)
CREATE TABLE public.revenue_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_date DATE NOT NULL,
  unified_booking_id TEXT NULL,
  related_type TEXT NOT NULL CHECK (related_type IN ('ROOM', 'SERVICE', 'ADJUSTMENT')),
  related_id TEXT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('REVENUE', 'COGS', 'OPEX')),
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'VND',
  note TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NULL
);

-- 5) Create cashflow_entries table (Cash basis)
CREATE TABLE public.cashflow_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_date DATE NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('PAYMENT', 'PAYABLE_PAYMENT', 'OPEX', 'ADJUSTMENT')),
  source_id TEXT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
  counterparty_type TEXT NOT NULL CHECK (counterparty_type IN ('OTA', 'GUEST', 'HOST', 'SERVICE_PARTNER', 'OTHER')),
  counterparty_id TEXT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'VND',
  note TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NULL
);

-- =============================================
-- PART C: ENABLE RLS & CREATE POLICIES
-- =============================================

ALTER TABLE public.commission_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashflow_entries ENABLE ROW LEVEL SECURITY;

-- Commission receivables policies
CREATE POLICY "Commission receivables viewable by authenticated"
ON public.commission_receivables FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Commission receivables insertable by authenticated"
ON public.commission_receivables FOR INSERT
TO authenticated WITH CHECK (true);

CREATE POLICY "Commission receivables updatable by authenticated"
ON public.commission_receivables FOR UPDATE
TO authenticated USING (true);

-- Revenue entries policies
CREATE POLICY "Revenue entries viewable by authenticated"
ON public.revenue_entries FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Revenue entries insertable by authenticated"
ON public.revenue_entries FOR INSERT
TO authenticated WITH CHECK (true);

CREATE POLICY "Revenue entries updatable by authenticated"
ON public.revenue_entries FOR UPDATE
TO authenticated USING (true);

-- Cashflow entries policies
CREATE POLICY "Cashflow entries viewable by authenticated"
ON public.cashflow_entries FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Cashflow entries insertable by authenticated"
ON public.cashflow_entries FOR INSERT
TO authenticated WITH CHECK (true);

CREATE POLICY "Cashflow entries updatable by authenticated"
ON public.cashflow_entries FOR UPDATE
TO authenticated USING (true);

-- =============================================
-- PART D: INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_commission_receivables_booking ON public.commission_receivables(unified_booking_id);
CREATE INDEX IF NOT EXISTS idx_commission_receivables_partner ON public.commission_receivables(partner_id);
CREATE INDEX IF NOT EXISTS idx_commission_receivables_status ON public.commission_receivables(status);

CREATE INDEX IF NOT EXISTS idx_revenue_entries_date ON public.revenue_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_revenue_entries_booking ON public.revenue_entries(unified_booking_id);
CREATE INDEX IF NOT EXISTS idx_revenue_entries_category ON public.revenue_entries(category);

CREATE INDEX IF NOT EXISTS idx_cashflow_entries_date ON public.cashflow_entries(cash_date);
CREATE INDEX IF NOT EXISTS idx_cashflow_entries_direction ON public.cashflow_entries(direction);
CREATE INDEX IF NOT EXISTS idx_cashflow_entries_source ON public.cashflow_entries(source_type);
