-- Fix is_ota_role to include admin and super_admin
CREATE OR REPLACE FUNCTION public.is_ota_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('ota_staff', 'ota_lead', 'admin', 'super_admin')
  );
$$;

-- Add trigger to auto-add project creator as member when project is created
CREATE OR REPLACE FUNCTION public.auto_add_project_creator_as_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-add the creator as a LEAD member if created_by is not null
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.ota_project_members (project_id, user_id, role, assigned_by, is_active)
    VALUES (NEW.id, NEW.created_by, 'LEAD'::ota_project_role, NEW.created_by, true)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS trg_auto_add_project_creator ON public.ota_projects;
CREATE TRIGGER trg_auto_add_project_creator
AFTER INSERT ON public.ota_projects
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_project_creator_as_member();

-- Add existing project creators as members (fix existing data)
INSERT INTO public.ota_project_members (project_id, user_id, role, assigned_by, is_active)
SELECT p.id, p.created_by, 'LEAD'::ota_project_role, p.created_by, true
FROM public.ota_projects p
WHERE p.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.ota_project_members pm 
    WHERE pm.project_id = p.id AND pm.user_id = p.created_by
  );

-- Also auto-add task assignee as project member when task is created/updated
CREATE OR REPLACE FUNCTION public.auto_add_task_assignee_as_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-add the assignee as STAFF member if not already member
  IF NEW.assignee_id IS NOT NULL THEN
    INSERT INTO public.ota_project_members (project_id, user_id, role, assigned_by, is_active)
    VALUES (NEW.project_id, NEW.assignee_id, 'STAFF'::ota_project_role, auth.uid(), true)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for tasks
DROP TRIGGER IF EXISTS trg_auto_add_task_assignee ON public.ota_tasks;
CREATE TRIGGER trg_auto_add_task_assignee
AFTER INSERT OR UPDATE OF assignee_id ON public.ota_tasks
FOR EACH ROW
WHEN (NEW.assignee_id IS NOT NULL)
EXECUTE FUNCTION public.auto_add_task_assignee_as_member();

-- Add existing task assignees as project members (fix existing data)
INSERT INTO public.ota_project_members (project_id, user_id, role, assigned_by, is_active)
SELECT DISTINCT t.project_id, t.assignee_id, 'STAFF'::ota_project_role, t.assignee_id, true
FROM public.ota_tasks t
WHERE t.assignee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.ota_project_members pm 
    WHERE pm.project_id = t.project_id AND pm.user_id = t.assignee_id
  );