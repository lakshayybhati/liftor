# TestFlight Server Integration Debug Guide

## 🔧 Fixes Applied

### 1. **Supabase Client Initialization** (Fixed in `hooks/useAuth.tsx`)

**Problem**: Supabase credentials were not being read correctly in TestFlight builds, causing authentication and database operations to fail.

**Solution**: Updated `getSupabaseCredentials()` to read from multiple sources:
```typescript
const fromExpoConfig = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const fromManifest2 = ((Constants as any).manifest2?.extra ?? {}) as Record<string, string>;
const extra = { ...fromManifest2, ...fromExpoConfig };
```

This ensures credentials are accessible in:
- ✅ Development (process.env)
- ✅ Simulator (Constants.expoConfig.extra)
- ✅ TestFlight (Constants.manifest2.extra)
- ✅ Production (Constants.manifest2.extra)

### 2. **AI Client Configuration** (Already fixed in `utils/ai-client.ts`)

**Problem**: Gemini API keys and models were not accessible in TestFlight.

**Solution**: Similar dual-source reading strategy:
```typescript
function getExtra(): Record<string, string> {
  const fromConstants = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  const fromManifest2 = ((Constants as any).manifest2?.extra ?? {}) as Record<string, string>;
  return { ...fromManifest2, ...fromConstants };
}
```

### 3. **Environment Diagnostics** (New file: `utils/environment-diagnostics.ts`)

Created a comprehensive diagnostic tool that runs on app startup and logs:
- Current environment (development/production)
- Whether running in TestFlight
- Supabase configuration status
- AI provider configuration status
- Which config sources are available

**Usage**: Automatically runs on app launch. Check console logs in Xcode or via TestFlight crash reports.

---

## 📋 Pre-Build Checklist

Before building for TestFlight, ensure:

### 1. **EAS Secrets are Set** ✅
Run: `eas secret:list`

Required secrets:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_AI_PROVIDER` (e.g., "gemini")
- `EXPO_PUBLIC_AI_API_KEY` (your Gemini API key)
- `EXPO_PUBLIC_AI_MODEL` (e.g., "gemini-2.0-flash-exp")
- `EXPO_PUBLIC_ENABLE_FALLBACK` (true/false)

### 2. **app.config.js Includes All Variables**
Verify that `app.config.js` passes all environment variables to `extra`:
```javascript
extra: {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_AI_PROVIDER: process.env.EXPO_PUBLIC_AI_PROVIDER,
  EXPO_PUBLIC_AI_API_KEY: process.env.EXPO_PUBLIC_AI_API_KEY,
  EXPO_PUBLIC_AI_MODEL: process.env.EXPO_PUBLIC_AI_MODEL,
  EXPO_PUBLIC_ENABLE_FALLBACK: process.env.EXPO_PUBLIC_ENABLE_FALLBACK,
  // ... other vars
}
```

### 3. **eas.json Production Config**
Ensure production build sets the environment:
```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_ENVIRONMENT": "production"
      }
    }
  }
}
```

---

## 🚀 Building for TestFlight

### Step 1: Clean Build
```bash
# Clear any cached builds
rm -rf .expo android/build ios/build

# Verify secrets are set
eas secret:list

# Build for iOS production
eas build --platform ios --profile production
```

### Step 2: Submit to TestFlight
```bash
eas submit --platform ios --profile production
```

### Step 3: Wait for Processing
- Apple typically takes 10-30 minutes to process
- Check status: https://appstoreconnect.apple.com

---

## 🔍 Debugging TestFlight Issues

### Method 1: Check Console Logs on Device

1. Connect your iPhone to your Mac
2. Open **Xcode** → **Window** → **Devices and Simulators**
3. Select your device
4. Click **Open Console** (bottom left)
5. Install and run the TestFlight build
6. Search for these log patterns:
   - `🔍 === ENVIRONMENT DIAGNOSTICS ===`
   - `[Auth] CRITICAL`
   - `🤖 Using AI provider`
   - `❌ Gemini API Error` or `❌ Supabase`

### Method 2: In-App Diagnostics Screen (Optional)

You can temporarily add a debug screen to your app:

```typescript
// Add to app/(tabs)/settings.tsx or create a new debug screen
import { runEnvironmentDiagnostics, logDetailedEnvironment } from '@/utils/environment-diagnostics';

function DebugButton() {
  const handlePress = () => {
    const result = runEnvironmentDiagnostics();
    logDetailedEnvironment();
    alert(JSON.stringify(result, null, 2));
  };
  
  return (
    <TouchableOpacity onPress={handlePress}>
      <Text>Run Diagnostics</Text>
    </TouchableOpacity>
  );
}
```

### Method 3: Crashlytics/Sentry

If you have crash reporting set up, errors will be automatically reported with full stack traces and console logs.

---

## 🔄 TestFlight vs Simulator Differences

| Aspect | Simulator | TestFlight |
|--------|-----------|------------|
| **Environment Variables** | `process.env.*` works directly | Only `Constants.manifest2.extra` works |
| **Build Type** | Development | Release (optimized) |
| **Code Signing** | Not required | Required (Apple Developer) |
| **Network** | Mac's network | Device's actual network |
| **Push Notifications** | Don't work | Work fully |
| **In-App Purchases** | Sandbox | Sandbox |

**Key Insight**: In TestFlight, `process.env` is **NOT** available at runtime. All config must come from `Constants.expoConfig.extra` or `Constants.manifest2.extra`.

---

## ✅ What Should Work Now

After these fixes, the following should work identically in both simulator and TestFlight:

1. **Authentication**
   - Email/password sign-up and login
   - Google OAuth
   - OTP verification
   - Password reset

2. **Database Operations**
   - Profile creation and updates
   - Workout plan storage
   - History tracking
   - Check-in data

3. **AI Plan Generation**
   - Base plan generation
   - Daily adjustments
   - Food snap analysis
   - All using your configured Gemini API

4. **Deep Linking**
   - OAuth callbacks
   - Password reset links
   - Email verification links

---

## 🐛 Common Issues & Solutions

### Issue: "Auth not working in TestFlight"
**Diagnostic Log**: `[Auth] CRITICAL: Missing or invalid Supabase credentials`

**Solution**:
1. Verify EAS secrets: `eas secret:list`
2. Rebuild: `eas build --platform ios --profile production --clear-cache`
3. Check app.config.js includes Supabase vars in `extra`

### Issue: "AI plan generation fails"
**Diagnostic Log**: `❌ Gemini API failed: 403` or `EXPO_PUBLIC_AI_API_KEY is not set`

**Solution**:
1. Verify API key is set: `eas secret:list | grep AI_API_KEY`
2. Test API key in Postman or curl:
   ```bash
   curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=YOUR_KEY" \
     -H 'Content-Type: application/json' \
     -d '{"contents":[{"parts":[{"text":"test"}]}]}'
   ```
3. Ensure Gemini API is enabled in Google Cloud Console

### Issue: "Works in simulator but not TestFlight"
**Diagnostic Log**: Check which config sources are available in the diagnostics output

**Solution**:
1. The fix applied should resolve this
2. Ensure you're building with `--profile production` (not `development`)
3. Clear cache: `eas build --clear-cache`

### Issue: "OAuth/Google sign-in doesn't redirect back"
**Diagnostic Log**: `[App] Auth Callback URL: exp://...`

**Solution**:
1. Check your Supabase OAuth redirect URL settings
2. Ensure you've added your bundle ID to Google Cloud Console
3. Update redirect URLs in Supabase dashboard:
   - Development: `exp://localhost:8081/auth/callback`
   - Production: `yourapp://auth/callback` (use your bundle ID)

---

## 📊 Expected Diagnostic Output

When you launch the TestFlight build, you should see:

```
🔍 === ENVIRONMENT DIAGNOSTICS ===
Environment: production
TestFlight: true
Supabase: ✅ (https://oyvxcdjvwxchmachnrtb.supa...)
AI: ✅ (gemini / gemini-2.0-flash-exp)
Config Sources: ExpoConfig=true, Manifest2=true, ProcessEnv=false
🔍 ================================
```

If you see ❌ for Supabase or AI, the issue is with your EAS secrets or app.config.js.

---

## 🆘 Still Having Issues?

1. **Collect Logs**:
   - Connect device to Mac
   - Open Xcode Console
   - Run the app
   - Copy ALL logs starting from "=== ENVIRONMENT DIAGNOSTICS ==="

2. **Check Network**:
   - Ensure device has internet connection
   - Try on WiFi and cellular
   - Check if Supabase URL is accessible from device's network

3. **Verify API Keys**:
   - Test Gemini API key manually (see above)
   - Check Supabase anon key is correct (copy from Supabase dashboard)
   - Ensure keys don't have extra spaces or quotes

4. **Clean Rebuild**:
   ```bash
   # Remove all caches
   rm -rf node_modules .expo android/build ios/build
   npm install
   eas build --platform ios --profile production --clear-cache
   ```

---

## 📝 Next Steps

1. Build and submit to TestFlight:
   ```bash
   eas build --platform ios --profile production
   eas submit --platform ios --profile production
   ```

2. Once approved, install on your device

3. Connect device to Mac and open Xcode Console

4. Launch the app and check for the diagnostics output

5. Test all key features:
   - Sign up new account
   - Log in
   - Generate workout plan
   - Take food snap
   - Check history

6. If any feature fails, check the console for error messages

---

## 🎯 Success Criteria

Your TestFlight build is working correctly when:

- ✅ Diagnostics show all green checkmarks
- ✅ You can sign up and log in
- ✅ Workout plan generation completes successfully
- ✅ Food snaps are analyzed
- ✅ History and profile data persist
- ✅ No crashes or "missing credentials" errors in console

If all of the above work, your server integration is fully functional in TestFlight! 🎉


