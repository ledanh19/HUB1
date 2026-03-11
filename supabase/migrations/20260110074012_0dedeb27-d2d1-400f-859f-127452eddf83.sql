
-- Create RPC function to archive partner
CREATE OR REPLACE FUNCTION public.archive_partner(
  p_partner_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_partner_name TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Get partner name for response
  SELECT partner_name INTO v_partner_name
  FROM partners WHERE id = p_partner_id;
  
  IF v_partner_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Partner not found');
  END IF;
  
  -- Update partner status
  UPDATE partners SET
    partner_status = 'ARCHIVED'::partner_status,
    status = 'archived',
    archived_at = NOW(),
    archived_by = v_user_id,
    archive_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_partner_id;
  
  RETURN json_build_object(
    'success', true,
    'partner_id', p_partner_id,
    'partner_name', v_partner_name
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Create RPC function to blacklist partner
CREATE OR REPLACE FUNCTION public.blacklist_partner(
  p_partner_id UUID,
  p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_partner_name TEXT;
BEGIN
  v_user_id := auth.uid();
  
  -- Validate reason is required
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Blacklist reason is required');
  END IF;
  
  -- Get partner name for response
  SELECT partner_name INTO v_partner_name
  FROM partners WHERE id = p_partner_id;
  
  IF v_partner_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Partner not found');
  END IF;
  
  -- Update partner status
  UPDATE partners SET
    partner_status = 'BLACKLISTED'::partner_status,
    status = 'blacklisted',
    blacklisted_at = NOW(),
    blacklisted_by = v_user_id,
    blacklist_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_partner_id;
  
  RETURN json_build_object(
    'success', true,
    'partner_id', p_partner_id,
    'partner_name', v_partner_name
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Create RPC function to reactivate partner
CREATE OR REPLACE FUNCTION public.reactivate_partner(
  p_partner_id UUID,
  p_new_status TEXT DEFAULT 'ACTIVE'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_partner_name TEXT;
  v_new_status partner_status;
BEGIN
  v_user_id := auth.uid();
  
  -- Validate and cast status
  BEGIN
    v_new_status := p_new_status::partner_status;
  EXCEPTION
    WHEN OTHERS THEN
      v_new_status := 'ACTIVE'::partner_status;
  END;
  
  -- Get partner name for response
  SELECT partner_name INTO v_partner_name
  FROM partners WHERE id = p_partner_id;
  
  IF v_partner_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Partner not found');
  END IF;
  
  -- Update partner status
  UPDATE partners SET
    partner_status = v_new_status,
    status = 'active',
    archived_at = NULL,
    archived_by = NULL,
    archive_reason = NULL,
    blacklisted_at = NULL,
    blacklisted_by = NULL,
    blacklist_reason = NULL,
    last_activated_at = NOW(),
    last_activated_by = v_user_id,
    updated_at = NOW()
  WHERE id = p_partner_id;
  
  RETURN json_build_object(
    'success', true,
    'partner_id', p_partner_id,
    'partner_name', v_partner_name,
    'new_status', v_new_status::text
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.archive_partner TO authenticated;
GRANT EXECUTE ON FUNCTION public.blacklist_partner TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_partner TO authenticated;
