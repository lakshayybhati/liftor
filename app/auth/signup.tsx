import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Link, Stack, useRouter } from 'expo-router';
import { theme } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { Eye, EyeOff, UserPlus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'react-native';

export default function SignupScreen() {
  const router = useRouter();
  const { signUp, isAuthLoading, googleSignIn } = useAuth();
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirm, setConfirm] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const passwordEval = useMemo(() => {
    const value = password || '';
    const trimmedName = (name || '').trim().toLowerCase();
    const trimmedEmail = (email || '').trim().toLowerCase();
    const emailLocal = trimmedEmail.split('@')[0] || '';

    const hasLower = /[a-z]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSymbol = /[^A-Za-z0-9]/.test(value);
    const lengthScore = value.length >= 12 ? 2 : value.length >= 8 ? 1 : 0;
    const varietyCount = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;

    let score = 0;
    if (value.length >= 6) score = 1;
    if (value.length >= 8 && varietyCount >= 2) score = 2;
    if (value.length >= 10 && varietyCount >= 3) score = 3;
    if (value.length >= 12 && varietyCount === 4) score = 4;

    const containsPersonal = !!value && (
      (trimmedName && value.toLowerCase().includes(trimmedName)) ||
      (emailLocal && value.toLowerCase().includes(emailLocal))
    );
    if (containsPersonal && score > 1) score -= 1;

    const colors = [
      theme.color.accent.primary,
      theme.color.accent.yellow,
      theme.color.accent.yellow,
      theme.color.accent.blue,
      theme.color.accent.green,
    ];
    const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

    const suggestions: string[] = [];
    if (value.length < 8) suggestions.push('Use at least 8 characters');
    if (!hasUpper) suggestions.push('Add an uppercase letter');
    if (!hasLower) suggestions.push('Add a lowercase letter');
    if (!hasNumber) suggestions.push('Add a number');
    if (!hasSymbol) suggestions.push('Add a symbol');
    if (containsPersonal) suggestions.push('Avoid using your name or email');

    const clamped = Math.max(0, Math.min(4, score));
    const activeBars = clamped === 0 && value.length > 0 ? 1 : clamped;

    return {
      score: clamped,
      color: colors[clamped],
      label: labels[clamped],
      suggestions,
      activeBars,
      hasInput: value.length > 0,
    };
  }, [password, name, email]);

  const canSubmit = useMemo(() => {
    return name.trim().length > 0 && email.trim().length > 3 && password.length >= 6 && password === confirm;
  }, [name, email, password, confirm]);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    const res = await signUp(email.trim(), password, name.trim());
    if (!res.success) {
      setError(res.error ?? 'Sign up failed. Try again.');
      return;
    }
    if (res.needsEmailConfirmation) {
      Alert.alert(
        'Confirm your email',
        'We sent a verification link to your email. Please verify to continue.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/auth/login'),
          },
        ],
        { cancelable: false }
      );
      return;
    }
    router.replace('/home');
  }, [canSubmit, email, password, name, signUp, router]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
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
        <Text style={styles.subtitle}>We’ll send a confirmation email</Text>

        {error && <Text style={styles.errorText}>{error}</Text>}

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
        </View>

        {passwordEval.hasInput && (
          <View style={styles.strengthContainer}>
            <View style={styles.strengthBars}>
              {[0, 1, 2, 3].map(i => (
                <View
                  key={i}
                  style={[
                    styles.strengthBar,
                    { backgroundColor: i < passwordEval.activeBars ? passwordEval.color : theme.color.line },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.strengthLabel, { color: passwordEval.color }]} testID="password-strength-label">
              {passwordEval.label}
            </Text>
            {passwordEval.suggestions.length > 0 && (
              <Text style={styles.suggestionText} testID="password-suggestion">
                {passwordEval.suggestions[0]}
              </Text>
            )}
          </View>
        )}

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

        <Button
          title={isAuthLoading ? 'Creating…' : 'Create account'}
          onPress={onSubmit}
          disabled={!canSubmit || isAuthLoading}
          icon={<UserPlus color="#fff" size={18} />}
        />

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
  errorText: { color: '#e5484d', marginBottom: 4 },
  bottomRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  bottomText: { color: theme.color.muted },
  link: { },
  linkText: { color: theme.color.accent.primary, fontWeight: '600' },
  strengthContainer: { marginTop: 8, gap: 6 },
  strengthBars: { flexDirection: 'row', gap: 6 },
  strengthBar: { flex: 1, height: 6, borderRadius: 4, backgroundColor: theme.color.line },
  strengthLabel: { marginTop: 2, fontSize: 12, color: theme.color.muted },
  suggestionText: { marginTop: 2, fontSize: 12, color: theme.color.muted },
  oauthBtn: { marginTop: 12, height: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.color.line, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.card },
  oauthText: { color: theme.color.ink, fontWeight: '600' },
});