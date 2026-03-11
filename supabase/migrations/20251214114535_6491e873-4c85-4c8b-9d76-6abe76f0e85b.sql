-- Add collection_type enum and new columns for REFUND/VOID support
-- collection_type: COLLECT (default), REFUND, VOID
-- related_collection_id: references the original collection for REFUND/VOID
-- reason_note: required for REFUND/VOID operations
-- voided_at: timestamp when collection was voided

-- Add new columns to hotel_collects table
ALTER TABLE public.hotel_collects 
ADD COLUMN collection_type text NOT NULL DEFAULT 'COLLECT',
ADD COLUMN related_collection_id uuid REFERENCES public.hotel_collects(id),
ADD COLUMN reason_note text,
ADD COLUMN voided_at timestamp with time zone;

-- Add constraint to ensure collection_type is valid
ALTER TABLE public.hotel_collects
ADD CONSTRAINT valid_collection_type CHECK (collection_type IN ('COLLECT', 'REFUND', 'VOID'));

-- Add constraint to ensure REFUND/VOID has related_collection_id
ALTER TABLE public.hotel_collects
ADD CONSTRAINT refund_void_requires_related CHECK (
  (collection_type = 'COLLECT') OR 
  (collection_type IN ('REFUND', 'VOID') AND related_collection_id IS NOT NULL AND reason_note IS NOT NULL)
);

-- Add index for faster lookups on related collections
CREATE INDEX idx_hotel_collects_related ON public.hotel_collects(related_collection_id) WHERE related_collection_id IS NOT NULL;

-- Add index for collection type filtering
CREATE INDEX idx_hotel_collects_type ON public.hotel_collects(collection_type);