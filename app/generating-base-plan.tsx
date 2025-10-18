import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated, Alert, Platform } from 'react-native';
import { router, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserStore } from '@/hooks/useUserStore';
import type { WeeklyBasePlan } from '@/types/user';
import { theme } from '@/constants/colors';
import { generateWeeklyBasePlan } from '@/services/documented-ai-service';
import { runPlanGenerationDiagnostics, logPlanGenerationAttempt } from '@/utils/plan-generation-diagnostics';
import { getProductionConfig } from '@/utils/production-config';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';

const LOADING_MESSAGES = [
  "📚 Gathering research and references tailored to your goals…",
  "🔎 Reviewing your profile and preferences to narrow options…",
  "🧭 Selecting evidence‑based training, nutrition, and recovery strategies…",
  "🛠️ Custom‑fitting your weekly structure and targets…",
  "✅ Finalizing your foundational base plan…",
  "🧭 this might take a moment please don't leave this screen"
];

const SLOW_PROMPTS = [
  'Your data’s one of a kind we’re tailoring this plan just right',
  'This one’s special. Give us a moment to fine-tune everything',
  'Your plan’s being crafted with extra care. give us a moment',
  'this isn’t just any plan… it’s yours. Hold tight',
  'We’re refining every detail to make this match you perfectly',
  'Unique input calls for a custom touch just a few seconds more',
];

export default function GeneratingBasePlanScreen() {
  const { user, addBasePlan } = useUserStore();
  const [messageIndex, setMessageIndex] = useState(0);
  const [, setIsGenerating] = useState(true);
  const fadeAnim = useMemo(() => new Animated.Value(1), []);
  const startedRef = useRef(false);

  const generatePlan = useCallback(async () => {
    try {
      // Validate configuration before starting
      const config = getProductionConfig();
      const isDev = __DEV__;
      
      console.log('[GeneratePlan] Starting plan generation...');
      console.log('[GeneratePlan] Environment:', isDev ? 'development' : 'production');
      console.log('[GeneratePlan] Config valid:', config.isValid);
      
      // Check for critical missing configuration
      if (!config.isValid && !isDev) {
        console.error('[GeneratePlan] ⚠️ Configuration issues detected:', config.errors);
        
        // Show user-friendly message for missing AI config
        if (config.errors.some(e => e.includes('AI'))) {
          Alert.alert(
            'Service Configuration',
            'AI service is not fully configured. Using basic plan generation.',
            [{ text: 'OK' }]
          );
        }
      }
      
      const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
      const requiredEntitlement = extra.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT || 'pro';
      
      console.log('[GeneratePlan] Defense-in-depth: checking subscription again...');
      console.log('[GeneratePlan] Required entitlement:', requiredEntitlement);
      
      // Run diagnostics in production/TestFlight
      if (!isDev) {
        console.log('🔍 Running plan generation diagnostics...');
        const diagnostics = await runPlanGenerationDiagnostics();
        if (diagnostics.errors.length > 0) {
          console.error('❌ Diagnostic errors:', diagnostics.errors);
        }
        // Proceed if any primary or fallback endpoint is accessible (DeepSeek preferred)
        if (!diagnostics.endpoints.deepseekAccessible && !diagnostics.endpoints.geminiAccessible && !diagnostics.endpoints.rorkAccessible) {
          console.error('⚠️ WARNING: No API endpoints accessible!');
          Alert.alert(
            'Network Issue',
            'Unable to reach AI services. Please check your internet connection.',
            [{ text: 'Continue Anyway', onPress: () => {} }]
          );
        }
      }
      
      // Check customer info and log status
      try { 
        const customerInfo = await Purchases.getCustomerInfo();
        console.log('[GeneratePlan] Active entitlements:', Object.keys(customerInfo.entitlements.active));
        console.log('[GeneratePlan] Has required entitlement:', !!customerInfo.entitlements.active[requiredEntitlement]);
      } catch (err) {
        console.warn('[GeneratePlan] Could not refresh customer info:', err);
      }
      
      console.log('[GeneratePlan] Checking subscription...');
      try {
        const info = await Purchases.getCustomerInfo();
        const entitled = !!info.entitlements.active[requiredEntitlement];
        if (!entitled) {
          router.replace({ pathname: '/paywall', params: { next: '/generating-base-plan' } as any });
          return;
        }
      } catch {}
      
      console.log('[GeneratePlan] ✅ Subscription verified, generating plan...');

      if (!user) {
        throw new Error('No user data available');
      }

      // Use the new AI service for plan generation
      const startTime = Date.now();
      // Show a friendly message if generation exceeds 45 seconds
      const slowTimer = setTimeout(() => {
        const msg = SLOW_PROMPTS[Math.floor(Math.random() * SLOW_PROMPTS.length)];
        Alert.alert('Crafting Your Plan', msg, [{ text: 'OK' }], { cancelable: true });
      }, 45000);

      const basePlan = await generateWeeklyBasePlan(user);
      const generationTime = Date.now() - startTime;
      clearTimeout(slowTimer);
      
      // Log successful generation
      await logPlanGenerationAttempt('base', true, null, {
        generationTime,
        planDays: Object.keys(basePlan.days || {}).length
      });
      
      await addBasePlan(basePlan);
      
      setTimeout(() => {
        setIsGenerating(false);
        router.replace('/plan-preview');
      }, 1000);

    } catch (error) {
      try { /* ensure timer cleared if set */ } catch {}
      console.error('❌ Error in plan generation screen:', error);
      
      // Log the failure
      await logPlanGenerationAttempt('base', false, error, {
        userDataPresent: !!user,
        errorMessage: String(error),
        errorType: error instanceof Error ? error.name : 'Unknown'
      });
      
      // Determine if error is recoverable
      const errorMessage = String(error);
      const isNetworkError = errorMessage.includes('network') || 
                            errorMessage.includes('fetch') || 
                            errorMessage.includes('timeout');
      const isConfigError = errorMessage.includes('API key') || 
                           errorMessage.includes('configuration');
      
      // Show user-friendly error message
      if (isNetworkError) {
        Alert.alert(
          'Connection Issue',
          'Unable to connect to AI services. Using a basic plan template instead.',
          [{ text: 'OK' }]
        );
      } else if (isConfigError) {
        Alert.alert(
          'Service Issue',
          'AI service configuration issue. Using a personalized basic plan instead.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Plan Generation',
          'Using a personalized basic plan. You can regenerate anytime from settings.',
          [{ text: 'OK' }]
        );
      }
      
      // The AI service already handles fallback, but if that also fails:
      // Create a simple emergency fallback plan
      const emergencyPlan = createEmergencyFallbackPlan();
      
      await addBasePlan(emergencyPlan);
      
      setTimeout(() => {
        setIsGenerating(false);
        router.replace('/plan-preview');
      }, 1000);
    }
  }, [user, addBasePlan]);

  // Emergency fallback function
  const createEmergencyFallbackPlan = (): WeeklyBasePlan => {
    const targetCalories = user?.dailyCalorieTarget || 2000;
    const targetProtein = user?.weight ? Math.round(user.weight * 2.2 * 0.9) : 150;
    
    const createDayPlan = (focus: string, isRest: boolean = false) => ({
      workout: {
        focus: [focus],
        blocks: isRest ? [
          {
            name: 'Active Recovery',
            items: [{ exercise: 'Light walking or yoga', sets: 1, reps: '20-30 min', RIR: 0 }]
          }
        ] : [
          {
            name: 'Warm-up',
            items: [{ exercise: 'Dynamic stretching', sets: 1, reps: '5-8 min', RIR: 0 }]
          },
          {
            name: 'Main Workout',
              items: [
              { exercise: 'Exercise 1', sets: 3, reps: '8-12', RIR: 2 },
              { exercise: 'Exercise 2', sets: 3, reps: '10-15', RIR: 2 },
              { exercise: 'Exercise 3', sets: 3, reps: '12-15', RIR: 1 }
            ]
          }
        ],
        notes: isRest ? 'Rest and recovery day' : 'Focus on proper form'
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
        mobility: ['Stretching routine', 'Focus on tight areas'],
        sleep: ['7-8 hours recommended', 'Consistent bedtime']
      }
    });

    return {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        days: {
        monday: createDayPlan('Upper Body'),
        tuesday: createDayPlan('Lower Body'),
        wednesday: createDayPlan('Rest/Recovery', true),
        thursday: createDayPlan('Upper Body'),
        friday: createDayPlan('Lower Body'),
        saturday: createDayPlan('Full Body'),
        sunday: createDayPlan('Rest/Recovery', true)
        },
        isLocked: false,
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
    }, 2500);

    generatePlan();

    return () => clearInterval(messageInterval);
  }, []);

  return (
    <LinearGradient
      colors={['#FF5C5C', '#FF4444', '#FF2222', '#1A1A1A', '#0C0C0D']}
      style={styles.container}
    >
      <Stack.Screen 
        options={{ 
          headerShown: false,
        }} 
      />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.loadingContainer}>
            <View style={styles.spinner}>
              <View style={styles.spinnerInner} />
            </View>
            
            <Text style={styles.title}>Building Your Journey</Text>
            
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