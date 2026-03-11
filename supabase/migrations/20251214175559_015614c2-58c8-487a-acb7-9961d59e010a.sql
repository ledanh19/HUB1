
-- Add collection_responsibility to host_payables for HOST_COLLECTED flow
ALTER TABLE public.host_payables 
ADD COLUMN IF NOT EXISTS collection_responsibility text NOT NULL DEFAULT 'ROOMRISE_COLLECTED' 
CHECK (collection_responsibility IN ('ROOMRISE_COLLECTED', 'HOST_COLLECTED'));

-- Add comment for documentation
COMMENT ON COLUMN public.host_payables.collection_responsibility IS 'ROOMRISE_COLLECTED = Roomrise collected from guest, HOST_COLLECTED = Host collected directly';

-- Create user_roles test data for role testing
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM profiles WHERE email LIKE '%@%'
ON CONFLICT (user_id, role) DO NOTHING;
