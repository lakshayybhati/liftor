-- ============================================================================
-- Redo Plan Support Migration
-- ============================================================================
-- Adds columns to track redo requests:
-- - Each plan can only be redone ONCE before user clicks "Start My Journey"
-- - Once activated, no more redos allowed
-- ============================================================================

-- 1. Add redo tracking columns to weekly_base_plans
ALTER TABLE public.weekly_base_plans
  ADD COLUMN IF NOT EXISTS redo_used BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS redo_reason TEXT,
  ADD COLUMN IF NOT EXISTS original_plan_id UUID REFERENCES public.weekly_base_plans(id) ON DELETE SET NULL;

-- 2. Add redo tracking to plan_generation_jobs
ALTER TABLE public.plan_generation_jobs
  ADD COLUMN IF NOT EXISTS request_reason TEXT,
  ADD COLUMN IF NOT EXISTS source_plan_id UUID REFERENCES public.weekly_base_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_redo BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Index for efficient redo eligibility checks
CREATE INDEX IF NOT EXISTS idx_weekly_plans_redo_eligible
  ON public.weekly_base_plans(user_id, status, redo_used)
  WHERE status IN ('pending'::public.weekly_plan_status, 'generating'::public.weekly_plan_status, 'generated'::public.weekly_plan_status) AND redo_used = FALSE;

-- 4. Comment for documentation
COMMENT ON COLUMN public.weekly_base_plans.redo_used IS 'TRUE after user has used their one-time redo for this plan';
COMMENT ON COLUMN public.weekly_base_plans.redo_reason IS 'User feedback text (max 50 words) for the redo request';
COMMENT ON COLUMN public.plan_generation_jobs.is_redo IS 'TRUE if this job is a redo of an existing plan';
COMMENT ON COLUMN public.plan_generation_jobs.request_reason IS 'User feedback for redo requests';
COMMENT ON COLUMN public.plan_generation_jobs.source_plan_id IS 'The plan being redone (contains the original days data)';

