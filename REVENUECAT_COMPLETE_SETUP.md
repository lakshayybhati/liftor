# RevenueCat SDK Complete Setup & Integration Guide

## 🔍 Current Implementation Review

### ✅ What's Already Configured

1. **API Keys in app.json**
   - iOS: `appl_CfuHeBCwQmEZeYiYLvtHInhIQVs`
   - Android: `goog_txuAMppyVuWBJpJAtpWcwrhMxYl`
   - Required Entitlement: `elite`

2. **SDK Initialization** (`app/_layout.tsx`)
   - ✅ Platform detection (iOS/Android)
   - ✅ Debug logging in non-production
   - ✅ User login/logout with Supabase user ID
   - ✅ AppState listener for refresh on foreground
   - ✅ Initial customer info fetch

3. **Custom Paywall** (`app/paywall.tsx`)
   - ✅ Offerings fetch with fallback logic
   - ✅ Package selection (Annual/Monthly with `$rc_annual`/`$rc_monthly`)
   - ✅ Multi-currency support (automatic via SDK)
   - ✅ Purchase flow
   - ✅ Restore purchases
   - ✅ Test unlock button (dev only)
   - ✅ Debug panel with diagnostics

4. **Navigation Gating**
   - ✅ `app/index.tsx` - Redirects to paywall if not subscribed
   - ✅ `app/(tabs)/home.tsx` - Checks subscription on mount
   - ✅ `app/generating-base-plan.tsx` - Checks before plan generation

5. **Subscription Helpers** (`utils/subscription-helpers.ts`)
   - ✅ `hasActiveSubscription()` - Check entitlement
   - ✅ `getSubscriptionDetails()` - Get full info
   - ✅ `restorePurchases()` - Restore with UI feedback
   - ✅ `getSubscriptionTier()` - Get tier (trial/elite/none)

---

## ❌ Critical Issue Found

### Missing Package
The core RevenueCat SDK package is **NOT installed** in `package.json`:

**Current:**
```json
{
  "react-native-purchases-ui": "^9.5.1"  // Only UI package
}
```

**Needs:**
```json
{
  "react-native-purchases": "^8.5.0",      // Core SDK ← MISSING
  "react-native-purchases-ui": "^9.5.1"    // UI package (optional)
}
```

---

## 🛠️ Fix Required

### Install the Core SDK

Run this command:
```bash
npm install react-native-purchases@^8.5.0
```

Or add to `package.json` and run `npm install`:
```json
"react-native-purchases": "^8.5.0"
```

### Why This Matters
- Without the core SDK, all `Purchases` imports will fail at runtime
- The paywall won't load offerings
- Purchase flows won't work
- The app will crash when trying to access RevenueCat

---

## 🌍 Multi-Currency Support

### How It Works (Automatic)
RevenueCat and StoreKit/Google Play handle currency localization automatically:

1. **StoreKit/Google Play**:
   - Fetches prices in user's local currency based on their Apple/Google account region
   - No code changes needed

2. **RevenueCat SDK**:
   - Automatically provides localized prices via `package.product.priceString`
   - Format: `$9.99`, `€8.99`, `₹799`, etc.

3. **Your Paywall** (`app/paywall.tsx`):
   - Already correctly displays `package.product.priceString`
   - ✅ Lines 155-166 show proper price display

### Example Price Display
```tsx
// Annual package
priceTop={monthlyFromAnnualText || annualPkg.product.priceString}
priceBottom={`Billed at ${annualPkg.product.priceString}/yr`}

// Monthly package
priceTop={monthlyPkg.product.priceString + '/mo'}
priceBottom={`Billed at ${monthlyPkg.product.priceString}/mo`}
```

**Multi-Currency Examples:**
- 🇺🇸 USA: `$9.99/mo`, `$99.99/yr`
- 🇬🇧 UK: `£9.99/mo`, `£99.99/yr`
- 🇮🇳 India: `₹799/mo`, `₹7,999/yr`
- 🇪🇺 Europe: `€9.99/mo`, `€99.99/yr`

### Currency Conversion Helper
Your code already includes a currency extraction helper:

```typescript:paywall.tsx
function extractCurrencySymbol(priceString: string): string {
  const match = priceString?.match(/^[^\d]+/);
  return match ? match[0].trim() : '$';
}

function perMonthPriceText(annual: PurchasesPackage): string | null {
  const total = Number(annual.product.price || 0);
  if (!total) return null;
  const per = total / 12;
  const symbol = extractCurrencySymbol(annual.product.priceString);
  return `${symbol}${per.toFixed(2)}/mo`;
}
```

This calculates monthly equivalent for annual plans in the correct currency.

---

## 📋 Complete Integration Checklist

### 1. Package Installation
- [ ] Install `react-native-purchases` core SDK
- [ ] Run `npm install`
- [ ] Rebuild app with `eas build` or `npx expo prebuild` + `npx expo run:ios`

### 2. App Store Connect Setup
For **BOTH** Monthly and Annual products:

#### Product Configuration
- [ ] Product ID: `org.name.liftor.Monthly` and `org.name.liftor.Annual`
- [ ] Subscription Group created and linked
- [ ] Reference Name set

#### Pricing (Critical)
- [ ] Click "Subscription Pricing"
- [ ] Add "Starting Price" with appropriate tier
- [ ] Click **"Done"** in modal
- [ ] Click **"Save"** on main page
- [ ] Verify table appears under "Current Pricing for New Subscribers"

#### Availability
- [ ] "Cleared for Sale" toggle **ON**
- [ ] Select "All Countries and Regions" (or specific regions)
- [ ] Click **"Save"**

#### Localization (Optional for Multi-Currency)
- [ ] Add localized descriptions for each currency region
- [ ] Apple automatically handles price conversion based on your base price

### 3. RevenueCat Dashboard Setup

#### Entitlements
- [ ] Create entitlement: `elite` (exact lowercase)
- [ ] Attach products:
  - `org.name.liftor.Monthly`
  - `org.name.liftor.Annual`

#### Offerings
- [ ] Create offering: `elite`
- [ ] Mark as **Current** (blue checkmark)
- [ ] Add Annual Package:
  - Identifier: `$rc_annual`
  - Product: `org.name.liftor.Annual`
- [ ] Add Monthly Package:
  - Identifier: `$rc_monthly`
  - Product: `org.name.liftor.Monthly`

#### App Configuration
- [ ] Bundle ID: `liftor.app`
- [ ] Platform: iOS (add Android later)
- [ ] Copy Public API Key to `app.json`

### 4. Testing Multi-Currency

#### Test Different Regions
1. **Change Apple ID Region**:
   - Settings → Apple ID → Media & Purchases → View Account → Country/Region
   - Change to test region (UK, India, EU, etc.)

2. **Create Sandbox Accounts**:
   - App Store Connect → Users and Access → Sandbox Testers
   - Create testers with different regions

3. **Test on Device**:
   - Sign out of production Apple ID
   - Settings → App Store → Sandbox Account → Sign in with test account
   - Open app → paywall should show prices in that region's currency

#### Verify Currency Display
- [ ] Prices show correct currency symbol
- [ ] Monthly prices formatted correctly
- [ ] Annual prices show yearly total
- [ ] Discount percentage calculates correctly
- [ ] "Per month" calculation uses correct currency

---

## 🎯 SDK Implementation Details

### 1. SDK Initialization (app/_layout.tsx)

```typescript
// Best practices implemented:
✅ Platform check (skip web and Expo Go)
✅ Debug logging in development
✅ User identity management with Purchases.logIn()
✅ AppState listener for foreground refresh
✅ Error handling with detailed logs
```

### 2. Offerings Fetch (app/paywall.tsx)

```typescript
// Lines 26-52: Robust offerings fetch
const offerings = await Purchases.getOfferings();

// Fallback logic:
1. Use requested offering if specified
2. Fall back to offerings.current
3. Fall back to first available offering
4. Show error if no offerings

// Package selection:
- Looks for $rc_annual and $rc_monthly (recommended IDs)
- Falls back to packageType check
- Falls back to identifier regex matching
```

### 3. Purchase Flow (app/paywall.tsx)

```typescript
// Lines 70-91: Purchase with entitlement check
const { customerInfo } = await Purchases.purchasePackage(selected);
const entitled = !!customerInfo.entitlements.active[requiredEntitlement];

if (entitled) {
  // Navigate to next screen
} else {
  // Double-check and show error
}
```

### 4. Restore Purchases (utils/subscription-helpers.ts)

```typescript
// Lines 93-128: Restore with UI feedback
const customerInfo = await Purchases.restorePurchases();
const hasEntitlement = !!customerInfo.entitlements.active[requiredEntitlement];

if (hasEntitlement) {
  Alert.alert('Success', 'Your subscription has been restored!');
  return true;
} else {
  Alert.alert('No Subscription Found', '...');
  return false;
}
```

---

## 🔄 SDK Lifecycle

### App Launch
1. `RCPurchasesInit` component mounts
2. SDK configures with API key
3. Initial `getCustomerInfo()` call
4. If user logged in → `Purchases.logIn(userId)`

### User Logs In
1. Supabase auth session created
2. `Purchases.logIn(userId)` called
3. RevenueCat links purchases to user
4. Customer info refreshed

### User Logs Out
1. Supabase session cleared
2. `Purchases.logOut()` called
3. SDK switches to anonymous user

### App Foreground
1. AppState listener detects "active"
2. `getCustomerInfo()` refreshes subscription status
3. Paywall/home screen can react to changes

---

## 🐛 Debugging Multi-Currency Issues

### If Prices Don't Show
1. **Check App Store Connect pricing is saved** (most common)
2. **Wait 1-4 hours for propagation**
3. **Verify sandbox account region matches product availability**

### If Wrong Currency Shows
1. **Check device region**: Settings → General → Language & Region
2. **Check Apple ID region**: Settings → Apple ID → Media & Purchases
3. **Sandbox tester region**: Must match your test case

### Debug Logs to Check
```
[RevenueCat] Active entitlements: ['elite']
[Paywall] offerings keys: ['elite']
[Paywall] current offering id: elite
[Paywall] packages: $rc_annual, $rc_monthly
```

### Price Object Structure
```typescript
package.product.priceString  // "$9.99" (localized)
package.product.price        // 9.99 (number)
package.product.currencyCode // "USD"
package.identifier           // "$rc_monthly"
package.packageType          // "MONTHLY"
```

---

## ✅ Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Core SDK | ❌ **NOT INSTALLED** | Must install `react-native-purchases` |
| SDK Init | ✅ Correct | Proper platform checks and user management |
| Paywall UI | ✅ Correct | Multi-currency support built-in |
| Offerings | ✅ Correct | Robust fallback logic |
| Packages | ✅ Correct | Uses recommended $rc_annual/$rc_monthly |
| Purchase | ✅ Correct | Entitlement check after purchase |
| Restore | ✅ Correct | UI feedback and entitlement check |
| Navigation | ✅ Correct | Proper gating on index and home |
| Helpers | ✅ Correct | Clean subscription utilities |

---

## 🚀 Next Steps

### Immediate (Required)
1. **Install core SDK**: `npm install react-native-purchases@^8.5.0`
2. **Rebuild app**: `eas build --platform ios --profile preview`
3. **Verify App Store Connect pricing is saved**
4. **Test on device with sandbox account**

### Configuration (If not done)
1. **App Store Connect**: Save pricing for both products
2. **RevenueCat**: Mark offering as Current
3. **Wait**: 1-4 hours for propagation

### Testing Multi-Currency
1. **Create sandbox testers** for different regions
2. **Test with UK, EU, India accounts**
3. **Verify currency symbols and formatting**

---

## 📞 Support

### If Issues Persist
1. **Check device logs**: Xcode → Devices → Console (filter "RevenueCat" or "Paywall")
2. **Run diagnostics**: Tap debug button in paywall (dev builds)
3. **RevenueCat Customer Debugger**: Dashboard → Customer Debugger → enter user ID

### Common Errors
- "Configuration problem... products could not be fetched" → App Store Connect pricing not saved
- "No offerings found" → Offering not marked Current in RevenueCat
- "Invalid product identifiers" → Product IDs mismatch

---

## 🎉 Summary

Your RevenueCat integration is **99% complete** with proper multi-currency support already built-in. The only issue is the **missing core SDK package**.

Once you install `react-native-purchases`, everything should work perfectly across all currencies and regions! 🌍

**The SDK handles all currency localization automatically** - you don't need any additional code. Your paywall already displays the localized prices correctly using `product.priceString`.

