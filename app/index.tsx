import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

export default function Index() {
  const auth = useAuth();
  
  // If auth context is not available yet, redirect to login as fallback
  if (!auth) {
    return <Redirect href="/auth/login" />;
  }
  
  const { session, isAuthLoading } = auth;
  
  // Don't show loading screen, just redirect immediately
  if (isAuthLoading) {
    return <Redirect href="/auth/login" />;
  }
  
  // If logged out
  if (!session) return <Redirect href="/auth/login" />;

  // Default: go home (paywall will be shown 10s after base plan generation, not on login)
  return <Redirect href="/home" />;
}