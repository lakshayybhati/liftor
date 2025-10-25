import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/colors';
import { openManageSubscription } from '@/utils/subscription-helpers';
import { useAuth } from '@/hooks/useAuth';

const REASONS = [
  'Too busy right now',
  'I’m not seeing results yet',
  'Content/features not what I expected',
  'Technical issues or bugs',
  'It’s too expensive at the moment',
  'Other',
];

export default function CancelReasonsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => !!selected && !submitting, [selected, submitting]);

  async function submitAndOpenStore() {
    try {
      setSubmitting(true);
      const reason = selected || 'Other';
      // Save to Supabase if available
      try {
        const { supabase, session } = auth!;
        if (session?.user?.id) {
          await supabase.from('cancellation_feedback').insert({ user_id: session.user.id, reason });
        }
      } catch (e) {
        console.log('[Cancel] feedback save skipped/failed:', e);
      }

      // Open native subscription management
      await openManageSubscription();
      router.back();
    } catch (e) {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Before You Go' }} />
      <Text style={styles.prompt}>What’s the main reason you’re pausing?</Text>
      <View style={{ gap: 12 }}>
        {REASONS.map((r) => (
          <TouchableOpacity key={r} style={[styles.option, selected === r && styles.optionSelected]} onPress={() => setSelected(r)}>
            <Text style={[styles.optionText, selected === r && styles.optionTextSelected]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ height: 16 }} />
      <Button title={submitting ? 'Opening…' : 'Proceed to Manage'} onPress={submitAndOpenStore} disabled={!canSubmit} />
      <TouchableOpacity onPress={() => router.back()} style={{ alignSelf: 'center', marginTop: 12 }}>
        <Text style={{ color: theme.color.muted }}>I’ll keep my benefits</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg, padding: 16 },
  prompt: { color: theme.color.ink, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  option: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
  },
  optionSelected: {
    borderColor: theme.color.accent.primary,
  },
  optionText: { color: theme.color.ink, fontSize: 16 },
  optionTextSelected: { color: theme.color.accent.primary, fontWeight: '700' },
});
