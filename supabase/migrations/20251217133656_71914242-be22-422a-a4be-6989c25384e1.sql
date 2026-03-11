-- Add approval workflow fields to host_deposits
ALTER TABLE public.host_deposits 
ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'PENDING' 
  CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAID')),
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS approved_by uuid,
ADD COLUMN IF NOT EXISTS rejection_note text;

-- Add approval workflow fields to host_prepaids  
ALTER TABLE public.host_prepaids
ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'PENDING'
  CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAID')),
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS approved_by uuid,
ADD COLUMN IF NOT EXISTS rejection_note text;

-- Update existing records to PAID (since they were already processed)
UPDATE public.host_deposits SET approval_status = 'PAID' WHERE approval_status = 'PENDING';
UPDATE public.host_prepaids SET approval_status = 'PAID' WHERE approval_status = 'PENDING';