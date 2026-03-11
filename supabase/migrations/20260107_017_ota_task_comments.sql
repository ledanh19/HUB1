-- ============================================================
-- OTA OPERATIONS MODULE - 017: TASK COMMENTS
-- ============================================================
-- Date: 2026-01-07
-- Updated: 2026-01-08
-- Purpose: Comments/discussion on tasks
-- Phase D: Optional feature for team communication
-- ============================================================

-- ============================================================
-- TABLE: ota_task_comments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ota_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES ota_tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  parent_id UUID REFERENCES ota_task_comments(id) ON DELETE CASCADE, -- For threaded replies
  is_edited BOOLEAN DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ota_task_comments_task_id ON ota_task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_ota_task_comments_author_id ON ota_task_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_ota_task_comments_parent_id ON ota_task_comments(parent_id);

-- RLS
ALTER TABLE ota_task_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: OTA users can view comments on tasks they can access
CREATE POLICY "ota_task_comments_select" ON ota_task_comments
  FOR SELECT
  TO authenticated
  USING (
    is_ota_role() AND 
    EXISTS (
      SELECT 1 FROM ota_tasks t
      JOIN ota_projects p ON p.id = t.project_id
      WHERE t.id = ota_task_comments.task_id
        AND has_ota_project_access(p.id)
    )
  );

-- ============================================================
-- RPC: ota_add_task_comment
-- Adds a new comment to a task
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_add_task_comment(
  p_task_id UUID,
  p_content TEXT,
  p_parent_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_comment_id UUID;
  v_project_id UUID;
BEGIN
  v_caller_id := auth.uid();
  
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can add comments'
    );
  END IF;
  
  -- Get project_id and check access
  SELECT t.project_id INTO v_project_id
  FROM ota_tasks t
  WHERE t.id = p_task_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'TASK_NOT_FOUND',
      'message', 'Task does not exist'
    );
  END IF;
  
  IF NOT has_ota_project_access(v_project_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROJECT_ACCESS_DENIED',
      'message', 'No access to this task'
    );
  END IF;
  
  -- Validate content
  IF p_content IS NULL OR LENGTH(TRIM(p_content)) = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'EMPTY_CONTENT',
      'message', 'Comment content cannot be empty'
    );
  END IF;
  
  -- Validate parent if provided
  IF p_parent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM ota_task_comments
      WHERE id = p_parent_id AND task_id = p_task_id
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'INVALID_PARENT',
        'message', 'Parent comment not found'
      );
    END IF;
  END IF;
  
  -- Insert comment
  INSERT INTO ota_task_comments (task_id, author_id, content, parent_id)
  VALUES (p_task_id, v_caller_id, TRIM(p_content), p_parent_id)
  RETURNING id INTO v_comment_id;
  
  RETURN json_build_object(
    'success', true,
    'comment_id', v_comment_id,
    'message', 'Comment added successfully'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLSTATE,
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ota_add_task_comment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_add_task_comment TO authenticated;

-- ============================================================
-- RPC: ota_get_task_comments
-- Returns all comments for a task
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_task_comments(
  p_task_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comments JSON;
  v_project_id UUID;
BEGIN
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can view comments'
    );
  END IF;
  
  -- Get project_id and check access
  SELECT t.project_id INTO v_project_id
  FROM ota_tasks t
  WHERE t.id = p_task_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'TASK_NOT_FOUND',
      'message', 'Task does not exist'
    );
  END IF;
  
  IF NOT has_ota_project_access(v_project_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROJECT_ACCESS_DENIED',
      'message', 'No access to this task'
    );
  END IF;
  
  SELECT COALESCE(json_agg(row_to_json(c) ORDER BY c.created_at ASC), '[]'::json)
  INTO v_comments
  FROM (
    SELECT 
      tc.id,
      tc.task_id,
      tc.author_id,
      tc.content,
      tc.parent_id,
      tc.is_edited,
      tc.edited_at,
      tc.created_at,
      COALESCE(u.raw_user_meta_data->>'full_name', u.email) as author_name,
      u.email as author_email
    FROM ota_task_comments tc
    JOIN auth.users u ON u.id = tc.author_id
    WHERE tc.task_id = p_task_id
  ) c;
  
  RETURN json_build_object(
    'success', true,
    'comments', v_comments
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLSTATE,
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_task_comments FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_task_comments TO authenticated;

-- ============================================================
-- RPC: ota_edit_task_comment
-- Edits an existing comment (author only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_edit_task_comment(
  p_comment_id UUID,
  p_content TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_author_id UUID;
BEGIN
  v_caller_id := auth.uid();
  
  -- Get comment author
  SELECT author_id INTO v_author_id
  FROM ota_task_comments
  WHERE id = p_comment_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'COMMENT_NOT_FOUND',
      'message', 'Comment does not exist'
    );
  END IF;
  
  -- Only author can edit
  IF v_author_id != v_caller_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only the author can edit this comment'
    );
  END IF;
  
  -- Validate content
  IF p_content IS NULL OR LENGTH(TRIM(p_content)) = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'EMPTY_CONTENT',
      'message', 'Comment content cannot be empty'
    );
  END IF;
  
  -- Update comment
  UPDATE ota_task_comments
  SET content = TRIM(p_content),
      is_edited = true,
      edited_at = now()
  WHERE id = p_comment_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Comment updated successfully'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLSTATE,
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ota_edit_task_comment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_edit_task_comment TO authenticated;

-- ============================================================
-- RPC: ota_delete_task_comment
-- Deletes a comment (author or Lead/Admin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_delete_task_comment(
  p_comment_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_author_id UUID;
  v_task_id UUID;
  v_project_id UUID;
BEGIN
  v_caller_id := auth.uid();
  
  -- Get comment info
  SELECT author_id, task_id INTO v_author_id, v_task_id
  FROM ota_task_comments
  WHERE id = p_comment_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'COMMENT_NOT_FOUND',
      'message', 'Comment does not exist'
    );
  END IF;
  
  -- Get project_id
  SELECT project_id INTO v_project_id
  FROM ota_tasks
  WHERE id = v_task_id;
  
  -- Author can delete their own, Lead/Admin can delete any
  IF v_author_id != v_caller_id AND NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only the author or Lead/Admin can delete this comment'
    );
  END IF;
  
  -- Delete comment (will cascade to replies)
  DELETE FROM ota_task_comments WHERE id = p_comment_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Comment deleted successfully'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLSTATE,
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ota_delete_task_comment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_delete_task_comment TO authenticated;
