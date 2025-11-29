-- ============================================================================
-- Purge User Data (Preserve Subscription Data)
-- Date: 2025-10-25
-- Creates an idempotent function to delete all app data for a user while
-- preserving subscription-related data (profiles.rc_*, profiles.subscription_*,
-- rc_webhook_events) and keeping the profile row.
-- ============================================================================

create or replace function public.purge_user_data(target_user uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := target_user;
begin
  -- Require an authenticated caller unless executed with service role
  if uid is null then
    raise exception 'Not authorized (no user)';
  end if;

  -- Delete user-owned app data (plans, logs, extras, feedback, tokens)
  delete from public.food_extras where user_id = uid;
  delete from public.plan_versions where user_id = uid;
  delete from public.daily_plans where user_id = uid;
  delete from public.plan_runs where user_id = uid;
  delete from public.weekly_base_plans where user_id = uid;
  delete from public.checkins where user_id = uid;
  delete from public.cancellation_feedback where user_id = uid;
  delete from public.push_tokens where user_id = uid;

  -- Keep rc_webhook_events (subscription audit log)

  -- Wipe non-subscription fields on profile but keep subscription-related columns intact
  update public.profiles set
    name = '',
    goal = null,
    equipment = '{}',
    dietary_prefs = '{}',
    dietary_notes = null,
    training_days = null,
    timezone = null,
    onboarding_complete = false,
    age = null,
    sex = null,
    height = null,
    weight = null,
    activity_level = null,
    daily_calorie_target = null,
    goal_weight = null,
    supplements = '{}',
    supplement_notes = null,
    personal_goals = '{}',
    perceived_lacks = '{}',
    preferred_exercises = '{}',
    avoid_exercises = '{}',
    preferred_training_time = null,
    session_length = null,
    travel_days = null,
    fasting_window = null,
    meal_count = null,
    injuries = null,
    budget_constraints = null,
    wake_time = null,
    sleep_time = null,
    step_target = null,
    caffeine_frequency = null,
    alcohol_frequency = null,
    stress_baseline = null,
    sleep_quality_baseline = null,
    preferred_workout_split = null,
    special_requests = null,
    vmn_transcription = null,
    workout_intensity = null,
    base_plan = null,
    updated_at = now()
  where id = uid;
end
$$;

grant execute on function public.purge_user_data(uuid) to authenticated, service_role;



