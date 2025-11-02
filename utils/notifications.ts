import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  let token: string | null = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Liftor Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E22118',
      sound: 'default',
    });
  }

  if (!Device.isDevice) {
    console.warn('[Notifications] Push notifications require a physical device');
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
      console.warn('[Notifications] Permission not granted');
      return null;
    }

    const projectId = (Constants as any).expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      throw new Error('EAS Project ID not found in app config');
    }

    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    console.log('[Notifications] Token obtained:', token);
  } catch (error) {
    console.error('[Notifications] Registration failed:', error);
  }

  return token;
}

export async function savePushTokenToBackend(supabase: any, userId: string, token: string) {
  try {
    const deviceInfo = {
      platform: Platform.OS,
      osVersion: Platform.Version,
      deviceModel: Device.modelName || 'Unknown',
    };

    const { error } = await supabase
      .from('push_tokens')
      .upsert({
        user_id: userId,
        token,
        device_info: deviceInfo,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,token'
      });

    if (error) throw error;
    console.log('[Notifications] Token saved to backend');
    return true;
  } catch (error) {
    console.error('[Notifications] Failed to save token:', error);
    return false;
  }
}

export function parseTimeString(timeStr: string): { hour: number; minute: number } {
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

export async function scheduleWorkoutReminder(preferredTime?: string) {
  if (!preferredTime) {
    console.log('[Notifications] No preferred time, skipping workout reminder');
    return null;
  }
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if ((n as any).content?.data?.type === 'workout_reminder') {
        await Notifications.cancelScheduledNotificationAsync((n as any).identifier);
      }
    }
    const { hour, minute } = parseTimeString(preferredTime);
    let reminderHour = hour;
    let reminderMinute = minute - 10; // 10 minutes before
    if (reminderMinute < 0) {
      reminderHour = (hour - 1 + 24) % 24;
      reminderMinute = 60 + reminderMinute;
    }
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Strap up in 10 mins',
        body: 'You have to push your body.',
        data: { type: 'workout_reminder', screen: '/plan' },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: { hour: reminderHour, minute: reminderMinute, repeats: true },
    });
    console.log(`[Notifications] Workout reminder scheduled for ${reminderHour}:${reminderMinute}`);
    return id;
  } catch (error) {
    console.error('[Notifications] Failed to schedule workout reminder:', error);
    return null;
  }
}

export async function scheduleDailyCheckInReminder(hour: number = 9, minute: number = 0) {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if ((n as any).content?.data?.type === 'checkin_reminder') {
        await Notifications.cancelScheduledNotificationAsync((n as any).identifier);
      }
    }
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Daily Check-in Time! 💪',
        body: 'How are you feeling today? Complete your check-in to get your personalized plan.',
        data: { type: 'checkin_reminder', screen: '/checkin' },
        sound: true,
      },
      trigger: { hour, minute, repeats: true },
    });
    console.log(`[Notifications] Check-in reminder scheduled for ${hour}:${minute}`);
    return id;
  } catch (error) {
    console.error('[Notifications] Failed to schedule check-in reminder:', error);
    return null;
  }
}

export async function scheduleDailyCheckInReminderAt(time: string) {
  const { hour, minute } = parseTimeString(time);
  return scheduleDailyCheckInReminder(hour, minute);
}

// Convenience to support "h:mm AM/PM" strings from preferences
export async function scheduleDailyCheckInReminderFromString(time: string | undefined | null) {
  try {
    if (!time || typeof time !== 'string') return null;
    const t = time.trim().toUpperCase();
    const isPM = t.includes('PM');
    const isAM = t.includes('AM');
    const [hStr, mStr = '0'] = t.replace(/AM|PM/gi, '').trim().split(':');
    let h = parseInt(hStr || '9', 10);
    const m = parseInt(mStr || '0', 10);
    if (isPM && h !== 12) h += 12; else if (isAM && h === 12) h = 0;
    return await scheduleDailyCheckInReminder(h, m);
  } catch {
    return null;
  }
}

export async function celebrateMilestone(type: 'streak' | 'weight_goal' | 'plan_completed', details?: any) {
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
  await Notifications.scheduleNotificationAsync({
    content: { ...message, data: { type: 'milestone', ...details }, sound: true },
    trigger: null,
  });
}

export async function cancelNotificationsByType(type: string) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if ((n as any).content?.data?.type === type) {
      await Notifications.cancelScheduledNotificationAsync((n as any).identifier);
    }
  }
}


