import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { theme } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { getSubscriptionTier, getSubscriptionStatusText, openManageSubscription } from '@/utils/subscription-helpers';

export default function ManageSubscriptionScreen() {
  const router = useRouter();
  const [statusText, setStatusText] = useState<string>('');
  const [tierLabel, setTierLabel] = useState<string>('');

  useEffect(() => {
    (async () => {
      const tier = await getSubscriptionTier();
      const text = await getSubscriptionStatusText();
      setTierLabel(tier.label);
      setStatusText(text);
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={styles.avatarCircle} />
            <View>
              <Text style={styles.hiText}>Hi, Athlete</Text>
              <Text style={styles.subLabel}>You're a {tierLabel || 'Premium'} Member</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Included in your subscription</Text>
        <View style={styles.benefits}>
          <Benefit title="Advanced Insights" desc="Understand your body and train smarter with data-driven guidance." />
          <Benefit title="Proven Programs" desc="Follow expert-designed training plans tailored for real results." />
          <Benefit title="Smart Tracking" desc="AI-powered suggestions, auto warm-ups, and precise weight calculations." />
          <Benefit title="Personal Records" desc="Set goals, track progress, and view your top achievements." />
        </View>

        <Button title="Manage Subscription" onPress={() => router.push('/cancel-retention')} />

        <TouchableOpacity onPress={() => openManageSubscription()} style={{ alignSelf: 'center', marginTop: 16 }}>
          <Text style={{ color: theme.color.muted }}>{statusText || 'View store subscription'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Benefit({ title, desc }: { title: string; desc: string }) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.iconDot} />
      <View style={{ flex: 1 }}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  content: { padding: 16, gap: 16 },
  headerCard: {
    backgroundColor: theme.color.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  hiText: { fontSize: 24, fontWeight: '800', color: theme.color.ink },
  subLabel: { color: theme.color.muted, marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: theme.color.ink, marginTop: 8 },
  benefits: { gap: 16 },
  benefitRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  benefitTitle: { color: theme.color.ink, fontWeight: '700', fontSize: 16 },
  benefitDesc: { color: theme.color.muted },
  iconDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.accent.primary, opacity: 0.15 },
  avatarCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.color.line },
});
