# Quick Start: Production Deployment

**Last Updated**: October 1, 2025  
**Status**: READY FOR PRODUCTION (with completions)

This is a quick reference for deploying Liftor to production. For detailed instructions, see `DEPLOYMENT.md` and `PRODUCTION_READINESS.md`.

---

## TL;DR: What You Need to Do

### 1. Set Environment Variables (15 minutes)
```bash
# Copy example file
cp .env.example .env

# Edit .env and fill in:
# - EXPO_PUBLIC_SUPABASE_URL (your production Supabase)
# - EXPO_PUBLIC_SUPABASE_ANON_KEY
# - EXPO_PUBLIC_GEMINI_API_KEY
# - EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY (add to app.json too)
```

### 2. Initialize EAS (5 minutes)
```bash
npm install -g eas-cli
eas login
eas init

# Update app.json with the projectId from eas init
```

### 3. Create Store Assets (2-4 hours)
- [ ] Take 5 screenshots on iOS simulator (6.7" display)
- [ ] Take 5 screenshots on Android emulator
- [ ] Create feature graphic (1024x500) for Android
- [ ] Write privacy policy and host at https://liftor.app/privacy
- [ ] Create support page at https://liftor.app/support

### 4. Configure RevenueCat (30 minutes)
- [ ] Create products in App Store Connect: `elite_monthly`, `elite_annual`
- [ ] Create products in Google Play Console: same IDs
- [ ] Link products in RevenueCat dashboard
- [ ] Test with sandbox/test accounts

### 5. Build & Test (1 day)
```bash
# Build for both platforms
eas build --platform all --profile production

# Submit to TestFlight and Internal Testing
eas submit --platform ios --latest
eas submit --platform android --latest

# Test thoroughly (see checklist below)
```

### 6. Complete Store Listings (2-3 hours)
- [ ] Fill in App Store Connect metadata (use drafts in STORE_ASSETS.md)
- [ ] Upload screenshots
- [ ] Complete App Privacy questionnaire
- [ ] Fill in Google Play Console metadata
- [ ] Upload screenshots and feature graphic
- [ ] Complete Data Safety form

### 7. Submit for Review (5 minutes)
- [ ] Submit to App Store
- [ ] Submit to Google Play
- [ ] Monitor review status
- [ ] Respond to any rejections

---

## Critical Testing Checklist

Before submitting, test these flows in TestFlight/Internal Testing:

### Authentication
- [ ] Sign up with new email
- [ ] Verify email and sign in
- [ ] Sign in with Google
- [ ] Reset password
- [ ] Sign out and sign back in

### Onboarding & Plans
- [ ] Complete onboarding (all steps)
- [ ] Check-in (try all modes: LOW, HIGH, PRO)
- [ ] Paywall appears for base plan generation
- [ ] Purchase subscription (sandbox account)
- [ ] Base plan generates successfully
- [ ] Daily plan generates successfully

### Core Features
- [ ] View workout, nutrition, recovery tabs
- [ ] Snap food photo
- [ ] View history
- [ ] Edit profile
- [ ] Export data
- [ ] Restore purchases (on second device or after reinstall)

### Edge Cases
- [ ] Force quit app and reopen (state persists)
- [ ] Toggle airplane mode during plan generation (error handled)
- [ ] Try to generate plan without subscription (paywall appears)
- [ ] Sign out and sign in with different account (data isolated)

---

## Estimated Timeline

| Phase | Duration | Can Parallelize? |
|-------|----------|------------------|
| Environment setup | 15 min | No |
| EAS initialization | 5 min | No |
| Store assets creation | 2-4 hours | No |
| Privacy policy/support pages | 1-2 hours | Yes (with assets) |
| RevenueCat configuration | 30 min | Yes (with assets) |
| First builds | 30-60 min | No |
| Internal testing | 4-8 hours | No |
| Bug fixes (if any) | 2-8 hours | No |
| Store listings | 2-3 hours | Yes (during testing) |
| Submission | 5 min | No |
| **TOTAL** | **2-3 days** | With parallelization |

---

## Common Issues & Solutions

### "Missing Supabase credentials"
**Fix**: Copy `.env.example` to `.env` and fill in your values.

### "RevenueCat not configured"
**Fix**: Add Android API key to `app.json` → `extra.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`

### "EAS project not found"
**Fix**: Run `eas init` and update `app.json` with the projectId.

### "Build fails on iOS"
**Fix**: Let EAS manage credentials: `eas credentials` → select "Generate new credentials"

### "Build fails on Android"
**Fix**: Ensure package name is unique and matches Play Console app.

### "Screenshots don't match requirements"
**Fix**: iOS requires 1290x2796 for 6.7" display. Android recommends 1080x1920 or 1440x2560.

---

## What's Already Done ✅

- [x] EAS build configuration (eas.json)
- [x] Environment variable documentation (.env.example)
- [x] Git ignore for secrets (.gitignore)
- [x] Security: Hardcoded credentials removed
- [x] Error boundary for crash handling
- [x] Android configuration fixed (package name, permissions)
- [x] Store asset requirements documented (STORE_ASSETS.md)
- [x] Deployment guide created (DEPLOYMENT.md)
- [x] Production readiness audit completed (PRODUCTION_READINESS.md)

---

## What You Need to Complete ⚠️

### CRITICAL (Can't ship without these)
- [ ] Set environment variables (.env)
- [ ] Add Android RevenueCat API key (app.json)
- [ ] Create privacy policy (https://liftor.app/privacy)
- [ ] Create screenshots (iOS & Android)
- [ ] Create feature graphic (Android)
- [ ] Configure products (App Store Connect + Play Console)
- [ ] Test purchase flow end-to-end

### HIGH PRIORITY (Should have)
- [ ] Create support page (https://liftor.app/support)
- [ ] Create terms of service (https://liftor.app/terms)
- [ ] Complete store listings (App Store + Play Store)
- [ ] Complete App Privacy questionnaire (iOS)
- [ ] Complete Data Safety form (Android)

### RECOMMENDED (Nice to have)
- [ ] Implement crash reporting (Sentry or Firebase)
- [ ] Set up analytics (Firebase, Amplitude, etc.)
- [ ] Create app preview video (optional but impressive)
- [ ] Add promotional images (optional)

---

## Quick Commands Reference

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Run on iOS simulator
npx expo start --ios

# Run on Android emulator
npx expo start --android

# Login to EAS
eas login

# Initialize EAS project
eas init

# Store secrets in EAS
eas secret:create --scope project --name KEY_NAME --value "value"

# Build for production
eas build --platform all --profile production

# Submit to stores
eas submit --platform ios --latest
eas submit --platform android --latest

# Publish OTA update (after launch)
eas update --branch production --message "Fix minor bug"

# Check build status
eas build:list

# View secrets
eas secret:list
```

---

## Support Resources

- **This Codebase**: See `PRODUCTION_READINESS.md` for detailed audit
- **Deployment**: See `DEPLOYMENT.md` for step-by-step instructions
- **Store Assets**: See `STORE_ASSETS.md` for complete checklist
- **Expo Docs**: https://docs.expo.dev/
- **EAS Build**: https://docs.expo.dev/build/introduction/
- **RevenueCat**: https://www.revenuecat.com/docs/
- **App Store Guidelines**: https://developer.apple.com/app-store/review/guidelines/
- **Google Play Policies**: https://support.google.com/googleplay/android-developer/answer/9904549

---

## Need Help?

1. Check `PRODUCTION_READINESS.md` for detailed analysis
2. Check `DEPLOYMENT.md` for step-by-step instructions
3. Check `STORE_ASSETS.md` for asset requirements
4. Search Expo forums: https://forums.expo.dev/
5. Contact engineering team

---

**You're almost there! Just a few non-code tasks remaining. Good luck! 🚀**


