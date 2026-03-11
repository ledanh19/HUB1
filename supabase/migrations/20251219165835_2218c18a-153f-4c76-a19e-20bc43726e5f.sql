-- Add unique constraint on provider_rate_plan_id to prevent duplicates
ALTER TABLE rate_plans_mirror 
ADD CONSTRAINT rate_plans_mirror_provider_rate_plan_id_key 
UNIQUE (provider_rate_plan_id);