import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';

function LoadingScreen({ message }: { message: string }) {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={theme.color.accent.primary} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

export default function Index() {
  const { session, isAuthLoading } = useAuth();
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const { user, isLoading: isUserLoading } = useUserStore();

  const showLoading = isAuthLoading || isProfileLoading || isUserLoading;
  const loadingMessage = isAuthLoading
    ? 'Checking your session...'
    : 'Loading your personalized plan...';

  if (showLoading) {
    console.log('[Index] Waiting for auth/profile/user state to load...');
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen message={loadingMessage} />
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
  const subscriptionActive = Boolean(profile?.subscription_active);
  
  // Debug logging to help diagnose routing issues
  console.log('[Index] Routing decision:', {
    profileOnboarded: profile?.onboarding_complete,
    localOnboarded: user?.onboardingComplete,
    subscriptionActive,
    finalOnboarded: onboarded,
    userId: session.user.id,
  });

  if (!onboarded && !subscriptionActive) {
    console.log('[Index] User not onboarded and no active subscription, redirecting to onboarding');
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Redirect href="/onboarding" />
      </>
    );
  }

  // Authenticated and onboarded → Home
  console.log('[Index] User authenticated and onboarded, redirecting to home');
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
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 16,
    color: theme.color.ink,
    fontSize: 16,
  },
});