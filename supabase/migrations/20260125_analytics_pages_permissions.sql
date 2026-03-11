-- Migration: Add Analytics pages permissions for existing admin users
-- Date: 2026-01-25
-- Description: Grant access to new Analytics module pages for users with admin/super_admin roles

-- Insert Analytics page permissions for all admin and super_admin users
-- Skip if already exists (ON CONFLICT DO NOTHING)

INSERT INTO public.user_page_permissions (user_id, page_path, can_use)
SELECT 
  u.id as user_id,
  page.path as page_path,
  true as can_use
FROM auth.users u
CROSS JOIN (
  VALUES 
    ('/analytics/overview'),
    ('/analytics/revenue'),
    ('/analytics/host-cost'),
    ('/analytics/price-spread')
) AS page(path)
WHERE u.raw_user_meta_data->>'role' IN ('admin', 'super_admin', 'ke_toan')
ON CONFLICT (user_id, page_path) DO NOTHING;

-- Also grant to users who already have access to /reports/pnl (finance users)
INSERT INTO public.user_page_permissions (user_id, page_path, can_use)
SELECT 
  upp.user_id,
  page.path as page_path,
  true as can_use
FROM public.user_page_permissions upp
CROSS JOIN (
  VALUES 
    ('/analytics/overview'),
    ('/analytics/revenue'),
    ('/analytics/host-cost'),
    ('/analytics/price-spread')
) AS page(path)
WHERE upp.page_path = '/reports/pnl'
  AND upp.can_use = true
ON CONFLICT (user_id, page_path) DO NOTHING;

-- Rollback script (comment out above, uncomment below to rollback)
-- DELETE FROM public.user_page_permissions 
-- WHERE page_path IN (
--   '/analytics/overview',
--   '/analytics/revenue', 
--   '/analytics/host-cost',
--   '/analytics/price-spread'
-- );
