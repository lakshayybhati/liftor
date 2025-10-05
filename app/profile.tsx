import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, Image, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { theme } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Save, UserCog, ChevronRight } from 'lucide-react-native';

export default function ProfileScreen() {
  const router = useRouter();
  const { data: profile, isLoading, updateProfile, uploadAvatar, updateAvatarUrl } = useProfile();
  const { session, supabase } = useAuth();
  const insets = useSafeAreaInsets();
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

  const pickImage = useCallback(async () => {
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
      console.error('pick image error', e);
    }
  }, []);

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
        } catch {}
      }
      if (avatar) {
        const publicUrl = await uploadAvatar(avatar);
        await updateAvatarUrl(publicUrl);
      }
      // 2) Email change: require verification; gracefully handle OAuth providers
      if ((session?.user?.email ?? '') !== trimmedEmail) {
        if (provider && provider !== 'email') {
          // For OAuth users, changing email is managed by the identity provider
          setSuccess('Name saved. Email changes for Google/SSO accounts must be done with your provider.');
        } else {
          const { error: emailErr } = await supabase.auth.updateUser({ email: trimmedEmail });
          if (emailErr) throw emailErr;
          setSuccess('Email update requested. Check your inbox to confirm the change.');
        }
      }
      // 3) Password change: ensure confirmation matches and refresh session before updating
      if (newPassword.length >= 8) {
        if (newPassword !== confirmPassword) throw new Error('Passwords do not match');
        try {
          await supabase.auth.refreshSession();
        } catch {}
        const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
        if (pwErr) throw pwErr;
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
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: 'Edit Profile' }} />
      {isLoading ? (
        <Text style={styles.loading}>Loading…</Text>
      ) : (
        <View style={styles.form}>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          {!!success && <Text style={styles.successText}>{success}</Text>}
          <TouchableOpacity style={styles.avatarBtn} onPress={pickImage} testID="pick-avatar">
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Camera color={theme.color.muted} size={20} />
              </View>
            )}
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
            style={styles.preferencesButton}
            onPress={() => router.push('/program-settings')}
            testID="edit-preferences"
          >
            <View style={styles.preferencesLeft}>
              <UserCog color={theme.color.accent.green} size={20} />
              <Text style={styles.preferencesText}>Edit Preferences</Text>
            </View>
            <ChevronRight color={theme.color.muted} size={16} />
          </TouchableOpacity>

          <Button title={saving ? 'Saving…' : 'Save'} onPress={onSave} disabled={!canSave || saving} icon={<Save color="#fff" size={18} />} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg, padding: 16 },
  loading: { color: theme.color.muted },
  form: { gap: 16 },
  errorText: { color: '#e5484d' },
  successText: { color: theme.color.accent.green },
  field: { gap: 8 },
  label: { color: theme.color.muted },
  input: { borderWidth: 1, borderColor: theme.color.line, borderRadius: 12, paddingHorizontal: 14, height: 48, color: theme.color.ink, backgroundColor: theme.color.card },
  avatarBtn: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
});
