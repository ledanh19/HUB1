-- Create enum for no-show reasons
CREATE TYPE public.no_show_reason AS ENUM (
  'GUEST_NO_ARRIVAL',
  'LATE_ARRIVAL_CONFIRMED', 
  'UNREACHABLE_GUEST',
  'OTHER'
);

-- Add missing columns and modify existing no_show_records table
ALTER TABLE public.no_show_records 
  ADD COLUMN IF NOT EXISTS no_show_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS note text;

-- Make note required for new records (we'll handle this in application code since existing records may not have it)
-- Drop financial columns that should not exist per requirements
ALTER TABLE public.no_show_records 
  DROP COLUMN IF EXISTS fee_amount,
  DROP COLUMN IF EXISTS fee_policy;

-- Add removed_by and removed_at for admin removal tracking
ALTER TABLE public.no_show_records
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS removed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS removal_reason text;

-- Drop existing policies and recreate with proper permissions
DROP POLICY IF EXISTS "No show records insertable by authenticated" ON public.no_show_records;
DROP POLICY IF EXISTS "No show records viewable by authenticated" ON public.no_show_records;

-- CSKH and Admin can create no-show records
CREATE POLICY "No show records insertable by cskh or admin"
ON public.no_show_records
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'cskh'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- CSKH can update their own records, Admin can update all
CREATE POLICY "No show records updatable by cskh or admin"
ON public.no_show_records
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  (has_role(auth.uid(), 'cskh'::app_role) AND created_by = auth.uid())
);

-- Admin, CSKH, and Sale can view (ke_toan excluded)
CREATE POLICY "No show records viewable by non-ketoan"
ON public.no_show_records
FOR SELECT
TO authenticated
USING (
  NOT has_role(auth.uid(), 'ke_toan'::app_role)
);

-- Only Admin can delete (soft delete via removed_by/removed_at)
CREATE POLICY "No show records deletable by admin only"
ON public.no_show_records
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));