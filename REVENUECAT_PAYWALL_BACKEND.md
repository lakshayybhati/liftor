## RevenueCat Paywall & Backend Integration (Production-Ready)

This document explains how the native RevenueCat Paywall is integrated into the app, how subscription gating works end-to-end, and how the backend (Supabase) stays in sync via a secure webhook. It also covers configuration, deployment, and testing in production.

---

### High-Level Flow

1) User completes onboarding and taps “Build My Journey”.
2) The app calls RevenueCat’s native UI `presentPaywallIfNeeded` with your required entitlement (e.g., `pro`).
   - If the user is already subscribed, the paywall is NOT presented and the app proceeds.
   - If not subscribed, the native paywall is presented. On purchase (or restore), proceed.
3) Before generating the base plan, we call `presentPaywallIfNeeded` again (defense-in-depth). If unsubscribed, paywall shows; if cancelled, we exit to Home.
4) RevenueCat sends webhooks to a Supabase Edge Function which updates subscription fields in `profiles`. The app uses SDK gating at runtime; the DB is the source of truth for server-side or analytics.

---

### Client Configuration

Config keys are stored in `app.json` → `expo.extra`:

- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`: Public API key for iOS
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`: Public API key for Android
- `EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT`: The entitlement identifier required to unlock the app (e.g., `pro`)

Purchases SDK is initialized on app start and bound to the logged-in Supabase user ID. This ensures subscriber state is tied to the user account.

---

### Where the Paywall is Triggered

- After onboarding (when tapping “Build My Journey”), the app calls:
  - `RevenueCatUI.presentPaywallIfNeeded({ requiredEntitlementIdentifier })`
  - If result is Purchased/Restored/Not Presented → proceed to `generating-base-plan`
  - Otherwise → return to Home

- When entering base plan generation:
  - The same `presentPaywallIfNeeded` is invoked. If the user cancels, we exit instead of continuing.

This provides a seamless UX for already-subscribed users (no extra dialogs) and a straightforward purchase/restore path for new users.

---

### RevenueCat Dashboard Setup

1) Create Products (App Store / Play Store) and link them in RevenueCat.
2) Create an Entitlement (e.g., `pro`).
3) Create an Offering and add your products.
4) Configure a Paywall for the Offering with RevenueCat’s Paywalls tool.
5) Obtain your Public API keys for iOS/Android and the Secret API key for server-side.

App shows the paywall tied to your current offering. All paywall content/variants can be updated server-side without shipping a new app build.

---

### Backend (Supabase) Integration

We store subscription state on the `profiles` table for analytics and optional server-side checks. SDK gating remains the authoritative client experience.

Schema additions (idempotent columns):

- `rc_app_user_id` text
- `rc_customer_id` text
- `rc_entitlements` text[]
- `subscription_active` boolean
- `subscription_platform` text
- `subscription_will_renew` boolean
- `subscription_expiration_at` timestamptz
- `subscription_renewal_at` timestamptz (optional future use)
- `last_rc_event` jsonb (raw last webhook payload for debugging)

These fields are updated by the Edge Function when RevenueCat sends events.

---

### Webhook Sync (Supabase Edge Function)

We expose a secure Edge Function endpoint to receive RevenueCat webhooks and sync the `profiles` row for the given user.

Environment Variables (Edge Function):

- `SUPABASE_URL`: project URL
- `SUPABASE_SERVICE_ROLE_KEY`: service role key (only in server/edge)
- `REVENUECAT_SECRET_API_KEY`: RevenueCat Secret API key (server-to-server)
- `REVENUECAT_WEBHOOK_SECRET`: shared bearer token to verify webhook requests

Security:

- RevenueCat Dashboard → Webhook settings → set Authorization header to `Bearer <REVENUECAT_WEBHOOK_SECRET>`
- Edge function checks this header before processing.
- Server uses Service Role Key to update `profiles` (bypasses RLS safely on server side only).

Processing Logic (Edge Function):

1) Verify Authorization header.
2) Parse webhook JSON; extract `app_user_id`.
3) Fetch canonical subscriber from RC REST (`/v1/subscribers/{app_user_id}`) using `REVENUECAT_SECRET_API_KEY`.
4) Compute active entitlements, renewal status, expiration.
5) Update `profiles` with:
   - `rc_app_user_id`, `rc_customer_id`
   - `rc_entitlements`, `subscription_active`, `subscription_platform`, `subscription_will_renew`, `subscription_expiration_at`, `last_rc_event`

This keeps the backend in sync even if the app is closed or installed on another device.

---

### Production Build Requirements

- In-app purchases require a custom dev client or EAS build (Expo Go doesn’t include billing).
- Run:
  - `npx expo prebuild`
  - `npx expo run:ios` / `npx expo run:android` (dev client), or `eas build -p ios|android`
- Configure store accounts, products, and sandbox testers.

---

### Testing & Validation

Client:

- Complete onboarding → on “Build My Journey”, verify:
  - Subscribed user: proceeds without paywall
  - Unsubscribed user: native paywall appears; upon purchase/restore proceeds to plan generation
- Navigate to base plan generation without purchase → paywall shows (defense-in-depth)

Webhook:

- In RevenueCat Dashboard, configure webhook URL for the Supabase Edge Function (e.g., `https://<project-ref>.functions.supabase.co/revenuecat-webhook`) and Authorization header.
- Trigger test events or perform a sandbox purchase to confirm `profiles.subscription_active` flips and `rc_entitlements` contains your entitlement.

---

### Error Handling & Resilience

- If a webhook delivery fails, the app still gates access via the SDK (`presentPaywallIfNeeded`). The DB will update on the next successful webhook.
- If the user cancels the paywall, we return to Home instead of proceeding.
- If RevenueCat SDK returns an error, the journey generation is not started (user remains unsubscribed path).

---

### Optional Enhancements

- Locale override: `Purchases.overridePreferredUILocale("de-DE")` to force a paywall language.
- Paywall listeners (if using the component API) for analytics: `onPurchaseCompleted`, `onDismiss`, etc.
- Use `offering` parameter to `presentPaywallIfNeeded` to target a specific offering variant (A/B tests).

---

### Operational Checklist

- [ ] Entitlement created (e.g., `pro`)
- [ ] Products configured for iOS/Android
- [ ] Offering created and set as current
- [ ] Paywall configured in RevenueCat Dashboard
- [ ] `app.json` keys set (iOS/Android Public API, required entitlement)
- [ ] Edge Function deployed with env vars set
- [ ] RevenueCat webhook pointing to Edge Function with Authorization bearer secret
- [ ] EAS builds signed and tested on device with sandbox testers

---

### Summary

The app uses RevenueCat’s native paywall UI to gate access to journey generation. Subscribed users skip the paywall automatically, while unsubscribed users see the paywall at precise moments in the flow. Supabase stores subscription snapshots for backend usage and analytics, kept in sync via a secure Edge Function listening to RevenueCat webhooks. This design ensures a robust, production-ready subscription experience across devices and sessions.



