-- ============================================================================
-- Add last_base_plan_generated_at column to profiles table
-- ============================================================================
-- This column tracks when the user's base plan was last generated.
-- Used to enforce the 14-day regeneration cycle.
-- ============================================================================

-- Add the column if it doesn't exist
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_base_plan_generated_at TIMESTAMPTZ NULL;

-- Add a comment explaining the column's purpose
COMMENT ON COLUMN public.profiles.last_base_plan_generated_at IS 
  'Timestamp of when the user''s base plan was last generated. Used to enforce the 14-day regeneration cycle.';

-- Backfill from existing weekly_base_plans for users who already have plans
-- Use the most recent generated_at from their weekly_base_plans
UPDATE public.profiles p
SET last_base_plan_generated_at = (
  SELECT MAX(COALESCE(wbp.generated_at, wbp.created_at))
  FROM public.weekly_base_plans wbp
  WHERE wbp.user_id = p.id
)
WHERE p.last_base_plan_generated_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.weekly_base_plans wbp WHERE wbp.user_id = p.id
  );



