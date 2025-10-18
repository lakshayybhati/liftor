import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';

export default function ResetPasswordScreen() {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle case where auth context isn't ready yet
  if (!auth) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: theme.color.ink }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const { supabase } = auth;
  const canSubmit = password.length >= 6 && password === confirm;

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: updErr } = await supabase.auth.updateUser({
        password,
      });
      if (updErr) {
        setError(updErr.message || 'Failed to update password.');
        return;
      }
      Alert.alert('Success', 'Your password has been updated.', [
        { text: 'OK', onPress: () => { router.replace('/home'); } }
      ]);
    } catch (e: any) {
      setError(e?.message || 'Unexpected error updating password.');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, password, supabase]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Set New Password', headerShown: true }} />
      <View style={styles.container}>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>Enter and confirm your new password to complete the reset.</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.field}>
          <Text style={styles.label}>New password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={theme.color.muted}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={theme.color.muted}
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Button
          title={submitting ? 'Saving…' : 'Save password'}
          onPress={onSubmit}
          disabled={!canSubmit || submitting}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.bg },
  container: { flex: 1, padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '700', color: theme.color.ink },
  subtitle: { fontSize: 14, color: theme.color.muted },
  field: { gap: 8 },
  label: { color: theme.color.muted },
  input: { borderWidth: 1, borderColor: theme.color.line, borderRadius: 12, paddingHorizontal: 14, height: 48, color: theme.color.ink, backgroundColor: theme.color.card },
  error: { color: '#e5484d' },
});


