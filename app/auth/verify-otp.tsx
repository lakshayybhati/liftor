import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, ScrollView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

export default function VerifyOtpScreen() {
  const params = useLocalSearchParams<{ identifier?: string; mode?: 'login' | 'signup' | 'reset' | 'profile'; name?: string; auto?: string }>();
  const identifier = (params.identifier || '').toString();
  const mode = (params.mode || 'login') as 'login' | 'signup' | 'reset';
  const name = (params.name || '').toString();
  const auto = (params.auto || '') === '1';
  const auth = useAuth();

  // Handle case where auth context isn't ready yet
  if (!auth) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: theme.color.ink }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const { verifyOtp, requestOtp, isAuthLoading } = auth;

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState<number>(0);
  const inputsRef = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  // Optimistic auto-send to reduce perceived latency
  const autoSent = useRef(false);
  useEffect(() => {
    (async () => {
      if (auto && !autoSent.current && identifier) {
        autoSent.current = true;
        const res = await requestOtp({ identifier, method: 'email', mode });
        if (!res.success) {
          setError(res.error ?? 'Failed to send code.');
          if (res.cooldownSeconds) setCooldown(res.cooldownSeconds);
        } else {
          setCooldown(res.cooldownSeconds ?? 60);
        }
      }
    })();
  }, [auto, identifier, mode, requestOtp]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const masked = useMemo(() => {
    if (!identifier.includes('@')) return identifier.replace(/.(?=.{2})/g, '*');
    const [local, domain] = identifier.split('@');
    const maskedLocal = local.length <= 2 ? '*'.repeat(local.length) : local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
    return `${maskedLocal}@${domain}`;
  }, [identifier]);

  const code = useMemo(() => digits.join(''), [digits]);
  const canSubmit = code.length === 6;

  const onBack = useCallback(() => {
    if (mode === 'signup') {
      router.replace({ pathname: '/auth/signup', params: { prefillEmail: identifier, prefillName: name } });
    } else if (mode === 'reset') {
      router.replace('/auth/login');
    } else {
      router.replace('/auth/login');
    }
  }, [mode, identifier, name]);

  const onChangeDigit = useCallback((index: number, val: string) => {
    const only = val.replace(/\D/g, '').slice(-1);
    setDigits(prev => {
      const next = [...prev];
      next[index] = only;
      return next;
    });
    if (only && index < 5) inputsRef.current[index + 1]?.focus();
  }, []);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    const res = await verifyOtp({ identifier, code, method: 'email', mode });
    if (!res.success) {
      setError(res.error ?? 'Invalid code. Try again.');
      return;
    }
    if (mode === 'reset') {
      router.replace('/auth/reset-password');
    } else if (mode === 'signup') {
      router.replace('/');
    } else if (mode === 'profile') {
      router.replace('/');
    } else {
      router.replace('/');
    }
  }, [canSubmit, verifyOtp, identifier, code, mode]);

  const onResend = useCallback(async () => {
    if (cooldown > 0) return;
    const r = await requestOtp({ identifier, method: 'email', mode });
    if (!r.success) {
      setError(r.error ?? 'Failed to resend code.');
      if (r.cooldownSeconds) setCooldown(r.cooldownSeconds);
      return;
    }
    setCooldown(60);
  }, [requestOtp, identifier, mode, cooldown]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View style={styles.container}>
        <Stack.Screen 
          options={{ 
            title: 'Verify Code', 
            headerShown: true, 
            headerBackVisible: false,
            gestureEnabled: false,
            headerStyle: {
              backgroundColor: '#000000',
            },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: {
              color: '#FFFFFF',
              fontWeight: '600',
            },
            headerLeft: () => (
              <TouchableOpacity onPress={onBack} style={{ paddingHorizontal: 8 }} accessibilityRole="button" accessibilityLabel="Back">
                <Text style={{ color: theme.color.accent.primary, fontWeight: '600' }}>Back</Text>
              </TouchableOpacity>
            )
          }} 
        />
        <Text style={styles.title}>Enter the 6‑digit code</Text>
        <Text style={styles.subtitle}>Sent to {masked}</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.otpRow}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(el) => (inputsRef.current[i] = el)}
              style={styles.otpBox}
              keyboardType="number-pad"
              returnKeyType={i === 5 ? 'done' : 'next'}
              blurOnSubmit={false}
              maxLength={1}
              value={d}
              onChangeText={(val) => onChangeDigit(i, val)}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace' && !digits[i] && i > 0) inputsRef.current[i - 1]?.focus();
                if ((nativeEvent.key === 'Enter' || nativeEvent.key === '\n') && i === 5 && canSubmit) {
                  onSubmit();
                }
              }}
              onSubmitEditing={() => {
                if (i === 5) {
                  if (canSubmit) onSubmit();
                } else {
                  inputsRef.current[i + 1]?.focus();
                }
              }}
            />
          ))}
        </View>
        <Button title={isAuthLoading ? 'Verifying…' : 'Verify'} onPress={onSubmit} disabled={!canSubmit || isAuthLoading} />
        <TouchableOpacity onPress={onResend} disabled={cooldown > 0} style={styles.resendBtn}>
          <Text style={[styles.resendText, cooldown > 0 && { opacity: 0.5 }]}>Resend {cooldown > 0 ? `in ${cooldown}s` : ''}</Text>
        </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.bg },
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: theme.color.ink },
  subtitle: { fontSize: 14, color: theme.color.muted },
  error: { color: '#e5484d' },
  otpRow: { flexDirection: 'row', gap: 10, alignSelf: 'center', marginTop: 8, marginBottom: 8 },
  otpBox: { width: 44, height: 52, borderRadius: 10, borderWidth: 1, borderColor: theme.color.line, textAlign: 'center', fontSize: 20, color: theme.color.ink, backgroundColor: theme.color.card },
  resendBtn: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  resendText: { color: theme.color.accent.primary, fontWeight: '600' },
});


