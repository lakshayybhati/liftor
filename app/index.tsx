import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { hasActiveSubscription } from '@/utils/subscription-helpers';
import { useAuth } from '@/hooks/useAuth';

export default function Index() {
  const auth = useAuth();
  const [entitled, setEntitled] = useState<boolean | null>(null);
  
  // If auth context is not available yet, redirect to login as fallback
  if (!auth) {
    return <Redirect href="/auth/login" />;
  }
  
  const { session, isAuthLoading } = auth;

  // Check entitlement on launch and redirect to paywall if needed
  useEffect(() => {
    (async () => {
      try {
        const ok = await hasActiveSubscription();
        setEntitled(ok);
      } catch {
        setEntitled(false);
      }
    })();
  }, []);
  
  // Don't show loading screen, just redirect immediately
  if (isAuthLoading) {
    return <Redirect href="/auth/login" />;
  }
  
  // If logged out
  if (!session) return <Redirect href="/auth/login" />;

  // If logged in but not entitled → send to paywall
  if (entitled === false) return <Redirect href="/paywall" />;

  // Default: go home
  return <Redirect href="/home" />;
}