-- Fix User Names in Database
-- This script updates profiles with "User" as the name to use their actual name from auth metadata

-- Step 1: Preview which users will be affected
SELECT 
  p.id,
  p.email,
  p.name as current_name,
  COALESCE(
    u.raw_user_meta_data->>'name',
    SPLIT_PART(p.email, '@', 1),
    'User'
  ) as new_name,
  CASE 
    WHEN (COALESCE(u.raw_user_meta_data->>'name', SPLIT_PART(p.email, '@', 1))) != p.name 
    THEN '🔄 Will update'
    ELSE '✓ No change needed'
  END as status
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.name = 'User'
ORDER BY p.created_at DESC;

-- Step 2: Backup current state (optional but recommended)
-- CREATE TABLE profiles_backup_names AS
-- SELECT id, email, name, updated_at FROM profiles WHERE name = 'User';

-- Step 3: Update profiles with "User" to use their actual name
-- IMPORTANT: Review Step 1 results before running this!
UPDATE profiles p
SET 
  name = COALESCE(
    (SELECT u.raw_user_meta_data->>'name' FROM auth.users u WHERE u.id = p.id),
    SPLIT_PART(p.email, '@', 1),
    'User'
  ),
  updated_at = NOW()
WHERE p.name = 'User'
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

-- Step 4: Verify the update
SELECT 
  COUNT(*) FILTER (WHERE name = 'User') as still_user,
  COUNT(*) FILTER (WHERE name != 'User') as fixed_users,
  COUNT(*) as total_users
FROM profiles;

-- Step 5: Show updated users
SELECT 
  p.id,
  p.email,
  p.name as updated_name,
  u.raw_user_meta_data->>'name' as auth_metadata_name,
  p.updated_at
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.updated_at > NOW() - INTERVAL '5 minutes'
ORDER BY p.updated_at DESC
LIMIT 20;

-- Additional Queries for Verification

-- Check name distribution
SELECT 
  CASE 
    WHEN name = 'User' THEN '❌ Still "User"'
    WHEN name = SPLIT_PART(email, '@', 1) THEN '📧 Email username'
    WHEN name IS NULL OR name = '' THEN '⚠️ Empty name'
    ELSE '✅ Actual name'
  END as name_type,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM profiles
GROUP BY name_type
ORDER BY count DESC;

-- Find users where auth metadata has name but profile doesn't match
SELECT 
  p.email,
  p.name as profile_name,
  u.raw_user_meta_data->>'name' as metadata_name,
  SPLIT_PART(p.email, '@', 1) as email_username
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.name != COALESCE(u.raw_user_meta_data->>'name', SPLIT_PART(p.email, '@', 1), 'User')
  AND (u.raw_user_meta_data->>'name') IS NOT NULL
LIMIT 50;

-- Specific user lookup (replace with actual email)
-- SELECT 
--   u.id,
--   u.email,
--   u.raw_user_meta_data,
--   p.name as profile_name,
--   p.onboarding_complete,
--   p.created_at,
--   p.updated_at
-- FROM auth.users u
-- LEFT JOIN profiles p ON p.id = u.id
-- WHERE u.email = 'your-email@example.com';












