import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated, Alert, BackHandler } from 'react-native';
import { router, Stack } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserStore } from '@/hooks/useUserStore';
import type { DailyPlan } from '@/types/user';
import { generateDailyPlan } from '@/services/documented-ai-service';
import { logPlanGenerationAttempt } from '@/utils/plan-generation-diagnostics';
import { getProductionConfig } from '@/utils/production-config';

const LOADING_MESSAGES = [
  "📚 Gathering research specific to your goals and preferences…",
  "🔎 Reviewing your recent check-ins and training history…",
  "🧭 Cross‑checking trusted sources for training, nutrition, and recovery…",
  "🛠️ Customizing recommendations to match your equipment and routine…",
  "✅ Finalizing today’s plan with precise adjustments…",
];

const SLOW_PROMPTS = [
  'Your data’s one of a kind we’re tailoring this plan just right',
  'This one’s special. Give us a moment to fine-tune everything',
  'Your plan’s being crafted with extra care. give us a moment',
  'this isn’t just any plan… it’s yours. Hold tight',
  'We’re refining every detail to make this match you perfectly',
  'Unique input calls for a custom touch just a few seconds more',
];

export default function GeneratingPlanScreen() {
  const { user, getRecentCheckins, getTodayCheckin, getTodayPlan, addPlan, getCurrentBasePlan } = useUserStore();
  const [messageIndex, setMessageIndex] = useState(0);
  const [, setIsGenerating] = useState(true);
  const fadeAnim = useMemo(() => new Animated.Value(1), []);
  const startedRef = useRef(false);
  const navigation = useNavigation();
  const [navLocked] = useState(true);
  const navLockedRef = useRef(true);
  const unlockNavigation = () => { navLockedRef.current = false; };

  const generatePlan = useCallback(async () => {
    try {
      // If a plan for today already exists, skip regeneration
      const existing = getTodayPlan();
      if (existing) {
        console.log('[GenerateDailyPlan] Plan already exists for today, navigating...');
        router.replace('/plan');
        return;
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
      const slowTimer = setTimeout(() => {
        const msg = SLOW_PROMPTS[Math.floor(Math.random() * SLOW_PROMPTS.length)];
        Alert.alert('Crafting Your Plan', msg, [{ text: 'OK' }], { cancelable: true });
      }, 45000);
      const planData = await generateDailyPlan(user, todayCheckin, recentCheckins, basePlan);
      const generationTime = Date.now() - startTime;
      clearTimeout(slowTimer);
      
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
      
      // Wait for state to propagate before navigating
      // This prevents race condition where plan screen renders before state updates
      console.log('[GenerateDailyPlan] ⏳ Waiting for state propagation...');
      
      setTimeout(() => {
        try {
          unlockNavigation();
          // Use push + replace combo for all environments (dev and production)
          // This is more reliable than replace alone
          console.log('[GenerateDailyPlan] 🚀 Using push + replace navigation');
          router.push('/plan?celebrate=1');
          
          // Ensure navigation with replace after a delay
          setTimeout(() => {
            console.log('[GenerateDailyPlan] 🔄 Confirming navigation with replace');
            router.replace('/plan?celebrate=1');
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
      }, 2000); // Increased from 1500ms to 2000ms for better reliability in production

    } catch (error) {
      // Ensure slowTimer is cleared on error
      try { /* no-op if not set */ } catch {}
      console.error('Error generating plan:', error);
      
      // Log the failure
      const todayCheckinData = getTodayCheckin();
      await logPlanGenerationAttempt('daily', false, error, {
        userDataPresent: !!user,
        checkinPresent: !!todayCheckinData,
        basePlanPresent: !!getCurrentBasePlan(),
        errorMessage: String(error),
        errorType: error instanceof Error ? error.name : 'Unknown'
      });
      
      // Determine error type for user message
      const errorMessage = String(error);
      const isNetworkError = errorMessage.includes('network') || 
                            errorMessage.includes('fetch') || 
                            errorMessage.includes('timeout');
      const isConfigError = errorMessage.includes('API key') || 
                           errorMessage.includes('configuration');
      
      // Create an emergency fallback plan
      const basePlan = getCurrentBasePlan();
      
      if (!user || !todayCheckinData) {
        // If critical data is missing, redirect to home
        console.error('Critical data missing for plan generation');
        Alert.alert(
          'Data Missing',
          'Please complete your daily check-in first.',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)/home') }]
        );
        return;
      }
      
      // Show user-friendly error
      if (isNetworkError) {
        Alert.alert(
          'Connection Issue',
          'Unable to reach AI services. Using your base plan with today\'s adjustments.',
          [{ text: 'OK' }]
        );
      } else if (isConfigError) {
        Alert.alert(
          'Service Issue',
          'Using your base plan adapted for today\'s check-in.',
          [{ text: 'OK' }]
        );
      } else {
        // Don't show alert for successful fallback
        console.log('📋 Using fallback plan based on check-in data');
      }
      
      const fallbackPlan = createEmergencyFallbackPlan(todayCheckinData);
      await addPlan(fallbackPlan);
      
      console.log('[GenerateDailyPlan] ✅ Fallback plan saved successfully');
      
      // Set generating to false first
      setIsGenerating(false);
      
      // Wait for state to propagate before navigating
      console.log('[GenerateDailyPlan] ⏳ Waiting for state propagation (fallback)...');
      
      setTimeout(() => {
        try {
          // Use push + replace combo for all environments (dev and production)
          console.log('[GenerateDailyPlan] 🚀 Using push + replace navigation (fallback)');
          unlockNavigation();
          router.push('/plan?celebrate=1');
          setTimeout(() => {
            console.log('[GenerateDailyPlan] 🔄 Confirming navigation with replace (fallback)');
            router.replace('/plan?celebrate=1');
          }, 500);
        } catch (navError) {
          console.error('[GenerateDailyPlan] ❌ Navigation error (fallback):', navError);
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
      }, 2000); // Increased from 1500ms to 2000ms for better reliability in production
    }
  }, [user, getTodayCheckin, getRecentCheckins, addPlan, getCurrentBasePlan, getTodayPlan]);

  // Emergency fallback function
  const createEmergencyFallbackPlan = (checkin: any): DailyPlan => {
    const targetCalories = user?.dailyCalorieTarget || 2000;
    const targetProtein = user?.weight ? Math.round(user.weight * 2.2 * 0.9) : 150;
        const isLowEnergy = (checkin.energy || 5) < 5;
    const hasEquipment = user?.equipment?.some((eq: string) => eq !== 'Bodyweight') || false;
        
        return {
          id: Date.now().toString(),
          date: new Date().toISOString().split('T')[0],
          workout: {
        focus: isLowEnergy ? ['Recovery', 'Mobility'] : ['Full Body'],
            blocks: [
              {
                name: 'Warm-up',
                items: [
                  { exercise: 'Dynamic stretching', sets: 1, reps: '5-8 min', RIR: 0 }
                ]
              },
              {
                name: isLowEnergy ? 'Light Movement' : 'Main Workout',
                items: isLowEnergy ? [
                  { exercise: 'Gentle yoga flow', sets: 1, reps: '15-20 min', RIR: 0 },
                  { exercise: 'Walking', sets: 1, reps: '10-15 min', RIR: 0 }
                ] : hasEquipment ? [
                  { exercise: 'Compound movement', sets: 3, reps: '8-12', RIR: 2 },
                  { exercise: 'Accessory work', sets: 3, reps: '10-15', RIR: 2 }
                ] : [
                  { exercise: 'Bodyweight Squats', sets: 3, reps: '10-15', RIR: 2 },
                  { exercise: 'Push-ups', sets: 3, reps: '8-12', RIR: 2 },
                  { exercise: 'Plank', sets: 3, reps: '30-60s', RIR: 1 }
                ]
              }
            ],
        notes: `Adaptive plan based on ${checkin.energy}/10 energy level.`
          },
          nutrition: {
        total_kcal: targetCalories,
            protein_g: targetProtein,
            meals: [
              {
                name: 'Breakfast',
            items: [
              { food: 'High-protein breakfast', qty: '1 serving' },
              { food: 'Complex carbs', qty: '1 serving' }
                ]
              },
              {
                name: 'Lunch',
            items: [
              { food: 'Lean protein', qty: '150g' },
              { food: 'Whole grains', qty: '1 cup' },
              { food: 'Vegetables', qty: '2 cups' }
                ]
              },
              {
                name: 'Post-Workout',
            items: [
                  { food: 'Protein shake', qty: '1 scoop' },
                  { food: 'Banana', qty: '1 medium' }
                ]
              },
              {
                name: 'Dinner',
            items: [
              { food: 'Quality protein', qty: '150g' },
              { food: 'Complex carbs', qty: '1 cup' },
              { food: 'Salad', qty: '2 cups' }
                ]
              }
            ],
            hydration_l: 2.5
          },
          recovery: {
            mobility: isLowEnergy ? [
              'Gentle stretching (10 min)',
              'Deep breathing exercises (5 min)'
            ] : [
              'Post-workout stretching (10 min)',
              'Foam rolling if available (5-10 min)'
            ],
            sleep: [
              `Target: ${Math.max(7, 9 - (checkin.stress || 3))} hours tonight`,
              'Create a calming bedtime routine',
              checkin.stress && checkin.stress > 6 ? 'Consider meditation before bed' : 'Avoid screens 1 hour before bed'
            ]
          },
          motivation: isLowEnergy ? 
            "Rest is part of progress. Listen to your body and be gentle with yourself today. 🌱" :
        "Every rep counts toward your fitness journey. Stay consistent! 💪",
          adherence: 0,
      adjustments: [],
      isFromBasePlan: true,
    };
  };

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