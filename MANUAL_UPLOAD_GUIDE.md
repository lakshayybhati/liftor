# 📱 Manual App Upload Guide

## Method 1: Download IPA and Use Transporter

### Step 1: Download the IPA

**Build #5 IPA URL:**
```
https://expo.dev/artifacts/eas/gJZuZvAWBof7n6ayDywfvS.ipa
```

1. Open this URL in your browser
2. The IPA file will download automatically (~100-200MB)
3. Save it to your Desktop or Downloads folder

### Step 2: Install Transporter

1. Open **Mac App Store**
2. Search for **"Transporter"**
3. Install the official Apple Transporter app
4. Open Transporter

### Step 3: Upload to App Store Connect

1. In Transporter, click **"+"** or drag and drop the IPA file
2. Click **"Deliver"**
3. Sign in with:
   - **Apple ID:** `lakshayybhati06@gmail.com`
   - **Password:** Your Apple ID password
4. Complete 2FA if prompted
5. Wait for upload to complete (~5-10 minutes)

### Step 4: Verify in App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click **"My Apps"**
3. Select **"Liftor"** (or create it if it doesn't exist)
4. Go to **"TestFlight"** tab
5. Your build should appear within 10-15 minutes

---

## Method 2: Use Terminal Submit

**Open Terminal and run:**

```bash
cd /Users/lakshaybhati/Downloads/fitcoach-AI-main
eas submit --platform ios --latest
```

**Enter when prompted:**
- Apple ID: `lakshayybhati06@gmail.com`
- Password: [Your Apple ID password]
- 2FA Code: [From your device]

---

## Method 3: Use Xcode Organizer

### Step 1: Download IPA
Same as Method 1 - download from:
```
https://expo.dev/artifacts/eas/gJZuZvAWBof7n6ayDywfvS.ipa
```

### Step 2: Open Xcode Organizer

1. Open **Xcode**
2. Go to **Window** → **Organizer** (or press `Cmd + Shift + O`)
3. Select **"Archives"** tab
4. Click **"+"** button → **"Import Archive"**
5. Select the downloaded IPA file

### Step 3: Upload

1. Select the imported archive
2. Click **"Distribute App"**
3. Choose **"App Store Connect"**
4. Choose **"Upload"**
5. Sign in with Apple ID if needed
6. Click **"Upload"**

---

## 🔍 Troubleshooting

### "App doesn't exist in App Store Connect"

**Solution:** Create the app first:

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click **"My Apps"** → **"+"** → **"New App"**
3. Fill in:
   - **Platform:** iOS
   - **Name:** Liftor (or your choice)
   - **Primary Language:** English
   - **Bundle ID:** Select `liftor.app` from dropdown
   - **SKU:** `liftor` (any unique ID)
   - **User Access:** Full Access
4. Click **"Create"**
5. Now try uploading again

### "Invalid Bundle Identifier"

Make sure your bundle ID `liftor.app` is registered:

1. Go to [Apple Developer](https://developer.apple.com/account)
2. **Certificates, Identifiers & Profiles** → **Identifiers**
3. Check if `liftor.app` exists
4. If not, create it:
   - Click **"+"**
   - Select **"App IDs"**
   - Bundle ID: `liftor.app`
   - Description: Liftor
   - Capabilities: (select any needed)
   - Click **"Register"**

### "Authentication Failed"

- Use your Apple ID: `lakshayybhati06@gmail.com`
- Use your Apple ID password (not device password)
- Complete 2FA on your trusted device
- Try again

### "Upload Failed"

- Check internet connection
- Wait 5 minutes and try again
- Try a different upload method
- Check App Store Connect system status

---

## ✅ After Successful Upload

### TestFlight (Immediate Access)

1. Build appears in App Store Connect → TestFlight tab
2. Processing takes 10-15 minutes
3. Once processed, you can:
   - Add internal testers
   - Add external testers
   - Install via TestFlight app

### App Store Submission (For Public Release)

1. Go to App Store Connect → Your App → App Store tab
2. Click **"+"** → **"New Version"** → **1.0.0**
3. Fill in required information:
   - Screenshots (at least 1 set)
   - Description (up to 4000 chars)
   - Keywords
   - Privacy Policy URL (required!)
   - Support URL
   - Age Rating
4. Select your uploaded build
5. Add **"What's New"** notes
6. Click **"Add for Review"**
7. Click **"Submit to App Review"**

**Review time:** Typically 24-48 hours

---

## 📊 Current Build Info

**Build Details:**
- **Build Number:** 5
- **Version:** 1.0.0
- **Bundle ID:** liftor.app
- **Team ID:** 7F3247BRAT
- **Apple ID:** lakshayybhati06@gmail.com

**Download IPA:**
```
https://expo.dev/artifacts/eas/gJZuZvAWBof7n6ayDywfvS.ipa
```

**Build Logs:**
```
https://expo.dev/accounts/lakshayybhati/projects/liftor/builds/7f79c0f8-001e-49b5-86b9-9e4d7e80270c
```

---

## ⚠️ Important Notes

### Current Build Status:
- ✅ **App launches** perfectly
- ✅ **No crashes** - all fixes applied
- ✅ **RevenueCat** configured
- ❌ **Login won't work** - needs real Supabase credentials

### To Fix Login:
1. Add real Supabase credentials to EAS
2. Rebuild the app
3. Upload new build

See `SUBMIT_TO_APP_STORE.md` for details.

---

## 🎯 Quick Checklist

Before submitting to App Store:

- [ ] App uploaded to App Store Connect
- [ ] Build processed (no errors)
- [ ] Screenshots prepared (3 device sizes)
- [ ] Privacy Policy URL ready
- [ ] Support/Marketing URLs ready
- [ ] App description written
- [ ] Keywords chosen
- [ ] Age rating completed
- [ ] Demo account credentials (if login required)
- [ ] Test on real device

---

## 📞 Need Help?

**Apple Support:**
- App Store Connect: https://help.apple.com/app-store-connect/
- Developer Support: https://developer.apple.com/support/

**EAS Documentation:**
- Submit Guide: https://docs.expo.dev/submit/introduction/
- Troubleshooting: https://docs.expo.dev/submit/ios/

---

Good luck with your submission! 🚀


