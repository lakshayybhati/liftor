import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated, Alert, BackHandler } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserStore } from '@/hooks/useUserStore';
import type { DailyPlan } from '@/types/user';
import { generateDailyPlan } from '@/services/plan-generation';
import { logPlanGenerationAttempt } from '@/utils/plan-generation-diagnostics';
import { getProductionConfig } from '@/utils/production-config';
import PlanLoadingMiniGameOverlay from '@/components/PlanLoadingMiniGameOverlay';
import { canPlayGame, markGamePlayedToday, saveGameScore } from '@/utils/game-storage';

const LOADING_MESSAGES = [
  "📚 Gathering research specific to your goals and preferences…",
  "🔎 Reviewing your recent check-ins and training history…",
  "🧭 Cross‑checking trusted sources for training, nutrition, and recovery…",
  "🛠️ Customizing recommendations to match your equipment and routine…",
  "✅ Finalizing today’s plan with precise adjustments…",
];

// const SLOW_PROMPTS = [
//   'Your data’s one of a kind we’re tailoring this plan just right',
//   'This one’s special. Give us a moment to fine-tune everything',
//   'Your plan’s being crafted with extra care. give us a moment',
//   'this isn’t just any plan… it’s yours. Hold tight',
//   'We’re refining every detail to make this match you perfectly',
//   'Unique input calls for a custom touch just a few seconds more',
// ];

export default function GeneratingPlanScreen() {
  // Support forced regeneration via params
  const params = useLocalSearchParams<{ force?: string; isRedo?: string }>();
  const { user, getRecentCheckins, getTodayCheckin, getTodayPlan, addPlan, getCurrentBasePlan, getCompletedSupplementsForDate } = useUserStore();
  const [messageIndex, setMessageIndex] = useState(0);
  const [, setIsGenerating] = useState(true);
  const fadeAnim = useMemo(() => new Animated.Value(1), []);
  const startedRef = useRef(false);
  const navigation = useNavigation();
  const [navLocked] = useState(true);
  const navLockedRef = useRef(true);
  const unlockNavigation = () => { navLockedRef.current = false; };
  
  // Game State
  const [showMiniGame, setShowMiniGame] = useState(false);
  const [planStatus, setPlanStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('loading');
  
  const forceRegen = params.force === 'true';

  // Check for mini-game eligibility
  useEffect(() => {
    const checkGameEligibility = async () => {
      const isRedo = params.isRedo === 'true';
      const allowed = await canPlayGame(isRedo, user?.id);
      
      if (allowed) {
        // Lock it immediately so they can't play again today if they crash/restart
        await markGamePlayedToday(user?.id);
        setShowMiniGame(true);
      }
    };
    
    checkGameEligibility();
  }, [user?.id, params.isRedo]);

  const handleGameEnd = useCallback((score: number) => {
    saveGameScore(score, user?.id);
    setShowMiniGame(false);
  }, [user?.id]);

  const generatePlan = useCallback(async () => {
    try {
      setPlanStatus('loading');
      
      // If a plan for today already exists and NOT forced, skip regeneration
      const existing = getTodayPlan();
      if (existing && !forceRegen) {
        console.log('[GenerateDailyPlan] Plan already exists for today (and not forced), navigating...');
        setPlanStatus('success');
        router.replace('/plan');
        return;
      }
      
      if (forceRegen && existing) {
        console.log('[GenerateDailyPlan] 🔄 Force regeneration requested - will replace existing plan');
      }

      // Validate configuration
      const config = getProductionConfig();
      const isDev = __DEV__;
      
      console.log('[GenerateDailyPlan] Starting daily plan generation...');
      console.log('[GenerateDailyPlan] Environment:', isDev ? 'development' : 'production');
      console.log('[GenerateDailyPlan] Config valid:', config.isValid);
      
      if (!config.isValid && !isDev) {
        console.warn('[GenerateDailyPlan] ⚠️ Configuration issues:', config.errors);
      }

      const todayCheckin = getTodayCheckin();
      const recentCheckins = getRecentCheckins(15);

      if (!todayCheckin || !user) {
        console.error('[GenerateDailyPlan] Missing checkin or user data');
        setPlanStatus('error');
        Alert.alert(
          'Data Missing',
          'Please complete your daily check-in first.',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)/home') }]
        );
        return;
      }

      // Get current base plan
      const basePlan = getCurrentBasePlan();
      
      if (!basePlan) {
        console.error('[GenerateDailyPlan] No base plan available');
        setPlanStatus('error');
        Alert.alert(
          'Base Plan Missing',
          'Please complete onboarding to generate your base plan first.',
          [{ text: 'OK', onPress: () => router.replace('/onboarding') }]
        );
        return;
      }

      // Use the new AI service for daily plan generation
      const startTime = Date.now();
      // Show a friendly message if generation exceeds 45 seconds
      // const slowTimer = setTimeout(() => {
      //   const msg = SLOW_PROMPTS[Math.floor(Math.random() * SLOW_PROMPTS.length)];
      //   Alert.alert('Crafting Your Plan', msg, [{ text: 'OK' }], { cancelable: true });
      // }, 45000);

      // Get yesterday's supplement data
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = yesterday.toISOString().split('T')[0];
      const yesterdaySupplements = getCompletedSupplementsForDate(yesterdayKey);

      const planData = await generateDailyPlan(user, todayCheckin, recentCheckins, basePlan, yesterdaySupplements);
      const generationTime = Date.now() - startTime;
      // clearTimeout(slowTimer);
      
      // Log successful generation
      await logPlanGenerationAttempt('daily', true, null, {
        generationTime,
        checkinEnergy: todayCheckin.energy,
        checkinStress: todayCheckin.stress
      });
      
      // Add the plan to store
      await addPlan(planData);
      
      console.log('[GenerateDailyPlan] ✅ Plan saved successfully');
      
      // Set generating to false first
      setIsGenerating(false);
      // setPlanStatus('success');
      
      // Wait for state to propagate before navigating
      // This prevents race condition where plan screen renders before state updates
      console.log('[GenerateDailyPlan] ⏳ Waiting for state propagation...');
      
      setTimeout(() => {
        setPlanStatus('success');
        setTimeout(() => {
          try {
            unlockNavigation();
            // Use push + replace combo for all environments (dev and production)
            // This is more reliable than replace alone
            console.log('[GenerateDailyPlan] 🚀 Using push + replace navigation');
            router.push('/plan?celebrate=1');
            
            // Ensure navigation with replace after a delay (without celebrate param to avoid remount confetti)
            setTimeout(() => {
              console.log('[GenerateDailyPlan] 🔄 Confirming navigation with replace (no celebrate param)');
              router.replace('/plan');
            }, 500);
          } catch (navError) {
            console.error('[GenerateDailyPlan] ❌ Navigation error:', navError);
            // Fallback 1: Try without celebrate parameter
            setTimeout(() => {
              console.log('[GenerateDailyPlan] 🔄 Fallback: Trying without celebrate param');
              try {
                unlockNavigation();
                router.push('/plan');
                setTimeout(() => router.replace('/plan'), 300);
              } catch (fallbackError) {
                // Fallback 2: Navigate to home as last resort
                console.log('[GenerateDailyPlan] 🏠 Final fallback: Navigating to home');
                unlockNavigation();
                router.replace('/(tabs)/home');
              }
            }, 100);
          }
        }, 500);
      }, 2000); // Increased from 1500ms to 2000ms for better reliability in production

    } catch (error) {
      // Ensure slowTimer is cleared on error
      try { /* no-op if not set */ } catch {}
      console.error('Error generating daily plan:', error);
      setPlanStatus('error');
      
      // Log the failure
      const todayCheckinData = getTodayCheckin();
      await logPlanGenerationAttempt('daily', false, error, {
        userDataPresent: !!user,
        checkinPresent: !!todayCheckinData,
        basePlanPresent: !!getCurrentBasePlan(),
        errorMessage: String(error),
        errorType: error instanceof Error ? error.name : 'Unknown'
      });
      
      // NO FALLBACK - Show error to user
      // Daily plan generation should not fail since it just applies
      // check-in adjustments to the existing base plan (no AI call)
      Alert.alert(
        'Unable to Generate Plan',
        'There was an issue creating your daily plan. Please try again.',
        [
          { 
            text: 'Go Home', 
            onPress: () => {
              unlockNavigation();
              router.replace('/(tabs)/home');
            }
          },
          { 
            text: 'Try Again', 
            onPress: () => {
              startedRef.current = false;
              setPlanStatus('loading');
              generatePlan();
            }
          },
        ],
        { cancelable: false }
      );
    }
  }, [user, getTodayCheckin, getRecentCheckins, addPlan, getCurrentBasePlan, getTodayPlan, forceRegen]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const messageInterval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);

    generatePlan();

    return () => clearInterval(messageInterval);
  }, []);

  // Lock hardware back and gestures until plan is generated
  useEffect(() => {
    const unsubBeforeRemove = navigation.addListener('beforeRemove', (e: any) => {
      if (navLockedRef.current) {
        e.preventDefault();
        return;
      }
    });
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      return navLockedRef.current; // Block while locked
    });
    return () => {
      try { unsubBeforeRemove(); } catch {}
      try { backSub.remove(); } catch {}
    };
  }, [navigation]);

  return (
    <LinearGradient
      colors={['#667eea', '#764ba2']}
      style={styles.container}
    >
      <Stack.Screen 
        options={{ 
          headerShown: false,
          gestureEnabled: false,
        }} 
      />
      
      <PlanLoadingMiniGameOverlay 
        visible={showMiniGame} 
        planStatus={planStatus} 
        onGameEnd={handleGameEnd}
        loadingMessage={LOADING_MESSAGES[messageIndex]}
        onExit={() => setShowMiniGame(false)}
      />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.loadingContainer}>
            <View style={styles.spinner}>
              <View style={styles.spinnerInner} />
            </View>
            
            <Text style={styles.title}>Creating Your Plan</Text>
            
            <Animated.View style={[styles.messageContainer, { opacity: fadeAnim }]}>
              <Text style={styles.message}>
                {LOADING_MESSAGES[messageIndex]}
              </Text>
            </Animated.View>

            <Text style={styles.hint}>This might take a moment — please don’t leave this screen.</Text>

            <View style={styles.dotsContainer}>
              <View style={[styles.dot, styles.dot1]} />
              <View style={[styles.dot, styles.dot2]} />
              <View style={[styles.dot, styles.dot3]} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  spinner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  spinnerInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  messageContainer: {
    minHeight: 24,
    justifyContent: 'center',
  },
  message: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center',
    marginBottom: 40,
  },
  hint: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.75,
    textAlign: 'center',
    marginTop: -28,
    marginBottom: 36,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
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
});
