-- Create table to store Channex user/account information
CREATE TABLE IF NOT EXISTS public.channex_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channex_user_id TEXT NOT NULL UNIQUE,
  email TEXT,
  name TEXT,
  phone TEXT,
  avatar_url TEXT,
  company_name TEXT,
  timezone TEXT,
  locale TEXT,
  is_active BOOLEAN DEFAULT true,
  subscription_plan TEXT,
  subscription_status TEXT,
  api_key_last_4 TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  properties_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table to track which properties belong to which Channex user
CREATE TABLE IF NOT EXISTS public.channex_user_properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channex_user_id TEXT NOT NULL,
  channex_property_id TEXT NOT NULL,
  property_name TEXT,
  property_status TEXT DEFAULT 'active',
  is_primary BOOLEAN DEFAULT false,
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(channex_user_id, channex_property_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_channex_users_email ON public.channex_users(email);
CREATE INDEX IF NOT EXISTS idx_channex_users_active ON public.channex_users(is_active);
CREATE INDEX IF NOT EXISTS idx_channex_user_properties_user ON public.channex_user_properties(channex_user_id);
CREATE INDEX IF NOT EXISTS idx_channex_user_properties_property ON public.channex_user_properties(channex_property_id);

-- Enable RLS
ALTER TABLE public.channex_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channex_user_properties ENABLE ROW LEVEL SECURITY;

-- RLS Policies for channex_users
CREATE POLICY "Channex users viewable by authenticated" 
  ON public.channex_users 
  FOR SELECT 
  USING (true);

CREATE POLICY "Channex users insertable by admin" 
  ON public.channex_users 
  FOR INSERT 
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Channex users updatable by admin" 
  ON public.channex_users 
  FOR UPDATE 
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for channex_user_properties
CREATE POLICY "Channex user properties viewable by authenticated" 
  ON public.channex_user_properties 
  FOR SELECT 
  USING (true);

CREATE POLICY "Channex user properties insertable by admin" 
  ON public.channex_user_properties 
  FOR INSERT 
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Channex user properties updatable by admin" 
  ON public.channex_user_properties 
  FOR UPDATE 
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_channex_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_channex_users_updated_at
  BEFORE UPDATE ON public.channex_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_channex_updated_at();

CREATE TRIGGER update_channex_user_properties_updated_at
  BEFORE UPDATE ON public.channex_user_properties
  FOR EACH ROW
  EXECUTE FUNCTION public.update_channex_updated_at();