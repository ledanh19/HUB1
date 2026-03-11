-- Add INTERNAL_OPS to ota_work_type enum for Ops Bucket projects
ALTER TYPE ota_work_type ADD VALUE IF NOT EXISTS 'INTERNAL_OPS';