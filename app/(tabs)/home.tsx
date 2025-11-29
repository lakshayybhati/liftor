import React, { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator, Animated, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Activity, TrendingUp, Dumbbell, Plus, ChevronRight, RefreshCw, Flame, Gamepad2 } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { useUserStore, REDO_CHECKIN_LIMIT } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { getSubscriptionTier, hasActiveSubscription } from '@/utils/subscription-helpers';
import { getGameStats, GameStats } from '@/utils/game-storage';
import { isGenerationInProgress } from '@/services/plan-generation';
import { getBasePlanJobState, BasePlanStatus, validatePendingJobState, isBackgroundGenerationInProgress } from '@/services/backgroundPlanGeneration';

export default function HomeScreen() {
  const { user, isLoading, getTodayCheckin, getTodayPlan, getStreak, getRecentCheckins, getNutritionProgress, getCompletedExercisesForDate, getCurrentBasePlan, basePlans, getCheckinCountForDate } = useUserStore();
  const auth = useAuth();
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const [subscriptionBadge, setSubscriptionBadge] = useState<'Trial' | 'Elite' | null>(null);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      if (user?.id) {
        getGameStats(user.id).then(stats => {
          if (isActive) setGameStats(stats);
        });
      }
      return () => { isActive = false; };
    }, [user?.id])
  );

  // Never early-return before all hooks are called; treat missing auth as loading in UI
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

  // Determine onboarding and subscription status using both local store and backend profile
  const onboardingCompleteFlag = Boolean(user?.onboardingComplete) || Boolean(profile?.onboarding_complete);
  const subscriptionActive = Boolean(profile?.subscription_active);

  // Check if user has a base plan
  const hasBasePlan = useMemo(() => {
    const currentPlan = getCurrentBasePlan();
    return !!currentPlan && basePlans.length > 0;
  }, [getCurrentBasePlan, basePlans]);

  useEffect(() => {
    // Wait for both local store and profile to hydrate before deciding
    if (isLoading || isProfileLoading) {
      console.log('[Home] Still loading data...');
      return;
    }

    console.log('[Home] Onboarding check:', {
      localOnboarded: user?.onboardingComplete,
      profileOnboarded: profile?.onboarding_complete,
      finalOnboarded: onboardingCompleteFlag,
      subscriptionActive,
      hasBasePlan,
      basePlansCount: basePlans.length,
    });

    // First check: if not onboarded, go to onboarding
    if (!onboardingCompleteFlag && !subscriptionActive) {
      console.log('[Home] User not onboarded, redirecting to onboarding');
      router.replace('/onboarding');
      return;
    }

    // Check background job state for plan verification flow
    const checkJobState = async () => {
      const userId = auth?.session?.user?.id ?? null;
      const jobState = await getBasePlanJobState(userId);
      
      console.log('[Home] Background job state:', {
        status: jobState.status,
        verified: jobState.verified,
        hasBasePlan,
        isGenerationRunning: isBackgroundGenerationInProgress(),
      });
      
      // If plan is ready but not verified, show plan preview first
      if (jobState.status === 'ready' && !jobState.verified && hasBasePlan) {
        console.log('[Home] Plan ready but not verified - redirecting to plan preview');
        router.replace('/plan-preview');
        return true;
      }
      
      // If plan is pending, VALIDATE that generation is actually running
      // This prevents being stuck on plan-building screen due to stale state
      if (jobState.status === 'pending' && onboardingCompleteFlag) {
        const isPendingValid = await validatePendingJobState(userId);
        
        if (isPendingValid) {
          console.log('[Home] Plan generation pending AND valid - redirecting to plan building');
          router.replace('/plan-building');
          return true;
        } else {
          console.log('[Home] Pending state was invalid/stale - staying on home');
          // The validatePendingJobState function already reset the state
          // User can now proceed normally
          return false;
        }
      }
      
      return false;
    };
    
    // Run the async check
    checkJobState().then(redirected => {
      if (redirected) return;
      
      // Second check: if onboarded but no base plan, redirect to onboarding
      // to let them start fresh (the old plan-building state might be corrupted)
      // BUT: Don't redirect if generation is already in progress (prevents duplicate calls)
      if (onboardingCompleteFlag && !hasBasePlan) {
        if (isGenerationInProgress() || isBackgroundGenerationInProgress()) {
          console.log('[Home] User has no base plan, but generation is already in progress - redirecting to plan building');
          router.replace('/plan-building');
          return;
        }
        // No base plan and no generation running - something went wrong
        // Redirect to onboarding to start fresh
        console.log('[Home] User has no base plan and no generation running - redirecting to onboarding');
        router.replace('/onboarding');
        return;
      }
    });
  }, [isLoading, isProfileLoading, onboardingCompleteFlag, subscriptionActive, hasBasePlan, basePlans.length, auth?.session?.user?.id]);

  // Delayed paywall gate after Home is opened (5s), run only once per session in the background
  const paywallCheckedRef = useRef(false);
  const paywallCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animation for the check-in button
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonScale, {
          toValue: 1.05,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(buttonScale, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    breathe.start();
    return () => breathe.stop();
  }, []);

  useEffect(() => {
    // Wait until auth/profile are done hydrating and we have a user
    if (isLoading || isProfileLoading || !auth?.session?.user?.id) {
      return;
    }

    // Ensure we only schedule the paywall check once per Home mount/session
    if (paywallCheckedRef.current) {
      return;
    }
    paywallCheckedRef.current = true;

    // Schedule background entitlement check; UI stays responsive
    paywallCheckTimerRef.current = setTimeout(async () => {
      try {
        const entitled = await hasActiveSubscription();
        if (!entitled) {
          router.replace({
            pathname: '/paywall',
            params: { next: '/(tabs)/home', blocking: 'true' } as any,
          });
        }
      } catch {
        // On error, fail open to avoid interrupting the session unnecessarily
      }
    }, 5000);

    return () => {
      if (paywallCheckTimerRef.current) {
        try {
          clearTimeout(paywallCheckTimerRef.current);
        } catch { }
        paywallCheckTimerRef.current = null;
      }
    };
  }, [isLoading, isProfileLoading, auth?.session?.user?.id]);

  // Flags for UI states; do not early-return to keep hook order consistent
  const isHydrating = isLoading || isProfileLoading || !auth;
  const shouldHoldForOnboardingRedirect = !isHydrating && !onboardingCompleteFlag && !subscriptionActive;
  // Also hold if user is onboarded but has no base plan (will redirect to generate)
  const shouldHoldForBasePlanRedirect = !isHydrating && onboardingCompleteFlag && !hasBasePlan;

  const handleCheckin = () => {
    router.push('/checkin');
  };

  const handleResetCheckin = useCallback(() => {
    const todayKey = new Date().toISOString().split('T')[0];
    const redoCountToday = getCheckinCountForDate(todayKey);
    if (redoCountToday >= REDO_CHECKIN_LIMIT) {
      Alert.alert(
        'Re-do limit reached',
        "You've hit your re-do check-ins for the day. Note: The mini-game is only available on your first check-in. Try again tomorrow!",
        [{ text: 'OK' }]
      );
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({ pathname: '/checkin', params: { isRedo: 'true' } });
  }, [getCheckinCountForDate]);

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

  const today = new Date().toISOString().split('T')[0];
  const playedToday = gameStats?.todayDate === today && gameStats?.todayScore !== null;
  const highScore = gameStats?.highScore || 0;
  const todaysScore = playedToday ? gameStats?.todayScore ?? 0 : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.color.bg }]}>
      {/* Background Glow */}
      <LinearGradient
        colors={[theme.color.accent.primary + '15', 'transparent']}
        style={styles.backgroundGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />

      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        {isHydrating || shouldHoldForOnboardingRedirect || shouldHoldForBasePlanRedirect ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.color.accent.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={true}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.header}>
              <View>
                <Text style={styles.greeting}>{getGreeting()},</Text>
                <View style={styles.nameContainer}>
                  <Text style={styles.userName} testID="home-greeting-name">
                    {(() => {
                      const displayName = (profile?.name ?? session?.user?.user_metadata?.name ?? user?.name ?? session?.user?.email ?? '—').split(' ')[0];
                      return displayName;
                    })()}
                  </Text>
                  {subscriptionBadge && (
                    <View style={[styles.badge, subscriptionBadge === 'Elite' ? styles.eliteBadge : styles.trialBadge]}>
                      <Text style={[styles.badgeText, subscriptionBadge === 'Elite' ? styles.eliteText : styles.trialText]}>{subscriptionBadge}</Text>
                    </View>
                  )}
                </View>
              </View>

              {streak > 0 && (
                <View style={[styles.streakBadge, {
                  backgroundColor: `rgba(255, 68, 68, ${0.1 + (Math.min(streak, 21) / 21) * 0.6})`,
                  borderColor: `rgba(255, 68, 68, ${0.2 + (Math.min(streak, 21) / 21) * 0.8})`
                }]}>
                  <Text style={styles.streakIcon}>🔥</Text>
                  <Text style={styles.streakText}>{streak} Day Streak</Text>
                </View>
              )}
            </View>

            <View style={styles.content}>
              {!todayCheckin ? (
                <Card gradient gradientColors={['#FF416C', '#FF4B2B']} style={styles.heroCard}>
                  <View style={styles.heroContent}>
                    {/* Title row with emoji */}
                    <View style={styles.heroTitleRow}>
                      <View style={styles.heroIconBadge}>
                        <Text style={styles.heroIconEmoji}>💪</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.heroTitle}>Ready to crush it?</Text>
                        {highScore > 0 && (
                          <Text style={styles.scoreText}>Score to beat: {highScore}</Text>
                        )}
                      </View>
                    </View>

                    <Text style={styles.heroSubtitle}>
                      Let's check in to generate your personalized plan for today.
                    </Text>

                    <Animated.View style={{ transform: [{ scale: buttonScale }], alignSelf: 'stretch', marginTop: 20 }}>
                      <TouchableOpacity
                        onPress={handleCheckin}
                        style={styles.heroButtonNew}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.heroButtonTextNew}>Start Check-in</Text>
                        <View style={styles.heroButtonArrow}>
                          <ChevronRight color="#FF416C" size={20} strokeWidth={3} />
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  </View>
                </Card>
              ) : !todayPlan ? (
                <Card style={styles.heroCard}>
                  <View style={styles.heroContent}>
                    <View style={styles.planStatusHeader}>
                      <Text style={[styles.heroTitle, { flex: 1 }]}>Crafting your plan...</Text>
                      <TouchableOpacity
                        onPress={handleResetCheckin}
                        style={styles.resetButton}
                        activeOpacity={0.85}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <RefreshCw color="#FFFFFF" size={16} strokeWidth={2.5} />
                        <Text style={styles.resetButtonText}>Redo check-in</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.heroSubtitle}>
                      Analyzing your recovery and goals to build the perfect routine.
                    </Text>
                    <View style={styles.loadingDots}>
                      <View style={[styles.dot, styles.dot1]} />
                      <View style={[styles.dot, styles.dot2]} />
                      <View style={[styles.dot, styles.dot3]} />
                    </View>
                  </View>
                </Card>
              ) : (
                <TouchableOpacity onPress={handleViewPlan} activeOpacity={0.95}>
                  <Card gradient gradientColors={['#4facfe', '#00f2fe']} style={styles.heroCard}>
                    <View style={styles.heroContent}>
                      <View style={styles.heroHeader}>
                        <View style={{ flex: 1, paddingRight: 16 }}>
                          <Text style={styles.heroTitle}>Today's Plan Ready</Text>
                        </View>
                        <View style={styles.heroIconContainer}>
                          <ChevronRight color="#fff" size={20} />
                        </View>
                      </View>
                      <Text style={styles.heroSubtitle}>
                        Your personalized roadmap is ready.
                      </Text>

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 20, gap: 10 }}>
                        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                            <Dumbbell color="#fff" size={16} fill="rgba(255,255,255,0.2)" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{workoutTotals.total} Exercises</Text>
                            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '500', textTransform: 'capitalize' }} numberOfLines={1}>{workoutCaption}</Text>
                          </View>
                        </View>

                        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                            <Flame color="#fff" size={16} fill="rgba(255,255,255,0.2)" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{todayPlan?.nutrition?.total_kcal || 0} kcal</Text>
                            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '500' }}>{todayPlan?.nutrition?.protein_g || 0}g protein</Text>
                          </View>
                        </View>

                        {todaysScore !== null && (
                          <View style={{ flex: 1, minWidth: 140, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                              <Gamepad2 color="#fff" size={16} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Today's Score</Text>
                              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '500' }}>{todaysScore}</Text>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              )}

              <View style={styles.statsRow}>
                <Card style={styles.statCard}>
                  <View style={styles.statContent}>
                    <View style={[styles.statIcon, { backgroundColor: theme.color.accent.primary + '20' }]}>
                      <Activity color={theme.color.accent.primary} size={22} />
                    </View>
                    <View>
                      <Text style={styles.statValue}>{recentCheckins.length}</Text>
                      <Text style={styles.statLabel}>Check-ins</Text>
                    </View>
                  </View>
                </Card>

                <Card style={styles.statCard}>
                  <View style={styles.statContent}>
                    <View style={[styles.statIcon, { backgroundColor: (energyTrend >= 0 ? theme.color.accent.green : theme.color.accent.primary) + '20' }]}>
                      <TrendingUp color={energyTrend >= 0 ? theme.color.accent.green : theme.color.accent.primary} size={22} />
                    </View>
                    <View>
                      <Text style={styles.statValue}>
                        {energyTrend >= 0 ? '+' : ''}{energyTrend.toFixed(1)}
                      </Text>
                      <Text style={styles.statLabel}>Energy</Text>
                    </View>
                  </View>
                </Card>
              </View>

              <View style={styles.actionsGrid}>
                {/* Start Workout Card */}
                <TouchableOpacity
                  style={styles.actionCardContainer}
                  onPress={handleWorkoutPress}
                  activeOpacity={0.85}
                >
                  <Card style={styles.actionCard}>
                    <View style={styles.actionHeader}>
                      <View style={[styles.actionIcon, { backgroundColor: theme.color.accent.blue + '20' }]}>
                        <Dumbbell color={theme.color.accent.blue} size={28} />
                      </View>
                      <TouchableOpacity
                        style={styles.quickAddButton}
                        onPress={handleQuickAddWorkout}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                      >
                        <Plus color={theme.color.ink} size={18} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.actionBody}>
                      <Text style={styles.actionTitle}>{workoutCardTitle}</Text>
                      <Text style={styles.actionCaption} numberOfLines={1}>
                        {workoutCaption}
                        {todayPlan?.workout ? ` • ${Math.min(workoutTotals.completed, workoutTotals.total)}/${workoutTotals.total}` : ''}
                      </Text>
                    </View>
                  </Card>
                </TouchableOpacity>

                {/* Diet Log Card */}
                <TouchableOpacity
                  style={styles.actionCardContainer}
                  onPress={handleDietPress}
                  activeOpacity={0.85}
                >
                  <Card style={styles.actionCard}>
                    <View style={styles.actionHeader}>
                      <View style={styles.progressContainer}>
                        <CircularProgress
                          progress={todayPlan?.nutrition ? nutritionProgress : 0}
                          size={48}
                          strokeWidth={5}
                          color={theme.color.accent.green}
                          showPercentage={false}
                        />
                      </View>
                      <TouchableOpacity
                        style={styles.quickAddButton}
                        onPress={handleQuickAddMeal}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                      >
                        <Plus color={theme.color.ink} size={18} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.actionBody}>
                      <Text style={styles.actionTitle}>Diet Log</Text>
                      <Text style={styles.actionCaption}>
                        {!todayPlan?.nutrition ? 'Check-In required' : `${Math.round(nutritionProgress * 100)}% daily goal`}
                      </Text>
                    </View>
                  </Card>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 400,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.space.xl,
    marginTop: theme.space.sm,
  },
  greeting: {
    fontSize: 14,
    color: theme.color.muted,
    marginBottom: 4,
    fontFamily: theme.font.ui,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 38,
    fontWeight: '800',
    color: theme.color.ink,
    fontFamily: theme.font.display,
    letterSpacing: -1,
    lineHeight: 44,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.15)', // theme.color.accent.primary with opacity
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
    gap: 6,
    marginTop: 4,
  },
  streakIcon: {
    fontSize: 14,
  },
  streakText: {
    color: theme.color.ink,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: theme.font.ui,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
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
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  eliteText: {
    color: '#000',
  },
  trialText: {
    color: theme.color.accent.blue,
  },
  content: {
    flex: 1,
    gap: theme.space.lg,
  },
  heroCard: {
    minHeight: 220,
    borderRadius: 28,
    padding: 0,
    overflow: 'hidden',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  heroContent: {
    padding: 24,
    paddingTop: 28,
    paddingBottom: 28,
    justifyContent: 'flex-start',
    flex: 1,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space.sm,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    fontFamily: theme.font.display,
    letterSpacing: -0.5,
    flex: 1,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 24,
    fontFamily: theme.font.ui,
    fontWeight: '400',
  },
  planStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: theme.space.xs,
    gap: 12,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  heroIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroButton: {
    marginTop: theme.space.lg,
    backgroundColor: '#000',
    alignSelf: 'flex-start',
    paddingHorizontal: 32,
    height: 52,
    borderRadius: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  heroButtonText: {
    color: '#FF416C',
    fontWeight: '700',
    fontSize: 16,
    fontFamily: theme.font.display,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  heroIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconEmoji: {
    fontSize: 22,
  },
  heroButtonNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  heroButtonTextNew: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    fontFamily: theme.font.display,
    letterSpacing: 0.3,
  },
  heroButtonArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: theme.space.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.7 },
  dot3: { opacity: 1.0 },

  statsRow: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
  statCard: {
    flex: 1,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.03)', // Very subtle background
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.color.ink,
    fontFamily: theme.font.display,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 13,
    color: theme.color.muted,
    marginTop: 2,
    fontFamily: theme.font.ui,
    fontWeight: '500',
  },

  actionsGrid: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
  actionCardContainer: {
    flex: 1,
  },
  actionCard: {
    height: 180,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'space-between',
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    // Container for circular progress if needed
  },
  quickAddButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBody: {
    gap: 6,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.ink,
    fontFamily: theme.font.display,
  },
  actionCaption: {
    fontSize: 13,
    color: theme.color.muted,
    fontFamily: theme.font.ui,
    fontWeight: '500',
  },
  scoreText: {
    fontSize: 19,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '900',
    marginTop: 19,
  },
});