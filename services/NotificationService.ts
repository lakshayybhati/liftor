/**
 * NotificationService - Centralized Notification Management
 * 
 * This service is the SINGLE source of truth for all notification scheduling,
 * cancellation, and state management. It prevents:
 * - Duplicate scheduling on app open
 * - Notifications firing immediately on component mount
 * - Ignoring user preferences
 * 
 * ARCHITECTURE:
 * 1. All notification scheduling goes through this service
 * 2. Preferences are user-scoped and respected
 * 3. Supabase custom notifications are fetched with deduplication
 * 4. Base plan notifications only fire on actual state transitions
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@/types/user';
import { getProductionConfig, logProductionMetric } from '@/utils/production-config';

// ============================================================================
// TYPES
// ============================================================================

export interface NotificationPreferences {
  workoutRemindersEnabled: boolean;
  checkInRemindersEnabled: boolean;
  milestonesEnabled: boolean;
  // Track what's currently scheduled to avoid duplicate scheduling
  scheduledWorkoutTime?: string;      // The time currently scheduled
  scheduledCheckInTime?: string;      // The time currently scheduled
  scheduledWorkoutId?: string;        // Notification ID for workout reminder
  scheduledCheckInId?: string;        // Legacy single notification ID (back-compat)
  scheduledCheckInIds?: string[];     // All queued check-in notification IDs
  // Track already-notified milestones to avoid spam (e.g., 'streak_7', 'weight_goal_75.0')
  notifiedMilestones?: string[];
}

export interface SupabaseNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  data?: Record<string, any>;
  screen?: string;
  created_at: string;
  read: boolean;
  delivered: boolean;
}

export interface InAppNotification {
  id: string;
  type: 'base_plan_ready' | 'base_plan_error' | 'custom' | 'milestone' | 'general';
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  link?: string;
  data?: any;
}

// ============================================================================
// STORAGE KEYS (User-scoped)
// ============================================================================

const STORAGE_KEYS = {
  PREFERENCES: 'Liftor_notification_prefs_v2', // v2 to migrate from old format
  IN_APP_NOTIFICATIONS: 'Liftor_inAppNotifications_v2',
  DELIVERED_SUPABASE_IDS: 'Liftor_deliveredSupabaseNotifs',
  // Legacy keys to clean up during migration
  LEGACY_PREFS: 'Liftor_notification_prefs', // Old global (non-user-scoped) prefs
} as const;

// Minimum queue size before we top up check-in reminders
const MIN_CHECKIN_QUEUE_SIZE = 7;

const CHECKIN_SCHEDULE_WINDOW_DAYS = 30;

const scopedKey = (base: string, userId: string | null | undefined) =>
  `${base}:${userId ?? 'anon'}`;

// ============================================================================
// EXPO NOTIFICATION HANDLER SETUP
// ============================================================================

// Configure how notifications are displayed when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ============================================================================
// NOTIFICATION SERVICE CLASS
// ============================================================================

class NotificationServiceClass {
  private initialized = false;
  private pushToken: string | null = null;
  private supabaseClient: any = null;
  private currentUserId: string | null = null;
  private supabaseSubscription: any = null;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the notification service with user context.
   * This should be called ONCE when the user logs in, not on every app open.
   */
  async initialize(userId: string | null, supabase: any): Promise<void> {
    if (this.initialized && this.currentUserId === userId) {
      console.log('[NotificationService] Already initialized for this user');
      return;
    }

    console.log('[NotificationService] Initializing for user:', userId?.substring(0, 8) || 'anon');
    this.currentUserId = userId;
    this.supabaseClient = supabase;
    this.initialized = true;

    const config = getProductionConfig();

    // Migrate from legacy prefs if needed
    await this.migrateLegacyPrefs();

    // Setup Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Liftor Notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#E22118',
        sound: 'default',
      });
    }

    // Register for push notifications (but don't schedule anything yet)
    const token = await this.registerPushToken();

    // Log initialization in production
    if (config.isProduction) {
      logProductionMetric('data', 'notification_service_init', {
        userId: userId?.substring(0, 8),
        pushTokenObtained: !!token,
        platform: Platform.OS,
      });
    }

    // Subscribe to Supabase custom notifications
    if (userId && supabase) {
      await this.subscribeToSupabaseNotifications();
    }
  }

  /**
   * Migrate from legacy notification prefs (global) to user-scoped prefs.
   * Also cleans up stale legacy data.
   */
  private async migrateLegacyPrefs(): Promise<void> {
    try {
      const legacyData = await AsyncStorage.getItem(STORAGE_KEYS.LEGACY_PREFS);
      if (!legacyData) return; // No legacy data, nothing to migrate

      const legacyPrefs = JSON.parse(legacyData);
      const currentPrefs = await this.getPreferences();

      // Only migrate if current prefs are default (user hasn't set anything yet)
      const isCurrentDefault = 
        currentPrefs.workoutRemindersEnabled === true &&
        currentPrefs.checkInRemindersEnabled === true &&
        currentPrefs.milestonesEnabled === true &&
        !currentPrefs.scheduledCheckInTime &&
        !currentPrefs.scheduledWorkoutTime;

      if (isCurrentDefault && legacyPrefs) {
        // Migrate legacy prefs to user-scoped
        await this.savePreferences({
          workoutRemindersEnabled: legacyPrefs.workoutRemindersEnabled ?? true,
          checkInRemindersEnabled: legacyPrefs.checkInRemindersEnabled ?? true,
          milestonesEnabled: legacyPrefs.milestonesEnabled ?? true,
        });
        console.log('[NotificationService] Migrated legacy preferences');
      }

      // Clean up legacy data to prevent future confusion
      await AsyncStorage.removeItem(STORAGE_KEYS.LEGACY_PREFS);
      console.log('[NotificationService] Cleaned up legacy notification prefs');

      const config = getProductionConfig();
      if (config.isProduction) {
        logProductionMetric('data', 'notification_prefs_migrated', {
          hadLegacyData: true,
          migratedToUserScoped: isCurrentDefault,
        });
      }
    } catch (error) {
      console.warn('[NotificationService] Legacy migration error (non-fatal):', error);
    }
  }

  /**
   * Cleanup when user logs out
   */
  async cleanup(): Promise<void> {
    console.log('[NotificationService] Cleaning up');
    this.unsubscribeFromSupabaseNotifications();
    this.initialized = false;
    this.currentUserId = null;
    this.supabaseClient = null;
  }

  // ============================================================================
  // PUSH TOKEN REGISTRATION
  // ============================================================================

  private async registerPushToken(): Promise<string | null> {
    const config = getProductionConfig();

    if (!Device.isDevice) {
      console.warn('[NotificationService] Push notifications require a physical device');
      if (config.isProduction) {
        logProductionMetric('error', 'push_registration_failed', { reason: 'not_physical_device' });
      }
      return null;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.warn('[NotificationService] Permission not granted');
        if (config.isProduction) {
          logProductionMetric('data', 'push_permission_denied', { existingStatus, finalStatus });
        }
        return null;
      }

      const projectId = (Constants as any).expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        console.warn('[NotificationService] EAS Project ID not found');
        if (config.isProduction) {
          logProductionMetric('error', 'push_registration_failed', { reason: 'no_project_id' });
        }
        return null;
      }

      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      this.pushToken = token;
      console.log('[NotificationService] Push token obtained');

      // Save to Supabase if we have a user
      if (this.currentUserId && this.supabaseClient) {
        await this.savePushTokenToBackend(token);
      }

      if (config.isProduction) {
        logProductionMetric('data', 'push_token_obtained', { platform: Platform.OS });
      }

      return token;
    } catch (error) {
      console.error('[NotificationService] Push registration failed:', error);
      if (config.isProduction) {
        logProductionMetric('error', 'push_registration_failed', { error: String(error) });
      }
      return null;
    }
  }

  private async savePushTokenToBackend(token: string): Promise<void> {
    if (!this.supabaseClient || !this.currentUserId) return;

    try {
      const deviceInfo = {
        platform: Platform.OS,
        osVersion: Platform.Version,
        deviceModel: Device.modelName || 'Unknown',
      };

      await this.supabaseClient
        .from('push_tokens')
        .upsert({
          user_id: this.currentUserId,
          token,
          device_info: deviceInfo,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,token'
        });

      console.log('[NotificationService] Push token saved to backend');
    } catch (error) {
      console.error('[NotificationService] Failed to save push token:', error);
    }
  }

  // ============================================================================
  // PREFERENCES MANAGEMENT (User-scoped)
  // ============================================================================

  async getPreferences(): Promise<NotificationPreferences> {
    try {
      const key = scopedKey(STORAGE_KEYS.PREFERENCES, this.currentUserId);
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[NotificationService] Error reading preferences:', error);
    }

    // Default preferences
    return {
      workoutRemindersEnabled: true,
      checkInRemindersEnabled: true,
      milestonesEnabled: true,
    };
  }

  async savePreferences(prefs: Partial<NotificationPreferences>): Promise<void> {
    try {
      const current = await this.getPreferences();
      const updated = { ...current, ...prefs };
      const key = scopedKey(STORAGE_KEYS.PREFERENCES, this.currentUserId);
      await AsyncStorage.setItem(key, JSON.stringify(updated));
      console.log('[NotificationService] Preferences saved');
    } catch (error) {
      console.error('[NotificationService] Error saving preferences:', error);
    }
  }

  // ============================================================================
  // CHECK-IN REMINDER SCHEDULING
  // ============================================================================

  /**
   * Schedule or update the daily check-in reminder.
   * This is IDEMPOTENT - it only reschedules if the time actually changed.
   * 
   * @param time - Time string like "9:00 AM"
   * @param forceReschedule - Force reschedule even if time hasn't changed
   */
  async scheduleCheckInReminder(time: string | undefined, forceReschedule = false): Promise<string | null> {
    const prefs = await this.getPreferences();

    // Check if reminders are enabled
    if (!prefs.checkInRemindersEnabled) {
      console.log('[NotificationService] Check-in reminders disabled, skipping');
      return null;
    }

    if (!time) {
      console.log('[NotificationService] No check-in time provided, skipping');
      return null;
    }

    const hasExistingSchedule =
      prefs.scheduledCheckInTime === time &&
      (
        (prefs.scheduledCheckInIds && prefs.scheduledCheckInIds.length > 0) ||
        !!prefs.scheduledCheckInId
      );

    // Check if already scheduled for this time (idempotent)
    if (!forceReschedule && hasExistingSchedule) {
      console.log('[NotificationService] Check-in reminder already scheduled for', time);
      return prefs.scheduledCheckInId ?? prefs.scheduledCheckInIds?.[0] ?? null;
    }

    const scheduledIds: string[] = [];
    try {
      // Cancel existing check-in reminder if any
      await this.cancelCheckInReminder();

      // Parse the time
      const { hour, minute } = this.parseTimeString(time);

      // Schedule the next N reminders explicitly so the first one never fires immediately
      const upcomingDates = this.getUpcomingCheckInDates(hour, minute, CHECKIN_SCHEDULE_WINDOW_DAYS);

      for (const date of upcomingDates) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Daily Check-in Time! 💪',
            body: 'How are you feeling today? Complete your check-in to get your personalized plan.',
            data: { type: 'checkin_reminder', screen: '/checkin' },
            sound: true,
          },
          trigger: date,
        });
        scheduledIds.push(id);
      }

      // Save the scheduled state
      await this.savePreferences({
        scheduledCheckInTime: time,
        scheduledCheckInId: scheduledIds[0],
        scheduledCheckInIds: scheduledIds,
      });

      console.log(
        `[NotificationService] Scheduled ${scheduledIds.length} check-in reminders starting ${upcomingDates[0].toISOString()}`
      );
      return scheduledIds[0] ?? null;
    } catch (error) {
      console.error('[NotificationService] Failed to schedule check-in reminder:', error);
      // Best-effort cleanup if scheduling partially succeeded
      try {
        for (const id of scheduledIds) {
          await Notifications.cancelScheduledNotificationAsync(id);
        }
        await this.savePreferences({
          scheduledCheckInTime: undefined,
          scheduledCheckInIds: [],
          scheduledCheckInId: undefined,
        });
      } catch (cleanupError) {
        console.warn('[NotificationService] Cleanup after scheduling failure failed:', cleanupError);
      }
      return null;
    }
  }

  /**
   * Cancel the scheduled check-in reminder
   */
  async cancelCheckInReminder(): Promise<void> {
    try {
      const prefs = await this.getPreferences();
      
      // Cancel by stored ID if available
      const idsToCancel = [
        ...(prefs.scheduledCheckInIds ?? []),
        ...(prefs.scheduledCheckInId ? [prefs.scheduledCheckInId] : []),
      ];
      for (const id of idsToCancel) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }

      // Also cancel any with matching type (cleanup)
      const all = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of all) {
        if ((n as any).content?.data?.type === 'checkin_reminder') {
          await Notifications.cancelScheduledNotificationAsync((n as any).identifier);
        }
      }

      // Clear scheduled state
      await this.savePreferences({
        scheduledCheckInTime: undefined,
        scheduledCheckInId: undefined,
        scheduledCheckInIds: [],
      });

      console.log('[NotificationService] Check-in reminder cancelled');
    } catch (error) {
      console.error('[NotificationService] Failed to cancel check-in reminder:', error);
    }
  }

  // ============================================================================
  // WORKOUT REMINDER SCHEDULING
  // ============================================================================

  /**
   * Schedule or update the daily workout reminder.
   * This is IDEMPOTENT - it only reschedules if the time actually changed.
   * 
   * @param preferredTime - Time string like "Morning (7-10 AM)"
   * @param hasVerifiedPlan - Whether user has a verified base plan
   * @param forceReschedule - Force reschedule even if time hasn't changed
   */
  async scheduleWorkoutReminder(
    preferredTime: string | undefined,
    hasVerifiedPlan: boolean = true,
    forceReschedule = false
  ): Promise<string | null> {
    const prefs = await this.getPreferences();

    // Check if reminders are enabled
    if (!prefs.workoutRemindersEnabled) {
      console.log('[NotificationService] Workout reminders disabled, skipping');
      return null;
    }

    if (!preferredTime) {
      console.log('[NotificationService] No preferred workout time, skipping');
      return null;
    }

    // Don't schedule if user doesn't have a verified plan yet
    if (!hasVerifiedPlan) {
      console.log('[NotificationService] No verified plan yet, skipping workout reminder');
      return null;
    }

    // Check if already scheduled for this time (idempotent)
    if (!forceReschedule && prefs.scheduledWorkoutTime === preferredTime && prefs.scheduledWorkoutId) {
      console.log('[NotificationService] Workout reminder already scheduled for', preferredTime);
      return prefs.scheduledWorkoutId;
    }

    try {
      // Cancel existing workout reminder if any
      await this.cancelWorkoutReminder();

      // Parse the time and calculate reminder time (10 min before)
      const { hour, minute } = this.parseTimeString(preferredTime);
      let reminderHour = hour;
      let reminderMinute = minute - 10;
      if (reminderMinute < 0) {
        reminderHour = (hour - 1 + 24) % 24;
        reminderMinute = 60 + reminderMinute;
      }

      // Schedule new reminder
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Strap up in 10 mins 💪',
          body: 'Time to push your limits. Your workout is about to begin.',
          data: { type: 'workout_reminder', screen: '/plan' },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: { hour: reminderHour, minute: reminderMinute, repeats: true },
      });

      // Save the scheduled state
      await this.savePreferences({
        scheduledWorkoutTime: preferredTime,
        scheduledWorkoutId: id,
      });

      console.log(`[NotificationService] Workout reminder scheduled for ${reminderHour}:${String(reminderMinute).padStart(2, '0')}`);
      return id;
    } catch (error) {
      console.error('[NotificationService] Failed to schedule workout reminder:', error);
      return null;
    }
  }

  /**
   * Cancel the scheduled workout reminder
   */
  async cancelWorkoutReminder(): Promise<void> {
    try {
      const prefs = await this.getPreferences();
      
      // Cancel by stored ID if available
      if (prefs.scheduledWorkoutId) {
        await Notifications.cancelScheduledNotificationAsync(prefs.scheduledWorkoutId);
      }

      // Also cancel any with matching type (cleanup)
      const all = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of all) {
        if ((n as any).content?.data?.type === 'workout_reminder') {
          await Notifications.cancelScheduledNotificationAsync((n as any).identifier);
        }
      }

      // Clear scheduled state
      await this.savePreferences({
        scheduledWorkoutTime: undefined,
        scheduledWorkoutId: undefined,
      });

      console.log('[NotificationService] Workout reminder cancelled');
    } catch (error) {
      console.error('[NotificationService] Failed to cancel workout reminder:', error);
    }
  }

  // ============================================================================
  // MILESTONE NOTIFICATIONS
  // ============================================================================

  /**
   * Generate a unique key for a milestone to track if it was already notified.
   * - streak: 'streak_7', 'streak_14', 'streak_30'
   * - weight_goal: 'weight_goal_75.0' (rounded to 1 decimal)
   * - plan_completed: 'plan_completed_2025-01-15' (by date)
   */
  private getMilestoneKey(type: 'streak' | 'weight_goal' | 'plan_completed', details?: any): string {
    switch (type) {
      case 'streak':
        return `streak_${details?.days || 7}`;
      case 'weight_goal':
        return `weight_goal_${Number(details?.weight || 0).toFixed(1)}`;
      case 'plan_completed':
        return `plan_completed_${details?.date || new Date().toISOString().split('T')[0]}`;
      default:
        return `${type}_${Date.now()}`;
    }
  }

  /**
   * Check if a milestone was already notified
   */
  async wasMilestoneNotified(type: 'streak' | 'weight_goal' | 'plan_completed', details?: any): Promise<boolean> {
    const prefs = await this.getPreferences();
    const key = this.getMilestoneKey(type, details);
    return (prefs.notifiedMilestones || []).includes(key);
  }

  /**
   * Mark a milestone as notified to prevent duplicate notifications
   */
  private async markMilestoneNotified(type: 'streak' | 'weight_goal' | 'plan_completed', details?: any): Promise<void> {
    const prefs = await this.getPreferences();
    const key = this.getMilestoneKey(type, details);
    const notified = prefs.notifiedMilestones || [];
    
    if (!notified.includes(key)) {
      // Keep only last 100 milestone keys to prevent unbounded growth
      const updated = [...notified, key].slice(-100);
      await this.savePreferences({ notifiedMilestones: updated });
    }
  }

  /**
   * Reset notified milestones for a specific type (e.g., when user sets new goal)
   */
  async resetMilestoneTracking(type?: 'streak' | 'weight_goal' | 'plan_completed'): Promise<void> {
    const prefs = await this.getPreferences();
    const notified = prefs.notifiedMilestones || [];
    
    if (!type) {
      // Reset all
      await this.savePreferences({ notifiedMilestones: [] });
    } else {
      // Reset only the specified type
      const filtered = notified.filter(key => !key.startsWith(`${type}_`));
      await this.savePreferences({ notifiedMilestones: filtered });
    }
    console.log(`[NotificationService] Milestone tracking reset for: ${type || 'all'}`);
  }

  /**
   * Send a milestone notification (one-off, immediate).
   * These are for achievements like streaks, weight goals, etc.
   * Includes deduplication - won't send the same milestone twice.
   */
  async sendMilestoneNotification(
    type: 'streak' | 'weight_goal' | 'plan_completed',
    details?: any
  ): Promise<void> {
    const prefs = await this.getPreferences();
    
    if (!prefs.milestonesEnabled) {
      console.log('[NotificationService] Milestone notifications disabled, skipping');
      return;
    }

    // Check if already notified (deduplication)
    const alreadyNotified = await this.wasMilestoneNotified(type, details);
    if (alreadyNotified) {
      console.log(`[NotificationService] Milestone already notified, skipping: ${this.getMilestoneKey(type, details)}`);
      return;
    }

    const messages: Record<string, { title: string; body: string }> = {
      streak: {
        title: `🔥 ${details?.days || 7}-Day Streak!`,
        body: `Amazing! You've completed check-ins for ${details?.days || 7} days in a row!`,
      },
      weight_goal: {
        title: '🎯 Weight Goal Achieved!',
        body: `Congratulations! You've reached your target weight of ${details?.weight}kg!`,
      },
      plan_completed: {
        title: '✅ Workout Completed!',
        body: `Great job completing today's workout! Keep up the momentum!`,
      },
    };

    const message = messages[type];
    if (!message) return;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          ...message,
          data: { type: 'milestone', milestoneType: type, ...details },
          sound: true,
        },
        trigger: null, // Immediate
      });

      // Mark as notified to prevent duplicates
      await this.markMilestoneNotified(type, details);

      console.log(`[NotificationService] Milestone notification sent: ${type}`);
    } catch (error) {
      console.error('[NotificationService] Failed to send milestone notification:', error);
    }
  }

  // ============================================================================
  // BASE PLAN NOTIFICATIONS (State-transition based)
  // ============================================================================

  /**
   * Send base plan ready notification.
   * This should ONLY be called when the plan actually transitions to 'ready'.
   */
  async sendBasePlanReadyNotification(): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🎉 Your plan is ready!',
          body: 'Your personalized fitness plan has been generated. Tap to review and start your journey.',
          data: { type: 'base_plan_ready', screen: '/plan-preview' },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Immediate
      });

      // Also add to in-app notifications
      await this.addInAppNotification({
        type: 'base_plan_ready',
        title: '🎉 Your plan is ready!',
        body: 'Your personalized fitness plan has been generated. Tap to review and start your journey.',
        link: '/plan-preview',
      });

      console.log('[NotificationService] Base plan ready notification sent');
    } catch (error) {
      console.error('[NotificationService] Failed to send base plan ready notification:', error);
    }
  }

  /**
   * Send base plan error notification.
   * This should ONLY be called when generation actually fails.
   */
  async sendBasePlanErrorNotification(errorMessage: string): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ Plan generation issue',
          body: 'We had trouble generating your plan. Tap to try again.',
          data: { type: 'base_plan_error', screen: '/plan-building', error: errorMessage },
          sound: true,
        },
        trigger: null, // Immediate
      });

      // Also add to in-app notifications
      await this.addInAppNotification({
        type: 'base_plan_error',
        title: '⚠️ Plan generation issue',
        body: 'We had trouble generating your plan. Tap to try again.',
        link: '/plan-building',
        data: { error: errorMessage },
      });

      console.log('[NotificationService] Base plan error notification sent');
    } catch (error) {
      console.error('[NotificationService] Failed to send base plan error notification:', error);
    }
  }

  // ============================================================================
  // SUPABASE CUSTOM NOTIFICATIONS
  // ============================================================================

  /**
   * Subscribe to Supabase custom notifications for this user.
   * Uses real-time subscription to receive new notifications.
   */
  private async subscribeToSupabaseNotifications(): Promise<void> {
    if (!this.supabaseClient || !this.currentUserId) return;

    const config = getProductionConfig();

    try {
      // First, fetch any undelivered notifications
      await this.fetchAndDeliverSupabaseNotifications();

      // Subscribe to new notifications
      this.supabaseSubscription = this.supabaseClient
        .channel(`notifications:${this.currentUserId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'user_notifications',
            filter: `user_id=eq.${this.currentUserId}`,
          },
          async (payload: any) => {
            console.log('[NotificationService] New Supabase notification received');
            await this.deliverSupabaseNotification(payload.new);
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            console.log('[NotificationService] Subscribed to Supabase notifications');
            if (config.isProduction) {
              logProductionMetric('data', 'supabase_notification_subscribed', { status });
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[NotificationService] Supabase subscription failed:', status);
            if (config.isProduction) {
              logProductionMetric('error', 'supabase_notification_subscription_failed', { status });
            }
          }
        });

    } catch (error) {
      console.error('[NotificationService] Failed to subscribe to Supabase notifications:', error);
      if (config.isProduction) {
        logProductionMetric('error', 'supabase_notification_subscription_error', { error: String(error) });
      }
    }
  }

  /**
   * Unsubscribe from Supabase notifications
   */
  private unsubscribeFromSupabaseNotifications(): void {
    if (this.supabaseSubscription) {
      this.supabaseSubscription.unsubscribe();
      this.supabaseSubscription = null;
      console.log('[NotificationService] Unsubscribed from Supabase notifications');
    }
  }

  /**
   * Fetch and deliver any pending Supabase notifications.
   * Uses deduplication to prevent re-sending the same notification.
   */
  async fetchAndDeliverSupabaseNotifications(): Promise<void> {
    if (!this.supabaseClient || !this.currentUserId) return;

    try {
      // Get already delivered notification IDs
      const deliveredIds = await this.getDeliveredSupabaseIds();

      // Fetch undelivered notifications from Supabase
      const { data: notifications, error } = await this.supabaseClient
        .from('user_notifications')
        .select('*')
        .eq('user_id', this.currentUserId)
        .eq('delivered', false)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[NotificationService] Error fetching Supabase notifications:', error);
        return;
      }

      if (!notifications || notifications.length === 0) {
        return;
      }

      // Deliver each notification (with deduplication)
      for (const notification of notifications) {
        if (!deliveredIds.has(notification.id)) {
          await this.deliverSupabaseNotification(notification);
        }
      }
    } catch (error) {
      console.error('[NotificationService] Error processing Supabase notifications:', error);
    }
  }

  /**
   * Deliver a single Supabase notification
   */
  private async deliverSupabaseNotification(notification: SupabaseNotification): Promise<void> {
    try {
      // Check if already delivered locally
      const deliveredIds = await this.getDeliveredSupabaseIds();
      if (deliveredIds.has(notification.id)) {
        console.log('[NotificationService] Notification already delivered:', notification.id);
        return;
      }

      // Send OS notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: {
            type: 'custom',
            notificationId: notification.id,
            screen: notification.screen,
            ...notification.data,
          },
          sound: true,
        },
        trigger: null, // Immediate
      });

      // Add to in-app notifications
      await this.addInAppNotification({
        type: 'custom',
        title: notification.title,
        body: notification.body,
        link: notification.screen,
        data: notification.data,
      });

      // Mark as delivered locally
      await this.markSupabaseNotificationDelivered(notification.id);

      // Mark as delivered in Supabase
      if (this.supabaseClient) {
        await this.supabaseClient
          .from('user_notifications')
          .update({ delivered: true })
          .eq('id', notification.id);
      }

      console.log('[NotificationService] Supabase notification delivered:', notification.id);
    } catch (error) {
      console.error('[NotificationService] Error delivering Supabase notification:', error);
    }
  }

  /**
   * Get set of already delivered Supabase notification IDs
   */
  private async getDeliveredSupabaseIds(): Promise<Set<string>> {
    try {
      const key = scopedKey(STORAGE_KEYS.DELIVERED_SUPABASE_IDS, this.currentUserId);
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (error) {
      console.error('[NotificationService] Error reading delivered IDs:', error);
    }
    return new Set();
  }

  /**
   * Mark a Supabase notification as delivered locally
   */
  private async markSupabaseNotificationDelivered(id: string): Promise<void> {
    try {
      const deliveredIds = await this.getDeliveredSupabaseIds();
      deliveredIds.add(id);
      
      // Keep only last 1000 IDs to prevent unbounded growth
      const idsArray = Array.from(deliveredIds).slice(-1000);
      
      const key = scopedKey(STORAGE_KEYS.DELIVERED_SUPABASE_IDS, this.currentUserId);
      await AsyncStorage.setItem(key, JSON.stringify(idsArray));
    } catch (error) {
      console.error('[NotificationService] Error saving delivered ID:', error);
    }
  }

  // ============================================================================
  // IN-APP NOTIFICATION CENTER
  // ============================================================================

  /**
   * Get all in-app notifications
   */
  async getInAppNotifications(): Promise<InAppNotification[]> {
    try {
      const key = scopedKey(STORAGE_KEYS.IN_APP_NOTIFICATIONS, this.currentUserId);
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[NotificationService] Error reading in-app notifications:', error);
    }
    return [];
  }

  /**
   * Add an in-app notification
   */
  async addInAppNotification(
    notification: Omit<InAppNotification, 'id' | 'createdAt' | 'read'>
  ): Promise<void> {
    try {
      const notifications = await this.getInAppNotifications();
      const newNotification: InAppNotification = {
        ...notification,
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        createdAt: new Date().toISOString(),
        read: false,
      };
      notifications.unshift(newNotification);

      // Keep only last 50 notifications
      const trimmed = notifications.slice(0, 50);

      const key = scopedKey(STORAGE_KEYS.IN_APP_NOTIFICATIONS, this.currentUserId);
      await AsyncStorage.setItem(key, JSON.stringify(trimmed));
    } catch (error) {
      console.error('[NotificationService] Error adding in-app notification:', error);
    }
  }

  /**
   * Mark an in-app notification as read
   */
  async markInAppNotificationRead(notificationId: string): Promise<void> {
    try {
      const notifications = await this.getInAppNotifications();
      const updated = notifications.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      );
      const key = scopedKey(STORAGE_KEYS.IN_APP_NOTIFICATIONS, this.currentUserId);
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    } catch (error) {
      console.error('[NotificationService] Error marking notification read:', error);
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(): Promise<number> {
    const notifications = await this.getInAppNotifications();
    return notifications.filter(n => !n.read).length;
  }

  /**
   * Clear all in-app notifications
   */
  async clearAllInAppNotifications(): Promise<void> {
    try {
      const key = scopedKey(STORAGE_KEYS.IN_APP_NOTIFICATIONS, this.currentUserId);
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('[NotificationService] Error clearing notifications:', error);
    }
  }

  // ============================================================================
  // MASTER TOGGLE
  // ============================================================================

  /**
   * Enable or disable all notifications
   */
  async setAllNotificationsEnabled(enabled: boolean): Promise<void> {
    await this.savePreferences({
      workoutRemindersEnabled: enabled,
      checkInRemindersEnabled: enabled,
      milestonesEnabled: enabled,
    });

    if (!enabled) {
      // Cancel all scheduled reminders
      await this.cancelCheckInReminder();
      await this.cancelWorkoutReminder();
    }

    console.log(`[NotificationService] All notifications ${enabled ? 'enabled' : 'disabled'}`);
  }

  // ============================================================================
  // SYNC USER PREFERENCES
  // ============================================================================

  /**
   * Sync notification schedules with user preferences.
   * This is called when user data changes, but it's IDEMPOTENT.
   * It will NOT reschedule if times haven't changed.
   * 
   * Also tops up the check-in reminder queue if running low (e.g., user
   * hasn't opened the app in a while and the 30-day queue is depleted).
   */
  async syncWithUserPreferences(
    user: User,
    hasVerifiedPlan: boolean = true
  ): Promise<void> {
    console.log('[NotificationService] Syncing with user preferences');

    // Check if check-in reminder queue needs topping up
    if (user.checkInReminderTime) {
      const needsTopUp = await this.checkIfQueueNeedsTopUp();
      if (needsTopUp) {
        console.log('[NotificationService] Check-in queue running low, forcing reschedule');
        await this.scheduleCheckInReminder(user.checkInReminderTime, true); // force reschedule
      } else {
        await this.scheduleCheckInReminder(user.checkInReminderTime);
      }
    }

    // Schedule workout reminder if user has set a preferred time
    if (user.preferredTrainingTime) {
      await this.scheduleWorkoutReminder(user.preferredTrainingTime, hasVerifiedPlan);
    }
  }

  /**
   * Check if the check-in reminder queue is running low and needs topping up.
   * Returns true if there are fewer than MIN_CHECKIN_QUEUE_SIZE reminders scheduled.
   */
  private async checkIfQueueNeedsTopUp(): Promise<boolean> {
    try {
      const prefs = await this.getPreferences();
      
      // If no scheduled IDs, queue is empty
      if (!prefs.scheduledCheckInIds || prefs.scheduledCheckInIds.length === 0) {
        // Check if there's at least a legacy single ID
        if (!prefs.scheduledCheckInId) {
          return true; // No reminders at all
        }
      }

      // Count how many scheduled check-in reminders still exist
      const all = await Notifications.getAllScheduledNotificationsAsync();
      const checkInReminders = all.filter(
        (n: (typeof all)[number]) => 
          (n.content?.data as Record<string, unknown> | undefined)?.type === 'checkin_reminder'
      );

      const count = checkInReminders.length;
      console.log(`[NotificationService] Check-in queue size: ${count}`);

      return count < MIN_CHECKIN_QUEUE_SIZE;
    } catch (error) {
      console.warn('[NotificationService] Error checking queue size:', error);
      return false; // Don't force reschedule on error
    }
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Parse a time string like "9:00 AM" or "Morning (7-10 AM)" into hour/minute
   */
  private parseTimeString(timeStr: string): { hour: number; minute: number } {
    // Handle window-style times like "Morning (7-10 AM)"
    const windowMatch = timeStr.match(/\((\d+)-\d+\s*(AM|PM)\)/i);
    if (windowMatch) {
      let hour = parseInt(windowMatch[1], 10);
      const isPM = windowMatch[2].toUpperCase() === 'PM';
      if (isPM && hour !== 12) hour += 12;
      else if (!isPM && hour === 12) hour = 0;
      return { hour, minute: 0 };
    }

    // Handle simple times like "9:00 AM"
    const time = timeStr.trim().toUpperCase();
    const isPM = time.includes('PM');
    const isAM = time.includes('AM');
    const timePart = time.replace(/AM|PM/gi, '').trim();
    const [hourStr, minuteStr] = timePart.split(':');
    let hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr || '0', 10);
    
    if (isPM && hour !== 12) hour += 12;
    else if (isAM && hour === 12) hour = 0;
    
    return { hour, minute };
  }

  private getUpcomingCheckInDates(hour: number, minute: number, count: number): Date[] {
    const dates: Date[] = [];
    const now = new Date();
    const first = new Date(now);
    first.setSeconds(0, 0);
    first.setHours(hour, minute, 0, 0);
    if (first <= now) {
      first.setDate(first.getDate() + 1);
    }

    for (let i = 0; i < Math.max(1, count); i++) {
      const occurrence = new Date(first);
      occurrence.setDate(first.getDate() + i);
      dates.push(occurrence);
    }

    return dates;
  }

  /**
   * Cancel all scheduled notifications by type
   */
  async cancelNotificationsByType(type: string): Promise<void> {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of all) {
        if ((n as any).content?.data?.type === type) {
          await Notifications.cancelScheduledNotificationAsync((n as any).identifier);
        }
      }
      console.log(`[NotificationService] Cancelled all ${type} notifications`);
    } catch (error) {
      console.error('[NotificationService] Error cancelling notifications:', error);
    }
  }

  /**
   * Get all currently scheduled notifications (for debugging)
   */
  async getScheduledNotifications(): Promise<any[]> {
    return Notifications.getAllScheduledNotificationsAsync();
  }
}

// Export singleton instance
export const NotificationService = new NotificationServiceClass();




