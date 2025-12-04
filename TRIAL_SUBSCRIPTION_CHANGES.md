# Trial & Subscription System Implementation

This document summarizes the changes made to implement the server-timed local trial and subscription system.

## Overview

The new system implements:
1. **Local 3-day trial** - Server-timed, no Apple involvement, one-time per user
2. **30% OFF immediate subscription** - Discount messaging for eligible users
3. **User state machine** - NO_ACCESS, LOCAL_TRIAL_ACTIVE, LOCAL_TRIAL_EXPIRED, SUBSCRIBED
4. **Feature gating** - Export and preferences locked during trial
5. **Server-side access control** - All decisions made via `/session/status` endpoint

## Files Changed

### Database

**`supabase/migrations/20251213_trial_subscription_fields.sql`** (NEW)
- Adds trial fields: `trial_type`, `trial_active`, `trial_started_at`, `trial_ends_at`, `has_had_local_trial`
- Adds discount fields: `discount_eligible_immediate`, `discount_used_at`
- Creates index for trial expiration cron job

**`supabase/schema.sql`** (UPDATED)
- Added trial and discount columns documentation

### Backend (Supabase Edge Functions)

**`supabase/functions/session-status/index.ts`** (NEW)
- Single source of truth for access state
- Returns `access`, `trial`, `subscriptionStatus`, `hasHadLocalTrial`, `discountEligibleImmediate`
- Uses server time for trial expiration checks
- Auto-expires trials when queried

**`supabase/functions/trial-local-start/index.ts`** (NEW)
- Starts one-time 3-day local trial
- Validates preconditions (no prior trial, not already active)
- Sets `discount_eligible_immediate = false` when trial starts

**`supabase/functions/trial-expiration-cron/index.ts`** (NEW)
- Scheduled function to expire local trials
- Sends push notifications and emails when trials expire
- Should be called every 10-15 minutes

### Client Hooks

**`hooks/useSessionStatus.ts`** (NEW)
- React Query hook for session status
- Fetches from `/session/status` on mount and app resume
- Provides `startTrial()` function
- Exports `formatTrialTimeRemaining()` helper

### Client Utilities

**`utils/subscription-helpers.ts`** (UPDATED)
- Added `checkAppAccess()` function that calls `/session/status`
- Added `clearSessionStatusCache()` for cache invalidation
- Maintains backward compatibility with existing functions

### App Screens

**`app/paywall.tsx`** (UPDATED)
- Added trial CTA: "Not ready to subscribe? Try the app for 3 days."
- Dynamic discount messaging based on `discountEligibleImmediate`
- Handles `trialEnded` param for different messaging
- New `onStartLocalTrial()` handler

**`app/(tabs)/home.tsx`** (UPDATED)
- Added trial countdown badge showing time remaining
- Uses `useSessionStatus` for subscription badge
- Updated paywall check to use `checkAppAccess()`

**`app/index.tsx`** (UPDATED)
- Uses `useSessionStatus` for routing decisions
- Redirects to paywall with `trialEnded=true` when trial expired

**`app/(tabs)/settings.tsx`** (UPDATED)
- Export feature gated behind subscription
- Shows lock icon and "Pro" badge for locked features
- Uses `useSessionStatus` for subscription info

**`app/plan-preview.tsx`** (UPDATED)
- Uses `checkAppAccess()` instead of `hasActiveSubscription()`

### Types

**`hooks/useProfile.ts`** (UPDATED)
- Added trial fields to Profile interface
- Added discount fields to Profile interface

## User State Machine

```
                    ┌─────────────────┐
                    │   NEW_USER      │
                    │ (after onboard) │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │ Tap "Subscribe  │           │ Tap "Try app    │
    │  • 30% OFF"     │           │  for 3 days"    │
    └────────┬────────┘           └────────┬────────┘
             │                             │
             ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │   SUBSCRIBED    │           │ LOCAL_TRIAL     │
    │   (full access) │           │ (3 days, gated) │
    └─────────────────┘           └────────┬────────┘
                                           │
                                  3 days pass (server time)
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │ LOCAL_TRIAL     │
                                  │ _EXPIRED        │
                                  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │ "Trial ended"   │
                                  │  paywall        │
                                  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │   SUBSCRIBED    │
                                  │   (full access) │
                                  └─────────────────┘
```

## Feature Gating

| Feature | Trial | Subscribed |
|---------|-------|------------|
| Core app features | ✅ | ✅ |
| Daily check-ins | ✅ | ✅ |
| Plan generation | ✅ | ✅ |
| Export data | ❌ | ✅ |
| Edit preferences | ❌ | ✅ |

## Deployment Steps

1. **Run database migration**
   ```bash
   supabase db push
   ```

2. **Deploy edge functions**
   ```bash
   supabase functions deploy session-status
   supabase functions deploy trial-local-start
   supabase functions deploy trial-expiration-cron
   ```

3. **Set up cron job** for trial expiration (every 10-15 minutes)
   - Use Supabase pg_cron or external scheduler
   - Call: `POST /functions/v1/trial-expiration-cron`

4. **Configure App Store Connect** (if not already done)
   - Create subscription with introductory offer (~30% discount)
   - Ensure products are in Ready to Submit state

## Testing Checklist

- [ ] New user → immediate subscription (30% OFF shown)
- [ ] New user → start local trial → use app for 3 days
- [ ] Trial expiration → "Trial ended" paywall shown
- [ ] Trial expired user → subscribe → full access
- [ ] Export data blocked during trial
- [ ] Trial badge shows countdown on home screen
- [ ] Discount messaging disappears after trial start


