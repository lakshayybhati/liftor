import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUserStore } from '@/hooks/useUserStore';
import { useSessionStatus } from '@/hooks/useSessionStatus';
import { theme } from '@/constants/colors';

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={theme.color.accent.primary} />
    </View>
  );
}

export default function Index() {
  const { session, isAuthLoading } = useAuth();
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const { user, isLoading: isUserLoading } = useUserStore();
  const { 
    isLoading: isSessionStatusLoading,
    canUseApp,
    isTrial,
    isSubscribed,
    hasHadLocalTrial,
  } = useSessionStatus();

  // Wait for all data to load
  const showLoading = isAuthLoading || isProfileLoading || isUserLoading || (session && isSessionStatusLoading);

  if (showLoading) {
    console.log('[Index] Waiting for auth/profile/user/session state to load...');
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen />
      </>
    );
  }

  // If logged out, go to Login
  if (!session) {
    console.log('[Index] No session, redirecting to login');
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Redirect href="/auth/login" />
      </>
    );
  }

  const onboarded = Boolean(profile?.onboarding_complete) || Boolean(user?.onboardingComplete);
  
  // Use profile.subscription_active as the PRIMARY source of truth for subscription status
  // This is updated by RevenueCat webhook and is always reliable
  const subscriptionActive = Boolean(profile?.subscription_active);
  
  // Also check for active trial from profile (fallback when edge function not deployed)
  const trialActive = Boolean(profile?.trial_active);
  
  // User can use the app if they have subscription OR active trial OR canUseApp from session status
  const hasAccess = subscriptionActive || trialActive || canUseApp;
  
  // Debug logging to help diagnose routing issues
  console.log('[Index] Routing decision:', {
    profileOnboarded: profile?.onboarding_complete,
    localOnboarded: user?.onboardingComplete,
    subscriptionActive,
    trialActive,
    canUseApp,
    hasAccess,
    finalOnboarded: onboarded,
    userId: session.user.id,
    isTrial,
    isSubscribed,
    hasHadLocalTrial,
  });

  // If not onboarded, go to onboarding
  if (!onboarded && !subscriptionActive) {
    console.log('[Index] User not onboarded and no active subscription, redirecting to onboarding');
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Redirect href="/onboarding" />
      </>
    );
  }

  // If onboarded but no access (trial expired or never subscribed), show paywall
  // Use hasAccess which checks profile.subscription_active directly
  if (onboarded && !hasAccess) {
    const trialEnded = hasHadLocalTrial && !isTrial && !isSubscribed;
    console.log('[Index] User onboarded but no access, redirecting to paywall', { trialEnded });
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Redirect href={`/paywall?next=/(tabs)/home&blocking=true&trialEnded=${trialEnded ? 'true' : 'false'}`} />
      </>
    );
  }

  // Authenticated, onboarded, and has access → Home
  console.log('[Index] User authenticated, onboarded, and has access, redirecting to home');
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Redirect href="/(tabs)/home" />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
