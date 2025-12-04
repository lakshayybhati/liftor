import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { KeyboardDismissView } from '@/components/ui/KeyboardDismissView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { theme } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useSessionStatus } from '@/hooks/useSessionStatus';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import { Camera, Image as ImageIcon, Save, UserCog, ChevronRight, ArrowLeft, Lock } from 'lucide-react-native';
import { UserAvatar } from '@/components/UserAvatar';

export default function ProfileScreen() {
  const router = useRouter();
  const { data: profile, isLoading, updateProfile, uploadAvatar, updateAvatarUrl } = useProfile();
  const auth = useAuth();
  const { canEditPreferences: sessionCanEditPreferences, isTrial: sessionIsTrial } = useSessionStatus();
  const insets = useSafeAreaInsets();
  
  // Check profile.subscription_active as fallback for premium features
  // This ensures features work even when edge function isn't deployed
  const profileSubscribed = Boolean(profile?.subscription_active);
  const profileTrial = Boolean(profile?.trial_active);
  const canEditPreferences = sessionCanEditPreferences || profileSubscribed;
  const isTrial = sessionIsTrial || (profileTrial && !profileSubscribed);

  // Handle case where auth context isn't ready yet
  if (!auth) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.color.bg }}>
        <ActivityIndicator size="large" color={theme.color.accent.primary} />
      </View>
    );
  }

  const { session, supabase } = auth;
  // Derive a sensible default display name from profile, auth metadata, or email
  const derivedName = useMemo(() => {
    const metaName = (session?.user?.user_metadata as any)?.name as string | undefined;
    return (profile?.name && profile.name.trim().length > 0)
      ? profile.name
      : (metaName && metaName.trim().length > 0)
        ? metaName
        : (session?.user?.email ?? '');
  }, [profile?.name, session?.user?.email, session?.user?.user_metadata]);

  const [name, setName] = useState<string>(derivedName ?? '');
  const [email, setEmail] = useState<string>(session?.user?.email ?? '');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  // Holds a newly selected image URI for upload. Existing avatar (if any) comes from session metadata.
  const [avatar, setAvatar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);


  useEffect(() => {
    setName(derivedName ?? '');
  }, [derivedName]);

  useEffect(() => {
    setEmail(session?.user?.email ?? '');
  }, [session?.user?.email]);



  const canSave = useMemo(() => {
    const baselineName = (derivedName || '').trim();
    const nameChanged = baselineName !== (name || '').trim() && (name || '').trim().length > 0;
    const emailChanged = (session?.user?.email ?? '') !== (email || '').trim() && (email || '').trim().includes('@');
    const pwValid = newPassword.length >= 8 && newPassword === confirmPassword;
    return nameChanged || emailChanged || pwValid || !!avatar;
  }, [name, email, newPassword, confirmPassword, session?.user?.email, avatar, derivedName]);

  const openCamera = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          alert('Camera permission is required');
          return;
        }
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });
      if (!result.canceled) {
        setAvatar(result.assets[0]?.uri ?? null);
      }
    } catch (e) {
      console.error('camera error', e);
    }
  }, []);

  const openGallery = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          alert('Permission required to select an image');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (!result.canceled) {
        setAvatar(result.assets[0]?.uri ?? null);
      }
    } catch (e) {
      console.error('gallery error', e);
    }
  }, []);

  const pickImage = useCallback(async () => {
    if (Platform.OS === 'web') {
      // Web: gallery only
      await openGallery();
      return;
    }
    Alert.alert(
      'Change Photo',
      'Choose a source',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: openCamera },
        { text: 'Choose from Library', onPress: openGallery },
      ],
      { cancelable: true }
    );
  }, [openCamera, openGallery]);

  const onSave = useCallback(async () => {
    if (!canSave) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const provider = (session?.user?.app_metadata as any)?.provider as string | undefined;
      const trimmedName = (name || '').trim();
      const trimmedEmail = (email || '').trim();

      // 1) Name updates: write to profiles and also mirror to auth metadata for consistency
      if (trimmedName.length > 0 && trimmedName !== (derivedName || '')) {
        await updateProfile({ name: trimmedName });
        try {
          await supabase.auth.updateUser({ data: { name: trimmedName } });
        } catch { }
      }
      if (avatar) {
        const publicUrl = await uploadAvatar(avatar);
        // Immediately reflect uploaded avatar in UI
        setAvatar(publicUrl);
        await updateAvatarUrl(publicUrl);
      }
      // 2) Email change: require in-app OTP verification; gracefully handle OAuth providers
      if ((session?.user?.email ?? '') !== trimmedEmail) {
        if (provider && provider !== 'email') {
          // For OAuth users, changing email is managed by the identity provider
          setSuccess('Name saved. Email changes for Google/SSO accounts must be done with your provider.');
        } else {
          // Send OTP for profile change verification
          const { error: otpErr } = await supabase.auth.signInWithOtp({ email: trimmedEmail, options: { shouldCreateUser: false } });
          if (otpErr) throw otpErr;
          // Navigate to OTP verify screen; after verify with mode=profile we celebrate
          router.replace({ pathname: '/auth/verify-otp', params: { identifier: trimmedEmail, mode: 'profile' } });
          return;
        }
      }
      // 3) Password change: ensure confirmation matches and refresh session before updating
      if (newPassword.length >= 8) {
        if (newPassword !== confirmPassword) throw new Error('Passwords do not match');
        try {
          await supabase.auth.refreshSession();
        } catch { }
        // For password change, require OTP before update to add protection
        const emailForOtp = (session?.user?.email ?? '').trim();
        if (emailForOtp) {
          const { error: otpErr } = await supabase.auth.signInWithOtp({ email: emailForOtp, options: { shouldCreateUser: false } });
          if (otpErr) throw otpErr;
          router.replace({ pathname: '/auth/verify-otp', params: { identifier: emailForOtp, mode: 'reset' } });
          return;
        }
      }
      Alert.alert('Profile updated', 'Your changes have been saved.');
      router.back();
    } catch (e: any) {
      console.error('save profile error', e);
      setError(e?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }, [canSave, name, avatar, email, newPassword, confirmPassword, session?.user?.email, updateProfile, uploadAvatar, updateAvatarUrl, supabase, router, derivedName, session?.user?.app_metadata]);

  return (
    <KeyboardDismissView style={[styles.container, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft color={theme.color.ink} size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>Edit Profile</Text>
        <View style={styles.placeholder} />
      </View>
      {isLoading ? (
        <Text style={styles.loading}>Loading…</Text>
      ) : (
        <View style={styles.form}>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          {!!success && <Text style={styles.successText}>{success}</Text>}



          <TouchableOpacity style={styles.avatarBtn} onPress={pickImage} testID="pick-avatar">
            <UserAvatar uri={avatar} size={48} />
            <Text style={styles.avatarText}>Change Photo</Text>
          </TouchableOpacity>

          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={profile?.name || 'Your name'}
              placeholderTextColor={theme.color.muted}
              testID="profile-name"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.color.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              testID="profile-email"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="••••••••"
              placeholderTextColor={theme.color.muted}
              textContentType="none"
              autoComplete="off"
              autoCorrect={false}
              autoCapitalize="none"
              secureTextEntry
              testID="profile-new-password"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm New Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              placeholderTextColor={theme.color.muted}
              textContentType="none"
              autoComplete="off"
              autoCorrect={false}
              autoCapitalize="none"
              secureTextEntry
              testID="profile-confirm-password"
            />
          </View>

          {/* Edit Preferences Button */}
          <TouchableOpacity
            style={[styles.preferencesButton, !canEditPreferences && styles.lockedButton]}
            onPress={() => {
              if (!canEditPreferences) {
                Alert.alert(
                  'Subscribe to Edit Preferences',
                  'Editing your fitness preferences is available with an active subscription. Subscribe to unlock this feature.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Subscribe', onPress: () => router.push('/paywall') },
                  ]
                );
                return;
              }
              router.push('/program-settings');
            }}
            testID="edit-preferences"
          >
            <View style={styles.preferencesLeft}>
              <UserCog color={canEditPreferences ? theme.color.accent.green : theme.color.muted} size={20} />
              <Text style={[styles.preferencesText, !canEditPreferences && styles.lockedText]}>Edit Preferences</Text>
            </View>
            {canEditPreferences ? (
              <ChevronRight color={theme.color.muted} size={16} />
            ) : (
              <View style={styles.lockBadge}>
                <Lock size={12} color={theme.color.muted} />
                <Text style={styles.lockBadgeText}>Pro</Text>
              </View>
            )}
          </TouchableOpacity>

          <Button title={saving ? 'Saving…' : 'Save'} onPress={onSave} disabled={!canSave || saving} icon={<Save color="#fff" size={18} />} />

          {/* Manage Subscription Entry Point */}
          <TouchableOpacity
            onPress={() => {
              if (isTrial) {
                Alert.alert(
                  'Subscribe First',
                  'You are currently on a free trial. Subscribe to manage your subscription.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Subscribe', onPress: () => router.push('/paywall') },
                  ]
                );
                return;
              }
              router.push('/manage-subscription');
            }}
            accessibilityRole="button"
            style={{ alignSelf: 'center', marginTop: 8 }}
          >
            <Text style={[styles.subscriptionText, isTrial && styles.disabledSubscriptionText]}>
              Subscription
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardDismissView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg, padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
    marginHorizontal: -16,
    marginTop: -16,
  },
  backButton: {
    padding: 6,
  },
  title: {
    fontSize: theme.size.h2,
    fontWeight: '700',
    color: theme.color.ink,
  },
  placeholder: { width: 32 },
  loading: { color: theme.color.muted },
  form: { gap: 16 },
  errorText: { color: '#e5484d' },
  successText: { color: theme.color.accent.green },
  field: { gap: 8 },
  label: { color: theme.color.muted },
  input: { borderWidth: 1, borderColor: theme.color.line, borderRadius: 12, paddingHorizontal: 14, height: 48, color: theme.color.ink, backgroundColor: theme.color.card },
  avatarBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: theme.color.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.color.line },
  avatarText: { color: theme.color.accent.blue, fontWeight: '600' },
  preferencesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: theme.color.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  preferencesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  preferencesText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.color.ink,
  },
  lockedButton: {
    opacity: 0.8,
  },
  lockedText: {
    color: theme.color.muted,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.accent.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  lockBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.color.muted,
    textTransform: 'uppercase',
  },
  subscriptionText: {
    color: theme.color.muted,
    fontSize: 13,
  },
  disabledSubscriptionText: {
    opacity: 0.4,
  },
});
