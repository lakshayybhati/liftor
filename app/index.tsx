import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUserStore } from '@/hooks/useUserStore';

export default function Index() {
  const { session, isAuthLoading } = useAuth();
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const { user, isLoading: isUserLoading } = useUserStore();

  // While auth state is loading, render nothing to avoid redirect loops
  if (isAuthLoading) {
    console.log('[Index] Auth loading...');
    return null;
  }

  // If logged out, go to Login
  if (!session) {
    console.log('[Index] No session, redirecting to login');
    return <Redirect href="/auth/login" />;
  }

  // New users → Onboarding (wait for both profile and local user to hydrate first)
  if (isProfileLoading || isUserLoading) {
    console.log('[Index] Loading profile or user data...');
    return null;
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
    return <Redirect href="/onboarding" />;
  }

  // Authenticated and onboarded → Home
  console.log('[Index] User authenticated and onboarded, redirecting to home');
  return <Redirect href="/(tabs)/home" />;
}