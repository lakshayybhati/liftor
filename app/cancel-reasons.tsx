import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, TextInput, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { KeyboardDismissView } from '@/components/ui/KeyboardDismissView';
import { Stack, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/colors';
import { openManageSubscription } from '@/utils/subscription-helpers';
import { useAuth } from '@/hooks/useAuth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, MessageCircle } from 'lucide-react-native';

const REASONS = [
  'Too busy right now',
  "I'm not seeing results yet",
  'Content/features not what I expected',
  'Technical issues or bugs',
  "It's too expensive at the moment",
  'Other',
];

export default function CancelReasonsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [additionalFeedback, setAdditionalFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => !!selected && !submitting, [selected, submitting]);

  async function submitAndOpenStore() {
    try {
      setSubmitting(true);
      const reason = selected || 'Other';
      const feedback = additionalFeedback.trim();
      
      // Save to Supabase if available
      try {
        const { supabase, session } = auth!;
        if (session?.user?.id) {
          await supabase.from('cancellation_feedback').insert({ 
            user_id: session.user.id, 
            reason,
            feedback: feedback || null 
          });
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
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <KeyboardDismissView style={{ flex: 1 }}>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          title: 'Before You Go',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700', fontSize: 18 },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 8 }}>
              <ChevronLeft color="#fff" size={24} />
            </TouchableOpacity>
          ),
        }} 
      />
      
      <ScrollView 
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        <View style={styles.headerSection}>
          <MessageCircle color={theme.color.accent.primary} size={32} strokeWidth={2} />
          <Text style={styles.prompt}>What's the main reason you're pausing?</Text>
          <Text style={styles.subtitle}>Your feedback helps us improve</Text>
        </View>

        <View style={styles.reasonsContainer}>
          {REASONS.map((r) => (
            <TouchableOpacity 
              key={r} 
              style={[styles.option, selected === r && styles.optionSelected]} 
              onPress={() => setSelected(r)}
              activeOpacity={0.7}
            >
              <View style={[styles.radioOuter, selected === r && styles.radioOuterSelected]}>
                {selected === r && <View style={styles.radioInner} />}
              </View>
              <Text style={[styles.optionText, selected === r && styles.optionTextSelected]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {selected && (
          <View style={styles.feedbackSection}>
            <Text style={styles.feedbackLabel}>
              Want to share more? (Optional)
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="Tell us what we could do better..."
              placeholderTextColor={theme.color.muted}
              value={additionalFeedback}
              onChangeText={setAdditionalFeedback}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{additionalFeedback.length}/500</Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <Button 
            title={submitting ? 'Opening…' : 'Proceed to Manage'} 
            onPress={submitAndOpenStore} 
            disabled={!canSubmit}
            style={styles.primaryButton}
          />
          
          <TouchableOpacity 
            onPress={() => router.back()} 
            style={styles.keepButton}
          >
            <Text style={styles.keepButtonText}>I'll keep my benefits</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardDismissView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: theme.color.bg,
  },
  content: {
    padding: 20,
    gap: 24,
  },
  headerSection: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  prompt: { 
    color: theme.color.ink, 
    fontSize: 22, 
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 28,
  },
  subtitle: {
    color: theme.color.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  reasonsContainer: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
    gap: 12,
  },
  optionSelected: {
    borderColor: theme.color.accent.primary,
    backgroundColor: theme.color.accent.primary + '08',
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: theme.color.accent.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.color.accent.primary,
  },
  optionText: { 
    color: theme.color.ink, 
    fontSize: 16,
    flex: 1,
  },
  optionTextSelected: { 
    color: theme.color.ink, 
    fontWeight: '600',
  },
  feedbackSection: {
    gap: 8,
    marginTop: 8,
  },
  feedbackLabel: {
    color: theme.color.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: theme.color.card,
    borderWidth: 2,
    borderColor: theme.color.line,
    borderRadius: 16,
    padding: 16,
    color: theme.color.ink,
    fontSize: 15,
    minHeight: 120,
    lineHeight: 22,
  },
  charCount: {
    color: theme.color.muted,
    fontSize: 12,
    textAlign: 'right',
  },
  buttonContainer: {
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    minHeight: 56,
  },
  keepButton: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  keepButtonText: {
    color: theme.color.muted,
    fontSize: 15,
    fontWeight: '600',
  },
});

