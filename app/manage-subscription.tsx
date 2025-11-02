import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { getSubscriptionTier, getSubscriptionStatusText, openManageSubscription } from '@/utils/subscription-helpers';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { TrendingUp, Clipboard, Sparkles, Trophy, ChevronLeft, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ManageSubscriptionScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { data: profile } = useProfile();
  const insets = useSafeAreaInsets();
  const [statusText, setStatusText] = useState<string>('');
  const [tierLabel, setTierLabel] = useState<string>('Premium');

  const userName = profile?.name?.split(' ')[0] || auth?.session?.user?.user_metadata?.name?.split(' ')[0] || 'Athlete';

  useEffect(() => {
    (async () => {
      const tier = await getSubscriptionTier();
      const text = await getSubscriptionStatusText();
      setTierLabel(tier.label === 'Elite' ? 'Elite' : tier.label === 'Trial' ? 'Trial' : 'Premium');
      setStatusText(text);
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Gradient Header */}
      <LinearGradient
        colors={['#0c0c0e', '#CE0200', '#EF4444']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradientHeader, { paddingTop: insets.top + 16 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color="#fff" size={28} />
        </TouchableOpacity>
        
        <View style={styles.avatarContainer}>
          <View style={styles.avatarCircle}>
            <User color="#9CA3AF" size={40} />
          </View>
        </View>
        
        <Text style={styles.hiText}>Hi, {userName}</Text>
        <Text style={styles.subLabel}>You're a {tierLabel} Member</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardDismissMode="on-drag">
        <Text style={styles.sectionTitle}>Included in your subscription</Text>
        
        <View style={styles.benefits}>
          <Benefit 
            icon={<TrendingUp color={theme.color.accent.blue} size={24} />}
            title="Advanced Insights" 
            desc="Understand your body and train smarter with data-driven guidance." 
          />
          <Benefit 
            icon={<Clipboard color={theme.color.accent.green} size={24} />}
            title="Proven Programs" 
            desc="Follow expert-designed training plans tailored for real results." 
          />
          <Benefit 
            icon={<Sparkles color={theme.color.accent.yellow} size={24} />}
            title="Smart Tracking" 
            desc="AI-powered suggestions, auto warm-ups, and precise weight calculations." 
          />
          <Benefit 
            icon={<Trophy color={theme.color.accent.primary} size={24} />}
            title="Personal Records" 
            desc="Set goals, track progress, and view your top achievements." 
          />
        </View>

        <View style={{ marginTop: 24 }}>
          <Button 
            title="Manage Your Subscription" 
            onPress={() => router.push('/cancel-retention')} 
            variant="secondary"
          />
        </View>



        {statusText && statusText !== 'No active subscription' && (
          <Text style={styles.statusText}>{statusText}</Text>
        )}
      </ScrollView>
    </View>
  );
}

function Benefit({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.iconCircle}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.benefitDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: theme.color.bg 
  },
  gradientHeader: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: 48,
    zIndex: 10,
    padding: 8,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatarCircle: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  hiText: { 
    fontSize: 28, 
    fontWeight: '800', 
    color: '#fff',
    marginTop: 4,
  },
  subLabel: { 
    color: 'rgba(255,255,255,0.9)', 
    marginTop: 4,
    fontSize: 16,
  },
  content: { 
    padding: 20,
    paddingTop: 24,
  },
  sectionTitle: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: theme.color.ink, 
    marginBottom: 20,
  },
  benefits: { 
    gap: 20,
  },
  benefitRow: { 
    flexDirection: 'row', 
    gap: 16, 
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.color.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  benefitTitle: { 
    color: theme.color.ink, 
    fontWeight: '700', 
    fontSize: 17,
    marginBottom: 4,
  },
  benefitDesc: { 
    color: theme.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  manageLinkContainer: {
    alignSelf: 'center',
    marginTop: 24,
    paddingVertical: 12,
  },
  manageLink: {
    color: theme.color.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  statusText: {
    color: theme.color.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
});

