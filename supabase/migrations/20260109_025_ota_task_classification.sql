-- ============================================================
-- OTA OPERATIONS MODULE - 025: TASK CLASSIFICATION
-- ============================================================
-- Date: 2026-01-09
-- Purpose: Add task classification to categorize work types
-- 
-- Classification values:
--   EXECUTION - Tác vụ thực thi (upload content, reply guest...)
--   PREP      - Chuẩn bị (thu thập info, chờ input)  
--   AUTO      - Tự động hóa (script runs)
--   OPS       - Vận hành nội bộ (meeting, report...)
--
-- Rollback:
--   ALTER TABLE ota_tasks DROP COLUMN IF EXISTS classification;
--   DROP TYPE IF EXISTS ota_task_classification;
-- ============================================================

-- ============================================================
-- STEP 1: Create enum type (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_task_classification') THEN
    CREATE TYPE public.ota_task_classification AS ENUM (
      'EXECUTION',  -- Tác vụ thực thi (upload content, reply guest...)
      'PREP',       -- Chuẩn bị (thu thập info, chờ input)
      'AUTO',       -- Tự động hóa (script runs)
      'OPS'         -- Vận hành nội bộ (meeting, report...)
    );
    RAISE NOTICE 'Created enum type ota_task_classification';
  ELSE
    RAISE NOTICE 'Enum type ota_task_classification already exists, skipping';
  END IF;
END$$;

-- ============================================================
-- STEP 2: Add column to ota_tasks (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_tasks' 
    AND column_name = 'classification'
  ) THEN
    ALTER TABLE public.ota_tasks 
    ADD COLUMN classification public.ota_task_classification DEFAULT 'EXECUTION';
    RAISE NOTICE 'Added classification column to ota_tasks';
  ELSE
    RAISE NOTICE 'Column classification already exists on ota_tasks';
  END IF;
END$$;

-- ============================================================
-- STEP 3: Create index for filtering
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ota_tasks_classification 
ON public.ota_tasks(classification);

-- ============================================================
-- STEP 4: Create partial indexes for common queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ota_tasks_classification_execution 
ON public.ota_tasks(project_id, status) 
WHERE classification = 'EXECUTION';

CREATE INDEX IF NOT EXISTS idx_ota_tasks_classification_ops 
ON public.ota_tasks(project_id, status) 
WHERE classification = 'OPS';

-- ============================================================
-- STEP 5: Comment for documentation
-- ============================================================
COMMENT ON COLUMN public.ota_tasks.classification IS 
  'Task classification: EXECUTION (thực thi), PREP (chuẩn bị), AUTO (tự động), OPS (vận hành)';

-- ============================================================
-- STEP 6: Audit log trigger for classification changes
-- (Uses existing ota_audit_trigger, no additional trigger needed)
-- ============================================================

RAISE NOTICE 'Migration 025_ota_task_classification completed successfully';
