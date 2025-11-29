# Notifications Architecture (v2)

> **Updated:** November 28, 2025  
> **Purpose:** Document the reworked notification system architecture.

---

## Overview

The notification system has been completely reworked to be:

1. **Centralized** - All notification logic flows through `NotificationService`
2. **Idempotent** - Scheduling only happens when times actually change
3. **User-scoped** - Preferences are tied to user ID, not device
4. **Deliberate** - No eager firing on app open
5. **Backend-ready** - Supabase custom notifications with deduplication

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           App Startup                                    │
│                                                                          │
│  _layout.tsx → NotificationsInit                                        │
│       │                                                                  │
│       ▼                                                                  │
│  NotificationService.initialize(userId, supabase)                       │
│       │                                                                  │
│       ├─── Register push token (once per session)                       │
│       ├─── Subscribe to Supabase notifications                          │
│       └─── Setup notification listeners                                 │
│                                                                          │
│  Then: syncWithUserPreferences(user, hasVerifiedPlan)                   │
│       │                                                                  │
│       ├─── Check if check-in time changed → schedule if needed          │
│       └─── Check if workout time changed → schedule if needed           │
│                                                                          │
│  ⚠️ Key: Only reschedules if time ACTUALLY changed (idempotent)        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        NotificationService                               │
│                    (services/NotificationService.ts)                     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Preferences (User-scoped AsyncStorage)                          │   │
│  │ - workoutRemindersEnabled                                       │   │
│  │ - checkInRemindersEnabled                                       │   │
│  │ - milestonesEnabled                                             │   │
│  │ - scheduledWorkoutTime / scheduledWorkoutId                     │   │
│  │ - scheduledCheckInTime / scheduledCheckInId                     │   │
│  │ - scheduledCheckInIds (array of next 30 reminder IDs)           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Scheduling Methods                                              │   │
│  │ - scheduleCheckInReminder(time, forceReschedule?)              │   │
│  │     ↳ Cancels old reminders and pre-schedules next 30 days      │   │
│  │ - scheduleWorkoutReminder(time, hasVerifiedPlan, force?)       │   │
│  │ - cancelCheckInReminder()                                       │   │
│  │ - cancelWorkoutReminder()                                       │   │
│  │ - setAllNotificationsEnabled(enabled)                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Event-based Notifications                                       │   │
│  │ - sendMilestoneNotification(type, details)                      │   │
│  │ - sendBasePlanReadyNotification()                               │   │
│  │ - sendBasePlanErrorNotification(error)                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Supabase Custom Notifications                                   │   │
│  │ - subscribeToSupabaseNotifications()                            │   │
│  │ - fetchAndDeliverSupabaseNotifications()                        │   │
│  │ - deliverSupabaseNotification(notification)                     │   │
│  │ - Deduplication via delivered IDs set                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ In-App Notification Center                                      │   │
│  │ - getInAppNotifications()                                       │   │
│  │ - addInAppNotification(notification)                            │   │
│  │ - markInAppNotificationRead(id)                                 │   │
│  │ - getUnreadCount()                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Notification Types

### 1. Recurring Local Reminders

| Type | Trigger | Scheduling |
|------|---------|------------|
| **Check-in Reminder** | User's `checkInReminderTime` | Pre-schedules the next 30 days at the configured time (no immediate fire) |
| **Workout Reminder** | User's `preferredTrainingTime` | Daily, 10 min before (only if verified plan exists) |

**Key behaviors:**
- Only scheduled when user explicitly sets a time
- Idempotent: won't reschedule if time unchanged
- Check-in reminders are queued for the next 30 days at explicit timestamps to avoid instant delivery glitches
- Respects global enable/disable toggle
- Workout reminders require a verified base plan

### 2. Milestone Notifications (One-off)

| Type | Trigger | Condition |
|------|---------|-----------|
| **Streak** | Check-in submission | 7, 14, or 30 day streak |
| **Weight Goal** | Weight update | Within 0.5kg of goal |
| **Plan Completed** | Plan saved | Adherence > 80% |

**Key behaviors:**
- Immediate, one-off notifications
- Respects `milestonesEnabled` preference
- Triggered by actual user actions, not app open

### 3. Base Plan Notifications (State-transition)

| Type | Trigger | Screen |
|------|---------|--------|
| **Plan Ready** | Generation completes successfully | `/plan-preview` |
| **Plan Error** | Generation fails | `/plan-building` |

**Key behaviors:**
- ONLY sent when status transitions (not on app open)
- Also added to in-app notification center
- Tapping navigates to relevant screen

### 4. Supabase Custom Notifications

| Type | Source | Delivery |
|------|--------|----------|
| **Custom** | `user_notifications` table | Real-time subscription + polling |

**Key behaviors:**
- Backend/admin can insert notifications for specific users
- App subscribes to real-time changes
- Deduplication prevents re-delivery on app restart
- Marked as delivered in both local storage and Supabase

---

## Flow: What Happens When

### App Launch / User Login

```
1. NotificationsInit mounts
2. If user logged in and not already initialized:
   a. NotificationService.initialize(userId, supabase)
   b. Register push token (save to Supabase)
   c. Subscribe to Supabase notifications
   d. Setup notification listeners
3. syncWithUserPreferences():
   a. Check if check-in time changed → schedule if needed
   b. Check if workout time changed → schedule if needed
   
⚠️ NO EAGER SCHEDULING - only if times actually changed
```

### User Changes Check-in Time (Program Settings)

```
1. User adjusts time picker
2. handleSavePreferences() called
3. NotificationService.scheduleCheckInReminder(newTime)
   a. Checks if checkInRemindersEnabled
   b. Compares with scheduledCheckInTime
   c. If different: cancel all pending reminders
   d. Computes the next 30 calendar occurrences and schedules each explicitly
   e. Saves new scheduledCheckInTime + array of scheduledCheckInIds (first ID kept for legacy paths)
```

### User Toggles Notifications Off (Settings)

```
1. Switch toggled OFF
2. NotificationService.setAllNotificationsEnabled(false)
   a. Updates preferences
   b. Calls cancelCheckInReminder()
   c. Calls cancelWorkoutReminder()
```

### Base Plan Generation Completes

```
1. backgroundPlanGeneration finishes
2. Status transitions to 'ready'
3. sendPlanReadyNotification() called
   a. NotificationService.sendBasePlanReadyNotification()
   b. Schedules immediate OS notification
   c. Adds to in-app notification center
   
⚠️ Only called on actual transition, not on app open
```

### Supabase Notification Arrives

```
1. Backend inserts row in user_notifications
2. Real-time subscription triggers
3. deliverSupabaseNotification(notification)
   a. Check if already delivered (deduplication)
   b. Schedule OS notification
   c. Add to in-app center
   d. Mark as delivered locally + in Supabase
```

---

## Storage Keys

All keys are user-scoped: `key:userId` or `key:anon`

| Key | Purpose |
|-----|---------|
| `Liftor_notification_prefs_v2:userId` | User preferences + scheduled state |
| `Liftor_inAppNotifications_v2:userId` | In-app notification center data |
| `Liftor_deliveredSupabaseNotifs:userId` | Delivered Supabase notification IDs |

---

## Files Changed

| File | Changes |
|------|---------|
| `services/NotificationService.ts` | **NEW** - Centralized notification service |
| `services/backgroundPlanGeneration.ts` | Uses NotificationService for base plan notifications |
| `app/_layout.tsx` | Uses NotificationService, idempotent sync |
| `app/(tabs)/settings.tsx` | Uses NotificationService for toggle |
| `app/program-settings.tsx` | Uses NotificationService, respects global prefs |
| `hooks/useUserStore.ts` | Uses NotificationService for milestones |
| `supabase/migrations/20251128_create_user_notifications_table.sql` | **NEW** - Custom notifications table |

---

## Key Improvements Over Previous Implementation

| Issue | Before | After |
|-------|--------|-------|
| Eager scheduling on app open | Every app open could reschedule | Only if time actually changed |
| Ignoring global toggle | Program Settings bypassed disable | All paths check preferences |
| Non-user-scoped prefs | Single device prefs | User-scoped storage keys |
| Duplicate scheduling | Multiple schedules possible | Tracked IDs, cancel before schedule |
| Base plan notifications | Could fire on mount | Only on state transition |
| Supabase notifications | Not implemented | Real-time subscription + deduplication |
| In-app center | Write-only | Full read/write API ready |

---

## Testing Checklist

- [ ] Check-in reminder only schedules when time is set
- [ ] Workout reminder only schedules when time is set AND plan verified
- [ ] Toggling notifications OFF cancels all reminders
- [ ] Toggling notifications ON reschedules based on user times
- [ ] Changing check-in time in Program Settings updates schedule
- [ ] Base plan ready notification only fires when generation completes
- [ ] Supabase notifications are delivered and not re-delivered on restart
- [ ] Milestone notifications respect milestonesEnabled preference
- [ ] Logging out cleans up notification subscriptions




