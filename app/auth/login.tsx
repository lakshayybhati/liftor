import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, ScrollView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Link, Stack, useRouter } from 'expo-router';
import { theme } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { Eye, EyeOff, LogIn } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const isAuthReady = !!auth;
  const {
    signIn = async () => ({ success: false, error: 'Auth not ready' }),
    resendConfirmationEmail = async () => ({ success: false, error: 'Auth not ready' }),
    requestOtp = async () => ({ success: false, error: 'Auth not ready' }),
    isAuthLoading = !isAuthReady,
    googleSignIn = async () => ({ success: false, error: 'Auth not ready' }),
  } = auth ?? {};

  const canSubmit = useMemo(() => email.trim().length > 3 && password.length >= 6, [email, password]);

  const onSubmit = useCallback(async () => {
    if (!canSubmit || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    const res = await signIn(email.trim(), password);
    if (!res.success) {
      setError(res.error ?? 'Login failed. Try again.');
      setIsSubmitting(false);
      return;
    }
    router.replace('/home');
    setIsSubmitting(false);
  }, [canSubmit, email, password, signIn, router, isSubmitting]);

  return (
  <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View style={styles.container} testID="login-screen">
        <Stack.Screen options={{ title: 'Login', headerShown: false }} />
        <Image
          source={require('../../assets/images/liftorlogo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessible
          accessibilityLabel="Liftor logo"
        />
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        {!isAuthReady && (
          <View style={{ gap: 8 }}>
            <Text style={styles.loadingText}>Loading authentication…</Text>
          </View>
        )}

        {error && (
          <View style={{ gap: 8 }}>
            <Text style={styles.errorText}>{error}</Text>
            {error?.toLowerCase().includes('email not confirmed') && (
              <TouchableOpacity
                style={styles.resendBtn}
                onPress={async () => {
                  const r = await resendConfirmationEmail(email.trim());
                  // reuse error text area to show confirmation
                  if (!(r.success)) {
                    setError(r.error ?? 'Failed to send email.');
                  } else {
                    setError('Confirmation email sent. Check your inbox.');
                  }
                }}
              >
                <Text style={styles.resendText}>Resend confirmation email</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="login-email"
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={theme.color.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              testID="login-password"
              style={[styles.input, styles.passwordInput]}
              placeholder="••••••••"
              placeholderTextColor={theme.color.muted}
              textContentType="none"
              autoComplete="off"
              autoCorrect={false}
              autoCapitalize="none"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              testID="toggle-password"
              onPress={() => setShowPassword(v => !v)}
              style={styles.eyeBtn}
              accessibilityLabel="Toggle password visibility"
            >
              {showPassword ? <EyeOff color={theme.color.ink} size={20} /> : <Eye color={theme.color.ink} size={20} />}
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={async () => {
            if (email.trim().length < 3) {
              setError('Enter your email first.');
              return;
            }
            setError(null);
            const r = await requestOtp({ identifier: email.trim(), method: 'email', mode: 'reset' });
            if (!r.success) {
              setError(r.error ?? 'Failed to send code.');
              return;
            }
            router.replace({ pathname: '/auth/verify-otp', params: { identifier: email.trim(), mode: 'reset' } });
          }}
          style={styles.forgotBtn}
          accessibilityRole="button"
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <Button
          title={isSubmitting ? 'Signing in…' : 'Sign in'}
          onPress={onSubmit}
          disabled={!canSubmit || isSubmitting}
          icon={<LogIn color="#fff" size={18} />}
        />

        {/* Keep Google sign-in as before */}

        <TouchableOpacity
          onPress={async () => { await googleSignIn(); }}
          style={styles.oauthBtn}
          testID="google-login"
          accessibilityLabel="Sign in with Google"
        >
          <Text style={styles.oauthText}>Continue with Google</Text>
        </TouchableOpacity>

        <View style={styles.bottomRow}>
          <Text style={styles.bottomText}>No account?</Text>
          <Link href={{ pathname: '/auth/signup' }} testID="go-signup" style={styles.link}>
            <Text style={styles.linkText}>Create one</Text>
          </Link>
        </View>
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
  title: { fontSize: 28, fontWeight: '700', color: theme.color.ink },
  subtitle: { fontSize: 14, color: theme.color.muted, marginBottom: 8 },
  logo: { width: 96, height: 96, alignSelf: 'center', marginBottom: 8 },
  field: { gap: 8 },
  label: { color: theme.color.muted },
  input: { borderWidth: 1, borderColor: theme.color.line, borderRadius: 12, paddingHorizontal: 14, height: 48, color: theme.color.ink, backgroundColor: theme.color.card },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1 },
  eyeBtn: { paddingHorizontal: 10, height: 48, justifyContent: 'center' },
  errorText: { color: '#e5484d', marginBottom: 4 },
  forgotBtn: { alignSelf: 'flex-end', marginTop: 6, paddingVertical: 4, paddingHorizontal: 6 },
  forgotText: { color: theme.color.accent.primary, fontWeight: '600' },
  bottomRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  bottomText: { color: theme.color.muted },
  link: { },
  linkText: { color: theme.color.accent.primary, fontWeight: '600' },
  oauthBtn: { marginTop: 12, height: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.color.line, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.card },
  oauthText: { color: theme.color.ink, fontWeight: '600' },
  loadingText: { color: theme.color.muted, textAlign: 'center' },
  resendBtn: { alignSelf: 'center', marginTop: 4 },
  resendText: { color: theme.color.accent.primary, fontWeight: '600', fontSize: 14 },
});