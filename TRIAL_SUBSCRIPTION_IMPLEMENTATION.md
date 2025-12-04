# Liftor Trial & Subscription Flow – Implementation Analysis

## Executive Summary

This document analyzes the current implementation and provides a complete roadmap to implement the trial + subscription model defined in `lift.plan.md`.

---

## Part 1: Current Implementation Analysis

### 1.1 Current Architecture Overview

The app currently uses **RevenueCat** for subscription management with the following flow:

```
User completes onboarding
       ↓
Base plan generated (plan-preview.tsx)
       ↓
"Start My Journey" button clicked
       ↓
hasActiveSubscription() check
       ↓
If NO subscription → paywall.tsx (blocking mode)
       ↓
User purchases via RevenueCat/StoreKit
       ↓
Navigate to home
```

### 1.2 Key Files & Their Current Roles

| File | Current Role | Blueprint Changes Needed |
|------|--------------|-------------------------|
| `app/paywall.tsx` | Shows RevenueCat offerings (annual/monthly), handles purchases via StoreKit | Add local trial CTA, 30% discount messaging, trial-ended variant |
| `utils/subscription-helpers.ts` | Checks RevenueCat entitlements, restore purchases | Add local trial status checks, integrate with backend `/session/status` |
| `app/plan-preview.tsx` | Entry point after base plan generation | No major changes, continues to check access |
| `app/(tabs)/home.tsx` | Background paywall check after 5s | Check local trial status, show trial badge |
| `app/index.tsx` | Root routing based on onboarding + subscription | Add local trial routing logic |
| `hooks/useProfile.ts` | Fetches profile from Supabase | Add new trial/subscription fields |
| `supabase/schema.sql` | Profile table definition | Add trial + subscription columns |
| `supabase/functions/revenuecat-webhook/index.ts` | Syncs RevenueCat events to profile | Keep for subscription sync |

### 1.3 Current Data Model (profiles table)

**Existing subscription-related columns:**
```sql
rc_app_user_id text null,
rc_customer_id text null,
rc_entitlements text[] not null default '{}',
subscription_active boolean not null default false,
subscription_platform text null,
subscription_will_renew boolean null,
subscription_expiration_at timestamptz null,
subscription_renewal_at timestamptz null,
last_rc_event jsonb null
```

**Missing columns (required by blueprint):**
```sql
-- Local trial fields
trial_type text null default 'none',  -- 'none' | 'local' | 'storekit'
trial_active boolean not null default false,
trial_started_at timestamptz null,
trial_ends_at timestamptz null,
has_had_local_trial boolean not null default false,

-- Discount eligibility
discount_eligible_immediate boolean not null default true,
discount_used_at timestamptz null
```

### 1.4 Current Access Control Flow

**Client-side (`hasActiveSubscription()`):**
```typescript
// Current implementation in utils/subscription-helpers.ts
export async function hasActiveSubscription(): Promise<boolean> {
  // 1. Check dev bypass (Expo Go only)
  // 2. Guard: Expo Go returns false
  // 3. Call Purchases.getCustomerInfo()
  // 4. Return !!customerInfo.entitlements.active[requiredEntitlement]
}
```

**Issues with current approach:**
- ❌ No local trial support
- ❌ All access decisions made client-side via RevenueCat SDK
- ❌ No server-timed trial window
- ❌ No discount eligibility tracking

### 1.5 Current Paywall UI

**Current CTAs:**
- "Start your 7-day free trial" (annual)
- "Start your 3-day free trial" (monthly)
- Both trigger **StoreKit purchase immediately**

**Blueprint requires:**
- Primary: "Start subscription • 30% OFF" → StoreKit purchase
- Secondary: "Not ready to subscribe? Try the app for 3 days." → **Local trial (no payment)**

---

## Part 2: Required Changes

### 2.1 Database Schema Changes

**New migration file: `supabase/migrations/YYYYMMDD_trial_subscription_fields.sql`**

```sql
-- Add trial and discount fields to profiles table
alter table public.profiles
  add column if not exists trial_type text null default 'none',
  add column if not exists trial_active boolean not null default false,
  add column if not exists trial_started_at timestamptz null,
  add column if not exists trial_ends_at timestamptz null,
  add column if not exists has_had_local_trial boolean not null default false,
  add column if not exists discount_eligible_immediate boolean not null default true,
  add column if not exists discount_used_at timestamptz null;

-- Add check constraint for trial_type
alter table public.profiles
  add constraint profiles_trial_type_check
  check (trial_type in ('none', 'local', 'storekit'));

-- Index for trial expiration cron job
create index if not exists idx_profiles_trial_expiration
  on public.profiles(trial_active, trial_ends_at)
  where trial_type = 'local' and trial_active = true;
```

### 2.2 New Backend Endpoints

#### A. `/session/status` (Supabase Edge Function)

**Purpose:** Single source of truth for access state, called on app launch and resume.

**Request:** Authenticated user token

**Response:**
```json
{
  "access": {
    "full": false,
    "trial": true,
    "can_use_app": true,
    "can_export_data": false,
    "can_edit_preferences": false
  },
  "trial": {
    "active": true,
    "ends_at": "2025-01-06T12:00:00Z",
    "type": "local"
  },
  "subscription_status": "none",
  "has_had_local_trial": true,
  "discount_eligible_immediate": false
}
```

**Logic:**
```typescript
const now = new Date();

// Compute subscription from profile (synced by RevenueCat webhook)
const hasSubscription = profile.subscription_active === true;

// Compute local trial status using SERVER time
let trialActive = false;
if (profile.trial_type === 'local' && profile.trial_ends_at) {
  trialActive = now < new Date(profile.trial_ends_at);
  // If expired, update DB
  if (!trialActive && profile.trial_active) {
    await supabase.from('profiles').update({ trial_active: false }).eq('id', userId);
  }
}

const canUseApp = hasSubscription || trialActive;
const canExportData = hasSubscription;
const canEditPreferences = hasSubscription;
```

#### B. `/trial/local/start` (Supabase Edge Function)

**Purpose:** Start a one-time 3-day local trial.

**Request:** Authenticated user token

**Preconditions:**
- `has_had_local_trial === false`
- `trial_active === false`

**Actions:**
```typescript
const now = new Date();
const endsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

await supabase.from('profiles').update({
  trial_type: 'local',
  trial_active: true,
  trial_started_at: now.toISOString(),
  trial_ends_at: endsAt.toISOString(),
  has_had_local_trial: true,
  discount_eligible_immediate: false,
}).eq('id', userId);
```

**Response:** Returns updated `/session/status` payload.

#### C. Trial Expiration Cron Job

**Schedule:** Every 10-15 minutes via Supabase pg_cron or scheduled edge function.

**Query:**
```sql
UPDATE public.profiles
SET trial_active = false
WHERE trial_type = 'local'
  AND trial_active = true
  AND trial_ends_at <= now();
```

**Notification trigger:** For each expired user, enqueue push notification:
> "Your 3-day Liftor trial has ended. Subscribe to keep your AI coach active."

### 2.3 Client-Side Changes

#### A. New Session Context/Hook

**File:** `hooks/useSessionStatus.ts`

```typescript
interface SessionStatus {
  access: {
    full: boolean;
    trial: boolean;
    canUseApp: boolean;
    canExportData: boolean;
    canEditPreferences: boolean;
  };
  trial: {
    active: boolean;
    endsAt: string | null;
    type: 'none' | 'local' | 'storekit';
  };
  subscriptionStatus: 'none' | 'active' | 'expired';
  hasHadLocalTrial: boolean;
  discountEligibleImmediate: boolean;
}

export function useSessionStatus() {
  // Fetch from /session/status on mount and app resume
  // Cache in React Query or Zustand
  // Expose: data, isLoading, refetch
}
```

#### B. Updated Access Check

**File:** `utils/subscription-helpers.ts`

```typescript
// New function that checks local trial + subscription
export async function checkAppAccess(): Promise<{
  canUseApp: boolean;
  isTrial: boolean;
  isSubscribed: boolean;
  trialEndsAt: string | null;
}> {
  // 1. Fetch /session/status from backend
  // 2. Return computed access state
}

// Keep hasActiveSubscription() for backward compatibility
// but have it call checkAppAccess() internally
```

#### C. Paywall UI Updates

**File:** `app/paywall.tsx`

**New props/state:**
```typescript
const { data: sessionStatus } = useSessionStatus();

const showDiscountMessaging = sessionStatus?.discountEligibleImmediate ?? false;
const showTrialCTA = !sessionStatus?.hasHadLocalTrial && !sessionStatus?.trial.active;
```

**Updated UI structure:**
```tsx
{/* Title */}
<Text>Unlock your AI coach</Text>

{/* Subtext - dynamic */}
{showDiscountMessaging ? (
  <Text>Start now and get 30% off your first subscription period.</Text>
) : (
  <Text>Subscribe to keep your plan evolving every day.</Text>
)}

{/* Primary Button */}
<Button
  title={showDiscountMessaging ? "Start subscription • 30% OFF" : "Start subscription"}
  onPress={handlePurchase}
/>

{/* Secondary Trial Link - conditional */}
{showTrialCTA && (
  <TouchableOpacity onPress={handleStartLocalTrial}>
    <Text>Not ready to subscribe? Try the app for 3 days.</Text>
  </TouchableOpacity>
)}
```

**New handlers:**
```typescript
const handleStartLocalTrial = async () => {
  try {
    await fetch('/trial/local/start', { method: 'POST', headers: authHeaders });
    await refetchSessionStatus();
    router.replace('/(tabs)/home');
  } catch (e) {
    Alert.alert('Error', 'Could not start trial');
  }
};

const handlePurchase = async () => {
  // Existing StoreKit purchase flow
  // On success, also set discount_eligible_immediate = false via backend
};
```

#### D. Trial Badge on Home

**File:** `app/(tabs)/home.tsx`

```tsx
const { data: sessionStatus } = useSessionStatus();

{sessionStatus?.trial.active && (
  <View style={styles.trialBadge}>
    <Text>Trial: {formatTimeRemaining(sessionStatus.trial.endsAt)}</Text>
  </View>
)}
```

#### E. Feature Gating

**Files:** Settings, Export, Preferences screens

```tsx
const { data: sessionStatus } = useSessionStatus();

const handleExport = () => {
  if (!sessionStatus?.access.canExportData) {
    Alert.alert(
      'Subscribe to Export',
      'Export is available with an active subscription.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Subscribe', onPress: () => router.push('/paywall') },
      ]
    );
    return;
  }
  // Proceed with export
};
```

### 2.4 Profile Type Updates

**File:** `hooks/useProfile.ts`

```typescript
export interface Profile {
  // ... existing fields ...
  
  // New trial fields
  trial_type?: 'none' | 'local' | 'storekit' | null;
  trial_active?: boolean;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  has_had_local_trial?: boolean;
  
  // Discount eligibility
  discount_eligible_immediate?: boolean;
  discount_used_at?: string | null;
}
```

---

## Part 3: Implementation Checklist

### Phase 1: Database & Backend
- [ ] Create migration for new profile columns
- [ ] Run migration in Supabase
- [ ] Create `/session/status` edge function
- [ ] Create `/trial/local/start` edge function
- [ ] Set up trial expiration cron job
- [ ] Add notification trigger for expired trials

### Phase 2: Client Infrastructure
- [ ] Create `useSessionStatus` hook
- [ ] Update `checkAppAccess()` in subscription-helpers
- [ ] Update Profile type definition
- [ ] Add session status provider to app layout

### Phase 3: Paywall Updates
- [ ] Add session status integration to paywall
- [ ] Implement conditional discount messaging
- [ ] Add "Try the app" secondary CTA
- [ ] Implement `handleStartLocalTrial()`
- [ ] Create "Trial ended" paywall variant

### Phase 4: Feature Gating
- [ ] Add trial badge to home screen
- [ ] Gate export functionality
- [ ] Gate preference editing
- [ ] Update settings screen access checks

### Phase 5: Navigation Updates
- [ ] Update `app/index.tsx` routing logic
- [ ] Update `app/(tabs)/home.tsx` paywall check
- [ ] Handle trial-ended state in navigation

### Phase 6: Testing
- [ ] Test new user → immediate subscription flow
- [ ] Test new user → local trial → subscription flow
- [ ] Test trial expiration and notification
- [ ] Test feature gating during trial
- [ ] Test discount messaging logic

---

## Part 4: User State Machine

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
                                  │ (no trial CTA)  │
                                  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │   SUBSCRIBED    │
                                  │   (full access) │
                                  └─────────────────┘
```

---

## Part 5: App Store Connect Configuration

### 5.1 Subscription Setup
1. Create subscription group: **"Liftor Pro"**
2. Create auto-renewable subscription: `com.liftor.pro.monthly`
3. Set full price tier

### 5.2 30% Discount (Introductory Offer)
1. Add Introductory Offer to subscription product
2. Set ~30% discount for first billing period
3. Type: "Pay up front" or "Pay as you go"

### 5.3 Integration Notes
- RevenueCat will automatically surface intro offers to eligible users
- App controls **messaging** (show "30% OFF" only when `discount_eligible_immediate === true`)
- Apple may still show intro offer even after local trial; this is acceptable

---

## Part 6: Key Differences from Current Implementation

| Aspect | Current | Blueprint |
|--------|---------|-----------|
| Trial type | StoreKit free trial (Apple-managed) | Local app-level trial (server-managed) |
| Trial timing | Device-based | Server-based (no cheating) |
| Trial trigger | Immediate StoreKit call | Backend API call, no payment |
| Discount | None | 30% for immediate payers |
| Access check | Client-side RevenueCat SDK | Backend `/session/status` |
| Feature gating | None during trial | Export + preferences locked |
| Trial limit | Apple-managed | One-time per user (server-enforced) |

---

## Appendix: File Change Summary

### New Files
- `supabase/migrations/YYYYMMDD_trial_subscription_fields.sql`
- `supabase/functions/session-status/index.ts`
- `supabase/functions/trial-local-start/index.ts`
- `supabase/functions/trial-expiration-cron/index.ts`
- `hooks/useSessionStatus.ts`

### Modified Files
- `supabase/schema.sql` - Add new columns
- `hooks/useProfile.ts` - Add new fields to Profile type
- `utils/subscription-helpers.ts` - Add `checkAppAccess()`, update `hasActiveSubscription()`
- `app/paywall.tsx` - Add trial CTA, discount messaging, trial-ended variant
- `app/(tabs)/home.tsx` - Add trial badge, update access check
- `app/(tabs)/settings.tsx` - Gate export/preferences
- `app/index.tsx` - Update routing logic
- `app/_layout.tsx` - Add session status provider

### Unchanged Files
- `supabase/functions/revenuecat-webhook/index.ts` - Keep for subscription sync
- `app/manage-subscription.tsx` - No changes needed
- `constants/` - No changes
- `components/` - No changes

