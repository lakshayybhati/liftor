# Notifications Deep-Dive Analysis

> ⚠️ **OUTDATED DOCUMENT** - Last updated: Pre-November 2025  
> This document describes the **legacy notification system** that has been replaced.  
> For the current architecture, see **[NOTIFICATIONS_ARCHITECTURE.md](./NOTIFICATIONS_ARCHITECTURE.md)**.
>
> **Key changes since this doc:**
> - `utils/notifications.ts` and `utils/notification-storage.ts` have been **deleted**
> - All notification logic now flows through `services/NotificationService.ts`
> - Preferences are now **user-scoped** (not global)
> - Milestone notifications have **deduplication** to prevent spam
> - Supabase `user_notifications` table enables backend-driven notifications

---

> **Generated:** Analysis of the current notification system implementation.  
> **Purpose:** Understand how notifications work today, what triggers them, and identify potential issues.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Core Modules and What They Do](#2-core-modules-and-what-they-do)
   - [utils/notifications.ts](#21-utilsnotificationsts--central-notification-utilities)
   - [utils/notification-storage.ts](#22-utilsnotification-storagets--notification-preferences)
   - [app/_layout.tsx – NotificationsInit](#23-app_layouttsx--notificationsinit-component)
   - [app/(tabs)/settings.tsx – Notifications UI](#24-apptabssettingstsx--notifications-ui)
   - [app/program-settings.tsx – Check-in Reminder Time](#25-appprogram-settingstsx--check-in-reminder-time-configuration)
   - [hooks/useUserStore.ts – Milestone Notifications](#26-hooksuseuserStorets--milestone-notifications)
   - [services/backgroundPlanGeneration.ts – Base Plan Notifications](#27-servicesbackgroundplangenerationts--base-plan-job--in-app-notification-store)
   - [Supabase Push Infrastructure](#28-supabase-push-infra)
   - [Configuration & Ambient Types](#29-configuration--ambient-types)
3. [Notification Types, Timing, and Triggers](#3-notification-types-timing-and-triggers)
   - [Recurring Reminders](#31-recurring-reminders)
   - [Milestone Notifications](#32-milestone-notifications)
   - [Base Plan Background Notifications](#33-base-plan-background-notifications)
   - [Daily Plan / Workout Completion](#34-daily-plan--workout-completion)
   - [Remote (Push) Notifications](#35-remote-push-notifications)
4. [Where Notifications Are Triggered From Each Flow](#4-where-notifications-are-triggered-from-each-flow)
   - [App Launch / App Resume](#41-app-launch--app-resume)
   - [Onboarding / Base Plan Generation](#42-onboarding--base-plan-generation)
   - [Check-in Flow](#43-check-in-flow)
   - [Workout / Daily Plan Flow](#44-workout--daily-plan-flow)
   - [Supabase / Cron-like Jobs](#45-supabase--cron-like-jobs)
5. [In-App Notification Center vs OS Notifications](#5-in-app-notification-center-vs-os-notifications)
6. [Eager Triggers and Potential Bugs/Smells](#6-eager-triggers-and-potential-bugssmells)
   - [Eager Triggers](#61-eager-triggers)
   - [Obvious Bugs / Smells](#62-obvious-bugs--smells)
7. [Summary](#7-summary-how-notifications-work-today)

---

## 1. High-Level Overview

Today's notification system has three main pieces:

- **Local OS notifications via `expo-notifications`** for:
  - Workout reminders (daily, time-based).
  - Daily check-in reminders (daily, time-based).
  - Milestone events (streaks, weight goal reached, plan completed).
  - Base plan generation status (plan ready / plan error).

- **A partially implemented in-app "notification center"** that stores base-plan events in AsyncStorage, but has **no UI hooked up yet**.

- **Supabase-backed push infra** where devices register Expo push tokens to a `push_tokens` table; a Supabase Edge Function can send broadcast pushes, but **the app does not currently call it for any user-facing workflow**.

---

## 2. Core Modules and What They Do

### 2.1 `utils/notifications.ts` – Central Notification Utilities

#### Expo Notifications Setup

- Imports `expo-notifications` and calls `Notifications.setNotificationHandler(...)` to always:
  - `shouldShowAlert: true`
  - `shouldPlaySound: true`
  - `shouldSetBadge: true`

So local and push notifications are allowed to alert even when the app is foregrounded.

#### Push Registration & Token Storage

- **`registerForPushNotificationsAsync()`**
  - On Android: configures the `default` channel with max importance, vibration, and default sound.
  - Ensures running on a physical device; otherwise logs a warning and returns `null`.
  - Requests notification permissions if not already granted.
  - Uses `Constants.expoConfig.extra.eas.projectId` and `Notifications.getExpoPushTokenAsync({ projectId })` to get an Expo push token.

- **`savePushTokenToBackend(supabase, userId, token)`**
  - Upserts into Supabase table `push_tokens` with `user_id`, `token`, and some `device_info`.
  - This is what enables the backend Edge Function to send remote push notifications later.

#### Time Parsing Helper

- **`parseTimeString(timeStr)`**
  - Converts human times like `"9:00 AM"` into `{ hour, minute }` in 24h format.

#### Workout Reminders (Local, Recurring)

- **`scheduleWorkoutReminder(preferredTime?: string)`**
  - If no `preferredTime`, logs and **does nothing**.
  - Calls `getAllScheduledNotificationsAsync` and cancels any notification whose `content.data.type === 'workout_reminder'` to avoid duplicates.
  - Parses `preferredTime` and schedules a daily repeating notification **10 minutes before** that time:
    - Title: **"Strap up in 10 mins"**
    - Body: "You have to push your body."
    - `data: { type: 'workout_reminder', screen: '/plan' }`
    - `trigger: { hour: reminderHour, minute: reminderMinute, repeats: true }`
  - Returns the scheduled notification ID or `null` on error.

#### Daily Check-in Reminders (Local, Recurring)

- **`scheduleDailyCheckInReminder(hour = 9, minute = 0)`**
  - Cancels any scheduled `content.data.type === 'checkin_reminder'`.
  - Schedules a **daily repeating** notification:
    - Title: **"Daily Check-in Time! 💪"**
    - Body: "How are you feeling today? Complete your check-in to get your personalized plan."
    - `data: { type: 'checkin_reminder', screen: '/checkin' }`
    - `trigger: { hour, minute, repeats: true }`

- **`scheduleDailyCheckInReminderAt(time: string)`**
  - Converts `time` via `parseTimeString` and calls `scheduleDailyCheckInReminder`.

- **`scheduleDailyCheckInReminderFromString(time)`**
  - Similar parsing logic (AM/PM) with a default of `9:00` if invalid; calls `scheduleDailyCheckInReminder`.

#### Milestone Notifications (Local, One-off Per Event)

- **`celebrateMilestone(type, details?)`**
  - Types:
    - `'streak'`: "🔥 X-Day Streak!"
    - `'weight_goal'`: "🎯 Weight Goal Achieved!"
    - `'plan_completed'`: "✅ Workout Completed!"
  - Schedules a **one-off, immediate** local notification:
    - `trigger: null`
    - `data: { type: 'milestone', ...details }`
  - No persistence; just an OS notification.

#### Generic Cancellation Helper

- **`cancelNotificationsByType(type: string)`**
  - Iterates `getAllScheduledNotificationsAsync()` and cancels any whose `content.data.type` matches.

---

### 2.2 `utils/notification-storage.ts` – Notification Preferences

Stores a single, **global (non user-scoped)** preferences object under `AsyncStorage` key `Liftor_notification_prefs` with:

- **`workoutRemindersEnabled: boolean`**
- **`checkInRemindersEnabled: boolean`**
- **`milestonesEnabled: boolean`**
- **`lastScheduledWorkoutTime?: string`**
- **`lastScheduledCheckInTime?: string`**
- **`checkInReminderTime?: string`** (documented as "HH:mm in 24h" but never actually written anywhere).

#### Functions

- **`getNotificationPreferences()`**
  - Returns stored prefs or defaults (`workoutRemindersEnabled`, `checkInRemindersEnabled`, `milestonesEnabled` set to `true`).

- **`saveNotificationPreferences(prefs)`**
  - Overwrites the stored JSON.

> **Important smell:** These prefs are **not user-id scoped**, and `clearAllData` intentionally **does not** delete them, meaning they persist across account changes on the same device.

---

### 2.3 `app/_layout.tsx` – `NotificationsInit` Component

`RootLayout` renders a `NotificationsInit` child on every app run, which wires up global notification behavior.

#### Push Registration + Token Sync (Eager on Login)

- `useEffect` with dependency `session?.user?.id`:
  - If there is a logged-in user:
    - Calls `registerForPushNotificationsAsync()`.
    - If a token is returned, calls `savePushTokenToBackend(supabase, session.user.id, token)`.

#### Listeners for OS Notifications

- Same effect registers:
  - **`Notifications.addNotificationReceivedListener`**: logs notifications.
  - **`Notifications.addNotificationResponseReceivedListener`**: when a notification is tapped, reads `response.notification.request.content.data.screen` and navigates using `router.push(screen)`.
    - This unifies navigation for:
      - Workout reminders (`screen: '/plan'`).
      - Check-in reminders (`screen: '/checkin'`).
      - Base plan ready (`screen: '/plan-preview'`).
      - Base plan error (`screen: '/plan-building'`).
      - Any remote pushes that include a `screen` in their `data`.

#### Automatic Scheduling Based on Preferences (On User Hydrate / Training Time Change)

- `useEffect` with dependency `[user?.preferredTrainingTime]`:
  - If `user` is present:
    - Reads `prefs = getNotificationPreferences()`.
    - **Workout reminders**:
      - If `prefs.workoutRemindersEnabled` and `user.preferredTrainingTime` is set, and `prefs.lastScheduledWorkoutTime !== user.preferredTrainingTime`, then:
        - Calls `scheduleWorkoutReminder(user.preferredTrainingTime)`.
        - Persists `lastScheduledWorkoutTime` = `user.preferredTrainingTime`.
    - **Daily check-in reminders (intended but currently inert)**:
      - If `prefs.checkInRemindersEnabled` and `prefs.checkInReminderTime` is set and `prefs.lastScheduledCheckInTime !== time`, then:
        - Calls `scheduleDailyCheckInReminder(hour, minute)` and updates `lastScheduledCheckInTime`.
      - **However, `checkInReminderTime` is never written into prefs anywhere, so this branch never runs in practice.**

---

### 2.4 `app/(tabs)/settings.tsx` – Notifications UI

- Renders a **"Notifications"** card with a single **"Enable Notifications"** `Switch`.
  - Subtext explains:
    > "Includes workout reminders (10 min before preferred training time) and daily check-in alerts (using the user's `checkInReminderTime` from their profile)."

#### On Mount

- Reads `NotificationPreferences` and sets `allNotificationsEnabled = workoutRemindersEnabled && checkInRemindersEnabled && milestonesEnabled`.

#### On Toggle Change

- Updates prefs:
  - `workoutRemindersEnabled`, `checkInRemindersEnabled`, `milestonesEnabled` all set to the new value (keeps all other fields).

- If toggling **ON**:
  - If `user.preferredTrainingTime` is set → calls **`scheduleWorkoutReminder(user.preferredTrainingTime)`**.
  - If `user.checkInReminderTime` is set → calls **`scheduleDailyCheckInReminderFromString(user.checkInReminderTime)`**.

- If toggling **OFF**:
  - Calls **`cancelNotificationsByType('workout_reminder')`** and **`cancelNotificationsByType('checkin_reminder')`** to cancel all scheduled recurring reminders.

> **Note:** This toggle **does not** immediately cancel or disable milestone notifications; it only toggles the prefs that those checks read (see `useUserStore` below).

---

### 2.5 `app/program-settings.tsx` – Check-in Reminder Time Configuration

- Provides an **"alarm clock" style** triple scroll-wheel picker under **"Daily Check-in Reminder Time"**.
  - Populates `formData.checkInReminderTime` (a `User` field) with values like `"9:00 AM"`.

#### On Save (`handleSavePreferences`)

- `updateUser(updatedUser)` persists the new `checkInReminderTime` to local store.
- Then, in a dynamic import `try` block:
  - Calls **`scheduleDailyCheckInReminderFromString(updatedUser.checkInReminderTime || '9:00 AM')`**, which:
    - Cancels existing `checkin_reminder` notifications.
    - Schedules a **daily repeating** local notification at that time.
- Also writes `checkin_reminder_time` to Supabase `profiles` so it can be hydrated into `user.checkInReminderTime` in future sessions.

> **Smell:** This code **ignores** `NotificationPreferences.checkInRemindersEnabled`. If the user has globally disabled notifications in Settings, saving Program Settings will still schedule a daily check-in reminder.

---

### 2.6 `hooks/useUserStore.ts` – Milestone Notifications

- Imports `celebrateMilestone` and `getNotificationPreferences`.

#### Weight Goal Milestone (`weight_goal`)

- In `updateUser(userData)`:
  - Reads `prefs = getNotificationPreferences()`.
  - If `prefs.milestonesEnabled` and both `userData.weight` and `userData.goalWeight` are numbers:
    - If `|weight - goalWeight| < 0.5` kg → calls **`celebrateMilestone('weight_goal', { weight: goalWeight })`**.
  - This fires whenever the stored weight gets within 0.5 kg of goal, not just once.

#### Streak Milestone (`streak`)

- In `addCheckin(checkin)` after saving and syncing to Supabase:
  - Recomputes up to a 30-day streak of days with check-ins (contiguous backwards from today).
  - If `prefs.milestonesEnabled` and `streak === 7 || 14 || 30` → calls **`celebrateMilestone('streak', { days: streak })`**.

#### Plan-Completed Milestone (`plan_completed`)

- In `addPlan(plan)` after saving the daily plan and syncing:
  - Reads `prefs = getNotificationPreferences()`.
  - If `prefs.milestonesEnabled` and `plan.adherence > 0.8` → calls **`celebrateMilestone('plan_completed', { date: plan.date })`**.

#### Data Clearing

- `clearAllData` intentionally **does not** delete `Liftor_notification_prefs`; comment notes they want to preserve notification prefs (and other subscription keys), so prefs persist across account logouts and local data wipes.

---

### 2.7 `services/backgroundPlanGeneration.ts` – Base-Plan Job & In-App Notification Store

#### Job State

- Manages base-plan generation as a **background job** with a job ID and status, stored in AsyncStorage as `Liftor_basePlanJobState:<userId|anon>`.
  - `BasePlanStatus = 'idle' | 'pending' | 'ready' | 'error'`.
  - Functions: `getBasePlanJobState`, `saveBasePlanJobState`, `resetBasePlanJobState`, `verifyBasePlan`, etc.

#### In-App "Notification Center" (No UI Yet)

- Defines an `InAppNotification` type:
  - `type: 'base_plan_ready' | 'base_plan_error' | 'general'`
  - `title`, `body`, `createdAt`, `read`, optional `link` and arbitrary `data`.

- Stores them under `Liftor_inAppNotifications:<userId|anon>` with:
  - `getInAppNotifications(userId)`
  - `addInAppNotification(userId, notification)`
  - `markNotificationRead(userId, notificationId)`
  - `getUnreadNotificationCount(userId)`
  - `clearAllNotifications(userId)`

> **Important:** These functions are **only used within this module** today; no screen reads or displays them, so there is **no visible in-app notification center UI yet**.

#### OS-Level Base-Plan Notifications

- **`sendPlanReadyNotification()`**
  - Schedules an **immediate local notification** (`trigger: null`) with:
    - Title: **"🎉 Your plan is ready!"**
    - Body: "Your personalized fitness plan has been generated. Tap to review and start your journey."
    - `data: { type: 'base_plan_ready', screen: '/plan-preview' }`

- **`sendPlanErrorNotification(errorMessage)`**
  - Schedules an **immediate local notification** (`trigger: null`) with:
    - Title: **"⚠️ Plan generation issue"**
    - Body: "We had trouble generating your plan. Tap to try again."
    - `data: { type: 'base_plan_error', screen: '/plan-building', error: errorMessage }`

#### Base-Plan Background Generation Flow

- **`startBasePlanGeneration(user, userId, addBasePlan)`**
  - If a generation is already in progress (`isBackgroundGenerationInProgress()`), returns the existing job ID to avoid duplicates.
  - Otherwise:
    - Creates a new job ID, sets job state to `'pending'`, and kicks off an async `currentGenerationPromise`:
      - Calls `generateBasePlan(user)` (engine).
      - On success:
        - Calls `addBasePlan(basePlan)` to save to store.
        - Updates job state to `'ready'`, `completedAt`, `error: null`.
        - Calls **`sendPlanReadyNotification()`** (OS notification).
        - Calls **`addInAppNotification(...)`** with `type: 'base_plan_ready'` and `link: '/plan-preview'`.
      - On error:
        - Updates job state to `'error'`.
        - Calls **`sendPlanErrorNotification(errorMessage)`** (OS notification).
        - Calls **`addInAppNotification(...)`** with `type: 'base_plan_error'` and `link: '/plan-building'`.
      - Finally clears internal generation promise and job ID.

- **`retryBasePlanGeneration(...)`**
  - Resets job state and calls `startBasePlanGeneration` again.

#### Consumers

- `app/onboarding.tsx` → after saving onboarding profile, calls `startBasePlanGeneration` and navigates to `/plan-building`.
- `app/program-settings.tsx` → when user confirms "Regenerate Base Plan", calls `startBasePlanGeneration` with (possibly updated) preferences and goes to `/plan-building`.
- `app/plan-building.tsx` polls `getBasePlanJobState(userId)` on an interval and on app foreground to navigate to `/plan-preview` when status becomes `'ready'`.
- `app/(tabs)/home.tsx` checks `getBasePlanJobState` on load:
  - If status `'ready'` but `verified === false` and a base plan exists, it auto-redirects to `/plan-preview`.

So base-plan ready/error notifications are **immediate local notifications**, plus internal in-app records, triggered when the background job resolves.

---

### 2.8 Supabase Push Infra

#### Client-Side

- `savePushTokenToBackend` (see above) upserts into the `push_tokens` table.

#### DB / Edge Functions

- `supabase/migrations/20251024_create_push_tokens_table.sql` defines the `push_tokens` table and RLS policy.

- `supabase/functions/send-broadcast-notification/index.ts`:
  - An Edge Function that:
    - Authenticates via a secret header.
    - Reads `push_tokens` (optionally filtering by `userIds`).
    - Sends push messages via Expo's push API (`https://exp.host/--/api/v2/push/send`).
  - Payload includes `title`, `body`, `data`, `sound`, `priority`, and `channelId: 'default'`.

> **Crucially:** There is **no mobile client code that calls this Edge Function**. It is presumably meant for admin/cron usage, but **no Supabase-triggered notification workflows (e.g. check-ins, workouts, base-plan events) are wired through it yet.**

---

### 2.9 Configuration & Ambient Types

- `types/ambient-notifications.d.ts` provides loose `any` typings for the `expo-notifications` API used.

- `app.json`:
  - Registers the `expo-notifications` plugin with icon, color, and production mode.
  - iOS `UIBackgroundModes` includes `"remote-notification"`.
  - Android enables `useNextNotificationsApi` and sets notification config.

---

## 3. Notification Types, Timing, and Triggers

### 3.1 Recurring Reminders

#### Workout Reminder

| Property | Value |
|----------|-------|
| **Type** | Local scheduled, **daily repeating** |
| **Implementation** | `scheduleWorkoutReminder(preferredTime)` |
| **Trigger to schedule** | When `NotificationsInit` runs and: `workoutRemindersEnabled === true`, `user.preferredTrainingTime` is set, `lastScheduledWorkoutTime !== user.preferredTrainingTime`. OR when user toggles "Enable Notifications" ON on Settings and has `preferredTrainingTime`. |
| **Trigger to cancel** | When user toggles "Enable Notifications" OFF, via `cancelNotificationsByType('workout_reminder')`. |
| **Behaviour** | At a fixed time (10 minutes before preferred training time) every day, if the schedule exists. |

#### Daily Check-in Reminder

| Property | Value |
|----------|-------|
| **Type** | Local scheduled, **daily repeating** |
| **Implementation** | `scheduleDailyCheckInReminder` / `scheduleDailyCheckInReminderFromString` |
| **Trigger to schedule** | When user saves Program Settings after adjusting the daily check-in time, the app **always** calls `scheduleDailyCheckInReminderFromString(updatedUser.checkInReminderTime || '9:00 AM')`, regardless of the global "Enable Notifications" toggle. OR when user toggles "Enable Notifications" ON on Settings and `user.checkInReminderTime` is present. Intended but currently non-functional: `_layout`'s `NotificationsInit` effect tries to read `prefs.checkInReminderTime` and reschedule based on `lastScheduledCheckInTime`, but `checkInReminderTime` in prefs is never set. |
| **Trigger to cancel** | When user toggles "Enable Notifications" OFF, via `cancelNotificationsByType('checkin_reminder')`. |
| **Behaviour** | One reminder each day at the chosen time from Program Settings / profile. |

---

### 3.2 Milestone Notifications

All four are **local, one-off (`trigger: null`) notifications** scheduled at the moment the event condition is detected; they are **not recurring** from a scheduler, but they **can be re-fired** if conditions are met again because there's no "already celebrated" flag.

#### Streak Milestone

| Property | Value |
|----------|-------|
| **Type value** | `data.type = 'milestone'` + `details.type === 'streak'` |
| **Triggers** | In `addCheckin` when: `prefs.milestonesEnabled === true`, streak of consecutive check-in days equals 7, 14, or 30. |

#### Weight Goal Milestone

| Property | Value |
|----------|-------|
| **Type value** | `data.type = 'milestone'` + `details.type === 'weight_goal'` |
| **Triggers** | In `updateUser` when: `prefs.milestonesEnabled === true`, `userData.weight` and `userData.goalWeight` are numbers, absolute difference `< 0.5 kg`. |

#### Plan Completed Milestone

| Property | Value |
|----------|-------|
| **Type value** | `data.type = 'milestone'` + `details.type === 'plan_completed'` |
| **Triggers** | In `addPlan` when: `prefs.milestonesEnabled === true`, `plan.adherence > 0.8`. |

---

### 3.3 Base Plan Background Notifications

#### Base Plan Ready

| Property | Value |
|----------|-------|
| **Type value** | `data.type = 'base_plan_ready'`, `data.screen = '/plan-preview'` |
| **When it's sent** | After `startBasePlanGeneration` successfully finishes the background generation (`generateBasePlan(user)` returns), saves the plan, and updates job state to `'ready'`. Triggers **immediately**, once per background generation, via `sendPlanReadyNotification()`. |

#### Base Plan Error

| Property | Value |
|----------|-------|
| **Type value** | `data.type = 'base_plan_error'`, `data.screen = '/plan-building'` |
| **When it's sent** | After `startBasePlanGeneration` catches an error during background generation and updates job state to `'error'`. Triggers **immediately**, once per failed generation, via `sendPlanErrorNotification(errorMessage)`. |

**In-app mirror:** Each success or error also calls `addInAppNotification(...)` with the same semantic info (type, title, body, link, data) stored under `Liftor_inAppNotifications`, but **no screen consumes this yet**.

---

### 3.4 Daily Plan / Workout Completion

- There is **no "daily plan ready" OS notification**:
  - `services/plan-generation.ts` and `app/generating-plan.tsx` generate daily plans synchronously with UI progress, but they do **not** schedule notifications.

- The only daily-plan-related notification is:
  - A **one-off milestone** (**"Workout Completed!"**) when a daily plan with `adherence > 0.8` is saved.

---

### 3.5 Remote (Push) Notifications

- **Infrastructure exists**:
  - Devices register push tokens and store them in `push_tokens`.
  - `send-broadcast-notification` Edge Function can send arbitrary push notifications to those tokens.

- **Current usage in app code:**
  - None—the mobile app doesn't call this function, and there are **no Supabase Realtime listeners or cron-like jobs** in the app that drive notifications.

When a remote push does arrive, `NotificationsInit` will log it and, if the payload includes `data.screen`, open that route when the notification is tapped.

---

## 4. Where Notifications Are Triggered From Each Flow

### 4.1 App Launch / App Resume

#### On App Launch (After Auth + User Hydrate)

- `RootLayout` mounts `NotificationsInit`, which:
  - Calls `registerForPushNotificationsAsync` and saves the token to Supabase (if a session exists).
  - Attaches `addNotificationReceivedListener` and `addNotificationResponseReceivedListener` once.
  - Reads `NotificationPreferences` and **may** schedule or reschedule:
    - Workout reminders (if enabled and training time present).
    - Daily check-in reminders (intended, but currently blocked by missing `prefs.checkInReminderTime`).

#### On App Resume

- No additional scheduling logic is hooked directly to `AppState` inside notifications; app resume primarily matters in:
  - `app/plan-building.tsx` which uses `AppState` to poll `getBasePlanJobState` and navigate, but **does not send new notifications** at resume time.

---

### 4.2 Onboarding / Base Plan Generation

#### Onboarding Completion (`app/onboarding.tsx`)

- Saves user data via `updateUser`.
- Calls **`startBasePlanGeneration(userData, userId, addBasePlan)`**.
- Navigates to **`/plan-building`**.

#### During Background Base Plan Generation

- When complete:
  - `startBasePlanGeneration`:
    - Saves the base plan via `addBasePlan`.
    - Updates job state to `'ready'`.
    - Sends `sendPlanReadyNotification()` (OS) **immediately**.
    - Adds an in-app `InAppNotification` of type `'base_plan_ready'`.

- On failure:
  - Updates job state to `'error'`.
  - Sends `sendPlanErrorNotification(error)` (OS) **immediately**.
  - Adds an in-app `InAppNotification` of type `'base_plan_error'`.

#### Plan Building Screen (`app/plan-building.tsx`)

- Polls `getBasePlanJobState(userId)` every 2 seconds and on app foreground.
- If sees `status === 'ready'` → navigates to `/plan-preview`.
- It **does not** send any notifications itself; it just reacts to the job state.

#### Home Screen (`app/(tabs)/home.tsx`)

- On mount, it also calls `getBasePlanJobState(userId)`:
  - If `status === 'ready' && verified === false && hasBasePlan` → redirects to `/plan-preview`.
  - If `status === 'pending'` → redirects to `/plan-building`.

---

### 4.3 Check-in Flow

- **Reminders:** As above, scheduled globally via Settings / Program Settings, not per-check-in.

- **When user submits a check-in (`addCheckin`):**
  - After save+sync:
    - Computes streak and, if hitting 7/14/30 days and `milestonesEnabled`, fires a **one-off streak notification** via `celebrateMilestone('streak')`.

---

### 4.4 Workout / Daily Plan Flow

- **Workout reminders:** Global schedule tied to `preferredTrainingTime`.

- **On plan completion (`addPlan`):**
  - If plan adherence > 0.8 and `milestonesEnabled`, fires a **one-off "Workout Completed!" notification**.

- **No additional OS notifications on entering or leaving workouts** (aside from reminders and milestones).

---

### 4.5 Supabase / Cron-like Jobs

- There are **no Supabase listeners** in the client that trigger notifications.

- The only Supabase-related notification logic is:
  - Storing Expo tokens (`push_tokens`).
  - Having a backend Edge Function capable of sending remote pushes, presumably invoked out-of-band (e.g. admin tools or separate cron), but **not wired into app flows**.

---

## 5. In-App Notification Center vs OS Notifications

### In-App "Notification Center" Data Model

- Implemented in `services/backgroundPlanGeneration.ts` using `InAppNotification` and AsyncStorage.
- Populated **only** by base-plan generation events (ready/error).
- Includes `read` flags and `getUnreadNotificationCount` for potential badge counts.

### UI / Store

- There is **no `NotificationCenter` component, no `notificationsStore`, and no screen** importing `getInAppNotifications`, `markNotificationRead`, or `getUnreadNotificationCount`.
- So right now, **in-app notifications are effectively invisible** to the user.

### Relation to OS Notifications

- For base-plan events:
  - **OS notifications** are sent immediately (local notifications).
  - **In-app notifications** are stored with essentially the same semantic information (type, title, body, `link`, `data`).

- For workout/check-in reminders and milestones:
  - There is **no in-app record**, only OS notifications.

---

## 6. Eager Triggers and Potential Bugs/Smells

### 6.1 Eager Triggers

#### Push Registration is Eager on App Launch After Login

- As soon as a session `user.id` exists, `NotificationsInit` immediately:
  - Requests notification permissions (if not already granted).
  - Fetches an Expo push token.
  - Upserts it to Supabase.

#### Reminder Scheduling is Eager on User Hydrate / Training Time Change

- The `NotificationsInit` preferences effect runs automatically when the `user` object becomes available, and:
  - Schedules workout reminders if enabled and a `preferredTrainingTime` exists.
  - (Intended) would schedule check-in reminders based on prefs/time, but that path is currently dead.

---

### 6.2 Obvious Bugs / Smells

#### 1. Check-in Reminder Prefs Are Half-Wired

- `NotificationPreferences.checkInReminderTime` is never set anywhere, so:
  - `_layout`'s idempotent "re-schedule on app start" logic for check-in reminders **never runs**.
  - Check-in reminders rely solely on immediate scheduling calls from Program Settings and the Settings toggle.

#### 2. Program Settings Ignores Global "Enable Notifications" Toggle

- Saving Program Settings always calls `scheduleDailyCheckInReminderFromString`, even if:
  - `checkInRemindersEnabled` is false, or
  - The user explicitly turned notifications off in Settings.
- This can **silently re-enable OS check-in notifications** after the user thought they were disabled.

#### 3. Notification Preferences Are Global, Not Per User

- `Liftor_notification_prefs` is not scoped by user ID.
- `clearAllData` intentionally leaves it intact.
- Result: **Notification prefs (including disabled state) leak between accounts** on the same device.

#### 4. Milestones Can Fire Repeatedly

- Weight goal, streak, and plan-completed milestones have no "already notified" tracking:
  - A user hovering around goal weight may get repeated "Weight Goal Achieved!" notifications as weight is edited.
  - Re-running `addPlan` with high adherence could fire multiple "Workout Completed!" notifications.
  - Re-saving check-ins that maintain a 7/14/30-day streak could re-trigger that milestone.

#### 5. In-App Notification Center is Write-Only

- `addInAppNotification` is used, but no UI reads from or displays these notifications, so:
  - Users only see OS notifications, not a historical list.
  - Unread counts and mark-as-read APIs are unused.

#### 6. Docs vs Implementation Mismatch

- `PRODUCTION_READINESS.md` still marks Notifications as "❌ Not implemented", but:
  - Workout, check-in reminders, and milestones are partially implemented.
  - Base-plan ready/error notifications are fully wired with OS + in-app data.

#### 7. Dependency Mismatch in `NotificationsInit`

- The second `useEffect` depends only on `user?.preferredTrainingTime`, yet it also reads `prefs.checkInReminderTime` and `prefs.lastScheduledCheckInTime`.
- If the prefs-based check-in scheduling were ever wired up, changing check-in time in prefs would **not** trigger a reschedule, because the effect doesn't depend on that time.

---

## 7. Summary: How Notifications Work Today

### Types of Notifications

| Category | Type | Trigger | Recurrence |
|----------|------|---------|------------|
| **Recurring Local Reminders** | Workout reminder | 10 min before `preferredTrainingTime` | Daily |
| **Recurring Local Reminders** | Daily check-in reminder | At `checkInReminderTime` | Daily |
| **One-off Local Notifications** | Streak milestone (7/14/30 days) | On check-in submission | Once per threshold hit |
| **One-off Local Notifications** | Weight goal milestone | On weight update within 0.5kg of goal | Can repeat |
| **One-off Local Notifications** | Plan completed milestone | On plan save with adherence > 0.8 | Can repeat |
| **One-off Local Notifications** | Base plan ready | On background generation success | Once per generation |
| **One-off Local Notifications** | Base plan error | On background generation failure | Once per failure |
| **Push Infra** | Expo push tokens stored | On app launch with session | N/A |
| **Push Infra** | Backend broadcast function | Not called from app | N/A |

### What Triggers Them

| Flow | Notifications Triggered |
|------|------------------------|
| **App launch / user hydrate** | Registers push, sets OS listeners, may auto-schedule workout reminders |
| **Onboarding & base-plan regenerate** | Starts background generation job → on completion/failure, sends immediate base-plan ready/error notifications and writes in-app notifications |
| **Check-ins / plan updates** | Milestones fire immediately when thresholds are met (streaks, weight goal, plan adherence) |
| **Settings & Program Settings** | User chooses daily check-in time and global enable toggle; these screens schedule or cancel the recurring reminders |

### In-App vs OS

- **OS notifications** are the only thing the user currently sees.
- A background **in-app notification store** exists for base-plan events, but **no Notification Center UI** is implemented yet.

### Supabase

- Used to **store push tokens** and expose a backend Edge Function for broadcast pushes.
- **No current app flow calls that function or relies on Supabase to time/schedule notifications.**

---

## Files Referenced

| File | Purpose |
|------|---------|
| `utils/notifications.ts` | Core notification scheduling, cancellation, and milestone functions |
| `utils/notification-storage.ts` | AsyncStorage-based notification preferences |
| `app/_layout.tsx` | `NotificationsInit` component for push registration and auto-scheduling |
| `app/(tabs)/settings.tsx` | "Enable Notifications" toggle UI |
| `app/program-settings.tsx` | Daily check-in reminder time picker |
| `hooks/useUserStore.ts` | Milestone notification triggers on user/checkin/plan updates |
| `services/backgroundPlanGeneration.ts` | Base plan job state + in-app notification store + OS notifications |
| `supabase/functions/send-broadcast-notification/index.ts` | Backend Edge Function for push broadcasts |
| `supabase/migrations/20251024_create_push_tokens_table.sql` | Push tokens table definition |
| `types/ambient-notifications.d.ts` | Ambient type declarations for expo-notifications |
| `app.json` | Expo notifications plugin configuration |
| `types/user.ts` | User type including `checkInReminderTime` field |

