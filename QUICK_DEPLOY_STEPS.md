# Quick Deploy to App Store - Liftor

## ✅ Configuration Complete

Your app is properly configured and ready to build:
- **EAS Project:** `@lakshayybhati/liftor`
- **Project ID:** `ba713e37-6a6f-4a12-a995-7a8dd864003a`
- **Bundle ID:** `liftor.app`
- **Version:** `1.0.0`
- **EAS CLI:** Installed ✅
- **Logged in as:** `lakshayybhati` ✅

---

## 🚀 Deploy Commands (Run These Now)

### 1. Build for iOS Production

```bash
cd /Users/lakshaybhati/Downloads/fitcoach-AI-main
eas build --platform ios --profile production
```

**You'll be prompted for:**
- ✓ Apple ID (your developer account email)
- ✓ Apple ID password
- ✓ 2FA code (if enabled)

**Build time:** 15-30 minutes  
**Track progress:** The command will show a URL to monitor the build

---

### 2. Submit to App Store (After Build Completes)

```bash
eas submit --platform ios --latest
```

This uploads your app to App Store Connect for review.

---

### 3. Complete App Store Listing

Go to: [App Store Connect](https://appstoreconnect.apple.com)

#### Required Information:

**App Information:**
- [ ] App Name: Liftor (or your choice)
- [ ] Subtitle: (30 characters max)
- [ ] Category: Health & Fitness
- [ ] Privacy Policy URL (required!)
- [ ] Support URL

**Version Information:**
- [ ] Screenshots (minimum 1 set required):
  - 6.7" Display: 1290 x 2796 pixels
  - 6.5" Display: 1242 x 2688 pixels
  - 5.5" Display: 1242 x 2208 pixels
- [ ] Description (up to 4000 characters)
- [ ] Keywords (comma-separated)
- [ ] What's New in this version

**App Review:**
- [ ] Contact information
- [ ] Demo account (if login required)
- [ ] Notes for reviewer

**Privacy:**
- [ ] Complete privacy questionnaire
- [ ] Data collection practices
- [ ] Data usage policies

**Pricing & Availability:**
- [ ] Select countries
- [ ] Set pricing

---

## 📱 Screenshots Guide

### Taking Screenshots:

1. **Using iOS Simulator:**
   ```bash
   npx expo run:ios
   # Take screenshots: Cmd + S
   ```

2. **Required Sizes:**
   - iPhone 14 Pro Max (6.7"): 1290 x 2796
   - iPhone 11 Pro Max (6.5"): 1242 x 2688
   - iPhone 8 Plus (5.5"): 1242 x 2208

3. **Screenshot Tips:**
   - Show key features (workout plans, check-ins, progress tracking)
   - Use actual app content
   - Keep status bar clean
   - Show value proposition

---

## ⚠️ Common Issues & Solutions

### Build Fails: "Invalid credentials"
- Ensure Apple Developer account is active ($99/year)
- Check that Apple ID and password are correct
- Complete 2FA if required

### Build Fails: "No matching provisioning profile"
- Let EAS manage credentials automatically
- Choose "Automatic" when prompted

### Submit Fails: "Missing required icon"
- Check that all icon assets are present in `assets/images/`
- Icons should be PNG format
- Required sizes should be generated

### App Rejected: "Missing privacy policy"
- Add a privacy policy URL before submission
- Must be publicly accessible
- Should explain data collection

### App Rejected: "Incomplete information"
- Fill ALL required fields in App Store Connect
- Provide working demo credentials if needed
- Add proper age rating

---

## 🔄 Future Updates

To release updates:

1. **Update version** in `app.json`:
   ```json
   "version": "1.0.1"
   ```

2. **Build and submit:**
   ```bash
   eas build --platform ios --profile production
   eas submit --platform ios --latest
   ```

3. **In App Store Connect:**
   - Create new version
   - Add "What's New" notes
   - Submit for review

---

## 💰 RevenueCat Setup Checklist

Your app uses RevenueCat for subscriptions:

- [ ] Products configured in RevenueCat dashboard
- [ ] Products created in App Store Connect
- [ ] Product IDs match between platforms
- [ ] Entitlements configured (you're using "elite")
- [ ] Test purchase flow before submission

**RevenueCat iOS Key:** `appl_CfuHeBCwQmEZeYiYLvtHInhIQVs`

---

## 📞 Need Help?

- **EAS Build Docs:** https://docs.expo.dev/build/introduction/
- **EAS Submit Docs:** https://docs.expo.dev/submit/introduction/
- **App Store Guidelines:** https://developer.apple.com/app-store/review/guidelines/
- **App Store Connect Help:** https://help.apple.com/app-store-connect/

---

## ⏱️ Timeline Estimate

- **Build:** 15-30 minutes
- **Upload to App Store Connect:** 5-10 minutes  
- **Processing in App Store Connect:** 10-15 minutes
- **Filling out listing:** 30-60 minutes
- **App Review:** 24-48 hours (typically)

**Total time to submission:** ~1-2 hours  
**Total time to live:** 1-3 days

---

## ✨ You're Ready!

Everything is configured. Just run the build command above and follow the prompts. Good luck! 🚀

