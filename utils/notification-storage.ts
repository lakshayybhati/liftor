import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIF_PREFS_KEY = 'Liftor_notification_prefs';

export interface NotificationPreferences {
  workoutRemindersEnabled: boolean;
  checkInRemindersEnabled: boolean;
  milestonesEnabled: boolean;
  lastScheduledWorkoutTime?: string;
  lastScheduledCheckInTime?: string;
  checkInReminderTime?: string; // HH:mm in 24h
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const stored = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {
    workoutRemindersEnabled: true,
    checkInRemindersEnabled: true,
    milestonesEnabled: true,
    // No default check-in time; user must set it in Edit Profile
  } as NotificationPreferences;
}

export async function saveNotificationPreferences(prefs: NotificationPreferences) {
  try {
    await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}


