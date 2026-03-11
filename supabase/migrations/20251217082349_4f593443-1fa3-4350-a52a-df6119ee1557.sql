-- Create booking_room_lines_mirror table for multi-room booking support
CREATE TABLE public.booking_room_lines_mirror (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pms_booking_id TEXT NOT NULL,
  line_key TEXT NOT NULL,
  line_index INTEGER NOT NULL DEFAULT 0,
  room_type TEXT,
  rate_plan TEXT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  nights INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient lookup by pms_booking_id
CREATE INDEX idx_booking_room_lines_pms_booking_id ON public.booking_room_lines_mirror(pms_booking_id);

-- Create unique constraint on line_key to prevent duplicates
CREATE UNIQUE INDEX idx_booking_room_lines_line_key ON public.booking_room_lines_mirror(line_key);

-- Enable RLS
ALTER TABLE public.booking_room_lines_mirror ENABLE ROW LEVEL SECURITY;

-- RLS policies - viewable by authenticated users
CREATE POLICY "Booking room lines viewable by authenticated"
ON public.booking_room_lines_mirror
FOR SELECT
USING (true);

-- RLS policies - insertable by admin (for sync function)
CREATE POLICY "Booking room lines insertable by admin"
ON public.booking_room_lines_mirror
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies - updatable by admin
CREATE POLICY "Booking room lines updatable by admin"
ON public.booking_room_lines_mirror
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies - deletable by admin (needed for replace strategy)
CREATE POLICY "Booking room lines deletable by admin"
ON public.booking_room_lines_mirror
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));