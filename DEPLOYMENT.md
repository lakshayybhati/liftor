# Deployment Guide for Liftor

This guide covers the complete deployment process for the Liftor fitness app to production (iOS App Store and Google Play Store).

## Prerequisites

### Accounts & Access
- [ ] Apple Developer Account ($99/year)
- [ ] Google Play Developer Account ($25 one-time)
- [ ] Expo account (free tier works)
- [ ] EAS Build/Submit enabled
- [ ] Supabase project (production instance)
- [ ] RevenueCat account with products configured
- [ ] Google Gemini AI API key

### Local Setup
- [ ] Node.js 18+ installed
- [ ] Expo CLI: `npm install -g expo-cli`
- [ ] EAS CLI: `npm install -g eas-cli`
- [ ] Xcode 14+ (macOS only, for iOS)
- [ ] Android Studio (for Android)
- [ ] Git configured

---

## Step 1: Environment Configuration

### 1.1 Create Production Environment File

Create `.env.production` (DO NOT commit to Git):

```bash
# Supabase (Production instance)
EXPO_PUBLIC_SUPABASE_URL=https://your-prod-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-production-anon-key

# AI Service
EXPO_PUBLIC_GEMINI_API_KEY=your-gemini-api-key

# RevenueCat
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=your-ios-api-key
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=your-android-api-key
EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT=elite

# Environment
EXPO_PUBLIC_ENVIRONMENT=production
```

### 1.2 Configure EAS Secrets

Store secrets securely in EAS:

```bash
# Login to EAS
eas login

# Set secrets (one-time)
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "your-url"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-key"
eas secret:create --scope project --name EXPO_PUBLIC_GEMINI_API_KEY --value "your-key"
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value "your-key"
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY --value "your-key"

# List secrets to verify
eas secret:list
```

---

## Step 2: Configure EAS Project

### 2.1 Initialize EAS

```bash
cd /path/to/fitcoach-AI-main

# Initialize EAS (if not already done)
eas init

# This will create an EAS project and update app.json with projectId
```

### 2.2 Update `eas.json`

Ensure `eas.json` has correct configuration (already created):
- Production builds use release configuration
- Auto-increment build numbers
- Android builds AAB (required for Play Store)

### 2.3 Update `app.json`

Replace placeholders in `app.json`:
- `YOUR_EAS_PROJECT_ID_HERE` → actual project ID from `eas init`
- `ANDROID_KEY_NEEDED` → your Android RevenueCat key

---

## Step 3: iOS Preparation

### 3.1 Apple Developer Portal

1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. **Certificates, Identifiers & Profiles** → **Identifiers**
3. Create App ID: `liftor.app`
4. Enable capabilities:
   - Sign in with Apple (if using Apple Sign-In)
   - Push Notifications (if planning to add later)
   - Associated Domains (for deep links)

### 3.2 App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. **My Apps** → **+** → **New App**
3. Fill in:
   - Platform: iOS
   - Name: Liftor
   - Primary Language: English (U.S.)
   - Bundle ID: liftor.app
   - SKU: liftor-ios
4. Save (don't submit yet)

### 3.3 Configure In-App Purchases (RevenueCat)

1. In App Store Connect → Your App → **In-App Purchases**
2. Create subscription groups and products:
   - Monthly: `elite_monthly`
   - Annual: `elite_annual` (recommended: offer discount)
3. Set prices, configure localizations
4. Add subscription details and promotional images
5. In RevenueCat Dashboard:
   - **Products** → **Add Product**
   - Link App Store Connect products
   - Assign to `elite` entitlement

---

## Step 4: Android Preparation

### 4.1 Google Play Console

1. Go to [Google Play Console](https://play.google.com/console/)
2. **Create App**
3. Fill in:
   - App name: Liftor
   - Default language: English (United States)
   - App or game: App
   - Free or paid: Free
4. Accept declarations and create

### 4.2 Configure Package Name

1. In Play Console → **App details**
2. Verify package name: `app.liftor`

### 4.3 Configure In-App Products (RevenueCat)

1. In Play Console → **Monetize** → **Subscriptions**
2. Create subscription:
   - Product ID: `elite_monthly`, `elite_annual`
   - Configure base plans and offers
3. In RevenueCat Dashboard:
   - Link Google Play products
   - Assign to `elite` entitlement

### 4.4 Generate Upload Key (One-Time)

If you don't have a keystore yet:

```bash
# Generate keystore
keytool -genkeypair -v -keystore liftor-upload-key.jks \
  -alias liftor-key-alias \
  -keyalg RSA -keysize 2048 -validity 10000

# Store keystore securely (DO NOT commit to Git)
# Save password in password manager
```

---

## Step 5: Build for Production

### 5.1 iOS Build

```bash
# Build for iOS (production)
eas build --platform ios --profile production

# This will:
# - Compile native code
# - Sign with your Apple Developer credentials
# - Create an .ipa file
# - Upload to EAS servers
```

When prompted:
- Select your Apple Team
- Let EAS manage credentials (recommended)

### 5.2 Android Build

```bash
# Build for Android (production)
eas build --platform android --profile production

# This will:
# - Compile native code
# - Create an AAB (Android App Bundle)
# - Sign with your upload key
# - Upload to EAS servers
```

### 5.3 Build Both Platforms

```bash
# Build both simultaneously
eas build --platform all --profile production
```

---

## Step 6: Test Production Builds

### 6.1 iOS Testing (TestFlight)

```bash
# Submit to TestFlight
eas submit --platform ios --latest

# Or manually: Download .ipa from EAS, upload via Transporter app
```

1. Go to App Store Connect → **TestFlight**
2. Add internal testers (up to 100)
3. Testers receive email → install via TestFlight app
4. Gather feedback, fix critical bugs

### 6.2 Android Testing (Internal Testing)

```bash
# Submit to Google Play Internal Testing
eas submit --platform android --latest --track internal

# Or manually: Download AAB, upload via Play Console
```

1. Go to Play Console → **Testing** → **Internal testing**
2. Create release, upload AAB
3. Add tester emails
4. Testers receive email → install via Play Store

### 6.3 Critical Testing Checklist

- [ ] Sign up with new email
- [ ] Sign in with existing account
- [ ] Google Sign-In flow
- [ ] Complete onboarding
- [ ] Perform daily check-in
- [ ] Generate base plan (paywall should appear)
- [ ] Purchase subscription (use sandbox/test account)
- [ ] Generate daily plan
- [ ] Navigate all tabs
- [ ] Test camera/photo picker (food snap)
- [ ] Edit profile
- [ ] Sign out and sign back in
- [ ] Restore purchases
- [ ] Deep link (click email verification link)
- [ ] Test on different devices/OS versions

---

## Step 7: Prepare Store Listings

### 7.1 iOS App Store

See `STORE_ASSETS.md` for complete checklist.

1. **App Information**
   - Name, subtitle, description, keywords
   - Privacy policy URL: `https://liftor.app/privacy`
   - Support URL: `https://liftor.app/support`

2. **App Privacy**
   - Complete questionnaire (see STORE_ASSETS.md)

3. **Screenshots**
   - Upload all required sizes

4. **App Review Information**
   - Demo account (if needed)
   - Notes for reviewer

### 7.2 Google Play Store

1. **Store Listing**
   - Short & full description
   - Screenshots, feature graphic
   - App icon (512x512)

2. **Data Safety**
   - Complete form (see STORE_ASSETS.md)

3. **Content Rating**
   - Complete questionnaire → likely Everyone/PEGI 3

---

## Step 8: Submit for Review

### 8.1 iOS Submission

1. In App Store Connect → Your App
2. Create new version (e.g., 1.0.0)
3. Select build from TestFlight
4. Complete all required fields
5. **Submit for Review**

**Timeline**: 24-48 hours typically

**Common Rejection Reasons**:
- Missing privacy policy
- Broken features during review
- Misleading screenshots
- Subscription terms not clear

### 8.2 Android Submission

1. In Play Console → **Production** → **Create new release**
2. Upload production AAB (or select from library)
3. Fill in release notes
4. **Review and roll out**

**Timeline**: 1-7 days for initial review

---

## Step 9: Post-Launch Monitoring

### 9.1 Set Up Crash Reporting

Recommended: Sentry

```bash
npm install --save @sentry/react-native
npx @sentry/wizard@latest -s -i reactNative

# Configure Sentry DSN in .env and eas.json
```

### 9.2 Set Up Analytics (Optional)

Options:
- Firebase Analytics
- Amplitude
- Mixpanel

### 9.3 Monitor Key Metrics

- Crash-free rate (target: >99%)
- RevenueCat subscription metrics
- Supabase database performance
- API response times
- User reviews & ratings

---

## Step 10: Updates & Maintenance

### OTA Updates (Over-The-Air)

For minor fixes (no native code changes):

```bash
# Publish update (JS/assets only)
eas update --branch production --message "Fix minor UI bug"
```

Users will get the update on next app launch (no app store review needed).

### Full Native Build Updates

For native code changes or major updates:

1. Increment version in app.json
2. Rebuild: `eas build --platform all --profile production`
3. Test in TestFlight/Internal Testing
4. Submit to stores

---

## Rollback Plan

If a critical bug is found post-launch:

### Immediate Mitigation
```bash
# Roll back to previous OTA update
eas update:republish --branch production --group <previous-group-id>
```

### Full Rollback (Native)
1. In App Store Connect: Remove current version from sale
2. Re-submit previous stable version
3. In Play Console: Halt rollout, roll back to previous release

---

## Troubleshooting

### Build Failures

**iOS: Code signing issues**
```bash
# Clear credentials and reconfigure
eas credentials
# Select "Remove credentials" then rebuild
```

**Android: Missing keystore**
```bash
# Let EAS manage credentials
eas build:configure
# Select "Yes" when asked to generate new credentials
```

### Submission Failures

**iOS: Missing compliance**
- Go to App Store Connect → Your App → App Privacy
- Complete export compliance questions

**Android: Content policy violation**
- Review rejection email carefully
- Common: misleading content, privacy policy missing
- Appeal if rejection is incorrect

---

## Security Checklist

- [ ] All secrets stored in EAS, not in code
- [ ] No hardcoded API keys in source
- [ ] Production Supabase uses RLS policies
- [ ] HTTPS enforced for all API calls
- [ ] User data encrypted at rest (Supabase default)
- [ ] No sensitive data in logs (production mode)
- [ ] Supabase service_role key NEVER in client app
- [ ] RevenueCat webhook secret configured
- [ ] Deep links properly validated

---

## Support Channels

- **App Issues**: support@liftor.app
- **Expo/EAS**: [https://expo.dev/support](https://expo.dev/support)
- **RevenueCat**: [https://www.revenuecat.com/support/](https://www.revenuecat.com/support/)
- **Supabase**: [https://supabase.com/support](https://supabase.com/support)

---

## Quick Reference Commands

```bash
# Login to EAS
eas login

# Build production
eas build --platform all --profile production

# Submit to stores
eas submit --platform ios --latest
eas submit --platform android --latest

# Publish OTA update
eas update --branch production --message "Description"

# Check build status
eas build:list

# View secrets
eas secret:list

# View project info
eas project:info
```

---

## Next Steps After Launch

1. Monitor crash reports and fix critical bugs
2. Respond to user reviews (4-5 star: thank, 1-3 star: address concerns)
3. Track subscription metrics in RevenueCat
4. Plan feature updates based on user feedback
5. Optimize onboarding based on drop-off analytics
6. A/B test paywall positioning
7. Localize for additional markets
8. Add social features (sharing, community)

---

**Last Updated**: 2025-10-01
**Maintainer**: Engineering Team



