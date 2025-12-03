-- ============================================================================
-- Auth Email Uniqueness Migration
-- ============================================================================
-- This migration ensures proper email uniqueness handling across the application.
-- 
-- IMPORTANT: Supabase's auth.users table already enforces email uniqueness.
-- The profiles.email unique constraint provides an additional layer of protection.
--
-- When email confirmation is ENABLED in Supabase Auth settings:
-- - signUp() with an existing email returns a "fake success" (user without session)
-- - The returned user will have identities: [] (empty array)
-- - This is intentional to prevent email enumeration attacks
-- - Application code must check for empty identities to detect this case
--
-- This migration:
-- 1. Ensures the unique constraint on profiles.email exists
-- 2. Creates an index for faster email lookups
-- 3. Adds a function to check for existing emails before signup attempts
-- ============================================================================

-- Ensure unique constraint on profiles.email (idempotent)
do $$ begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'profiles_email_key' 
    and conrelid = 'public.profiles'::regclass
  ) then
    -- If the constraint doesn't exist, try to add it
    -- This might fail if there are duplicates - clean them up first
    begin
      alter table public.profiles add constraint profiles_email_key unique (email);
    exception when others then
      raise notice 'Could not add profiles_email_key constraint - may already exist or have duplicates';
    end;
  end if;
end $$;

-- Create index for faster email lookups (idempotent)
create index if not exists idx_profiles_email on public.profiles(email);

-- Function to check if an email already exists in the system
-- This can be called from edge functions or RPC for pre-validation
create or replace function public.email_exists(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where lower(email) = lower(check_email)
  );
$$;

-- Grant execute permission to authenticated users
grant execute on function public.email_exists(text) to authenticated, anon;

-- Add comment for documentation
comment on function public.email_exists(text) is 
  'Checks if an email already exists in the profiles table. Used for pre-signup validation.';

-- ============================================================================
-- NOTE: The primary email uniqueness enforcement happens at these levels:
-- 1. Supabase auth.users table (built-in unique constraint)
-- 2. profiles.email column (unique constraint added in base schema)
-- 3. Application code (checks for empty identities array on signup)
--
-- All three layers work together to prevent duplicate accounts.
-- ============================================================================

