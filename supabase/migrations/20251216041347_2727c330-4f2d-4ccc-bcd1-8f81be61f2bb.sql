-- Add new fields for internal_expenses per spec

-- Expense period (Kỳ chi phí) - format: YYYY-MM or free text
ALTER TABLE public.internal_expenses 
ADD COLUMN IF NOT EXISTS expense_period text;

-- Confirmation date (Ngày chốt) - when the amount was verified/locked
ALTER TABLE public.internal_expenses 
ADD COLUMN IF NOT EXISTS confirmed_at timestamp with time zone;

-- Transaction status: PENDING (Chờ duyệt), CONFIRMED (Đã chốt - chưa chi), PAID (Đã thanh toán)
ALTER TABLE public.internal_expenses 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'PAID';

-- Proposal date (Ngày đề xuất) - when request was created, defaults to created_at
ALTER TABLE public.internal_expenses 
ADD COLUMN IF NOT EXISTS proposed_at timestamp with time zone DEFAULT now();

-- Comment for documentation
COMMENT ON COLUMN public.internal_expenses.expense_period IS 'Expense period (e.g., 2024-12 for Dec 2024)';
COMMENT ON COLUMN public.internal_expenses.confirmed_at IS 'Date when the expense amount was verified/locked';
COMMENT ON COLUMN public.internal_expenses.status IS 'Transaction status: PENDING, CONFIRMED, PAID';
COMMENT ON COLUMN public.internal_expenses.proposed_at IS 'Date when the expense request was created';