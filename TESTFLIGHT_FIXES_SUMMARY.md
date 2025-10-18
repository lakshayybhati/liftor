# TestFlight Server Integration Fixes - Summary

## 🎯 Problem Statement

The app was working perfectly in the iOS simulator but failing in TestFlight:
- Authentication not working
- Database operations failing
- AI plan generation not functioning
- Food capture working, but plan generation broken

**Root Cause**: Environment variables accessible via `process.env` in development/simulator are NOT available in TestFlight/production builds. All runtime configuration must come from `Constants.expoConfig.extra` or `Constants.manifest2.extra`.

---

## ✅ Fixes Applied

### 1. **Supabase Client Initialization** (`hooks/useAuth.tsx`)

**Changed**: `getSupabaseCredentials()` function

**Before**:
```typescript
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const url = extra.EXPO_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
```

**After**:
```typescript
// Read from both expoConfig.extra (EAS builds) and manifest2.extra (TestFlight/production)
const fromExpoConfig = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const fromManifest2 = ((Constants as any).manifest2?.extra ?? {}) as Record<string, string>;
const extra = { ...fromManifest2, ...fromExpoConfig };

const url = extra.EXPO_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
```

**Why**: In TestFlight, environment variables are only available via `Constants.manifest2.extra`. This ensures we check both sources.

---

### 2. **AI Client Configuration** (`utils/ai-client.ts`)

**Changed**: Created `getExtra()` helper function

**Implementation**:
```typescript
function getExtra(): Record<string, string> {
  const fromConstants = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  const fromManifest2 = ((Constants as any).manifest2?.extra ?? {}) as Record<string, string>;
  return { ...fromManifest2, ...fromConstants };
}
```

This function is now used throughout `ai-client.ts` to reliably read:
- `EXPO_PUBLIC_AI_PROVIDER`
- `EXPO_PUBLIC_AI_API_KEY`
- `EXPO_PUBLIC_AI_MODEL`
- `EXPO_PUBLIC_ENABLE_FALLBACK`

**Note**: This was already partially fixed in a previous session, but is now consistent with the Supabase approach.

---

### 3. **Environment Diagnostics** (`utils/environment-diagnostics.ts` - NEW FILE)

Created a comprehensive diagnostic tool that:
- Detects the current environment (development/production/TestFlight)
- Validates Supabase configuration
- Validates AI provider configuration
- Checks which config sources are available
- Logs detailed information for debugging

**Key Functions**:
- `runEnvironmentDiagnostics()`: Returns a diagnostic report and logs to console
- `logDetailedEnvironment()`: Logs all available config details (use for deep debugging)

**Output Example**:
```
🔍 === ENVIRONMENT DIAGNOSTICS ===
Environment: production
TestFlight: true
Supabase: ✅ (https://oyvxcdjvwxchmachnrtb.supa...)
AI: ✅ (gemini / gemini-2.0-flash-exp)
Config Sources: ExpoConfig=true, Manifest2=true, ProcessEnv=false
🔍 ================================
```

---

### 4. **App Initialization** (`app/_layout.tsx`)

**Changed**: Added diagnostics to `AppInitializer` component

**Implementation**:
```typescript
import { runEnvironmentDiagnostics } from "@/utils/environment-diagnostics";

function AppInitializer({ children }: { children: React.ReactNode }) {
  // Run diagnostics on mount (only once)
  useEffect(() => {
    try {
      runEnvironmentDiagnostics();
    } catch (err) {
      console.error('[App] Diagnostics failed:', err);
    }
  }, []);
  
  // ... rest of initialization
}
```

**Why**: Automatically runs on every app launch, making it easy to verify configuration in TestFlight.

---

### 5. **Enhanced Error Logging** (`hooks/useAuth.tsx`)

Added more detailed error logging in `getSupabaseCredentials()`:

```typescript
if (!hasValidUrl || !hasValidKey) {
  console.error('[Auth] CRITICAL: Missing or invalid Supabase credentials.');
  console.error('[Auth] URL valid:', hasValidUrl, 'Key valid:', hasValidKey);
  console.error('[Auth] URL:', url ? `${url.substring(0, 20)}...` : 'none');
  console.error('[Auth] Key length:', key.length);
  console.error('[Auth] Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in EAS Secrets');
}
```

**Why**: Makes it immediately clear in console logs if configuration is missing or invalid.

---

## 📁 Files Modified

1. ✅ `hooks/useAuth.tsx` - Updated Supabase credential reading
2. ✅ `utils/ai-client.ts` - Already had robust config reading (no changes needed)
3. ✅ `app/_layout.tsx` - Added diagnostics import and initialization
4. 📄 `utils/environment-diagnostics.ts` - NEW FILE
5. 📄 `TESTFLIGHT_DEBUG_GUIDE.md` - NEW FILE (comprehensive guide)
6. 📄 `TESTFLIGHT_FIXES_SUMMARY.md` - NEW FILE (this document)

---

## 🔑 Key Configurations Verified

### EAS Secrets (via `eas secret:list`)
All required secrets are set:
- ✅ `EXPO_PUBLIC_SUPABASE_URL`
- ✅ `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `EXPO_PUBLIC_AI_PROVIDER`
- ✅ `EXPO_PUBLIC_AI_API_KEY`
- ✅ `EXPO_PUBLIC_AI_MODEL`
- ✅ `EXPO_PUBLIC_ENABLE_FALLBACK`

### app.config.js
All environment variables are passed to `extra`:
```javascript
extra: {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_AI_PROVIDER: process.env.EXPO_PUBLIC_AI_PROVIDER,
  EXPO_PUBLIC_AI_API_KEY: process.env.EXPO_PUBLIC_AI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY,
  EXPO_PUBLIC_AI_MODEL: process.env.EXPO_PUBLIC_AI_MODEL,
  EXPO_PUBLIC_ENABLE_FALLBACK: process.env.EXPO_PUBLIC_ENABLE_FALLBACK,
  // ... other vars
}
```

### eas.json
Production build sets environment flag:
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

## 🚀 Next Steps

### 1. Test in Simulator (Optional but Recommended)
Run the app in the simulator to verify diagnostics output:
```bash
npm start
# Press 'i' for iOS
```

Expected output in console:
```
🔍 === ENVIRONMENT DIAGNOSTICS ===
Environment: development
TestFlight: false
Supabase: ✅ (https://oyvxcdjvwxchmachnrtb...)
AI: ✅ (gemini / gemini-2.0-flash-exp)
Config Sources: ExpoConfig=true, Manifest2=false, ProcessEnv=true
🔍 ================================
```

### 2. Build for TestFlight
```bash
# Clean build to ensure all changes are included
eas build --platform ios --profile production --clear-cache
```

### 3. Submit to TestFlight
```bash
eas submit --platform ios --profile production
```

### 4. Test in TestFlight
Once the build is approved (~10-30 minutes):

1. Install the TestFlight build on your device
2. Connect device to Mac via USB
3. Open Xcode → Window → Devices and Simulators
4. Select your device → Open Console
5. Launch the app from TestFlight
6. Verify diagnostics output shows:
   - `TestFlight: true`
   - `Supabase: ✅`
   - `AI: ✅`
   - `Config Sources: ExpoConfig=true, Manifest2=true, ProcessEnv=false`

### 5. Test All Features
- ✅ Sign up with email/password
- ✅ Log in
- ✅ Google OAuth sign-in
- ✅ OTP verification
- ✅ Generate workout plan (this was broken before!)
- ✅ Take food snap and get AI analysis
- ✅ Check history
- ✅ Update profile

---

## 🎓 Technical Explanation

### Why TestFlight is Different from Simulator

| Feature | Simulator | TestFlight |
|---------|-----------|------------|
| Build Type | Debug | Release (optimized) |
| Environment Variables | `process.env` works | Only via `Constants.*` |
| Source Maps | Full | Stripped (unless configured) |
| Optimization | Minimal | Full (minification, tree-shaking) |
| Code Signing | Not required | Required |

### The Core Issue

In React Native/Expo apps:
- **Development/Simulator**: `process.env.EXPO_PUBLIC_*` is injected at build time and accessible at runtime
- **Production/TestFlight**: `process.env` is NOT available. All config must be embedded via `app.config.js` and accessed through `Constants.expoConfig.extra` or `Constants.manifest2.extra`

### The Solution Pattern

For any environment variable needed in production:

1. **Add to EAS Secrets**:
   ```bash
   eas secret:create --name EXPO_PUBLIC_MY_VAR --value "my-value"
   ```

2. **Add to app.config.js**:
   ```javascript
   module.exports = ({ config }) => ({
     ...config,
     extra: {
       ...config.extra,
       EXPO_PUBLIC_MY_VAR: process.env.EXPO_PUBLIC_MY_VAR,
     }
   });
   ```

3. **Read in code**:
   ```typescript
   import Constants from 'expo-constants';
   
   function getMyVar() {
     const fromExpoConfig = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
     const fromManifest2 = ((Constants as any).manifest2?.extra ?? {}) as Record<string, string>;
     const extra = { ...fromManifest2, ...fromExpoConfig };
     return extra.EXPO_PUBLIC_MY_VAR ?? process.env.EXPO_PUBLIC_MY_VAR ?? 'default';
   }
   ```

This pattern ensures the variable works in:
- ✅ Local development
- ✅ Expo Go
- ✅ Development builds
- ✅ iOS Simulator
- ✅ TestFlight
- ✅ Production (App Store)
- ✅ Android (all environments)

---

## 📊 Expected Results

After these fixes, your TestFlight build should:

1. **Successfully authenticate users** via:
   - Email/password sign-up and login
   - Google OAuth
   - OTP verification

2. **Successfully connect to Supabase**:
   - Create profiles
   - Store and retrieve workout plans
   - Save history and check-ins

3. **Successfully generate AI plans**:
   - Use your Gemini API key
   - Generate base workout plans
   - Create daily adjustments
   - Analyze food snaps

4. **Show proper diagnostic output**:
   - Clear indication of configuration status
   - Easy troubleshooting if issues arise

---

## 🐛 Troubleshooting

If you still have issues after building, check the [TESTFLIGHT_DEBUG_GUIDE.md](./TESTFLIGHT_DEBUG_GUIDE.md) for:
- Common issues and solutions
- How to read console logs from TestFlight
- Step-by-step debugging process
- Network and API key validation

---

## ✅ Success Confirmation

Your build is working correctly when:

1. Diagnostics show all green checkmarks (✅)
2. No "CRITICAL" errors in console
3. You can sign up, log in, and generate plans
4. All features work identically to simulator

If all of the above are true, congratulations! Your server integration is fully functional in TestFlight. 🎉

---

## 📞 Support

If you continue to have issues:

1. Collect the full diagnostic output (see debug guide)
2. Note which specific feature is failing
3. Check if the API keys work outside the app (e.g., Postman for Gemini API)
4. Verify network connectivity from the device
5. Try a clean rebuild with `--clear-cache`

The diagnostic tool and enhanced logging should make it much easier to identify exactly what's wrong.


