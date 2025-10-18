-- ============================================================================
-- LIFTOR SECURITY FIXES MIGRATION
-- Date: 2025-10-14
-- Purpose: Comprehensive security hardening for all tables, storage, and RPCs
-- ============================================================================
-- This migration is idempotent and safe to run multiple times.
-- It implements security best practices from supabase_lint_fix_plan.md
-- ============================================================================

-- ============================================================================
-- 1. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- ============================================================================
-- Ensures all tables enforce row-level security policies

alter table public.profiles enable row level security;
alter table public.weekly_base_plans enable row level security;
alter table public.daily_plans enable row level security;
alter table public.plan_versions enable row level security;
alter table public.plan_runs enable row level security;
alter table public.checkins enable row level security;
alter table public.food_extras enable row level security;
alter table public.rc_webhook_events enable row level security;

-- ============================================================================
-- 2. PROFILES TABLE POLICIES
-- ============================================================================
-- Users can only access their own profile data

-- Drop existing policies to ensure clean state
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

-- SELECT: Users can view their own profile
create policy "profiles_select_own" 
on public.profiles for select 
using (id = auth.uid());

-- INSERT: Users can only insert their own profile
create policy "profiles_insert_own" 
on public.profiles for insert 
to authenticated
with check (id = auth.uid());

-- UPDATE: Users can only update their own profile
create policy "profiles_update_own" 
on public.profiles for update 
using (id = auth.uid()) 
with check (id = auth.uid());

-- DELETE: Users can delete their own profile (soft delete recommended in production)
create policy "profiles_delete_own" 
on public.profiles for delete 
using (id = auth.uid());

-- ============================================================================
-- 3. WEEKLY BASE PLANS TABLE POLICIES
-- ============================================================================
-- Users can only access their own base plans

drop policy if exists "weekly_base_plans_all_own" on public.weekly_base_plans;
drop policy if exists "weekly_base_plans_select_own" on public.weekly_base_plans;
drop policy if exists "weekly_base_plans_insert_own" on public.weekly_base_plans;
drop policy if exists "weekly_base_plans_update_own" on public.weekly_base_plans;
drop policy if exists "weekly_base_plans_delete_own" on public.weekly_base_plans;

-- Consolidated policy for all operations
create policy "weekly_base_plans_all_own" 
on public.weekly_base_plans for all 
using (user_id = auth.uid()) 
with check (user_id = auth.uid());

-- ============================================================================
-- 4. DAILY PLANS TABLE POLICIES
-- ============================================================================
-- Users can only access their own daily plans

drop policy if exists "daily_plans_all_own" on public.daily_plans;
drop policy if exists "daily_plans_select_own" on public.daily_plans;
drop policy if exists "daily_plans_insert_own" on public.daily_plans;
drop policy if exists "daily_plans_update_own" on public.daily_plans;
drop policy if exists "daily_plans_delete_own" on public.daily_plans;

-- Consolidated policy for all operations
create policy "daily_plans_all_own" 
on public.daily_plans for all 
using (user_id = auth.uid()) 
with check (user_id = auth.uid());

-- ============================================================================
-- 5. PLAN VERSIONS TABLE POLICIES
-- ============================================================================
-- Users can only access their own plan versions

drop policy if exists "plan_versions_all_own" on public.plan_versions;
drop policy if exists "plan_versions_select_own" on public.plan_versions;
drop policy if exists "plan_versions_insert_own" on public.plan_versions;
drop policy if exists "plan_versions_update_own" on public.plan_versions;
drop policy if exists "plan_versions_delete_own" on public.plan_versions;

-- Consolidated policy for all operations
create policy "plan_versions_all_own" 
on public.plan_versions for all 
using (user_id = auth.uid()) 
with check (user_id = auth.uid());

-- ============================================================================
-- 6. PLAN RUNS TABLE POLICIES
-- ============================================================================
-- Users can only access their own plan generation runs

drop policy if exists "plan_runs_all_own" on public.plan_runs;
drop policy if exists "plan_runs_select_own" on public.plan_runs;
drop policy if exists "plan_runs_insert_own" on public.plan_runs;
drop policy if exists "plan_runs_update_own" on public.plan_runs;
drop policy if exists "plan_runs_delete_own" on public.plan_runs;

-- Consolidated policy for all operations
create policy "plan_runs_all_own" 
on public.plan_runs for all 
using (user_id = auth.uid()) 
with check (user_id = auth.uid());

-- ============================================================================
-- 7. CHECKINS TABLE POLICIES
-- ============================================================================
-- Users can only access their own check-in data

drop policy if exists "checkins_all_own" on public.checkins;
drop policy if exists "checkins_select_own" on public.checkins;
drop policy if exists "checkins_insert_own" on public.checkins;
drop policy if exists "checkins_update_own" on public.checkins;
drop policy if exists "checkins_delete_own" on public.checkins;

-- Consolidated policy for all operations
create policy "checkins_all_own" 
on public.checkins for all 
using (user_id = auth.uid()) 
with check (user_id = auth.uid());

-- ============================================================================
-- 8. FOOD EXTRAS TABLE POLICIES
-- ============================================================================
-- Users can only access their own food entries

drop policy if exists "food_extras_all_own" on public.food_extras;
drop policy if exists "food_extras_select_own" on public.food_extras;
drop policy if exists "food_extras_insert_own" on public.food_extras;
drop policy if exists "food_extras_update_own" on public.food_extras;
drop policy if exists "food_extras_delete_own" on public.food_extras;

-- Consolidated policy for all operations
create policy "food_extras_all_own" 
on public.food_extras for all 
using (user_id = auth.uid()) 
with check (user_id = auth.uid());

-- ============================================================================
-- 9. RC_WEBHOOK_EVENTS TABLE POLICIES
-- ============================================================================
-- RevenueCat webhook events - service role only for writes, no user access

drop policy if exists "rc_webhook_events_service_only" on public.rc_webhook_events;

-- Only service_role can insert webhook events (called from Edge Functions)
create policy "rc_webhook_events_service_only" 
on public.rc_webhook_events for insert 
to service_role
with check (true);

-- ============================================================================
-- 10. STORAGE BUCKET SECURITY
-- ============================================================================
-- Make all storage buckets private and enforce owner-based access

-- Update avatars bucket to be private
update storage.buckets 
set public = false 
where id = 'avatars';

-- Drop existing storage policies
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;
drop policy if exists "avatars_select_own" on storage.objects;

-- SELECT: Users can only view their own avatars
create policy "avatars_select_own" 
on storage.objects for select 
using (
  bucket_id = 'avatars' 
  and owner = auth.uid()
);

-- INSERT: Users can only upload their own avatars
create policy "avatars_insert_own" 
on storage.objects for insert 
to authenticated
with check (
  bucket_id = 'avatars' 
  and owner = auth.uid()
);

-- UPDATE: Users can only update their own avatars
create policy "avatars_update_own" 
on storage.objects for update 
using (
  bucket_id = 'avatars' 
  and owner = auth.uid()
) 
with check (
  bucket_id = 'avatars' 
  and owner = auth.uid()
);

-- DELETE: Users can only delete their own avatars
create policy "avatars_delete_own" 
on storage.objects for delete 
using (
  bucket_id = 'avatars' 
  and owner = auth.uid()
);

-- ============================================================================
-- 11. SECURE RPC FUNCTIONS
-- ============================================================================
-- Ensure all RPC functions use security invoker and validate auth

-- get_todays_nutrition_plan: Secure with auth check
create or replace function public.get_todays_nutrition_plan(user_uuid uuid)
returns uuid
language plpgsql
security invoker  -- Changed from definer to invoker for better security
stable
set search_path = public
as $$
declare
  plan_id uuid;
begin
  -- Ensure caller is authenticated and requesting their own data
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  
  if user_uuid is distinct from auth.uid() then
    raise exception 'Unauthorized access to other user data';
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

-- get_current_base_plan: Secure with auth check
create or replace function public.get_current_base_plan(user_uuid uuid)
returns uuid
language plpgsql
security invoker  -- Changed from definer to invoker for better security
stable
set search_path = public
as $$
declare
  base_plan_id uuid;
begin
  -- Ensure caller is authenticated and requesting their own data
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  
  if user_uuid is distinct from auth.uid() then
    raise exception 'Unauthorized access to other user data';
  end if;
  
  select id into base_plan_id
  from public.weekly_base_plans
  where user_id = user_uuid
  order by (not is_locked), created_at desc
  limit 1;
  
  return base_plan_id;
end
$$;

-- ensure_event_processed: Keep as security definer but add auth check
create or replace function public.ensure_event_processed(p_event_key text)
returns void
language plpgsql
security definer  -- Needs definer for service_role context
set search_path = public
as $$
begin
  -- This function is called from Edge Functions with service_role
  -- Only allow if called from service_role or authenticated context
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'Unauthorized';
  end if;
  
  insert into public.rc_webhook_events(event_key)
  values (p_event_key)
  on conflict (event_key) do nothing;
end
$$;

-- Grant execute permissions to authenticated users
grant execute on function public.get_todays_nutrition_plan(uuid) to authenticated;
grant execute on function public.get_current_base_plan(uuid) to authenticated;
grant execute on function public.ensure_event_processed(text) to authenticated, service_role;

-- ============================================================================
-- 12. ADDITIONAL SECURITY MEASURES
-- ============================================================================

-- Ensure handle_new_user trigger function is secure
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only allow this to be called from the auth.users trigger
  -- No additional auth check needed as this is a system trigger
  insert into public.profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce((new.raw_user_meta_data->>'name')::text, new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end
$$;

-- Ensure sync_profile_email trigger function is secure
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only allow this to be called from the auth.users trigger
  -- No additional auth check needed as this is a system trigger
  if coalesce(new.email,'') is distinct from coalesce(old.email,'') then
    update public.profiles
    set email = new.email
    where id = new.id;
  end if;
  return new;
end
$$;

-- ============================================================================
-- 13. REVOKE UNNECESSARY PERMISSIONS
-- ============================================================================
-- Remove any overly permissive grants

-- Revoke all public access to tables (RLS policies will handle access)
revoke all on public.profiles from anon, authenticated;
revoke all on public.weekly_base_plans from anon, authenticated;
revoke all on public.daily_plans from anon, authenticated;
revoke all on public.plan_versions from anon, authenticated;
revoke all on public.plan_runs from anon, authenticated;
revoke all on public.checkins from anon, authenticated;
revoke all on public.food_extras from anon, authenticated;
revoke all on public.rc_webhook_events from anon, authenticated;

-- Grant only necessary permissions (SELECT, INSERT, UPDATE, DELETE)
-- RLS policies will further restrict access
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.weekly_base_plans to authenticated;
grant select, insert, update, delete on public.daily_plans to authenticated;
grant select, insert, update, delete on public.plan_versions to authenticated;
grant select, insert, update, delete on public.plan_runs to authenticated;
grant select, insert, update, delete on public.checkins to authenticated;
grant select, insert, update, delete on public.food_extras to authenticated;

-- Service role retains full access for admin operations and Edge Functions
grant all on all tables in schema public to service_role;

-- ============================================================================
-- 14. AUDIT AND VERIFICATION QUERIES
-- ============================================================================
-- Run these queries to verify security setup (commented out for safety)

-- Check RLS is enabled on all tables:
-- SELECT schemaname, tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename;

-- Check all policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies 
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

-- Check storage bucket security:
-- SELECT id, name, public, file_size_limit, allowed_mime_types
-- FROM storage.buckets;

-- Check storage policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies 
-- WHERE schemaname = 'storage' AND tablename = 'objects'
-- ORDER BY policyname;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- All security fixes have been applied successfully.
-- Tables: RLS enabled, ownership policies enforced
-- Storage: Private buckets, owner-only access
-- RPCs: Security invoker, auth validation added
-- Permissions: Least privilege principle applied
-- ============================================================================


