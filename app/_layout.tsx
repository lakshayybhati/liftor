import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as Linking from 'expo-linking';
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { StyleSheet, Platform, AppState, AppStateStatus } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { UserProvider } from "@/hooks/useUserStore";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Purchases from "react-native-purchases";
import Constants from "expo-constants";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RCPurchasesInit() {
  const { session } = useAuth();
  const lastUserIdRef = useRef<string | null>(null);
  const isConfiguredRef = useRef<boolean>(false);

  useEffect(() => {
    // Skip configuration on web or Expo Go; requires EAS dev client or standalone build
    if (Platform.OS === 'web') {
      console.log('[RevenueCat] Skipping configuration on web platform.');
      return;
    }
    if (Constants.appOwnership === 'expo') {
      console.log('[RevenueCat] Skipping configuration in Expo Go. Use EAS dev client or a build.');
      return;
    }

    (async () => {
      try {
        const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
        const iosKey = extra.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
        const androidKey = extra.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
        const apiKey = Platform.OS === 'ios' ? iosKey : androidKey;
        if (!apiKey) {
          console.warn('[RevenueCat] Missing API key in app.json → extra.');
          return;
        }
        await Purchases.configure({ apiKey });
        isConfiguredRef.current = true;
        // Warm up cache once on startup
        try { void Purchases.getCustomerInfo(); } catch {}
      } catch (e: any) {
        isConfiguredRef.current = false;
        console.error('Error configuring Purchases:', e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!isConfiguredRef.current) return;
      try {
        const current = session?.user?.id ?? null;
        if (current && current !== lastUserIdRef.current) {
          await Purchases.logIn(current);
          lastUserIdRef.current = current;
        } else if (!current && lastUserIdRef.current) {
          try { await Purchases.logOut(); } catch {}
          lastUserIdRef.current = null;
        }
      } catch (e) {
        console.log('[RevenueCat] logIn/logOut error', e);
      }
    })();
  }, [session?.user?.id]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (!isConfiguredRef.current) return;
      if (state === 'active') {
        try { void Purchases.getCustomerInfo(); } catch {}
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="checkin" options={{ headerShown: true }} />
      <Stack.Screen name="generating-plan" options={{ headerShown: false }} />
      <Stack.Screen name="plan" options={{ headerShown: true }} />
      <Stack.Screen name="history" options={{ headerShown: false }} />
      <Stack.Screen name="auth/login" options={{ headerShown: false }} />
      <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: true, title: 'Edit Profile' }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    const authCallbackUrl = Linking.createURL('/auth/callback');
    console.log('Auth Callback URL:', authCallbackUrl);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UserProvider>
          <GestureHandlerRootView style={styles.container}>
            <RCPurchasesInit />
            <RootLayoutNav />
          </GestureHandlerRootView>
        </UserProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});