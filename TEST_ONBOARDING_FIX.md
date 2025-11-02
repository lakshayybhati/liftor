# Quick Test Guide - Onboarding Fix

## Quick Test (5 minutes)

### Prerequisites
- App running on device/simulator
- Access to console logs
- Test account ready

### Test Steps

#### 1. Test New User Flow
```bash
# Clear app data to simulate new user
# iOS: Delete and reinstall app
# Android: Settings > Apps > Clear Data
```

1. **Start app** → Should go to login
2. **Create account** → Enter email, password, name
3. **Complete onboarding** → Fill all required fields
4. **Click "Build My Journey"**
   - ✅ Button should show "Saving..."
   - ✅ Console should show: `[Onboarding] Save attempt 1/3`
   - ✅ Console should show: `[Onboarding] ✅ Profile synced to Supabase`
   - ✅ Console should show: `[Onboarding] ✅ Profile cache refreshed`
   - ✅ Should redirect to plan generation
5. **Wait for plan to generate**
6. **Log out** from settings
7. **Log back in** with same credentials
   - ✅ Console should show: `[Index] Routing decision: { profileOnboarded: true }`
   - ✅ Should go directly to HOME
   - ✅ Should NOT go to onboarding again

**Expected Result**: ✅ User goes to home after login, not onboarding

---

#### 2. Test Network Failure Handling

1. **Start new onboarding**
2. **Fill all fields**
3. **Turn off WiFi/Data** on device
4. **Click "Build My Journey"**
   - ✅ Button should show "Saving..."
   - ✅ Should see retry attempts in console
   - ✅ After ~6 seconds, should see error alert
   - ✅ Alert should have "Retry" and "Cancel" options
5. **Turn WiFi/Data back on**
6. **Click "Retry"** in alert
   - ✅ Should save successfully
   - ✅ Should proceed to plan generation

**Expected Result**: ✅ Graceful error handling with retry option

---

#### 3. Test Existing User (Database Fix)

If you have users stuck in onboarding loop:

```sql
-- Check current status
SELECT email, onboarding_complete 
FROM profiles 
WHERE email = 'stuck-user@example.com';

-- Fix if needed
UPDATE profiles 
SET onboarding_complete = true 
WHERE email = 'stuck-user@example.com';

-- Verify
SELECT email, onboarding_complete 
FROM profiles 
WHERE email = 'stuck-user@example.com';
```

Then have user log in:
- ✅ Should go to home
- ✅ Should NOT loop back to onboarding

---

## Console Log Patterns

### ✅ Success Pattern
```
[Onboarding] Name resolution: {
  formName: null,
  sessionName: "John Doe",
  emailLocalPart: "john.doe",
  resolvedName: "John Doe"
}
[Onboarding] Save attempt 1/3
[Onboarding] ✅ Profile synced to Supabase
[Onboarding] ✅ Profile cache refreshed
[Onboarding] ✅ Local store updated
[Onboarding] ✅ Onboarding complete, proceeding to plan generation

[Index] Routing decision: {
  profileOnboarded: true,
  localOnboarded: true,
  subscriptionActive: false,
  finalOnboarded: true,
  userId: "..."
}
[Index] User authenticated and onboarded, redirecting to home

[Home] Display name sources: {
  profileName: "John Doe",
  sessionMetadataName: "John Doe",
  localUserName: "John Doe",
  sessionEmail: "john.doe@example.com",
  finalDisplayName: "John"
}
```

### ❌ Failure Pattern (Network Issue)
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
Then alert should appear with retry option.

### ❌ OLD BUG - Email Missing (FIXED)
```
[Onboarding] Save attempt 1/3
ERROR [Onboarding] Save attempt 1 failed: {"code": "23502", "message": "null value in column \"email\" of relation \"profiles\" violates not-null constraint"}
```
**This should NO LONGER happen** - the fix now includes email validation before attempting save.

### ❌ Problem Pattern (Old Bug)
```
[Index] Routing decision: {
  profileOnboarded: false,  ← Still false after onboarding!
  localOnboarded: true,
  subscriptionActive: false,
  finalOnboarded: true,
  userId: "..."
}
[Index] User not onboarded and no active subscription, redirecting to onboarding
```
This should NO LONGER happen with the fix!

---

## Visual Indicators

### During Save
- Button text: **"Saving..."** (not "Build My Journey")
- Button: **Disabled** (slightly grayed out)
- Back button: **Disabled**

### On Error
- **Red error banner** appears above buttons
- Error text: "Failed to save your profile: [error message]"
- **Alert dialog** appears with "Retry" and "Cancel" options

### On Success
- Redirects to `/generating-base-plan`
- No errors shown

---

## Troubleshooting

### Issue: Still redirecting to onboarding after login

**Check:**
1. Console logs - look for routing decision logs
2. Database - verify `onboarding_complete` is `true`
3. Cache - try clearing React Query cache

**Fix:**
```sql
UPDATE profiles 
SET onboarding_complete = true 
WHERE email = 'user@example.com';
```

### Issue: Save fails immediately without retries

**Check:**
1. Console for error message
2. Network connectivity
3. Supabase connection status

**Fix:**
- Check Supabase keys in environment variables
- Verify user has valid session
- Check database permissions

### Issue: Email constraint error (23502)

**Error Message:**
```
null value in column "email" of relation "profiles" violates not-null constraint
```

**This was FIXED in the update** but if you still see it:

**Check:**
1. Verify `auth?.session?.user?.email` exists
2. Console should show: `[Onboarding] No user email found in session` if email is missing
3. Verify user is properly authenticated

**Fix:**
- User needs to log out and log back in
- Check that signup/login properly sets the session
- Verify email is stored in auth.users table

### Issue: Home screen shows "User" instead of real name

**Symptoms:**
- Home screen greeting shows "Good evening, User!"
- Profile shows "User" instead of account name

**Check Console Logs:**
```
[Onboarding] Name resolution: {
  formName: null,
  sessionName: null,  ← Should have the user's name!
  emailLocalPart: "john.doe",
  resolvedName: "User"  ← Falls back to "User"
}

[Home] Display name sources: {
  profileName: "User",  ← Saved as "User" in database
  sessionMetadataName: null,
  localUserName: "User",
  sessionEmail: "john.doe@example.com",
  finalDisplayName: "User"
}
```

**Root Cause:**
- Name not set in `user_metadata` during signup
- Profile saved with "User" instead of actual name

**Fix:**
1. **Update database directly:**
```sql
UPDATE profiles 
SET name = 'Your Actual Name' 
WHERE email = 'your-email@example.com';
```

2. **Or verify signup sets user_metadata:**
- Check that signup.tsx passes name to signUp function
- Verify signUp function stores name in user_metadata
- Name should be in `auth.users.raw_user_meta_data`

3. **Restart app after database update:**
- Log out
- Log back in
- Should now show correct name

### Issue: Retry doesn't work

**Check:**
1. Console should show "Retrying in Xms..."
2. Each attempt should log

**Fix:**
- The retry logic is automatic
- If manual retry from alert fails, check network

---

## Success Criteria

- [x] ✅ Onboarding saves to database
- [x] ✅ Cache is refreshed after save
- [x] ✅ Only proceeds on successful save
- [x] ✅ Shows loading state during save
- [x] ✅ Shows error message on failure
- [x] ✅ Offers retry on failure
- [x] ✅ Retries automatically 3 times
- [x] ✅ User goes to home after login
- [x] ✅ No onboarding loop for completed users

---

## Quick Commands

### Check Database
```sql
-- See recent signups
SELECT id, email, name, onboarding_complete, created_at 
FROM profiles 
ORDER BY created_at DESC 
LIMIT 10;

-- Check specific user
SELECT * FROM profiles WHERE email = 'test@example.com';

-- Fix stuck user
UPDATE profiles SET onboarding_complete = true WHERE email = 'test@example.com';
```

### Clear App Data (Fresh Test)
```bash
# iOS Simulator
xcrun simctl uninstall booted com.yourapp.bundleid

# Android
adb shell pm clear com.yourapp.packagename
```

### Monitor Logs
```bash
# React Native
npx react-native log-android  # Android
npx react-native log-ios      # iOS

# Expo
npx expo start --clear        # Clear cache and start
```

