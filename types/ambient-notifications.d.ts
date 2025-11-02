declare module 'expo-notifications' {
  export const setNotificationHandler: any;
  export const addNotificationReceivedListener: any;
  export const addNotificationResponseReceivedListener: any;
  export const removeNotificationSubscription: any;
  export const getPermissionsAsync: any;
  export const requestPermissionsAsync: any;
  export const getExpoPushTokenAsync: any;
  export const setNotificationChannelAsync: any;
  export const scheduleNotificationAsync: any;
  export const getAllScheduledNotificationsAsync: any;
  export const cancelScheduledNotificationAsync: any;
  export const cancelAllScheduledNotificationsAsync: any;
  export const AndroidImportance: any;
  export const AndroidNotificationPriority: any;
}

declare module 'expo-device' {
  export const isDevice: boolean;
  export const modelName: string | null;
}


