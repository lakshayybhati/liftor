import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, TrendingUp, Dumbbell, Plus } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { getSubscriptionTier, hasActiveSubscription } from '@/utils/subscription-helpers';

export default function HomeScreen() {
  const { user, isLoading, getTodayCheckin, getTodayPlan, getStreak, getRecentCheckins, getNutritionProgress, getCompletedExercisesForDate } = useUserStore();
  const auth = useAuth();
  const { data: profile } = useProfile();
  const [subscriptionBadge, setSubscriptionBadge] = useState<'Trial' | 'Elite' | null>(null);
  const insets = useSafeAreaInsets();

  // Handle case where auth context isn't ready yet
  if (!auth) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.color.accent.primary} />
        </View>
      </View>
    );
  }

  const session = auth?.session ?? null;

  // Always call hooks before any conditional returns
  const todayCheckin = getTodayCheckin();
  const todayPlan = getTodayPlan();
  const streak = getStreak();
  const recentCheckins = getRecentCheckins(7);

  useEffect(() => {
    (async () => {
      try {
        const tier = await getSubscriptionTier();
        setSubscriptionBadge(tier.tier === 'trial' ? 'Trial' : tier.tier === 'elite' ? 'Elite' : null);
      } catch {
        setSubscriptionBadge(null);
      }
    })();
  }, []);

  // Remove paywall enforcement on Home screen
  // Paywall will only appear 10 seconds after base plan generation

  // Compute workout caption from today's plan
  const workoutCaption = useMemo(() => {
    if (!todayPlan?.workout) return 'Check-In';
    
    const focus = todayPlan.workout.focus;
    if (!focus || focus.length === 0) return 'full body';
    
    // Extract muscle groups and simplify
    const muscleGroups = focus
      .join(' ')
      .toLowerCase()
      .replace(/\b(strength|maintenance|mobility|light|full|body)\b/g, '')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 2)
      .join(' & ');
    
    return muscleGroups || 'full body';
  }, [todayPlan]);

  // Get actual nutrition progress from logged foods
  const nutritionProgress = useMemo(() => {
    if (!todayPlan?.nutrition) return 0;
    const progress = getNutritionProgress();
    return progress.calories;
  }, [todayPlan, getNutritionProgress]);

  const handleWorkoutPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    
    if (!todayPlan) {
      router.push('/checkin');
    } else {
      router.push('/plan');
    }
  }, [todayPlan]);

  const handleDietPress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    
    if (!todayPlan?.nutrition) {
      router.push('/checkin');
    } else {
      router.push('/plan?tab=nutrition');
    }
  }, [todayPlan]);

  const handleQuickAddWorkout = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    // Navigate directly to today's workout log (plan screen workout tab)
    if (!todayPlan) {
      router.push('/checkin');
    } else {
      router.push('/plan?tab=workout');
    }
  }, [todayPlan]);

  const handleQuickAddMeal = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    // Go straight to Snap Food to add to diet log
    router.push('/snap-food');
  }, []);

  useEffect(() => {
    if (!isLoading && (user === null || (user && !user.onboardingComplete))) {
      router.replace('/onboarding');
    }
  }, [isLoading, user]);

  if (isLoading || !user || !user.onboardingComplete) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const handleCheckin = () => {
    router.push('/checkin');
  };

  const handleViewPlan = () => {
    if (todayPlan) {
      router.push('/plan');
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const energyTrend = useMemo(() => {
    // More responsive trend: today's value minus average of previous 3-4 check-ins
    // Accept legacy string energies as well
    const values = recentCheckins
      .map(c => (typeof c.energy === 'number' ? c.energy : parseFloat(String(c.energy ?? ''))))
      .filter(v => isFinite(v))
      .slice(0, 7); // most recent first

    if (values.length < 2) return 0;
    const todayVal = values[0];
    const prev = values.slice(1, 5); // up to previous 4 entries
    const avgPrev = prev.reduce((a, b) => a + b, 0) / prev.length;
    return todayVal - avgPrev;
  }, [recentCheckins]);

  // Determine workout completion status for today
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const workoutTotals = useMemo(() => {
    const total = (todayPlan?.workout?.blocks || []).reduce((sum, b: any) => sum + ((b?.items || []).length), 0);
    const completed = getCompletedExercisesForDate(todayStr).length;
    return { total, completed };
  }, [todayPlan, getCompletedExercisesForDate, todayStr]);
  const workoutComplete = workoutTotals.total > 0 && workoutTotals.completed >= workoutTotals.total;
  const workoutCardTitle = workoutComplete ? 'Workout Completed' : 'Start Workout';

  return (
    <View style={[styles.container, { backgroundColor: theme.color.bg }]}>
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.userName} testID="home-greeting-name">{(profile?.name ?? session?.user?.user_metadata?.name ?? user?.name ?? session?.user?.email ?? '—').split(' ')[0]}! 👋</Text>
              {subscriptionBadge && (
                <View style={[styles.badge, subscriptionBadge === 'Elite' ? styles.eliteBadge : styles.trialBadge]}>
                  <Text style={[styles.badgeText, subscriptionBadge === 'Elite' ? styles.eliteText : styles.trialText]}>{subscriptionBadge}</Text>
                </View>
              )}
            </View>
            
            {streak > 0 && (
              <View style={styles.streakBadge}>
                <Text style={styles.streakText}>{streak} day streak! 🔥</Text>
              </View>
            )}
          </View>

          <View style={styles.content}>
            {!todayCheckin ? (
              <Card gradient gradientColors={[theme.color.accent.primary, theme.color.luxe.orchid]} style={styles.checkinCard}>
                <View style={styles.checkinContent}>
                  <Text style={styles.checkinTitle}>Ready for today?</Text>
                  <Text style={styles.checkinSubtitle}>
                    Let&apos;s check in and get your personalized plan
                  </Text>
                  <Button
                    title="Start Check-in"
                    onPress={handleCheckin}
                    variant="secondary"
                    size="large"
                    style={styles.checkinButton}
                  />
                </View>
              </Card>
            ) : !todayPlan ? (
              <Card style={styles.planCard}>
                <View style={styles.planContent}>
                  <Text style={styles.planTitle}>Generating your plan...</Text>
                  <Text style={styles.planSubtitle}>
                    Our AI is crafting the perfect workout and nutrition plan for you
                  </Text>
                  <View style={styles.loadingDots}>
                    <View style={[styles.dot, styles.dot1]} />
                    <View style={[styles.dot, styles.dot2]} />
                    <View style={[styles.dot, styles.dot3]} />
                  </View>
                </View>
              </Card>
            ) : (
              <TouchableOpacity onPress={handleViewPlan}>
                <Card gradient gradientColors={[theme.color.accent.green, theme.color.accent.blue]} style={styles.planCard}>
                  <View style={styles.planContent}>
                    <Text style={styles.planTitle}>Today&apos;s Plan Ready! 🎯</Text>
                    <Text style={styles.planSubtitle}>
                      Tap to view your personalized workout and nutrition
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            )}

            <View style={styles.statsGrid}>
              <Card style={styles.statCard}>
                <View style={styles.statContent}>
                  <Activity color={theme.color.accent.primary} size={24} />
                  <Text style={styles.statValue}>{recentCheckins.length}</Text>
                  <Text style={styles.statLabel}>Check-ins</Text>
                  <Text style={styles.statPeriod}>Last 7 days</Text>
                </View>
              </Card>

              <Card style={styles.statCard}>
                <View style={styles.statContent}>
                  <TrendingUp color={energyTrend >= 0 ? theme.color.accent.green : theme.color.accent.primary} size={24} />
                  <Text style={styles.statValue}>
                    {energyTrend >= 0 ? '+' : ''}{energyTrend.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>Energy</Text>
                  <Text style={styles.statPeriod}>Trend</Text>
                </View>
              </Card>
            </View>

            <View style={styles.quickActionsGrid}>
              {/* Start Workout Card */}
              <TouchableOpacity 
                style={styles.quickActionCard}
                onPress={handleWorkoutPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={`Start Workout ${workoutCaption === 'Check-In' ? 'Check-In required' : workoutCaption}`}
                accessibilityRole="button"
              >
                <Card style={styles.workoutCard}>
                  <TouchableOpacity 
                    style={styles.quickAddChip}
                    onPress={handleQuickAddWorkout}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Quick add workout"
                  >
                    <Plus color={theme.color.ink} size={16} />
                  </TouchableOpacity>
                  
                  <View style={styles.cardContent}>
                    <Dumbbell color={theme.color.ink} size={32} />
                    <Text style={styles.cardTitle}>{workoutCardTitle}</Text>
                    <Text style={styles.cardCaption}>
                      {workoutCaption}
                      {todayPlan?.workout ? ` • ${Math.min(workoutTotals.completed, workoutTotals.total)}/${workoutTotals.total}` : ''}
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>

              {/* Diet Log Card */}
              <TouchableOpacity 
                style={styles.quickActionCard}
                onPress={handleDietPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={`Diet Log ${!todayPlan?.nutrition ? 'Check-In required' : `${Math.round(nutritionProgress * 100)} percent`}`}
                accessibilityRole="button"
              >
                <Card style={styles.dietCard}>
                  <TouchableOpacity 
                    style={styles.quickAddChip}
                    onPress={handleQuickAddMeal}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Quick add meal"
                  >
                    <Plus color={theme.color.ink} size={16} />
                  </TouchableOpacity>
                  
                  <View style={styles.cardContent}>
                    <CircularProgress 
                      progress={todayPlan?.nutrition ? nutritionProgress : 0}
                      size={80}
                      strokeWidth={6}
                      color={theme.color.accent.green}
                      centerText={!todayPlan?.nutrition ? 'Check-In' : undefined}
                      showPercentage={!!todayPlan?.nutrition}
                    />
                    <Text style={styles.cardTitle}>Diet Log</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.space.lg,
  },
  header: {
    marginBottom: theme.space.xxl,
    marginTop: theme.space.sm,
  },
  greeting: {
    fontSize: 18,
    color: theme.color.muted,
    opacity: 0.9,
  },
  userName: {
    fontSize: theme.size.h1,
    fontWeight: '700',
    color: theme.color.ink,
    marginTop: 4,
  },
  streakBadge: {
    backgroundColor: theme.color.accent.primary + '20',
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.pill,
    alignSelf: 'flex-start',
    marginTop: theme.space.sm,
    borderWidth: 1,
    borderColor: theme.color.accent.primary + '40',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  eliteBadge: {
    backgroundColor: '#FFD700',
  },
  trialBadge: {
    backgroundColor: theme.color.accent.blue + '20',
    borderWidth: 1,
    borderColor: theme.color.accent.blue,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  eliteText: {
    color: '#000',
  },
  trialText: {
    color: theme.color.accent.blue,
  },
  streakText: {
    color: theme.color.accent.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    gap: theme.space.lg,
  },
  checkinCard: {
    minHeight: 180,
    borderRadius: 36,
  },
  checkinContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  checkinTitle: {
    fontSize: theme.size.h2,
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
    marginBottom: theme.space.xs,
  },
  checkinSubtitle: {
    fontSize: theme.size.body,
    color: theme.color.ink,
    opacity: 0.9,
    textAlign: 'center',
    marginBottom: theme.space.lg,
  },
  checkinButton: {
    backgroundColor: theme.color.bg,
    minWidth: 200,
    alignSelf: 'center',
  },
  planCard: {
    minHeight: 120,
  },
  planContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  planTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
    marginBottom: theme.space.xs,
  },
  planSubtitle: {
    fontSize: 14,
    color: theme.color.ink,
    opacity: 0.9,
    textAlign: 'center',
  },
  loadingDots: {
    flexDirection: 'row',
    gap: theme.space.xs,
    marginTop: theme.space.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.accent.primary,
  },
  dot1: {
    opacity: 0.4,
  },
  dot2: {
    opacity: 0.7,
  },
  dot3: {
    opacity: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: theme.space.sm,
  },
  statCard: {
    flex: 1,
    minHeight: 100,
  },
  statContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.ink,
    marginTop: theme.space.xs,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.muted,
    marginTop: 4,
  },
  statPeriod: {
    fontSize: theme.size.label,
    color: theme.color.muted,
    opacity: 0.7,
    marginTop: 2,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: theme.space.md,
    marginTop: theme.space.sm,
  },
  quickActionCard: {
    flex: 1,
  },
  workoutCard: {
    backgroundColor: theme.color.card,
    borderColor: theme.color.line,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    height: 180,
    shadowColor: theme.color.bg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  dietCard: {
    backgroundColor: theme.color.card,
    borderColor: theme.color.line,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    height: 180,
    shadowColor: theme.color.bg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  quickAddChip: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.color.bg,
    borderWidth: 1,
    borderColor: theme.color.line,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.md,
    paddingTop: theme.space.xl,
    gap: theme.space.xs,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.ink,
    textAlign: 'center',
    marginTop: theme.space.xs,
  },
  cardCaption: {
    fontSize: 12,
    color: theme.color.muted,
    textAlign: 'center',
    opacity: 0.8,
    marginTop: 2,
  },
});