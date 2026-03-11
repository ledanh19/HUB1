-- Migration: 20260110_030_ota_task_todos.sql
-- Purpose: Task checklist (Todo) feature for OTA Operations
-- Constraint: Todo is a simple checklist - no status, no workflow gate

-- =====================================================
-- TABLE: ota_task_todos
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ota_task_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.ota_tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 500),
  is_done BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Comment
COMMENT ON TABLE public.ota_task_todos IS 'Task checklist items (todos) - simple checklist, no workflow gate';
COMMENT ON COLUMN public.ota_task_todos.is_done IS 'Checkbox state - does NOT affect task DONE status';
COMMENT ON COLUMN public.ota_task_todos.sort_order IS 'For manual reordering';

-- =====================================================
-- RLS
-- =====================================================

ALTER TABLE public.ota_task_todos ENABLE ROW LEVEL SECURITY;

-- Policy: User can access todos if they can access the parent task (via project membership)
CREATE POLICY "Todo inherits task access via project membership"
ON public.ota_task_todos
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.ota_tasks t
    JOIN public.ota_project_members pm ON pm.project_id = t.project_id
    WHERE t.id = ota_task_todos.task_id
    AND pm.user_id = auth.uid()
  )
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_ota_task_todos_task_id ON public.ota_task_todos(task_id);
CREATE INDEX IF NOT EXISTS idx_ota_task_todos_sort ON public.ota_task_todos(task_id, sort_order, created_at);

-- =====================================================
-- TRIGGER: updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_ota_task_todos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ota_task_todos_updated_at ON public.ota_task_todos;
CREATE TRIGGER trigger_ota_task_todos_updated_at
  BEFORE UPDATE ON public.ota_task_todos
  FOR EACH ROW EXECUTE FUNCTION update_ota_task_todos_updated_at();

-- =====================================================
-- RPC: ota_get_task_todos
-- =====================================================

CREATE OR REPLACE FUNCTION public.ota_get_task_todos(p_task_id UUID)
RETURNS TABLE (
  id UUID,
  task_id UUID,
  content TEXT,
  is_done BOOLEAN,
  sort_order INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check task access via project membership
  IF NOT EXISTS (
    SELECT 1 FROM ota_tasks t
    JOIN ota_project_members pm ON pm.project_id = t.project_id
    WHERE t.id = p_task_id AND pm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to task todos';
  END IF;

  RETURN QUERY
  SELECT 
    tt.id,
    tt.task_id,
    tt.content,
    tt.is_done,
    tt.sort_order,
    tt.created_at,
    tt.updated_at,
    tt.created_by
  FROM ota_task_todos tt
  WHERE tt.task_id = p_task_id
  ORDER BY tt.sort_order, tt.created_at;
END;
$$;

-- =====================================================
-- RPC: ota_add_task_todo
-- =====================================================

CREATE OR REPLACE FUNCTION public.ota_add_task_todo(
  p_task_id UUID,
  p_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_max_sort INTEGER;
BEGIN
  -- Check task access
  IF NOT EXISTS (
    SELECT 1 FROM ota_tasks t
    JOIN ota_project_members pm ON pm.project_id = t.project_id
    WHERE t.id = p_task_id AND pm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to add todo';
  END IF;

  -- Get max sort order
  SELECT COALESCE(MAX(sort_order), 0) INTO v_max_sort
  FROM ota_task_todos WHERE task_id = p_task_id;

  -- Insert new todo
  INSERT INTO ota_task_todos (task_id, content, sort_order, created_by)
  VALUES (p_task_id, trim(p_content), v_max_sort + 1, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- =====================================================
-- RPC: ota_toggle_task_todo
-- =====================================================

CREATE OR REPLACE FUNCTION public.ota_toggle_task_todo(p_todo_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_done BOOLEAN;
  v_task_id UUID;
BEGIN
  -- Get task_id for access check
  SELECT task_id INTO v_task_id FROM ota_task_todos WHERE id = p_todo_id;
  
  IF v_task_id IS NULL THEN
    RAISE EXCEPTION 'Todo not found';
  END IF;

  -- Check task access
  IF NOT EXISTS (
    SELECT 1 FROM ota_tasks t
    JOIN ota_project_members pm ON pm.project_id = t.project_id
    WHERE t.id = v_task_id AND pm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to toggle todo';
  END IF;

  -- Toggle
  UPDATE ota_task_todos
  SET is_done = NOT is_done
  WHERE id = p_todo_id
  RETURNING is_done INTO v_is_done;

  RETURN v_is_done;
END;
$$;

-- =====================================================
-- RPC: ota_update_task_todo
-- =====================================================

CREATE OR REPLACE FUNCTION public.ota_update_task_todo(
  p_todo_id UUID,
  p_content TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id UUID;
BEGIN
  -- Get task_id for access check
  SELECT task_id INTO v_task_id FROM ota_task_todos WHERE id = p_todo_id;
  
  IF v_task_id IS NULL THEN
    RAISE EXCEPTION 'Todo not found';
  END IF;

  -- Check task access
  IF NOT EXISTS (
    SELECT 1 FROM ota_tasks t
    JOIN ota_project_members pm ON pm.project_id = t.project_id
    WHERE t.id = v_task_id AND pm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to update todo';
  END IF;

  -- Update
  UPDATE ota_task_todos
  SET content = trim(p_content)
  WHERE id = p_todo_id;
END;
$$;

-- =====================================================
-- RPC: ota_delete_task_todo
-- =====================================================

CREATE OR REPLACE FUNCTION public.ota_delete_task_todo(p_todo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id UUID;
BEGIN
  -- Get task_id for access check
  SELECT task_id INTO v_task_id FROM ota_task_todos WHERE id = p_todo_id;
  
  IF v_task_id IS NULL THEN
    RETURN; -- Already deleted or never existed
  END IF;

  -- Check task access
  IF NOT EXISTS (
    SELECT 1 FROM ota_tasks t
    JOIN ota_project_members pm ON pm.project_id = t.project_id
    WHERE t.id = v_task_id AND pm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to delete todo';
  END IF;

  -- Delete
  DELETE FROM ota_task_todos WHERE id = p_todo_id;
END;
$$;

-- =====================================================
-- RPC: ota_reorder_task_todos (optional - for drag/drop)
-- =====================================================

CREATE OR REPLACE FUNCTION public.ota_reorder_task_todos(
  p_task_id UUID,
  p_todo_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order INTEGER := 0;
  v_todo_id UUID;
BEGIN
  -- Check task access
  IF NOT EXISTS (
    SELECT 1 FROM ota_tasks t
    JOIN ota_project_members pm ON pm.project_id = t.project_id
    WHERE t.id = p_task_id AND pm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to reorder todos';
  END IF;

  -- Update sort_order based on array position
  FOREACH v_todo_id IN ARRAY p_todo_ids
  LOOP
    UPDATE ota_task_todos
    SET sort_order = v_order
    WHERE id = v_todo_id AND task_id = p_task_id;
    v_order := v_order + 1;
  END LOOP;
END;
$$;

-- =====================================================
-- GRANTS
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ota_task_todos TO authenticated;
GRANT EXECUTE ON FUNCTION public.ota_get_task_todos(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ota_add_task_todo(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ota_toggle_task_todo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ota_update_task_todo(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ota_delete_task_todo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ota_reorder_task_todos(UUID, UUID[]) TO authenticated;