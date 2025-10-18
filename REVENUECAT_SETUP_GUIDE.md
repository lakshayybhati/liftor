# RevenueCat Setup Guide for TestFlight & Production

This guide ensures your RevenueCat paywall works correctly in TestFlight and production.

## Required APIs Implemented

### ✅ Core APIs (Already Implemented)

1. **Purchases.configure({ apiKey })** - Initialize SDK at app startup
2. **Purchases.logIn(appUserId)** - Link purchases to your Supabase user
3. **Purchases.logOut()** - Clear user on sign out
4. **Purchases.getCustomerInfo()** - Check subscription status
5. **RevenueCatUI.presentPaywallIfNeeded({ requiredEntitlementIdentifier })** - Show paywall if needed
6. **Purchases.setLogLevel('DEBUG')** - Debug logging (non-production builds)

### 📍 Where These Are Called

- **App startup** (`app/_layout.tsx`): Configure SDK, enable debug logging
- **User login** (`app/_layout.tsx`): Call `Purchases.logIn(userId)`
- **App foreground** (`app/_layout.tsx`): Refresh customer info
- **After onboarding** (`app/onboarding.tsx`): Show paywall before plan generation
- **Plan generation** (`app/generating-base-plan.tsx`): Defense-in-depth paywall check

---

## RevenueCat Dashboard Configuration

### Step 1: Create Products in App Stores

**iOS (App Store Connect):**
1. Go to App Store Connect → My Apps → Your App
2. Navigate to Features → In-App Purchases
3. Click + to create new subscription
4. Product ID examples: `elite_monthly`, `elite_annual`
5. Set pricing and localization
6. Submit for review (can test in sandbox before approval)

**Android (Google Play Console):**
1. Go to Google Play Console → Your App
2. Navigate to Monetize → Subscriptions
3. Create subscription products with same IDs: `elite_monthly`, `elite_annual`
4. Set pricing and billing period
5. Activate subscriptions

### Step 2: Configure RevenueCat

**2.1 Create Entitlement:**
1. RevenueCat Dashboard → Entitlements → Create New Entitlement
2. Name: `elite` (must match `EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT` in app.json)
3. Identifier: `elite`

**2.2 Add Products:**
1. RevenueCat Dashboard → Products → Add Product
2. Link your App Store and Play Store products
3. Associate products with the `elite` entitlement

**2.3 Create Offering:**
1. RevenueCat Dashboard → Offerings → Create New Offering
2. Identifier: `default` (or custom)
3. Add packages (e.g., monthly, annual)
4. Attach your products to packages
5. Set as **Current Offering**

**2.4 Configure Paywall:**
1. RevenueCat Dashboard → Paywalls → Create New Paywall
2. Design your paywall UI (or use template)
3. Link to your offering
4. Set default localization
5. Publish paywall

**2.5 Get API Keys:**
1. RevenueCat Dashboard → Project Settings → API Keys
2. Copy **Public iOS API Key** → `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
3. Copy **Public Android API Key** → `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
4. Copy **Secret API Key** (for webhook/backend) → Keep secure

### Step 3: Update App Configuration

Your `app.json` already has the keys configured:

```json
{
  "extra": {
    "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY": "appl_CfuHeBCwQmEZeYiYLvtHInhIQVs",
    "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY": "goog_txuAMppyVuWBJpJAtpWcwrhMxYl",
    "EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT": "elite"
  }
}
```

**Verify:**
- iOS key starts with `appl_`
- Android key starts with `goog_`
- Entitlement matches exactly what you created in RevenueCat dashboard

---

## TestFlight Testing Setup

### Step 1: Sandbox Tester Setup

**Create Sandbox Tester:**
1. Go to App Store Connect → Users and Access → Sandbox Testers
2. Click + to add tester
3. Use a **different email** than your Apple ID
4. Note: Gmail allows `+` aliases: `yourname+test1@gmail.com`

**Sign in on Device:**
1. iOS Settings → App Store → Sandbox Account
2. Sign in with your sandbox tester email
3. When purchasing in TestFlight, use sandbox credentials

### Step 2: Build for TestFlight

```bash
# Build iOS for TestFlight
eas build --profile production --platform ios

# Upload to TestFlight (automatic with EAS Submit)
eas submit --platform ios --latest
```

### Step 3: Testing Checklist

**Before Testing:**
- [ ] Products approved/ready in App Store Connect
- [ ] Entitlement `elite` created in RevenueCat
- [ ] Offering is set as "Current" in RevenueCat
- [ ] Paywall is published in RevenueCat
- [ ] Sandbox tester signed in on device

**Test Flow:**
1. Install TestFlight build
2. Create new account (or use test account)
3. Complete onboarding
4. Tap "Build My Journey"
5. **Paywall should appear** (if not already subscribed)
6. Test purchase with sandbox account
7. Verify plan generation proceeds after purchase

**If Paywall Doesn't Show:**
- Check device logs (see debugging section below)
- Verify tester doesn't already have entitlement in RevenueCat dashboard
- Ensure entitlement name matches exactly: `elite`
- Confirm offering is set as "Current"

---

## Debugging on TestFlight

### Enable Console Logs

**iOS Device:**
1. Connect device to Mac
2. Open Xcode → Window → Devices and Simulators
3. Select your device → Open Console
4. Filter by "RevenueCat" or "Onboarding" or "GeneratePlan"

**Or use Safari:**
1. Enable Web Inspector: Settings → Safari → Advanced → Web Inspector
2. Open Safari on Mac → Develop → [Your Device] → [App Name]

### Key Log Messages to Check

```
[RevenueCat] Initializing...
[RevenueCat] Platform: ios
[RevenueCat] API Key present: true
[RevenueCat] ✅ SDK configured successfully
[RevenueCat] Logging in user: 12345678...
[RevenueCat] ✅ User logged in successfully
[RevenueCat] Active entitlements: []  // or ["elite"] if subscribed

[Onboarding] Checking subscription status...
[Onboarding] Required entitlement: elite
[Onboarding] Has required entitlement: false
[Onboarding] Presenting paywall if needed...
[Onboarding] Paywall result: PURCHASED / RESTORED / NOT_PRESENTED / CANCELLED
```

### Common Issues & Fixes

**Issue:** Paywall doesn't appear
- **Cause:** User already has `elite` entitlement
- **Fix:** Check RevenueCat dashboard → Customers → find user → remove entitlement

**Issue:** "Missing API key" warning
- **Cause:** Keys not available in build
- **Fix:** Rebuild with `eas build` (keys are baked into production builds)

**Issue:** Paywall shows but purchase fails
- **Cause:** Products not configured or not approved in App Store Connect
- **Fix:** Ensure products are "Ready to Submit" or approved; check RevenueCat product linking

**Issue:** Paywall result is `ERROR_PRESENTING_OFFERING`
- **Cause:** No current offering or paywall not published
- **Fix:** Set offering as "Current" and publish paywall in RevenueCat dashboard

**Issue:** User sees production products instead of sandbox
- **Cause:** Not signed in with sandbox tester
- **Fix:** Settings → App Store → Sandbox Account → sign in with sandbox tester

---

## Production Checklist

Before releasing to App Store:

- [ ] Products approved in App Store Connect
- [ ] Products approved in Google Play Console (for Android)
- [ ] Entitlement created: `elite`
- [ ] Offering set as Current with paywall
- [ ] API keys verified in `app.json`
- [ ] Bundle ID matches RevenueCat configuration: `liftor.app`
- [ ] Tested full purchase flow in TestFlight sandbox
- [ ] Tested restore purchases
- [ ] Webhook configured (optional, for Supabase sync)
- [ ] Privacy policy mentions RevenueCat/subscriptions

---

## Optional: Webhook for Supabase Sync

If you want subscription status in your database:

**Deploy Edge Function:**
```bash
# Deploy webhook function
supabase functions deploy revenuecat-webhook

# Set secrets
supabase secrets set REVENUECAT_SECRET_API_KEY=your_secret_key
supabase secrets set REVENUECAT_WEBHOOK_SECRET=your_random_secret
```

**Configure RevenueCat Webhook:**
1. RevenueCat Dashboard → Integrations → Webhooks
2. URL: `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`
3. Authorization: `Bearer your_random_secret`
4. Events: Select all subscription events

See `REVENUECAT_PAYWALL_BACKEND.md` for full webhook setup.

---

## Testing Purchase Flows

### Test Scenarios

1. **New User, No Subscription:**
   - Complete onboarding → Paywall appears → Purchase → Plan generated

2. **Existing Subscriber:**
   - Complete onboarding → No paywall (NOT_PRESENTED) → Plan generated

3. **Purchase Cancellation:**
   - Complete onboarding → Paywall appears → Cancel → Returns to home

4. **Restore Purchases:**
   - Delete app, reinstall → Login → Onboarding → Paywall → Restore → Plan generated

5. **Expired Subscription:**
   - Let sandbox subscription expire (auto after ~5 mins) → Paywall appears again

---

## Support & Resources

- **RevenueCat Docs:** https://docs.revenuecat.com/
- **iOS Sandbox Testing:** https://developer.apple.com/in-app-purchase/
- **React Native SDK:** https://docs.revenuecat.com/docs/react-native
- **Paywalls:** https://docs.revenuecat.com/docs/paywalls

---

## Quick Reference: API Calls

```typescript
// Initialize (app startup)
await Purchases.configure({ apiKey: 'appl_...' });

// Set debug logging
Purchases.setLogLevel('DEBUG');

// Link to user
await Purchases.logIn(userId);

// Check subscription status
const customerInfo = await Purchases.getCustomerInfo();
const hasEntitlement = !!customerInfo.entitlements.active['elite'];

// Show paywall if needed
const result = await RevenueCatUI.presentPaywallIfNeeded({
  requiredEntitlementIdentifier: 'elite'
});

// Handle result
if (result === PAYWALL_RESULT.PURCHASED) { /* user bought */ }
if (result === PAYWALL_RESULT.RESTORED) { /* user restored */ }
if (result === PAYWALL_RESULT.NOT_PRESENTED) { /* already subscribed */ }
if (result === PAYWALL_RESULT.CANCELLED) { /* user closed paywall */ }

// Restore purchases (optional manual button)
await Purchases.restorePurchases();

// Logout
await Purchases.logOut();
```

---

## Summary

Your app is fully configured with:
- ✅ RevenueCat SDK initialization with debug logging
- ✅ User authentication binding (Purchases.logIn)
- ✅ Automatic customer info refresh
- ✅ Paywall presentation at onboarding
- ✅ Defense-in-depth paywall check at plan generation
- ✅ Comprehensive logging for debugging

**Next steps:**
1. Create products in App Store Connect
2. Configure entitlement and offering in RevenueCat dashboard
3. Create and publish a paywall
4. Test in TestFlight with sandbox account
5. Ship to production! 🚀





