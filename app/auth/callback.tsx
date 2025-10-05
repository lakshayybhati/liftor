import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { theme } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';

export default function AuthCallbackScreen() {
  const { session, isAuthLoading } = useAuth();

  useEffect(() => {
    if (session && !isAuthLoading) {
      router.replace('/home');
    }
  }, [session, isAuthLoading]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Signing in…', headerShown: false }} />
      <ActivityIndicator color={theme.color.accent.primary} />
      <Text style={styles.text}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.bg },
  text: { marginTop: 12, color: theme.color.ink },
});






