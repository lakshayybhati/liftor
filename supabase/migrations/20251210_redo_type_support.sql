-- Add redo_type column to plan_generation_jobs
-- This allows users to choose to redo only workout, only nutrition, or both
ALTER TABLE public.plan_generation_jobs
  ADD COLUMN IF NOT EXISTS redo_type TEXT DEFAULT 'both';

-- Add comment explaining the column
COMMENT ON COLUMN public.plan_generation_jobs.redo_type IS 'Type of redo: workout, nutrition, or both';


