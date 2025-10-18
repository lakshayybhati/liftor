import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as Linking from 'expo-linking';
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Platform, AppState, AppStateStatus, View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { UserProvider, useUserStore } from "@/hooks/useUserStore";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Purchases from "react-native-purchases";
import Constants from "expo-constants";
import colors from "@/constants/colors";
import { runEnvironmentDiagnostics } from "@/utils/environment-diagnostics";
import { validateProductionConfig, getProductionConfig } from "@/utils/production-config";

// Prevent splash screen from hiding automatically
SplashScreen.preventAutoHideAsync().catch((err) => {
  // Ignore errors on web or where splash screen may not be available
  console.log('[App] Splash screen not available:', err?.message || 'unknown error');
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
    },
  },
});

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
        
        console.log('[RevenueCat] Initializing...');
        console.log('[RevenueCat] Platform:', Platform.OS);
        console.log('[RevenueCat] API Key present:', !!apiKey);
        
        if (!apiKey) {
          console.warn('[RevenueCat] ❌ Missing API key in app.json → extra.');
          console.warn('[RevenueCat] Keys checked:', { 
            iosKey: iosKey ? 'present' : 'missing',
            androidKey: androidKey ? 'present' : 'missing'
          });
          return;
        }

        // Enable debug logging in development/preview builds
        const isProduction = extra.EXPO_PUBLIC_ENVIRONMENT === 'production';
        if (!isProduction) {
          console.log('[RevenueCat] Debug mode enabled');
          Purchases.setLogLevel('DEBUG' as any);
        }

        await Purchases.configure({ apiKey });
        isConfiguredRef.current = true;
        console.log('[RevenueCat] ✅ SDK configured successfully');
        
        // Warm up cache and log initial state
        try { 
          const customerInfo = await Purchases.getCustomerInfo();
          console.log('[RevenueCat] Initial customer info fetched');
          console.log('[RevenueCat] Active entitlements:', Object.keys(customerInfo.entitlements.active));
        } catch (err) {
          console.warn('[RevenueCat] Could not fetch initial customer info:', err);
        }
      } catch (e: any) {
        isConfiguredRef.current = false;
        console.error('[RevenueCat] ❌ Configuration error:', e.message || e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!isConfiguredRef.current) {
        console.log('[RevenueCat] Skipping logIn - SDK not configured');
        return;
      }
      try {
        const current = session?.user?.id ?? null;
        if (current && current !== lastUserIdRef.current) {
          console.log('[RevenueCat] Logging in user:', current.substring(0, 8) + '...');
          const { customerInfo } = await Purchases.logIn(current);
          lastUserIdRef.current = current;
          console.log('[RevenueCat] ✅ User logged in successfully');
          console.log('[RevenueCat] Active entitlements:', Object.keys(customerInfo.entitlements.active));
          console.log('[RevenueCat] Original App User ID:', customerInfo.originalAppUserId);
        } else if (!current && lastUserIdRef.current) {
          console.log('[RevenueCat] Logging out user');
          try { 
            await Purchases.logOut();
            console.log('[RevenueCat] ✅ User logged out');
          } catch (err) {
            console.warn('[RevenueCat] Logout error:', err);
          }
          lastUserIdRef.current = null;
        }
      } catch (e: any) {
        console.error('[RevenueCat] ❌ logIn/logOut error:', e.message || e);
      }
    })();
  }, [session?.user?.id]);

  useEffect(() => {
    const onChange = async (state: AppStateStatus) => {
      if (!isConfiguredRef.current) return;
      if (state === 'active') {
        console.log('[RevenueCat] App became active, refreshing customer info...');
        try { 
          const customerInfo = await Purchases.getCustomerInfo();
          console.log('[RevenueCat] ✅ Customer info refreshed');
          console.log('[RevenueCat] Active entitlements:', Object.keys(customerInfo.entitlements.active));
        } catch (err) {
          console.warn('[RevenueCat] Could not refresh customer info:', err);
        }
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
      <Stack.Screen name="paywall" options={{ headerShown: false }} />
      <Stack.Screen name="checkin" options={{ headerShown: true }} />
      <Stack.Screen name="generating-plan" options={{ headerShown: false }} />
      <Stack.Screen name="plan" options={{ headerShown: true }} />
      <Stack.Screen name="history" options={{ headerShown: false }} />
      <Stack.Screen name="auth/login" options={{ headerShown: false }} />
      <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
      <Stack.Screen name="auth/verify-otp" options={{ headerShown: true, title: 'Verify Code' }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="program-settings" options={{ headerShown: false }} />
    </Stack>
  );
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const { isAuthLoading, session } = useAuth();
  
  // Import useUserStore inside the component
  const { isLoading: isUserLoading } = useUserStore();

  // Run diagnostics on mount (only once)
  useEffect(() => {
    try {
      // Validate all production configuration
      const isDev = __DEV__;
      if (!isDev) {
        console.log('🚀 App starting in production mode');
        validateProductionConfig();
      }
      
      // Run detailed diagnostics
      runEnvironmentDiagnostics();
      
      // Log production configuration status
      if (!isDev) {
        const config = getProductionConfig();
        console.log('Configuration valid:', config.isValid ? '✅' : '❌');
        if (!config.isValid) {
          console.error('Configuration issues:', config.errors);
        }
      }
    } catch (err) {
      console.error('[App] Diagnostics failed:', err);
    }
  }, []);

  useEffect(() => {
    // Wait for both auth AND user data to initialize before showing app
    // This ensures we have complete user state before rendering
    const bothLoaded = !isAuthLoading && !isUserLoading;
    
    if (bothLoaded) {
      console.log('[App] Auth and user data loaded, preparing app');
      console.log('[App] Session exists:', !!session);
      
      // Small delay to ensure everything is mounted and state is stable
      const timer = setTimeout(() => {
        console.log('[App] ✅ App ready, hiding splash screen');
        setIsReady(true);
        SplashScreen.hideAsync().catch((err) => {
          console.log('[App] Error hiding splash:', err?.message || 'unknown');
        });
      }, 200); // Slightly longer delay for stability

      return () => clearTimeout(timer);
    } else {
      console.log('[App] Waiting for initialization... Auth loading:', isAuthLoading, 'User loading:', isUserLoading);
    }
  }, [isAuthLoading, isUserLoading, session]);
  
  // Timeout safety net - if initialization takes too long, show app anyway
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isReady) {
        console.warn('[App] ⚠️ Initialization timeout - forcing app to show');
        setInitError('Initialization took longer than expected');
        setIsReady(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    }, 10000); // 5 second timeout (reduced from 10s since we optimized loading)
    
    return () => clearTimeout(timeout);
  }, [isReady]);

  useEffect(() => {
    try {
      const authCallbackUrl = Linking.createURL('/auth/callback');
      console.log('[App] Auth Callback URL:', authCallbackUrl);
    } catch (err) {
      console.log('[App] Error creating callback URL:', err);
    }
  }, []);

  if (!isReady) {
    // Keep splash screen visible while initializing
    return (
      <View style={[styles.container, { backgroundColor: colors.light.background }]}>
        {/* Splash screen is still visible */}
      </View>
    );
  }
  
  if (initError && __DEV__) {
    // Show error banner in dev mode
    return (
      <>
        <View style={{ backgroundColor: '#ff9800', padding: 8 }}>
          <Text style={{ color: '#000', fontSize: 12, textAlign: 'center' }}>
            {initError}
          </Text>
        </View>
        {children}
      </>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ErrorBoundary>
            <UserProvider>
              <GestureHandlerRootView style={styles.container}>
                <AppInitializer>
                  <RCPurchasesInit />
                  <RootLayoutNav />
                </AppInitializer>
              </GestureHandlerRootView>
            </UserProvider>
          </ErrorBoundary>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});