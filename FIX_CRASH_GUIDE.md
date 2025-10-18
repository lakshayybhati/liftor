# 🔧 App Crash Fix Guide

## Problem Identified

Your app crashes immediately on launch because:

1. ✅ **Environment Variables Missing**: The build was created with placeholder Supabase credentials
2. ✅ **Code Fixed**: Made initialization safer to prevent crashes
3. ⚠️ **Need to Rebuild**: Must add real environment variables to EAS and rebuild

## 🚨 Critical: Your Current .env File Has Placeholders

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co  ❌
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key  ❌
EXPO_PUBLIC_GEMINI_API_KEY=your-gemini-api-key  ❌
```

These need to be **real values** for the app to work!

---

## 📋 Step-by-Step Fix

### Step 1: Get Your Real Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

### Step 2: Get Your Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create or copy your API key

### Step 3: Add Environment Variables to EAS Secrets

Run these commands **with your real values**:

```bash
cd /Users/lakshaybhati/Downloads/fitcoach-AI-main

# Add Supabase URL
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR-PROJECT.supabase.co" --type string

# Add Supabase Anon Key
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJhbGci..." --type string

# Add Gemini API Key
eas secret:create --scope project --name EXPO_PUBLIC_GEMINI_API_KEY --value "AIza..." --type string
```

**Important:** Replace the values with your actual credentials!

### Step 4: Verify Secrets Are Set

```bash
eas secret:list
```

You should see:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GEMINI_API_KEY`

### Step 5: Clean Build Cache and Rebuild

```bash
# Clean prebuild
npx expo prebuild --clean

# Rebuild for iOS with environment variables
eas build --platform ios --profile production --non-interactive
```

This will:
- ✅ Use Node 20.18.0 (stable)
- ✅ Include your real environment variables
- ✅ Use the fixed crash-safe initialization code
- ⏱️ Take 15-30 minutes

### Step 6: Submit the Fixed Build

Once the build completes:

```bash
eas submit --platform ios --latest
```

---

## 🛠️ What We Fixed in the Code

### 1. **hooks/useAuth.tsx** - Safer Initialization

**Before:**
```typescript
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing credentials');  // ❌ Crashes immediately
}
```

**After:**
```typescript
function getSupabaseCredentials() {
  // Checks for placeholders
  const isPlaceholder = (val: string) => 
    !val || 
    val.includes('your-supabase') || 
    val.includes('your-anon-key');
  
  // Returns validation result instead of crashing
  return { url, key, isValid: hasValidUrl && hasValidKey };
}

// Creates client even with invalid creds to prevent crash
// (but logs errors for debugging)
```

### 2. **app/_layout.tsx** - Better Error Handling

- Wrapped `SplashScreen.preventAutoHideAsync()` in try-catch
- Added error handling for initialization

---

## 🧪 Testing After Fix

Once you install the new build:

1. **Check Launch**: App should open without crashing
2. **Check Auth**: Try signing up/logging in
3. **Check Features**: Test camera, food snap, check-ins

If the app still crashes:
- Check crash logs in App Store Connect
- Verify secrets with `eas secret:list`
- Check that placeholder values are NOT being used

---

## 📊 Environment Variables Checklist

Make sure these are set with **REAL values**:

- [ ] `EXPO_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- [ ] `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key
- [ ] `EXPO_PUBLIC_GEMINI_API_KEY` - Your Gemini API key
- [ ] `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` - Already in app.json ✅

---

## 🔍 Common Issues

### Issue: "Secret already exists"

```bash
# Delete and recreate
eas secret:delete --name EXPO_PUBLIC_SUPABASE_URL
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "your-real-url" --type string
```

### Issue: "Still crashing after rebuild"

1. Verify secrets are correct:
   ```bash
   eas secret:list
   ```

2. Check the build logs for the actual values being used
3. Make sure you're testing the NEW build, not the old one

### Issue: "Don't have Supabase project yet"

You need to create one:
1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Run the schema from `supabase/schema.sql`
4. Get credentials from Settings → API

---

## 🎯 Quick Commands Reference

```bash
# Navigate to project
cd /Users/lakshaybhati/Downloads/fitcoach-AI-main

# List current secrets
eas secret:list

# Add a secret
eas secret:create --scope project --name SECRET_NAME --value "value" --type string

# Delete a secret
eas secret:delete --name SECRET_NAME

# Clean and rebuild
npx expo prebuild --clean
eas build --platform ios --profile production --non-interactive

# Submit to App Store
eas submit --platform ios --latest
```

---

## ✅ Verification Steps

After adding secrets and before rebuilding:

```bash
# 1. Check secrets exist
eas secret:list

# 2. Verify local .env is not used in builds (it's only for local dev)
cat .env

# 3. Start build with production profile
eas build --platform ios --profile production --non-interactive
```

The production build will automatically use the EAS Secrets.

---

## 📞 Need Help?

If you're stuck:
1. Run `eas secret:list` and verify all three secrets are there
2. Check that your Supabase project is active
3. Test your Supabase credentials locally first
4. Review build logs for any other errors

---

**Next Action:** Set up your EAS Secrets with real values and rebuild! 🚀

