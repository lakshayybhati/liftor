# TestFlight Plan Generation Fix - Complete Guide

## 🚨 Problem Identified
The plan generation feature works in the iOS Simulator but fails in TestFlight because:
1. **API keys are not being properly accessed from EAS secrets in production builds**
2. **The AI service (Gemini) requires proper API key configuration**
3. **Environment variables are not available at runtime in TestFlight**

## ✅ Solution Implemented

### 1. Enhanced Error Logging and Diagnostics
- Added comprehensive diagnostics utility (`utils/plan-generation-diagnostics.ts`)
- Added detailed logging in the AI client (`utils/ai-client.ts`)
- Added generation attempt logging in plan generation screens

### 2. Improved AI Client Configuration
- Better error handling with automatic fallback to Rork API
- Production-aware configuration reading from `Constants.expoConfig.extra`
- Detailed error messages for API failures

### 3. Emergency Fallback System
- All plan generation screens now have emergency fallback plans
- If AI fails, users still get a functional (though basic) plan

## 🔧 Setup Instructions

### Step 1: Configure Your Gemini API Key

First, obtain a Gemini API key from Google:
1. Go to https://makersuite.google.com/app/apikey
2. Create a new API key
3. Enable the Generative Language API

### Step 2: Set EAS Secrets

Run these commands in your terminal:

```bash
# Set the Gemini API key
eas secret:create --scope project --name EXPO_PUBLIC_GEMINI_API_KEY --value "YOUR_GEMINI_API_KEY_HERE"

# Also set it as the generic AI API key
eas secret:create --scope project --name EXPO_PUBLIC_AI_API_KEY --value "YOUR_GEMINI_API_KEY_HERE"

# Set the AI provider
eas secret:create --scope project --name EXPO_PUBLIC_AI_PROVIDER --value "gemini"

# Set the AI model
eas secret:create --scope project --name EXPO_PUBLIC_AI_MODEL --value "gemini-1.5-flash"

# Enable fallback to Rork API
eas secret:create --scope project --name EXPO_PUBLIC_ENABLE_FALLBACK --value "true"
```

### Step 3: Verify Secrets Are Set

```bash
eas secret:list
```

You should see all these secrets:
- `EXPO_PUBLIC_GEMINI_API_KEY`
- `EXPO_PUBLIC_AI_API_KEY`
- `EXPO_PUBLIC_AI_PROVIDER`
- `EXPO_PUBLIC_AI_MODEL`
- `EXPO_PUBLIC_ENABLE_FALLBACK`

### Step 4: Build for TestFlight

```bash
# Clean build with cache clear
eas build --platform ios --profile production --clear-cache
```

### Step 5: Submit to TestFlight

```bash
eas submit --platform ios --profile production
```

## 🔍 Debugging in TestFlight

### How to Check Logs

1. **Connect your iPhone to your Mac**
2. **Open Xcode** → **Window** → **Devices and Simulators**
3. **Select your device**
4. **Click "Open Console"** (bottom left)
5. **Install and run the TestFlight build**
6. **Filter logs** by searching for these patterns:
   - `[AI Client]` - AI service logs
   - `[Gemini]` - Gemini-specific logs
   - `[Rork]` - Fallback API logs
   - `[GeneratePlan]` - Plan generation logs
   - `=== PLAN GENERATION DIAGNOSTICS ===` - Diagnostic summary

### Expected Log Output (Success)

```
🔍 [AI Client] Production Configuration:
Provider: gemini
API Key present: true
Model: gemini-1.5-flash
Fallback enabled: true

🤖 [AI Client] Using provider: gemini
🔑 [AI Client] API key available: true
🔄 [AI Client] Fallback enabled: true

🤖 [Gemini] Calling API...
[Gemini] Model: gemini-1.5-flash
[Gemini] Prompt length: 2456
[Gemini] API key prefix: AIzaSyB3c4...

✅ [Gemini] Response received, length: 3842
✅ Base plan generated successfully with 7 days
```

### Common Issues and Solutions

#### Issue: "No API key found"
**Log:** `❌ [Gemini] No API key found`

**Solution:**
1. Verify EAS secrets are set: `eas secret:list`
2. Rebuild with `--clear-cache`: `eas build --platform ios --profile production --clear-cache`
3. Check that `app.config.js` includes the environment variables in the `extra` section

#### Issue: "Invalid API key"
**Log:** `❌ [Gemini] API Error: 403`

**Solution:**
1. Verify your Gemini API key is valid
2. Check that the Generative Language API is enabled in Google Cloud Console
3. Re-set the secret: `eas secret:delete EXPO_PUBLIC_GEMINI_API_KEY` then create it again

#### Issue: "Quota exceeded"
**Log:** `Gemini API quota exceeded`

**Solution:**
1. Check your API usage at https://console.cloud.google.com
2. The app will automatically fall back to the Rork API
3. Consider upgrading your Google Cloud quota

## 🎯 How the Fix Works

### 1. Configuration Reading
The app now properly reads configuration from `Constants.expoConfig.extra` in production, which contains the EAS secrets:

```typescript
function getExtra(): Record<string, string> {
  const fromConstants = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  const fromManifest2 = ((Constants as any).manifest2?.extra ?? {}) as Record<string, string>;
  return { ...fromManifest2, ...fromConstants };
}
```

### 2. Multi-Layer Fallback
If Gemini fails, the app automatically falls back to:
1. **Rork API** (toolkit.rork.com) - Free fallback API
2. **Emergency fallback plans** - Basic but functional plans generated locally

### 3. Comprehensive Error Logging
Every step of the plan generation process is now logged with:
- Timestamp
- Success/failure status
- Error details
- Performance metrics

## 📊 Monitoring Plan Generation

### Check Stored Diagnostics
The app stores diagnostics that you can retrieve later:

```typescript
// In your debug screen or console:
import { getStoredDiagnostics } from '@/utils/plan-generation-diagnostics';

const diagnostics = await getStoredDiagnostics();
console.log('Last diagnostics:', diagnostics.lastDiagnostics);
console.log('Recent logs:', diagnostics.recentLogs);
```

### Success Metrics
After implementing these fixes, you should see:
- ✅ Plan generation working in TestFlight
- ✅ Proper error messages if something fails
- ✅ Automatic fallback to alternative APIs
- ✅ Users always get a plan (even if basic)

## 🚀 Quick Troubleshooting Checklist

1. [ ] EAS secrets are set (`eas secret:list`)
2. [ ] Gemini API key is valid and has quota
3. [ ] Built with `--clear-cache` flag
4. [ ] `app.config.js` includes all environment variables in `extra`
5. [ ] Generative Language API is enabled in Google Cloud
6. [ ] TestFlight build is the latest version

## 📝 Testing the Fix

1. **Build and submit to TestFlight:**
   ```bash
   eas build --platform ios --profile production --clear-cache
   eas submit --platform ios --profile production
   ```

2. **Install on device and test:**
   - Complete onboarding
   - Generate a base plan
   - Complete daily check-in
   - Generate daily plan

3. **Check console logs** for any errors

4. **If it works:** The plans should generate within 10-20 seconds

5. **If it fails:** Check the console logs for specific error messages

## 🆘 Still Having Issues?

If plan generation still fails after following this guide:

1. **Check the console logs** for the specific error
2. **Run diagnostics** to see what's configured
3. **Verify API key** is working by testing it directly
4. **Check network** - ensure the device can reach the API endpoints
5. **Contact support** with the diagnostic logs

The fixes implemented ensure that even if the primary AI service fails, users will still get a functional plan through the fallback mechanisms.

## 🎉 Success Criteria

Your TestFlight build is working correctly when:
- ✅ Plans generate successfully without errors
- ✅ Generation completes in 10-20 seconds
- ✅ Console shows successful API calls
- ✅ No crashes or error messages
- ✅ Users can view and interact with generated plans

With these fixes implemented and properly configured, plan generation should work reliably in TestFlight!
