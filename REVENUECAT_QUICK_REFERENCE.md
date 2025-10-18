# RevenueCat Quick Reference Card

## ⚡ Quick Start (5 Minutes)

### 1. RevenueCat Dashboard Setup
```
1. Create Entitlement: "elite"
2. Add iOS/Android Products
3. Create Offering → Set as "Current"
4. Design Paywall → Publish
5. Get API Keys → Add to app.json
```

### 2. App Configuration
Already done! ✅ Check `app.json`:
```json
{
  "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY": "appl_...",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY": "goog_...",
  "EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT": "elite"
}
```

### 3. Test in TestFlight
```bash
# Build
eas build --profile production --platform ios

# Submit
eas submit --platform ios --latest

# Test with sandbox tester
# Settings → App Store → Sandbox Account
```

---

## 🔍 Debugging Commands

### View Logs on Device
```bash
# Option 1: Xcode Console
1. Connect device
2. Xcode → Window → Devices
3. Select device → Console
4. Filter: "RevenueCat"

# Option 2: Terminal
xcrun devicectl device info logs --device <UDID>
```

### Run Diagnostics
```typescript
import { runRevenueCatDiagnostics } from '@/utils/test-revenuecat';

// In app or debug screen
await runRevenueCatDiagnostics();
```

### Check Subscription Status
```typescript
import { checkSubscriptionStatus } from '@/utils/test-revenuecat';

const status = await checkSubscriptionStatus();
console.log('Is subscribed:', status.isSubscribed);
console.log('Entitlements:', status.activeEntitlements);
```

---

## 📊 Log Checkpoints

### ✅ Successful Flow
```
[RevenueCat] ✅ SDK configured successfully
[RevenueCat] ✅ User logged in successfully
[RevenueCat] Active entitlements: []

[Onboarding] Has required entitlement: false
[Onboarding] Presenting paywall if needed...
[Onboarding] Paywall result: PURCHASED
[Onboarding] ✅ Proceeding to plan generation

[GeneratePlan] Has required entitlement: true
[GeneratePlan] Paywall result: NOT_PRESENTED
[GeneratePlan] ✅ Subscription verified, generating plan...
```

### ❌ Common Error Patterns

**Missing API Key:**
```
[RevenueCat] ❌ Missing API key in app.json → extra.
```
**Fix:** Rebuild with `eas build`

**Not Configured:**
```
[RevenueCat] ❌ Configuration error: ...
```
**Fix:** Check bundle ID, API keys

**Paywall Error:**
```
[Onboarding] ❌ Paywall error: ...
```
**Fix:** Check offering is Current, paywall is published

---

## 🎯 Common Tasks

### Task: User Already Subscribed (Test New User)
```
1. RevenueCat Dashboard → Customers
2. Search for user (Supabase UUID)
3. Entitlements → Remove "elite"
4. User must restart app
```

### Task: Test Purchase Flow
```
1. Create sandbox tester in App Store Connect
2. Sign in: Settings → App Store → Sandbox Account
3. Complete onboarding
4. Paywall appears → Purchase
5. Use sandbox credentials
```

### Task: Test Restore
```
1. Delete app
2. Reinstall from TestFlight
3. Sign in with same account
4. Complete onboarding
5. Paywall appears → Restore Purchases
```

### Task: Add Restore Button
```typescript
import { restorePurchases } from '@/utils/subscription-helpers';

<Button onPress={restorePurchases}>
  Restore Purchases
</Button>
```

### Task: Show Subscription Status
```typescript
import { getSubscriptionStatusText } from '@/utils/subscription-helpers';

const status = await getSubscriptionStatusText();
// "Active • Renews January 15, 2026"
```

---

## 🐛 Troubleshooting Matrix

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| Paywall doesn't appear | Already subscribed | Check RC dashboard, remove entitlement |
| Paywall doesn't appear | Offering not Current | RC Dashboard → Set as Current |
| Purchase fails | Products not configured | App Store Connect → Create products |
| Purchase fails | Not sandbox tester | Settings → App Store → Sign in |
| "Missing API key" | Keys not in build | `eas build` again |
| Error presenting offering | Paywall not published | RC Dashboard → Publish paywall |
| Wrong entitlement | Name mismatch | Check "elite" vs "pro" everywhere |

---

## 📞 Support Info

### RevenueCat Dashboard
```
https://app.revenuecat.com/
→ Projects → [Your Project]
→ Customers (search by Supabase user ID)
→ Entitlements (check "elite")
→ Offerings (verify "Current")
→ Paywalls (verify "Published")
```

### App Store Connect
```
https://appstoreconnect.apple.com/
→ My Apps → Liftor
→ Features → In-App Purchases
→ Sandbox Testers
```

### Key Files
- Setup guide: `REVENUECAT_SETUP_GUIDE.md`
- Implementation: `PAYWALL_IMPLEMENTATION_SUMMARY.md`
- Config: `app.json`
- Init code: `app/_layout.tsx`
- Paywall calls: `app/onboarding.tsx`, `app/generating-base-plan.tsx`

---

## 💡 Pro Tips

1. **Always test with fresh user:** Existing entitlements prevent paywall from showing
2. **Check logs first:** 90% of issues are visible in logs
3. **Sandbox expires fast:** Test subscriptions expire after 5 minutes
4. **Bundle ID must match:** `liftor.app` everywhere (RC, App Store, code)
5. **Use diagnostics:** `runRevenueCatDiagnostics()` catches most config issues
6. **Test restore flow:** Many users reinstall apps
7. **Debug mode:** Automatically enabled in non-production builds
8. **Customer ID = Supabase UUID:** Easy to look up in RC dashboard

---

## 🚀 Launch Day Checklist

Quick pre-flight check before App Store submission:

```
✅ Products approved in App Store Connect
✅ Entitlement "elite" exists in RevenueCat
✅ Offering set as "Current"
✅ Paywall published
✅ Tested purchase in TestFlight
✅ Tested restore in TestFlight
✅ Tested already-subscribed user (paywall skipped)
✅ Privacy policy mentions subscriptions
✅ Bundle ID: liftor.app (matches everywhere)
```

Build command:
```bash
eas build --profile production --platform ios
eas submit --platform ios --latest
```

---

## 📚 Full Documentation

For comprehensive guides, see:
- `REVENUECAT_SETUP_GUIDE.md` - Complete setup walkthrough
- `PAYWALL_IMPLEMENTATION_SUMMARY.md` - What's implemented
- `REVENUECAT_PAYWALL_BACKEND.md` - Webhook integration

For code examples:
- `utils/test-revenuecat.ts` - Diagnostic utilities
- `utils/subscription-helpers.ts` - UI helper functions

You're all set! 🎉





