import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, ScrollView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Link, Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { theme } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { Eye, EyeOff, UserPlus, Check, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'react-native';

export default function SignupScreen() {
  const router = useRouter();
  const qp = useLocalSearchParams<{ prefillEmail?: string; prefillName?: string }>();
  const auth = useAuth();
  const [name, setName] = useState<string>((qp.prefillName as string) || '');
  const [email, setEmail] = useState<string>((qp.prefillEmail as string) || '');
  const [password, setPassword] = useState<string>('');
  const [confirm, setConfirm] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const isAuthReady = !!auth;
  const {
    signUp = async () => ({ success: false, error: 'Auth not ready' }),
    isAuthLoading = !isAuthReady,
    googleSignIn = async () => ({ success: false, error: 'Auth not ready' }),
  } = auth ?? {};
  const canSubmit = useMemo(() => name.trim().length > 0 && email.trim().length > 3 && password.length >= 8 && password === confirm, [name, email, password, confirm]);

  // Password rules and strength
  const passwordRules = useMemo(() => {
    const hasMinLength = password.length >= 8;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    return { hasMinLength, hasLower, hasUpper, hasNumber, hasSpecial };
  }, [password]);

  const strengthIndex = useMemo(() => {
    if (!password) return 0; // nothing typed
    const satisfied = Object.values(passwordRules).filter(Boolean).length; // 0..5
    if (satisfied <= 1) return 1; // very weak
    if (satisfied === 2) return 2; // weak
    if (satisfied === 3 || satisfied === 4) return 3; // fair/good
    return 4; // strong (all 5)
  }, [password, passwordRules]);

  const { strengthLabel, strengthColor } = useMemo(() => {
    const labels = ['','Weak','Okay','Good','Strong'] as const;
    const colors = [theme.color.muted, theme.color.accent.primary, theme.color.accent.yellow, theme.color.accent.blue, theme.color.accent.green] as const;
    return { strengthLabel: labels[strengthIndex] ?? '', strengthColor: colors[strengthIndex] ?? theme.color.muted };
  }, [strengthIndex]);

  const onSubmit = useCallback(async () => {
    if (!canSubmit || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    const res = await signUp(email.trim(), password, name.trim());
    if (!res.success) {
      setError(res.error ?? 'Sign up failed. Try again.');
      setIsSubmitting(false);
      return;
    }
    if (res.needsEmailConfirmation) {
      router.replace({ pathname: '/auth/verify-otp', params: { identifier: email.trim(), mode: 'signup', name: name.trim(), auto: '1' } });
      setIsSubmitting(false);
      return;
    }
    router.replace('/');
    setIsSubmitting(false);
  }, [canSubmit, email, password, name, signUp, router, isSubmitting]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View style={styles.container} testID="signup-screen">
        <Stack.Screen options={{ title: 'Create account', headerShown: false }} />
        <Image
          source={require('../../assets/images/liftorlogo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessible
          accessibilityLabel="Liftor logo"
        />
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>We’ll send a confirmation if needed</Text>
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            {error.toLowerCase().includes('already exists') && (
              <TouchableOpacity
                onPress={() => router.replace({ pathname: '/auth/login' })}
                style={styles.errorLinkBtn}
                accessibilityRole="button"
              >
                <Text style={styles.errorLinkText}>Sign in instead</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            testID="signup-name"
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={theme.color.muted}
            value={name}
            onChangeText={setName}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="signup-email"
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
              testID="signup-password"
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
          {/* Strength meter and rules */}
          <View style={styles.strengthContainer} testID="password-strength">
            <View style={styles.strengthBar}>
              {[0,1,2,3].map(i => (
                <View
                  key={`seg-${i}`}
                  style={[
                    styles.strengthSegment,
                    { backgroundColor: i < strengthIndex ? strengthColor : theme.color.line }
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.strengthLabel, { color: strengthIndex === 0 ? theme.color.muted : strengthColor }]}>
              {strengthIndex === 0 ? 'Enter a password' : `Strength: ${strengthLabel}`}
            </Text>
          </View>

          <View style={styles.rulesContainer} testID="password-rules">
            <View style={styles.ruleRow}>
              {passwordRules.hasMinLength ? <Check size={16} color={theme.color.accent.green} /> : <X size={16} color={theme.color.accent.primary} />}
              <Text style={[styles.ruleText, { color: passwordRules.hasMinLength ? theme.color.ink : theme.color.muted }]}>At least 8 characters</Text>
            </View>
            <View style={styles.ruleRow}>
              {passwordRules.hasLower ? <Check size={16} color={theme.color.accent.green} /> : <X size={16} color={theme.color.accent.primary} />}
              <Text style={[styles.ruleText, { color: passwordRules.hasLower ? theme.color.ink : theme.color.muted }]}>One lowercase letter</Text>
            </View>
            <View style={styles.ruleRow}>
              {passwordRules.hasUpper ? <Check size={16} color={theme.color.accent.green} /> : <X size={16} color={theme.color.accent.primary} />}
              <Text style={[styles.ruleText, { color: passwordRules.hasUpper ? theme.color.ink : theme.color.muted }]}>One uppercase letter</Text>
            </View>
            <View style={styles.ruleRow}>
              {passwordRules.hasNumber ? <Check size={16} color={theme.color.accent.green} /> : <X size={16} color={theme.color.accent.primary} />}
              <Text style={[styles.ruleText, { color: passwordRules.hasNumber ? theme.color.ink : theme.color.muted }]}>One number</Text>
            </View>
            <View style={styles.ruleRow}>
              {passwordRules.hasSpecial ? <Check size={16} color={theme.color.accent.green} /> : <X size={16} color={theme.color.accent.primary} />}
              <Text style={[styles.ruleText, { color: passwordRules.hasSpecial ? theme.color.ink : theme.color.muted }]}>One special character</Text>
            </View>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            testID="signup-confirm"
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={theme.color.muted}
            textContentType="none"
            autoComplete="off"
            autoCorrect={false}
            autoCapitalize="none"
            secureTextEntry={!showPassword}
            value={confirm}
            onChangeText={setConfirm}
          />
        </View>

        <Button title={isSubmitting ? 'Creating…' : 'Create account'} onPress={onSubmit} disabled={!canSubmit || isSubmitting} icon={<UserPlus color="#fff" size={18} />} />

        {/* Keep Google sign-up as before */}
        <TouchableOpacity
          onPress={async () => { await googleSignIn(); }}
          style={styles.oauthBtn}
          testID="google-signup"
          accessibilityLabel="Continue with Google"
        >
          <Text style={styles.oauthText}>Continue with Google</Text>
        </TouchableOpacity>
        <View style={styles.bottomRow}>
          <Text style={styles.bottomText}>Have an account?</Text>
          <Link href={{ pathname: '/auth/login' }} testID="go-login" style={styles.link}>
            <Text style={styles.linkText}>Sign in</Text>
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
  logo: { width: 96, height: 96, alignSelf: 'center', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: theme.color.ink },
  subtitle: { fontSize: 14, color: theme.color.muted, marginBottom: 8 },
  field: { gap: 8 },
  label: { color: theme.color.muted },
  input: { borderWidth: 1, borderColor: theme.color.line, borderRadius: 12, paddingHorizontal: 14, height: 48, color: theme.color.ink, backgroundColor: theme.color.card },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1 },
  eyeBtn: { paddingHorizontal: 10, height: 48, justifyContent: 'center' },
  errorContainer: { gap: 8, marginBottom: 4 },
  errorText: { color: '#e5484d' },
  errorLinkBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  errorLinkText: { color: theme.color.accent.primary, fontWeight: '600', textDecorationLine: 'underline' },
  bottomRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  bottomText: { color: theme.color.muted },
  link: { },
  linkText: { color: theme.color.accent.primary, fontWeight: '600' },
  oauthBtn: { marginTop: 12, height: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.color.line, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.card },
  oauthText: { color: theme.color.ink, fontWeight: '600' },
  strengthContainer: { marginTop: 8, gap: 6 },
  strengthBar: { flexDirection: 'row', gap: 6 },
  strengthSegment: { flex: 1, height: 6, borderRadius: 4, backgroundColor: theme.color.line },
  strengthLabel: { fontSize: 12, color: theme.color.muted },
  rulesContainer: { marginTop: 8, gap: 6 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { fontSize: 12 },
});