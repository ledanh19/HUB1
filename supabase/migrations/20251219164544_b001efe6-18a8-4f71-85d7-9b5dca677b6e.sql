-- Add sync_status, source_layer, and soft lock fields to inventory_cells
ALTER TABLE public.inventory_cells 
ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'SYNCED' CHECK (sync_status IN ('PENDING', 'SYNCED', 'FAILED')),
ADD COLUMN IF NOT EXISTS source_layer TEXT NOT NULL DEFAULT 'BASE' CHECK (source_layer IN ('BASE', 'OVERRIDE', 'RULE', 'SYNC')),
ADD COLUMN IF NOT EXISTS editing_by UUID,
ADD COLUMN IF NOT EXISTS editing_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_error TEXT,
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Create index for sync status queries
CREATE INDEX IF NOT EXISTS idx_inventory_cells_sync_status ON public.inventory_cells(sync_status) WHERE sync_status != 'SYNCED';

-- Create index for editing lock queries
CREATE INDEX IF NOT EXISTS idx_inventory_cells_editing ON public.inventory_cells(editing_by, editing_expires_at) WHERE editing_by IS NOT NULL;

-- Create inventory_sync_jobs table for background OTA sync
CREATE TABLE IF NOT EXISTS public.inventory_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL,
  cell_ids UUID[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  channel_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  idempotency_key TEXT UNIQUE
);

-- Enable RLS on sync_jobs
ALTER TABLE public.inventory_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inventory sync jobs viewable by authenticated"
  ON public.inventory_sync_jobs FOR SELECT USING (true);

CREATE POLICY "Inventory sync jobs insertable by admin"
  ON public.inventory_sync_jobs FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Inventory sync jobs updatable by admin"
  ON public.inventory_sync_jobs FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for pending jobs
CREATE INDEX IF NOT EXISTS idx_inventory_sync_jobs_pending ON public.inventory_sync_jobs(status, created_at) WHERE status = 'PENDING';

-- Enable realtime for inventory_cells
ALTER TABLE public.inventory_cells REPLICA IDENTITY FULL;
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE public.inventory_cells;