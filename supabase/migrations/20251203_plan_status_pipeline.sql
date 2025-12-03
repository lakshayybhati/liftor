-- ============================================================================
-- Plan Status Pipeline + Cycle Guards
-- ============================================================================
-- Adds canonical week-cycle tracking and plan status management so that each
-- user can only have one plan per week and one active plan overall.
-- ============================================================================

-- 1. Enum for plan lifecycle
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'weekly_plan_status') THEN
    CREATE TYPE public.weekly_plan_status AS ENUM (
      'pending',
      'generating',
      'generated',
      'active',
      'archived'
    );
  END IF;
END $$;

-- 2. Extend weekly_base_plans with status + cycle metadata
ALTER TABLE public.weekly_base_plans
  ADD COLUMN IF NOT EXISTS status public.weekly_plan_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS week_start_date DATE NOT NULL DEFAULT (date_trunc('week', timezone('utc', now()))::date),
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Forward reference to plan jobs for provenance tracking
ALTER TABLE public.weekly_base_plans
  ADD COLUMN IF NOT EXISTS generation_job_id UUID REFERENCES public.plan_generation_jobs(id) ON DELETE SET NULL;

-- 3. Track cycle + plan linkage on plan_generation_jobs
ALTER TABLE public.plan_generation_jobs
  ADD COLUMN IF NOT EXISTS cycle_week_start_date DATE DEFAULT (date_trunc('week', timezone('utc', now()))::date),
  ADD COLUMN IF NOT EXISTS target_plan_id UUID REFERENCES public.weekly_base_plans(id) ON DELETE SET NULL;

-- 4. Backfill existing weekly plans with sane defaults
UPDATE public.weekly_base_plans
SET week_start_date = date_trunc('week', timezone('utc', created_at))::date
WHERE week_start_date IS NULL;

UPDATE public.weekly_base_plans
SET status = CASE
  WHEN COALESCE(is_locked, false) = false THEN 'active'::public.weekly_plan_status
  ELSE 'archived'::public.weekly_plan_status
END,
generated_at = COALESCE(generated_at, created_at),
activated_at = CASE
  WHEN COALESCE(is_locked, false) = false THEN COALESCE(activated_at, created_at)
  ELSE activated_at
END
WHERE status = 'pending'::public.weekly_plan_status;

-- 5. Backfill plan jobs cycle metadata
UPDATE public.plan_generation_jobs
SET cycle_week_start_date = date_trunc('week', timezone('utc', created_at))::date
WHERE cycle_week_start_date IS NULL;

-- 6. Clean up duplicate plans per user/week (keep the most recent one)
DELETE FROM public.weekly_base_plans a
USING public.weekly_base_plans b
WHERE a.user_id = b.user_id
  AND a.week_start_date = b.week_start_date
  AND a.created_at < b.created_at;

-- 7. Enforce uniqueness constraints
CREATE UNIQUE INDEX IF NOT EXISTS uniq_weekly_plan_per_user_week
  ON public.weekly_base_plans(user_id, week_start_date);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_plan_per_user
  ON public.weekly_base_plans(user_id)
  WHERE status = 'active'::public.weekly_plan_status;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_plan_job_per_cycle
  ON public.plan_generation_jobs(user_id, cycle_week_start_date)
  WHERE status IN ('pending', 'processing');

