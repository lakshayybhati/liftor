# 📱 Submit to App Store Connect & TestFlight

## ✅ Build Ready

**Latest Build:** Build #5  
**Status:** ✅ Finished successfully  
**Download:** https://expo.dev/artifacts/eas/gJZuZvAWBof7n6ayDywfvS.ipa

---

## 🚀 Submit to App Store Connect

### **Option 1: Using EAS Submit (Recommended)**

Run this command in your terminal:

```bash
cd /Users/lakshaybhati/Downloads/fitcoach-AI-main
eas submit --platform ios --latest
```

**You'll be prompted for:**
1. ✅ Apple ID: `lakshayybhati06@gmail.com`
2. ✅ Password: Your Apple ID password
3. ✅ 2FA Code: If enabled

The submission will:
- Upload the IPA to App Store Connect
- Make it available in TestFlight immediately
- Ready for internal/external testing

---

### **Option 2: Using Transporter App (Alternative)**

1. Download the IPA:
   ```
   https://expo.dev/artifacts/eas/gJZuZvAWBof7n6ayDywfvS.ipa
   ```

2. Download **Transporter** from Mac App Store

3. Open Transporter and drag the IPA file

4. Click "Deliver" to upload to App Store Connect

---

## ⚠️ CRITICAL: Environment Variables Issue

**Your current build still has placeholder credentials!**

### The Problem:
- ✅ App launches without crashing (thanks to our fixes)
- ❌ Login shows "Network request failed"
- ❌ No Supabase connection

### The Solution:

**You need to:**

1. **Get your real Supabase credentials:**
   - Go to https://app.supabase.com
   - Select your project → Settings → API
   - Copy: Project URL + anon public key

2. **Get your Gemini API key:**
   - Go to https://aistudio.google.com/app/apikey
   - Create/copy your API key

3. **Add them to EAS:**
   ```bash
   # Supabase URL
   eas env:create production --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR-PROJECT.supabase.co" --type string --non-interactive

   # Supabase Anon Key
   eas env:create production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..." --type string --non-interactive

   # Gemini API Key
   eas env:create production --name EXPO_PUBLIC_GEMINI_API_KEY --value "AIza..." --type string --non-interactive
   ```

4. **Rebuild with real credentials:**
   ```bash
   eas build --platform ios --profile production --non-interactive
   ```

5. **Submit the new build:**
   ```bash
   eas submit --platform ios --latest
   ```

---

## 📋 After Submission

### **TestFlight (Immediate)**

Once submitted, the build will appear in TestFlight within ~10-15 minutes:

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click "My Apps" → "Liftor"
3. Go to "TestFlight" tab
4. The build will be processing
5. Once ready, add internal testers
6. They can download via TestFlight app

### **App Store (Requires Review)**

To submit for App Store review:

1. In App Store Connect, go to "App Store" tab
2. Create a new version (1.0.0)
3. Fill in all required information:
   - Screenshots (at least one set)
   - Description
   - Keywords
   - Privacy Policy URL
   - Support URL
   - Age Rating
4. Select your TestFlight build
5. Click "Submit for Review"

**Review Time:** 24-48 hours typically

---

## 🎯 Quick Decision Tree

### Want to test in TestFlight NOW?
```bash
cd /Users/lakshaybhati/Downloads/fitcoach-AI-main
eas submit --platform ios --latest
```
**Note:** Login will fail until you add real Supabase credentials

### Want login to work first?
1. Add real Supabase credentials (see above)
2. Rebuild: `eas build --platform ios --profile production --non-interactive`
3. Submit: `eas submit --platform ios --latest`

---

## 📞 Need Help?

**Common Issues:**

1. **"Authentication failed"**
   - Use your Apple ID: `lakshayybhati06@gmail.com`
   - Use your Apple ID password (not device password)
   - Complete 2FA if prompted

2. **"App not found in App Store Connect"**
   - You need to create the app first
   - Go to App Store Connect → "+" → New App
   - Bundle ID: `liftor.app`

3. **"Network request failed" in app**
   - Add real Supabase credentials
   - Rebuild the app
   - Submit new build

---

## ✅ Current Status

- ✅ **Build #5** ready for submission
- ✅ **App launches** without crashing
- ✅ **RevenueCat** configured
- ✅ **Code signing** valid until Oct 2026
- ⚠️ **Environment variables** need real values
- ⚠️ **Login** won't work until Supabase credentials added

---

## 🚀 Quick Start Command

**Run this now to submit:**

```bash
cd /Users/lakshaybhati/Downloads/fitcoach-AI-main && eas submit --platform ios --latest
```

Then provide your Apple ID credentials when prompted.

**After submission completes, add real Supabase credentials and rebuild for a working version.**

---

Good luck! 🎉


