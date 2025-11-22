# Name Resolution Fix - Summary

## Problem

Users were seeing "User" as their display name on the home screen instead of their actual account name, even though they registered with a real name during signup.

## Root Cause

### The Signup Flow (Working Correctly ✅)
1. User enters name during signup
2. `signup.tsx` calls `signUp(email, password, name)`
3. `useAuth.tsx` stores name in `user_metadata`:
   ```typescript
   await supabase.auth.signUp({
     email,
     password,
     options: { data: { name: name.trim() } }  // ✅ Stored correctly
   });
   ```

### The Onboarding Flow (Was Broken ❌)
1. User completes onboarding
2. Onboarding had empty name state: `const [name] = useState('')`
3. Profile saved with: `name: name || 'User'` → always "User"
4. Database profile stored as "User" instead of actual name
5. Home screen displayed "User" from database

## The Fix

### Changes Made

**File: `app/onboarding.tsx`**

Added proper name resolution with fallback chain:

```typescript
// Get user's name from session metadata (set during signup) or email
const sessionUserName = auth?.session?.user?.user_metadata?.name;
const userEmail = auth?.session?.user?.email || '';
const emailLocalPart = userEmail.split('@')[0] || '';

// Fallback chain: form name → session name → email local-part → 'User'
const resolvedName = (name?.trim() || sessionUserName?.trim() || emailLocalPart || 'User');

console.log('[Onboarding] Name resolution:', {
  formName: name?.trim() || null,
  sessionName: sessionUserName?.trim() || null,
  emailLocalPart: emailLocalPart || null,
  resolvedName,
});

// Use resolvedName in both userData and profileData
const userData = {
  name: resolvedName,  // ✅ Properly resolved
  // ... other fields
};

const profileData = {
  email: userEmail,
  name: resolvedName,  // ✅ Properly resolved
  // ... other fields
};
```

**File: `app/(tabs)/home.tsx`**

Added debug logging to track name sources:

```typescript
<Text style={styles.userName}>
  {(() => {
    const displayName = (
      profile?.name ?? 
      session?.user?.user_metadata?.name ?? 
      user?.name ?? 
      session?.user?.email ?? 
      '—'
    ).split(' ')[0];
    
    console.log('[Home] Display name sources:', {
      profileName: profile?.name,
      sessionMetadataName: session?.user?.user_metadata?.name,
      localUserName: user?.name,
      sessionEmail: session?.user?.email,
      finalDisplayName: displayName,
    });
    
    return displayName;
  })()}! 👋
</Text>
```

## Name Resolution Fallback Chain

The system now uses a comprehensive fallback chain to ensure users always see a meaningful name:

1. **Form name** - If user edits name in onboarding form
2. **Session metadata** - Name from signup stored in `user_metadata` ✅
3. **Email local-part** - Username from email (e.g., "john.doe" from "john.doe@example.com")
4. **"User"** - Ultimate fallback (rarely used)

## Console Logs

### ✅ Successful Name Resolution

```
[Onboarding] Name resolution: {
  formName: null,
  sessionName: "John Doe",           ← Retrieved from signup
  emailLocalPart: "john.doe",
  resolvedName: "John Doe"           ← Final resolved name
}

[Onboarding] Save attempt 1/3
[Onboarding] ✅ Profile synced to Supabase
[Onboarding] ✅ Profile cache refreshed
[Onboarding] ✅ Local store updated

[Home] Display name sources: {
  profileName: "John Doe",            ← Saved to database
  sessionMetadataName: "John Doe",    ← From signup
  localUserName: "John Doe",          ← From local store
  sessionEmail: "john.doe@example.com",
  finalDisplayName: "John"            ← Display on screen
}
```

### ⚠️ Fallback to Email (No Session Name)

```
[Onboarding] Name resolution: {
  formName: null,
  sessionName: null,                  ← Not in session metadata
  emailLocalPart: "john.doe",
  resolvedName: "john.doe"            ← Uses email username
}
```

## Testing the Fix

### New Users (After Fix)
1. **Sign up** with name "John Doe"
2. **Complete onboarding**
3. **Check console** - Should show: `resolvedName: "John Doe"`
4. **View home screen** - Should show: "Good evening, John!"
5. **Verify database**:
   ```sql
   SELECT name FROM profiles WHERE email = 'john.doe@example.com';
   -- Result: John Doe ✅
   ```

### Existing Users (Before Fix)

If users already completed onboarding before this fix:

**Option 1: Update Database Directly**
```sql
-- Check current name
SELECT id, email, name FROM profiles WHERE email = 'user@example.com';

-- Get actual name from auth.users
SELECT 
  u.id, 
  u.email, 
  u.raw_user_meta_data->>'name' as actual_name
FROM auth.users u
WHERE u.email = 'user@example.com';

-- Update profile with actual name
UPDATE profiles 
SET name = (
  SELECT raw_user_meta_data->>'name' 
  FROM auth.users 
  WHERE id = profiles.id
)
WHERE name = 'User' AND email = 'user@example.com';
```

**Option 2: Bulk Fix for All Users**
```sql
-- Update all profiles with "User" to use their auth metadata name
UPDATE profiles p
SET name = COALESCE(
  (SELECT u.raw_user_meta_data->>'name' FROM auth.users u WHERE u.id = p.id),
  SPLIT_PART(p.email, '@', 1),  -- Fallback to email username
  'User'
)
WHERE p.name = 'User';
```

**Option 3: Re-complete Onboarding**
- User can edit their profile and update their name
- Or admin can reset `onboarding_complete = false` (forces re-onboarding with proper name extraction)

## Verification Checklist

- [ ] Signup stores name in `user_metadata` (verified ✅)
- [ ] Onboarding extracts name from session
- [ ] Onboarding saves resolved name to database
- [ ] Home screen displays correct name
- [ ] Console logs show name resolution steps
- [ ] Fallback chain works for edge cases
- [ ] Database has actual names, not "User"

## Database Queries for Debugging

### Check a specific user's name sources
```sql
SELECT 
  u.id,
  u.email,
  u.raw_user_meta_data->>'name' as auth_metadata_name,
  p.name as profile_name,
  CASE 
    WHEN p.name = 'User' THEN '⚠️ Needs fixing'
    ELSE '✅ OK'
  END as status
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email = 'specific-user@example.com';
```

### Find all users with "User" as name
```sql
SELECT 
  p.id,
  p.email,
  p.name as current_profile_name,
  u.raw_user_meta_data->>'name' as actual_name_in_auth,
  SPLIT_PART(p.email, '@', 1) as email_fallback
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.name = 'User'
ORDER BY p.created_at DESC;
```

### Count users by name status
```sql
SELECT 
  CASE 
    WHEN name = 'User' THEN 'Using default "User"'
    WHEN name = SPLIT_PART(email, '@', 1) THEN 'Using email username'
    ELSE 'Using actual name'
  END as name_status,
  COUNT(*) as user_count
FROM profiles
GROUP BY name_status;
```

## Expected Behavior After Fix

### Scenario 1: User with Name in Metadata
- **Signup**: "Jane Smith" → stored in `user_metadata`
- **Onboarding**: Extracts "Jane Smith" from session
- **Database**: Saves "Jane Smith"
- **Home Screen**: Displays "Jane!"

### Scenario 2: User without Metadata (Edge Case)
- **Signup**: Somehow no name in metadata
- **Onboarding**: Falls back to email username
- **Database**: Saves "jane.smith" (from jane.smith@example.com)
- **Home Screen**: Displays "jane.smith!"

### Scenario 3: Edge Case - No Email Username
- **Email**: user@example.com (just "user")
- **Onboarding**: Uses "user" from email
- **Database**: Saves "user"
- **Home Screen**: Displays "user!" (better than "User!")

## Future Improvements

1. **Add name input field to onboarding** - Let users confirm/edit their name
2. **Profile edit screen** - Let users update their name anytime
3. **Capitalize email usernames** - "john.doe" → "John Doe"
4. **Detect invalid names** - Flag "User", "user", single letters as requiring update
5. **Migration script** - Automatically fix all existing "User" names in database
6. **Name validation** - Ensure names are at least 2 characters, not all numbers, etc.

## Summary

✅ **Fixed**: Name resolution now properly extracts from session metadata  
✅ **Fixed**: Console logging shows name resolution steps  
✅ **Fixed**: Proper fallback chain prevents "User" in most cases  
✅ **Documented**: SQL queries to fix existing affected users  

The home screen will now display actual user names instead of "User" for new signups. Existing users may need database updates to fix their stored names.












