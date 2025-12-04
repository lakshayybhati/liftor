-- ============================================================================
-- Adjust weekly_base_plans unique index to allow archived history
-- ============================================================================
-- Context:
-- - We want to keep a full history of base plans for each user, including
--   archived plans that were replaced via forceRegenerate (14‑day reset).
-- - The original unique index `uniq_weekly_plan_per_user_week` enforced
--   a hard limit of ONE plan per (user_id, week_start_date), regardless of
--   status. This caused errors when:
--     1) A plan existed for the current cycle/week, and
--     2) The create-plan-job Edge Function was called with forceRegenerate=true,
--        which archives the existing plan and attempts to insert a new one
--        for the same (user_id, week_start_date).
-- - Because the archived plan still participated in the unique index, the
--   insert raised a `duplicate key value violates unique constraint` error,
--   surfacing to the client as:
--       "Edge Function returned a non-2xx status code"
--   and blocking base plan regeneration from Program Settings.
--
-- Fix:
-- - Replace the old unique index with a PARTIAL unique index that only applies
--   to NON-ARCHIVED plans. This preserves the invariant of "at most one active
--   or generating plan per user per week" while allowing any number of
--   archived historical plans for the same week.
-- ============================================================================

-- Drop the old (non‑partial) unique index if it exists
DROP INDEX IF EXISTS uniq_weekly_plan_per_user_week;

-- Recreate as a partial unique index that ignores archived plans
CREATE UNIQUE INDEX IF NOT EXISTS uniq_weekly_plan_per_user_week
ON public.weekly_base_plans(user_id, week_start_date)
WHERE status <> 'archived'::public.weekly_plan_status;



