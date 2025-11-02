# Onboarding Completion Fix - Summary

## Problem
Users were being redirected to onboarding every time they logged in, even after completing it during signup. This happened because the `onboarding_complete` flag wasn't being reliably saved to the database.

### Root Cause
The original `handleComplete` function in `app/onboarding.tsx`:
1. **Missing email field** - Profile update didn't include required `email` field (database constraint)
2. **Silently caught errors** - Failed saves were only logged, not handled
3. **Always proceeded** - Redirected to plan generation even if the save failed
4. **No retry logic** - Network issues or timeouts caused permanent failures
5. **No user feedback** - Users weren't informed when saves failed
6. **Cache not refreshed** - Profile query cache wasn't explicitly refetched after save

## Solution Implemented

### 1. **Enhanced Save Logic** (`app/onboarding.tsx`)

#### Added State Management
```typescript
const [isSaving, setIsSaving] = useState(false);
const [saveError, setSaveError] = useState<string | null>(null);
const { updateProfile, refetch: refetchProfile } = useProfile();
```

#### Implemented Retry Logic
- **3 automatic retry attempts** with progressive delays (1s, 2s, 3s)
- Each attempt logs its progress for debugging
- Only proceeds if save succeeds

#### Critical Changes
```typescript
// CRITICAL: Extract user name and email from session
const sessionUserName = auth?.session?.user?.user_metadata?.name;
const userEmail = auth?.session?.user?.email || '';
const emailLocalPart = userEmail.split('@')[0] || '';

// Name fallback chain: form → session metadata → email local-part → 'User'
const resolvedName = (name?.trim() || sessionUserName?.trim() || emailLocalPart || 'User');

// Validate email (required by database)
if (!userEmail) {
  setSaveError('User email not found. Please log in again.');
  return;
}

// Include email and resolved name in profile data
const profileData = {
  email: userEmail,        // ✅ Required field
  name: resolvedName,      // ✅ Properly resolved from session
  onboarding_complete: true,
  // ... other fields
};

const saveWithRetry = async (maxRetries = 3): Promise<boolean> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 1. Save to database (critical)
      await updateProfile(profileData);
      
      // 2. Force cache refresh (ensure fresh data)
      await refetchProfile();
      
      // 3. Update local store (non-critical)
      await updateUser(userData);
      
      return true; // Success!
    } catch (error) {
      // Retry with delay if not last attempt
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      } else {
        setSaveError(`Failed to save: ${error.message}`);
        return false;
      }
    }
  }
};
```

#### User Feedback
- **Loading state**: Button shows "Saving..." during save
- **Error display**: Red error banner shows if save fails
- **Alert dialog**: Offers retry option if all attempts fail
- **Back button disabled**: Prevents navigation during save

### 2. **Improved Routing Logic** (`app/index.tsx`)

Added comprehensive logging to help diagnose routing issues:

```typescript
console.log('[Index] Routing decision:', {
  profileOnboarded: profile?.onboarding_complete,
  localOnboarded: user?.onboardingComplete,
  subscriptionActive,
  finalOnboarded: onboarded,
  userId: session.user.id,
});
```

### 3. **Home Screen Safeguards** (`app/(tabs)/home.tsx`)

Added similar logging to track onboarding state checks:

```typescript
console.log('[Home] Onboarding check:', {
  localOnboarded: user?.onboardingComplete,
  profileOnboarded: profile?.onboarding_complete,
  finalOnboarded: onboardingCompleteFlag,
  subscriptionActive,
});
```

## Files Modified

1. **`app/onboarding.tsx`**
   - Added `isSaving` and `saveError` state
   - Complete rewrite of `handleComplete` with retry logic
   - Added error container UI
   - Updated button to show loading state
   - Added error message display

2. **`app/index.tsx`**
   - Added debug logging for routing decisions
   - Better visibility into why users are redirected

3. **`app/(tabs)/home.tsx`**
   - Added debug logging for onboarding checks
   - Consistent logging format with index.tsx

## Testing the Fix

### Test Case 1: New User Signup
1. Create a new account
2. Complete onboarding
3. **Expected**: Should see console logs showing save attempts
4. **Expected**: Should see "✅ Profile synced to Supabase" in logs
5. **Expected**: Should proceed to plan generation
6. **Expected**: Profile in database has `onboarding_complete = true`

### Test Case 2: Retry on Network Failure
1. Start onboarding
2. Simulate network issue (disconnect WiFi before completing)
3. Click "Build My Journey"
4. **Expected**: Should see retry attempts in logs
5. **Expected**: After 3 failed attempts, should show error alert
6. **Expected**: Should stay on onboarding screen
7. Reconnect network and click "Retry"
8. **Expected**: Should succeed and proceed

### Test Case 3: Login After Onboarding
1. Complete onboarding successfully
2. Log out
3. Log back in
4. **Expected**: Console shows `[Index] Routing decision` with `profileOnboarded: true`
5. **Expected**: Should redirect directly to home, NOT onboarding
6. **Expected**: Should not see "User not onboarded" message

### Test Case 4: Existing Users
1. Query database for users with `onboarding_complete = false`
2. For test accounts, manually set to `true`:
   ```sql
   UPDATE profiles 
   SET onboarding_complete = true 
   WHERE email = 'test@example.com';
   ```
3. Log in with that account
4. **Expected**: Should go directly to home

## Debug Console Logs

### Successful Flow
```
[Onboarding] Save attempt 1/3
[Onboarding] ✅ Profile synced to Supabase
[Onboarding] ✅ Profile cache refreshed
[Onboarding] ✅ Local store updated
[Onboarding] ✅ Onboarding complete, proceeding to plan generation
[Index] Routing decision: { profileOnboarded: true, localOnboarded: true, ... }
[Index] User authenticated and onboarded, redirecting to home
```

### Failed Save (with retry)
```
[Onboarding] Save attempt 1/3
[Onboarding] Save attempt 1 failed: Network request failed
[Onboarding] Retrying in 1000ms...
[Onboarding] Save attempt 2/3
[Onboarding] Save attempt 2 failed: Network request failed
[Onboarding] Retrying in 2000ms...
[Onboarding] Save attempt 3/3
[Onboarding] Save attempt 3 failed: Network request failed
[Onboarding] All save attempts failed: Network request failed
```

## Verification Checklist

- [ ] No linter errors in modified files
- [ ] Button shows "Saving..." during save
- [ ] Error message displays if save fails
- [ ] Alert dialog appears after failed retries
- [ ] Console logs show retry attempts
- [ ] Profile cache is refreshed after save
- [ ] Only proceeds to plan generation on success
- [ ] Login after onboarding goes to home, not onboarding
- [ ] Database has `onboarding_complete = true` after completion

## Database Verification

Check the database to ensure onboarding flag is set:

```sql
SELECT 
  id, 
  email, 
  name, 
  onboarding_complete, 
  created_at 
FROM profiles 
WHERE email = 'your-test-email@example.com';
```

Expected result: `onboarding_complete = true`

## Manual Fix for Affected Users

If users are still stuck in onboarding loop despite completing it:

```sql
UPDATE profiles 
SET onboarding_complete = true 
WHERE id = 'user-uuid-here';
```

## Future Improvements

1. **Add telemetry** - Track onboarding completion success rate
2. **Add network status check** - Warn user if offline before attempting save
3. **Add optimistic updates** - Update local state immediately, sync in background
4. **Add save progress indicator** - Show which fields are being saved
5. **Add partial save recovery** - Resume from last saved step if interrupted

## Notes

- The fix prioritizes **data integrity** over speed
- Retry delays are progressive to handle temporary network issues
- Local store updates are non-critical and won't block completion
- All critical operations are logged for debugging
- Users can always retry manually if automatic retries fail

