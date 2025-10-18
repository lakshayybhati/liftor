# App Store & Play Store Assets Checklist

This document outlines all required assets and metadata for submitting Liftor to the Apple App Store and Google Play Store.

## App Store (iOS) Requirements

### App Icons
- [x] App Icon (1024x1024) - `ios/liftor/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png`
- [x] All required sizes generated automatically by Expo

### Screenshots
- [ ] 6.7" Display (iPhone 14 Pro Max) - **REQUIRED** (1290x2796 or 2796x1290)
  - Recommended: 3-5 screenshots showing key features
  - Home screen with personalized greeting
  - Check-in flow
  - Daily plan view (workout, nutrition, recovery)
  - Progress/history view
  - Settings/profile

- [ ] 6.5" Display (iPhone 14 Plus, 13 Pro Max, 12 Pro Max, 11 Pro Max) - Optional but recommended
- [ ] 5.5" Display (iPhone 8 Plus) - Optional
- [ ] iPad Pro 12.9" (2nd/3rd gen) - If supporting iPad - (2048x2732)

### App Preview Videos (Optional but recommended)
- [ ] 6.7" Display - 15-30 second video showcasing app flow

### App Information

#### Required
- [x] App Name: `Liftor`
- [x] Bundle ID: `liftor.app`
- [ ] Primary Language: `English (U.S.)`
- [ ] Primary Category: `Health & Fitness`
- [ ] Secondary Category: `Lifestyle` (optional)
- [ ] Content Rights: Confirm you have rights to all content
- [ ] Age Rating: Complete questionnaire (likely 4+, unless tracking health data requires higher rating)

#### Description & Marketing
- [ ] **Subtitle** (30 chars max): e.g., "AI-Powered Fitness Coach"
- [ ] **Description** (4000 chars max):
  ```
  Liftor is your AI-powered personal fitness companion that creates personalized 
  workout and nutrition plans tailored to your goals, equipment, and lifestyle.

  KEY FEATURES:
  • Personalized AI Plans: Daily workout, nutrition, and recovery guidance
  • Smart Check-ins: Track energy, mood, sleep, and progress
  • Adaptive Planning: Plans adjust based on your daily check-in data
  • Equipment Flexibility: Works with gym equipment, dumbbells, or bodyweight
  • Dietary Preferences: Supports vegetarian, vegan, and other preferences
  • Progress Tracking: Monitor weight, energy trends, and adherence
  • Snap Food Log: Quick meal tracking with camera integration
  
  Whether you're building muscle, losing weight, or maintaining general fitness,
  Liftor provides evidence-based guidance personalized to your unique needs.
  
  SUBSCRIPTION REQUIRED:
  Liftor requires an Elite subscription for full access to AI-generated plans.
  Free trial available. Subscription auto-renews unless cancelled.
  
  HEALTH & FITNESS:
  Liftor is designed to complement, not replace, professional medical advice.
  Always consult healthcare providers before starting any fitness program.
  ```

- [ ] **Keywords** (100 chars max, comma-separated):
  ```
  fitness,workout,nutrition,ai,coach,gym,exercise,diet,weight,health
  ```

- [ ] **Promotional Text** (170 chars, updateable without review):
  ```
  Get your personalized workout and nutrition plan today! AI-powered coaching tailored to your goals and lifestyle. Start your fitness journey now.
  ```

- [ ] **Support URL**: `https://liftor.app/support`
- [ ] **Marketing URL**: `https://liftor.app`
- [ ] **Privacy Policy URL**: `https://liftor.app/privacy` - **REQUIRED**

### Privacy & Permissions

#### App Privacy (Data Collection)
You MUST fill out Apple's App Privacy questionnaire. Based on the app:

**Data Linked to User:**
- Health & Fitness (workouts, nutrition, check-ins)
- Contact Info (email)
- Identifiers (user ID for RevenueCat)
- Usage Data (analytics if implemented)

**Data Not Linked to User:**
- Diagnostics (crash logs, if implemented)

**Permissions Used (NSUsageDescription in Info.plist):**
- [x] Camera: "Allow Liftor to access your camera to capture food photos"
- [x] Photo Library: "Allow Liftor to access your photos to log meals"
- [x] Microphone: (Only if camera video recording is enabled)

### App Store Connect Configuration

- [ ] Create App Store Connect record
- [ ] Configure TestFlight for internal/external testing
- [ ] Add test users
- [ ] Set pricing (Free with in-app purchases)
- [ ] Configure In-App Purchases via RevenueCat
- [ ] Add tax/banking information

---

## Google Play Store (Android) Requirements

### App Icons
- [x] App Icon (512x512) - High-res icon for Play Store
- [ ] Feature Graphic (1024x500) - **REQUIRED** - Banner for store listing

### Screenshots
- [ ] Phone Screenshots - **REQUIRED** (minimum 2, maximum 8)
  - Min resolution: 320px
  - Max resolution: 3840px
  - Recommended: 1080x1920 or 1440x2560
  - Same screens as iOS

- [ ] 7" Tablet Screenshots - Optional
- [ ] 10" Tablet Screenshots - Optional

### App Information

#### Required
- [x] App Name: `Liftor`
- [x] Package Name: `app.liftor`
- [ ] Default Language: `English (United States)`
- [ ] App Category: `Health & Fitness`
- [ ] Content Rating: Complete questionnaire (likely Everyone)
- [ ] Target Audience: `Adults` (18+, or Teens if appropriate)

#### Description & Marketing
- [ ] **Short Description** (80 chars max):
  ```
  AI-powered fitness coach with personalized workout and nutrition plans
  ```

- [ ] **Full Description** (4000 chars max): Same as iOS description

- [ ] **App Icon** (512x512 PNG)
- [ ] **Feature Graphic** (1024x500 PNG) - **REQUIRED**
  - Design showcasing app UI or key feature

### Privacy & Data Safety

**You MUST complete Google Play's Data Safety form**:

**Data Collected:**
- Personal Info: Email address
- Health & Fitness: Workout data, nutrition logs, body metrics
- App Activity: Check-ins, usage patterns
- Device IDs: For RevenueCat subscriptions

**Data Shared:**
- RevenueCat (for subscription management)
- Supabase (for backend storage)
- Google Gemini AI (for plan generation - anonymized)

**Security Practices:**
- Data encrypted in transit (HTTPS)
- Data encrypted at rest (Supabase)
- User can request data deletion

### Google Play Console Configuration

- [ ] Create Google Play Console app
- [ ] Set up Closed Testing (Internal testing track)
- [ ] Add test users
- [ ] Configure pricing (Free with in-app purchases)
- [ ] Link RevenueCat for subscription management
- [ ] Add developer contact information
- [ ] Configure Play App Signing

---

## RevenueCat Configuration

### iOS
- [x] iOS API Key configured in app.json
- [ ] Create products in App Store Connect
  - Product ID: e.g., `elite_monthly`, `elite_annual`
  - Prices configured
- [ ] Link products in RevenueCat dashboard
- [ ] Configure entitlement `elite` with products
- [ ] Test with sandbox account

### Android
- [ ] **CRITICAL**: Add Android API Key to app.json
- [ ] Create products in Google Play Console
  - Product ID: matching iOS where possible
  - Base plans and offers configured
- [ ] Link products in RevenueCat dashboard
- [ ] Test with Google Play test account

---

## Pre-Submission Checklist

### Both Platforms
- [x] App builds successfully
- [ ] All environment variables configured in EAS
- [ ] Privacy policy page live at `https://liftor.app/privacy`
- [ ] Support page live at `https://liftor.app/support`
- [ ] Terms of Service live at `https://liftor.app/terms`
- [ ] Test auth flows (email, Google sign-in)
- [ ] Test subscription purchase & restore
- [ ] Test all critical user flows
- [ ] Verify deep links work (auth callback)
- [ ] Check for memory leaks
- [ ] Test on different screen sizes
- [ ] Accessibility audit (VoiceOver/TalkBack)
- [ ] Load test (stress test plan generation)

### iOS Specific
- [ ] Test on real iOS device (not just simulator)
- [ ] Verify App Store Connect metadata
- [ ] Complete App Privacy questionnaire
- [ ] Upload screenshots (all required sizes)
- [ ] Test with TestFlight
- [ ] Gather feedback from beta testers
- [ ] Submit for review

### Android Specific
- [ ] Test on real Android device
- [ ] Sign APK/AAB with production keystore
- [ ] Complete Data Safety form
- [ ] Upload screenshots and feature graphic
- [ ] Test with Internal Testing track
- [ ] Roll out to Open Testing (optional)
- [ ] Submit for review

---

## Post-Launch

### Monitoring
- [ ] Set up crash reporting (Sentry, Firebase Crashlytics)
- [ ] Set up analytics (Firebase, Amplitude, etc.)
- [ ] Monitor RevenueCat dashboard for subscription metrics
- [ ] Monitor Supabase for database performance
- [ ] Set up alerts for critical errors

### Maintenance
- [ ] Plan for regular updates
- [ ] Monitor user reviews and ratings
- [ ] Respond to user feedback
- [ ] Track subscription churn
- [ ] Optimize based on usage data

---

## Asset Creation Tools & Resources

- **Screenshot Mockups**: Use [Screely](https://screely.com/) or [AppLaunchpad](https://theapplaunchpad.com/)
- **Feature Graphic**: Canva, Figma, Adobe XD
- **App Previews**: Use iOS Simulator + screen recording
- **Icon Design**: Ensure 1024x1024 with no transparency
- **Text Overlay**: Avoid too much text on screenshots; focus on UI

---

## Current Status

### Completed ✅
- App Icon (iOS)
- Bundle IDs configured
- Basic app.json configuration
- iOS native folder structure

### To Do 🔴
- All screenshots (iOS & Android)
- Feature graphic (Android)
- Privacy policy page
- Support page
- Terms of service page
- Android RevenueCat key
- Complete store listings
- Test subscription flows
- Submit to TestFlight
- Submit to Internal Testing (Android)

---

## Notes

1. **Privacy Policy**: MANDATORY for both stores. Must cover data collection, usage, sharing, and user rights.
2. **Screenshots**: Must be real app UI (no mockups). Can add text overlay to explain features.
3. **Subscriptions**: RevenueCat handles cross-platform logic, but you must configure products separately on each platform.
4. **Review Time**: Apple typically 24-48 hours, Google 1-7 days for initial review.
5. **Rejections**: Common reasons include missing privacy policy, misleading screenshots, incomplete metadata, broken features.

---

**Contact**: For questions about assets or submission, refer to:
- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Developer Policy](https://support.google.com/googleplay/android-developer/answer/9904549)
- [Expo EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)



