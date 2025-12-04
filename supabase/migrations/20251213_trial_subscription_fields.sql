-- Migration: Add local trial and discount eligibility fields to profiles table
-- This supports the server-timed 3-day local trial and 30% immediate-pay discount system

-- Add trial fields
alter table public.profiles
  add column if not exists trial_type text null default 'none',
  add column if not exists trial_active boolean not null default false,
  add column if not exists trial_started_at timestamptz null,
  add column if not exists trial_ends_at timestamptz null,
  add column if not exists has_had_local_trial boolean not null default false;

-- Add discount eligibility fields
alter table public.profiles
  add column if not exists discount_eligible_immediate boolean not null default true,
  add column if not exists discount_used_at timestamptz null;

-- Add check constraint for trial_type (idempotent)
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_trial_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_trial_type_check
      check (trial_type is null or trial_type in ('none', 'local', 'storekit'));
  end if;
end $$;

-- Index for trial expiration cron job (find users with active local trials)
create index if not exists idx_profiles_trial_expiration
  on public.profiles(trial_active, trial_ends_at)
  where trial_type = 'local' and trial_active = true;

-- Index for discount eligibility queries
create index if not exists idx_profiles_discount_eligible
  on public.profiles(discount_eligible_immediate)
  where discount_eligible_immediate = true;

-- Comment on columns for documentation
comment on column public.profiles.trial_type is 'Type of trial: none, local (app-managed 3-day), or storekit (Apple-managed)';
comment on column public.profiles.trial_active is 'Whether the user currently has an active trial';
comment on column public.profiles.trial_started_at is 'When the trial started (server time)';
comment on column public.profiles.trial_ends_at is 'When the trial ends (server time)';
comment on column public.profiles.has_had_local_trial is 'Whether user has ever used their one-time local trial';
comment on column public.profiles.discount_eligible_immediate is 'Whether user is eligible for 30% immediate-pay discount';
comment on column public.profiles.discount_used_at is 'When the discount was used';


