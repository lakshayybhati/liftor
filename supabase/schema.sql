create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

do $$ begin
  if not exists (select 1 from pg_type where typname = 'goal_type') then
    create type public.goal_type as enum ('WEIGHT_LOSS','MUSCLE_GAIN','ENDURANCE','GENERAL_FITNESS','FLEXIBILITY_MOBILITY');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'sex_type') then
    create type public.sex_type as enum ('Male','Female');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'activity_level_type') then
    create type public.activity_level_type as enum ('Sedentary','Lightly Active','Moderately Active','Very Active','Extra Active');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'checkin_mode_type') then
    create type public.checkin_mode_type as enum ('LOW','HIGH','PRO');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  goal public.goal_type null,
  equipment text[] not null default '{}',
  dietary_prefs text[] not null default '{}',
  dietary_notes text null,
  training_days int null,
  timezone text null,
  onboarding_complete boolean null default false,
  age int null,
  sex public.sex_type null,
  height int null,
  weight int null,
  activity_level public.activity_level_type null,
  daily_calorie_target int null,
  goal_weight int null,
  supplements text[] not null default '{}',
  supplement_notes text null,
  personal_goals text[] not null default '{}',
  perceived_lacks text[] not null default '{}',
  preferred_exercises text[] not null default '{}',
  avoid_exercises text[] not null default '{}',
  preferred_training_time text null,
  session_length int null,
  travel_days int null,
  fasting_window text null,
  meal_count int null,
  injuries text null,
  budget_constraints text null,
  wake_time text null,
  sleep_time text null,
  step_target int null,
  caffeine_frequency text null,
  alcohol_frequency text null,
  stress_baseline int null,
  sleep_quality_baseline int null,
  preferred_workout_split text null,
  special_requests text null,
  vmn_transcription text null,
  workout_intensity text null,
  base_plan jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email)
);

-- Ensure legacy instances of food_extras have required columns before creating indexes
do $$ begin
  -- Add source column if missing (used by index below)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='food_extras' and column_name='source'
  ) then
    alter table public.food_extras add column source text;
    update public.food_extras set source = 'manual' where source is null;
    -- add check constraint if not present
    if not exists (
      select 1 from pg_constraint where conname = 'food_extras_source_check'
    ) then
      alter table public.food_extras add constraint food_extras_source_check check (source in ('manual','snap'));
    end if;
    alter table public.food_extras alter column source set not null;
  end if;
end $$;

-- Ensure columns exist for legacy tables (backfill and defaults)
do $$ begin
  -- occurred_at_utc
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='food_extras' and column_name='occurred_at_utc'
  ) then
    alter table public.food_extras add column occurred_at_utc timestamptz;
    -- backfill from legacy "date" column if present
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='food_extras' and column_name='date'
    ) then
      update public.food_extras set occurred_at_utc = date where occurred_at_utc is null;
    end if;
    update public.food_extras set occurred_at_utc = now() where occurred_at_utc is null;
    alter table public.food_extras alter column occurred_at_utc set not null;
    alter table public.food_extras alter column occurred_at_utc set default now();
  end if;

  -- day_key_local
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='food_extras' and column_name='day_key_local'
  ) then
    alter table public.food_extras add column day_key_local date;
    -- compute from occurred_at_utc if available; else fallback to legacy date
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='food_extras' and column_name='occurred_at_utc'
    ) then
      update public.food_extras
      set day_key_local = (occurred_at_utc at time zone 'Asia/Kolkata')::date
      where day_key_local is null;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='food_extras' and column_name='date'
    ) then
      update public.food_extras
      set day_key_local = (date at time zone 'Asia/Kolkata')::date
      where day_key_local is null;
    end if;
    update public.food_extras
    set day_key_local = (now() at time zone 'Asia/Kolkata')::date
    where day_key_local is null;
    alter table public.food_extras alter column day_key_local set not null;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_set_updated_at') then
    create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.weekly_base_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  days jsonb not null,
  is_locked boolean not null default false,
  version int not null default 1
);

create index if not exists idx_weekly_base_plans_user_created on public.weekly_base_plans(user_id, created_at desc);
create index if not exists idx_weekly_base_plans_user_locked on public.weekly_base_plans(user_id, is_locked);

create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  workout jsonb,
  nutrition jsonb,
  recovery jsonb,
  motivation text,
  adherence numeric,
  adjustments text[] not null default '{}',
  nutrition_adjustments text[] not null default '{}',
  memory_adjustments text[] not null default '{}',
  is_from_base_plan boolean not null default false,
  is_ai_adjusted boolean not null default false,
  flags text[] not null default '{}',
  memory jsonb null,
  base_plan_id uuid null references public.weekly_base_plans(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, date)
);

-- Migration: Add is_ai_adjusted and flags columns if they don't exist
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='daily_plans' and column_name='is_ai_adjusted'
  ) then
    alter table public.daily_plans add column is_ai_adjusted boolean not null default false;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='daily_plans' and column_name='flags'
  ) then
    alter table public.daily_plans add column flags text[] not null default '{}';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='daily_plans' and column_name='nutrition_adjustments'
  ) then
    alter table public.daily_plans add column nutrition_adjustments text[] not null default '{}';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'daily_plans_set_updated_at') then
    create trigger daily_plans_set_updated_at before update on public.daily_plans for each row execute function public.set_updated_at();
  end if;
end $$;

create index if not exists idx_daily_plans_user_date on public.daily_plans(user_id, date desc);

create table if not exists public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.daily_plans(id) on delete cascade,
  version int not null,
  plan jsonb not null,
  created_at timestamptz not null default now(),
  unique(plan_id, version)
);

create index if not exists idx_plan_versions_user on public.plan_versions(user_id);

create table if not exists public.plan_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_type text not null,
  status text not null default 'success',
  request jsonb,
  response jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_plan_runs_user_created on public.plan_runs(user_id, created_at desc);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode public.checkin_mode_type not null,
  date date not null,
  body_weight numeric,
  current_weight numeric,
  mood text,
  mood_character text,
  energy int,
  sleep_hrs numeric,
  sleep_quality int,
  woke_feeling text,
  soreness text[],
  appearance text,
  digestion text,
  stress int,
  water_l numeric,
  salt_yn boolean,
  supps_yn boolean,
  steps int,
  kcal_est int,
  caffeine_yn boolean,
  alcohol_yn boolean,
  motivation int,
  hr int,
  hrv int,
  injuries text,
  busy_blocks jsonb,
  travel_yn boolean,
  workout_intensity int,
  yesterday_workout_quality int,
  special_request text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, date)
);

-- Migration: Add yesterday_workout_quality and special_request columns if they don't exist
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='checkins' and column_name='yesterday_workout_quality'
  ) then
    alter table public.checkins add column yesterday_workout_quality int;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='checkins' and column_name='special_request'
  ) then
    alter table public.checkins add column special_request text;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'checkins_set_updated_at') then
    create trigger checkins_set_updated_at before update on public.checkins for each row execute function public.set_updated_at();
  end if;
end $$;

create index if not exists idx_checkins_user_date on public.checkins(user_id, date desc);

create table if not exists public.food_extras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- historical column kept for compatibility; prefer occurred_at_utc + day_key_local
  nutrition_plan_id uuid null references public.daily_plans(id) on delete set null,
  -- new canonical time fields
  occurred_at_utc timestamptz not null default now(),
  day_key_local date not null,
  name text not null,
  calories int not null check (calories >= 0),
  protein numeric not null check (protein >= 0),
  carbs numeric not null check (carbs >= 0),
  fat numeric not null check (fat >= 0),
  portion text null,
  portion_weight_g numeric null,
  -- migrated from image_url -> image_path (no public URLs)
  image_path text null,
  confidence numeric null check (confidence >= 0 and confidence <= 1),
  notes text null,
  -- auditing
  source text not null default 'manual' check (source in ('manual','snap')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- idempotency key (per user)
  idempotency_key text null,
  -- optional nutrition mapping
  food_id uuid null
);

-- Backwards compatible indexes
-- Ensure legacy instances have columns referenced by indexes
do $$ begin
  -- idempotency_key (for unique index)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='food_extras' and column_name='idempotency_key'
  ) then
    alter table public.food_extras add column idempotency_key text;
  end if;
  -- source (for day+source index)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='food_extras' and column_name='source'
  ) then
    alter table public.food_extras add column source text;
    update public.food_extras set source = 'manual' where source is null;
    if not exists (select 1 from pg_constraint where conname = 'food_extras_source_check') then
      alter table public.food_extras add constraint food_extras_source_check check (source in ('manual','snap'));
    end if;
    alter table public.food_extras alter column source set not null;
  end if;
end $$;

create index if not exists idx_food_extras_user_date on public.food_extras(user_id, occurred_at_utc desc);
create index if not exists idx_food_extras_plan on public.food_extras(nutrition_plan_id);
create index if not exists food_extras_user_day_idx on public.food_extras(user_id, day_key_local desc);
create index if not exists food_extras_user_day_source_idx on public.food_extras(user_id, day_key_local desc, source);
create unique index if not exists food_extras_user_idem_uniq on public.food_extras(user_id, idempotency_key);

alter table public.profiles enable row level security;
alter table public.weekly_base_plans enable row level security;
alter table public.daily_plans enable row level security;
alter table public.plan_versions enable row level security;
alter table public.plan_runs enable row level security;
alter table public.checkins enable row level security;
alter table public.food_extras enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own') then
    create policy profiles_select_own on public.profiles for select using (id = auth.uid());
  end if;
end $$;

-- Idempotency helper for RevenueCat webhooks
do $$ begin
  if not exists (select 1 from information_schema.tables where table_name = 'rc_webhook_events' and table_schema = 'public') then
    create table public.rc_webhook_events (
      event_key text primary key,
      created_at timestamptz not null default now()
    );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'ensure_event_processed' and n.nspname = 'public'
  ) then
    create or replace function public.ensure_event_processed(p_event_key text)
    returns void
    language plpgsql
    security definer
    as $fn$
    begin
      insert into public.rc_webhook_events(event_key)
      values (p_event_key)
      on conflict (event_key) do nothing;
    end;
    $fn$;
    grant execute on function public.ensure_event_processed(text) to authenticated, service_role, anon;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_own') then
    create policy profiles_insert_own on public.profiles for insert with check (id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own') then
    create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='weekly_base_plans' and policyname='weekly_base_plans_all_own') then
    create policy weekly_base_plans_all_own on public.weekly_base_plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='daily_plans' and policyname='daily_plans_all_own') then
    create policy daily_plans_all_own on public.daily_plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='plan_versions' and policyname='plan_versions_all_own') then
    create policy plan_versions_all_own on public.plan_versions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='plan_runs' and policyname='plan_runs_all_own') then
    create policy plan_runs_all_own on public.plan_runs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='checkins' and policyname='checkins_all_own') then
    create policy checkins_all_own on public.checkins for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='food_extras' and policyname='food_extras_all_own') then
    create policy food_extras_all_own on public.food_extras for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

create or replace function public.get_todays_nutrition_plan(user_uuid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_id uuid;
begin
  if user_uuid is distinct from auth.uid() then
    return null;
  end if;
  select dp.id into plan_id
  from public.daily_plans dp
  where dp.user_id = user_uuid
    and dp.date = (now() at time zone 'UTC')::date
  order by dp.created_at desc
  limit 1;
  return plan_id;
end
$$;

create or replace function public.get_current_base_plan(user_uuid uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id
  from public.weekly_base_plans
  where user_id = user_uuid
  order by (not is_locked), created_at desc
  limit 1;
$$;

insert into storage.buckets (id, name, public)
values ('avatars','avatars', true)
on conflict (id) do nothing;

-- Private bucket for food snaps
insert into storage.buckets (id, name, public)
values ('food_snaps','food_snaps', false)
on conflict (id) do nothing;

-- Optional canonical foods for nutrition mapping
create table if not exists public.canonical_foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  alt_names text[] not null default '{}',
  portion_unit text null,
  kcal_per_100g numeric null,
  protein_per_100g numeric null,
  carbs_per_100g numeric null,
  fat_per_100g numeric null
);
alter table public.canonical_foods enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='canonical_foods' and policyname='canonical_foods_select_all') then
    create policy canonical_foods_select_all on public.canonical_foods for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_public_read') then
    create policy avatars_public_read on storage.objects for select using (bucket_id = 'avatars');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_insert_own') then
    create policy avatars_insert_own on storage.objects for insert with check (bucket_id = 'avatars' and owner = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_update_own') then
    create policy avatars_update_own on storage.objects for update using (bucket_id = 'avatars' and owner = auth.uid()) with check (bucket_id = 'avatars' and owner = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_delete_own') then
    create policy avatars_delete_own on storage.objects for delete using (bucket_id = 'avatars' and owner = auth.uid());
  end if;
end $$;

-- RLS for private bucket food_snaps
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='food_snaps_read_own') then
    create policy food_snaps_read_own on storage.objects for select using (bucket_id = 'food_snaps' and owner = auth.uid());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='food_snaps_insert_own') then
    create policy food_snaps_insert_own on storage.objects for insert with check (bucket_id = 'food_snaps' and owner = auth.uid());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='food_snaps_update_own') then
    create policy food_snaps_update_own on storage.objects for update using (bucket_id = 'food_snaps' and owner = auth.uid()) with check (bucket_id = 'food_snaps' and owner = auth.uid());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='food_snaps_delete_own') then
    create policy food_snaps_delete_own on storage.objects for delete using (bucket_id = 'food_snaps' and owner = auth.uid());
  end if;
end $$;


-- RevenueCat subscription tracking fields (idempotent)
alter table public.profiles
  add column if not exists rc_app_user_id text null,
  add column if not exists rc_customer_id text null,
  add column if not exists rc_entitlements text[] not null default '{}',
  add column if not exists subscription_active boolean not null default false,
  add column if not exists subscription_platform text null,
  add column if not exists subscription_will_renew boolean null,
  add column if not exists subscription_expiration_at timestamptz null,
  add column if not exists subscription_renewal_at timestamptz null,
  add column if not exists last_rc_event jsonb null;





-- Auto-create and maintain public.profiles for new/auth users (idempotent)
do $$ begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'handle_new_user' and n.nspname = 'public'
  ) then
    create or replace function public.handle_new_user()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      insert into public.profiles (id, email, name)
      values (
        new.id,
        coalesce(new.email, ''),
        coalesce((new.raw_user_meta_data->>'name')::text, new.email, '')
      )
      on conflict (id) do nothing;
      return new;
    end;
    $fn$;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'sync_profile_email' and n.nspname = 'public'
  ) then
    create or replace function public.sync_profile_email()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      if coalesce(new.email,'') is distinct from coalesce(old.email,'') then
        update public.profiles
        set email = new.email
        where id = new.id;
      end if;
      return new;
    end;
    $fn$;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_email_updated') then
    create trigger on_auth_user_email_updated
    after update of email on auth.users
    for each row execute function public.sync_profile_email();
  end if;
end $$;

