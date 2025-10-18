# 🚨 QUICK FIX: TestFlight Plan Generation

## The Problem
Plan generation works in iOS Simulator but **NOT in TestFlight** because the Gemini API key isn't configured in EAS secrets.

## ✅ The Solution (5 Minutes)

### Step 1: Get a Gemini API Key
1. Go to: https://makersuite.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key

### Step 2: Run the Setup Script
```bash
# Run the automated setup
./setup-eas-secrets.sh

# Or manually set the key:
eas secret:create --scope project --name EXPO_PUBLIC_GEMINI_API_KEY --value "YOUR_API_KEY_HERE"
eas secret:create --scope project --name EXPO_PUBLIC_AI_API_KEY --value "YOUR_API_KEY_HERE"
```

### Step 3: Build & Deploy
```bash
# Build with fresh cache
eas build --platform ios --profile production --clear-cache

# Submit to TestFlight
eas submit --platform ios --profile production
```

## 🔍 How to Verify It's Working

### In TestFlight:
1. Install the new build
2. Complete onboarding
3. Generate a plan
4. **It should work!** 🎉

### If It Still Fails:
1. Connect iPhone to Mac
2. Open Xcode → Devices → Open Console
3. Look for these logs:
   - `[AI Client] API key available: true` ✅
   - `[Gemini] Response received` ✅
   - If you see `No API key found` ❌ - rebuild with `--clear-cache`

## 📊 What We Fixed

### Before:
- ❌ API keys not accessible in TestFlight
- ❌ No error logging
- ❌ App crashes or shows errors

### After:
- ✅ Proper API key configuration
- ✅ Automatic fallback to free API if Gemini fails
- ✅ Emergency fallback plans if all APIs fail
- ✅ Comprehensive error logging

## 🆘 Still Not Working?

Check these:
1. **API Key Valid?** Test at: https://makersuite.google.com/app/prompts
2. **Secrets Set?** Run: `eas secret:list`
3. **Latest Build?** Rebuild with: `eas build --platform ios --profile production --clear-cache`

## 📝 Files Changed
- `utils/ai-client.ts` - Better API key handling
- `utils/plan-generation-diagnostics.ts` - New diagnostic tools
- `app/generating-base-plan.tsx` - Added error logging
- `app/generating-plan.tsx` - Added error logging

## 🎯 Success = 
When you see plans generating in TestFlight within 10-20 seconds! 🚀
