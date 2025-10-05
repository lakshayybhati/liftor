import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

export default function Index() {
  const { session, isAuthLoading } = useAuth();
  if (isAuthLoading) return null;
  return <Redirect href={session ? '/home' : '/auth/login'} />;
}