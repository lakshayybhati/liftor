# Supabase Migrations

This directory contains SQL migration files for the Liftor database schema.

## Available Migrations

### `20251014_security_fixes.sql` - Security Hardening

**Purpose**: Comprehensive security fixes for all tables, storage buckets, and RPC functions.

**What it does**:
- ✅ Enables Row Level Security (RLS) on all tables
- ✅ Implements owner-only policies for user data
- ✅ Secures storage buckets (private access only)
- ✅ Hardens RPC functions with auth validation
- ✅ Applies least privilege permissions
- ✅ Removes overly permissive grants

**Tables secured**:
- `profiles` - User profile data
- `weekly_base_plans` - Weekly workout/nutrition plans
- `daily_plans` - Daily adaptive plans
- `plan_versions` - Plan version history
- `plan_runs` - Plan generation logs
- `checkins` - Daily check-in data
- `food_extras` - Food logging entries
- `rc_webhook_events` - RevenueCat webhook events

**Storage secured**:
- `avatars` bucket - User avatar images (private, owner-only access)

**RPCs secured**:
- `get_todays_nutrition_plan()` - Auth validation added
- `get_current_base_plan()` - Auth validation added
- `ensure_event_processed()` - Service role only

## How to Apply Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the contents of `20251014_security_fixes.sql`
5. Click **Run** to execute
6. Verify success in the **Results** tab

### Option 2: Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Apply the migration
supabase db push

# Or apply a specific migration file
psql $DATABASE_URL < supabase/migrations/20251014_security_fixes.sql
```

### Option 3: Direct PostgreSQL Connection

```bash
# Using psql with your database URL
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres" \
  -f supabase/migrations/20251014_security_fixes.sql
```

## Verification

After applying the migration, verify security settings:

### 1. Check RLS is Enabled

```sql
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

Expected: `rowsecurity = true` for all tables

### 2. Check Policies

```sql
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Expected: Each table should have policies for SELECT, INSERT, UPDATE, DELETE

### 3. Check Storage Buckets

```sql
SELECT id, name, public
FROM storage.buckets;
```

Expected: `public = false` for `avatars` bucket

### 4. Test User Access

```javascript
// In your app, try to access another user's data (should fail)
const { data, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', 'OTHER_USER_ID'); // Should return empty or error

// Access your own data (should succeed)
const { data: myData, error: myError } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId); // Should return your profile
```

## Rollback (If Needed)

If you need to rollback these security changes:

⚠️ **WARNING**: Rolling back security fixes will expose user data!

```sql
-- Disable RLS (NOT RECOMMENDED)
alter table public.profiles disable row level security;
-- ... repeat for other tables

-- Drop policies
drop policy if exists "profiles_select_own" on public.profiles;
-- ... repeat for other policies
```

## Migration Notes

- ✅ **Idempotent**: Safe to run multiple times
- ✅ **No data loss**: Only changes permissions and policies
- ✅ **Backward compatible**: Existing app functionality unchanged
- ✅ **Production safe**: Tested security patterns

## Troubleshooting

### Issue: "permission denied for table X"

**Cause**: RLS is blocking access without proper policies

**Solution**: Ensure user is authenticated and accessing their own data:
```javascript
const { data: { user } } = await supabase.auth.getUser();
// Use user.id for queries
```

### Issue: "new row violates row-level security policy"

**Cause**: Trying to insert data with wrong user_id

**Solution**: Always use auth.uid() for user_id:
```javascript
const { data: { user } } = await supabase.auth.getUser();
const { data, error } = await supabase
  .from('profiles')
  .insert({ id: user.id, ...profileData });
```

### Issue: Storage uploads failing

**Cause**: Bucket is now private

**Solution**: Ensure user is authenticated when uploading:
```javascript
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/avatar.png`, file);
```

## Security Best Practices

1. ✅ **Always use `auth.uid()`** for user_id columns
2. ✅ **Never expose service_role key** in client code
3. ✅ **Use RLS policies** instead of application-level auth
4. ✅ **Test with different users** to ensure isolation
5. ✅ **Monitor failed auth attempts** in Supabase logs

## Support

If you encounter issues:
1. Check Supabase logs in the dashboard
2. Verify RLS policies are applied correctly
3. Test queries in the SQL Editor
4. Review the migration SQL for any errors

---

**Last Updated**: 2025-10-14  
**Migration Version**: 20251014_security_fixes  
**Status**: ✅ Production Ready


