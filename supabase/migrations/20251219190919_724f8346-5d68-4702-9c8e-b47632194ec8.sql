-- Add missing columns to inventory_cells for full traceability per ABSOLUTE SPEC
ALTER TABLE public.inventory_cells 
ADD COLUMN IF NOT EXISTS applied_rule_id uuid REFERENCES public.availability_rules(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS applied_override_id uuid,
ADD COLUMN IF NOT EXISTS batch_id text,
ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Ho_Chi_Minh',
ADD COLUMN IF NOT EXISTS cell_state text DEFAULT 'SAVED' CHECK (cell_state IN ('DRAFT', 'SAVED', 'SYNCING', 'FAILED'));

-- Add index for batch_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_inventory_cells_batch_id ON public.inventory_cells(batch_id);

-- Add index for applied_rule_id
CREATE INDEX IF NOT EXISTS idx_inventory_cells_applied_rule_id ON public.inventory_cells(applied_rule_id);

-- Create inventory_batches table to track bulk operations
CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL,
  batch_id text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  status text DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'PARTIAL_FAIL', 'FAILED')),
  total_cells integer DEFAULT 0,
  success_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  intent text,
  intent_note text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;

-- RLS policies for inventory_batches
CREATE POLICY "Inventory batches viewable by authenticated" ON public.inventory_batches
  FOR SELECT USING (true);
  
CREATE POLICY "Inventory batches insertable by authenticated" ON public.inventory_batches
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Inventory batches updatable by authenticated" ON public.inventory_batches
  FOR UPDATE USING (true);