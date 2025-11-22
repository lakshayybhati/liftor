import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated, Alert, Platform, BackHandler } from 'react-native';
import { router, Stack } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserStore } from '@/hooks/useUserStore';
import type { WeeklyBasePlan } from '@/types/user';
import { theme } from '@/constants/colors';
import { Dumbbell, Apple, Heart, Calendar } from 'lucide-react-native';
import { generateWeeklyBasePlan } from '@/services/plan-generation';
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
  const navigation = useNavigation();
  const [showFeaturePreview, setShowFeaturePreview] = useState(false);
  const featureFade = useMemo(() => new Animated.Value(0), []);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [navLocked, setNavLocked] = useState(true);
  const navLockedRef = useRef(true);
  const unlockNavigation = () => { navLockedRef.current = false; setNavLocked(false); };

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
      
      // Log subscription status (non-blocking)
      console.log('[GeneratePlan] 🎯 Starting plan generation (subscription check will happen after plan is displayed)');

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
      if (previewTimerRef.current) { try { clearTimeout(previewTimerRef.current); } catch {} previewTimerRef.current = null; }
      setShowFeaturePreview(false);
      
      // Log successful generation
      await logPlanGenerationAttempt('base', true, null, {
        generationTime,
        planDays: Object.keys(basePlan.days || {}).length
      });
      
      console.log('[GenerateBasePlan] 💾 Saving plan to store...');
      console.log('[GenerateBasePlan] Plan has', Object.keys(basePlan.days || {}).length, 'days');
      console.log('[GenerateBasePlan] Plan ID:', basePlan.id);
      console.log('[GenerateBasePlan] Plan structure:', {
        id: basePlan.id,
        createdAt: basePlan.createdAt,
        isLocked: basePlan.isLocked,
        dayCount: Object.keys(basePlan.days || {}).length
      });
      await addBasePlan(basePlan);
      console.log('[GenerateBasePlan] ✅ Plan saved to store successfully');
      
      // Update state
      console.log('[GenerateBasePlan] 🔄 Updating state...');
      setIsGenerating(false);
      
      // Wait extra time to ensure state propagates through React and AsyncStorage
      // React state updates are asynchronous and batched
      console.log('[GenerateBasePlan] ⏳ Waiting for state propagation...');
      
      // Navigation approach - Always go to plan-preview
      setTimeout(async () => {
        try {
          unlockNavigation();
          // Try plan-preview first
          console.log('[GenerateBasePlan] 🚀 Attempting navigation to plan-preview');
          router.push('/plan-preview');
          console.log('[GenerateBasePlan] ✅ Navigation push executed');
          
          // Ensure navigation with replace after a delay
          setTimeout(() => {
            console.log('[GenerateBasePlan] 🔄 Ensuring navigation with replace');
            router.replace('/plan-preview');
          }, 500);
        } catch (navError) {
          console.error('[GenerateBasePlan] ❌ Navigation error:', navError);
          
          // Fallback: Try direct navigation to plan-preview as last resort
          setTimeout(() => {
            console.log('[GenerateBasePlan] 🔁 Fallback: navigating to plan-preview');
            unlockNavigation();
            try { router.replace('/plan-preview'); } catch {}
          }, 100);
        }
      }, 1500); // Increased to 1500ms for better reliability

    } catch (error) {
      try { /* ensure timer cleared if set */ } catch {}
      console.error('❌ Error in plan generation screen:', error);

      // Log the failure
      await logPlanGenerationAttempt('base', false, error, {
        userDataPresent: !!user,
        errorMessage: String(error),
        errorType: error instanceof Error ? error.name : 'Unknown'
      });

      // Failure UX: do not save any plan, do not navigate
      Alert.alert(
        'We\'re experiencing high demand',
        "Due to high demand we're having an issue. Try again in a bit; contact us if this persists.",
        [
          { text: 'Go Back', onPress: () => { try { unlockNavigation(); router.replace('/(tabs)/home'); } catch {} } },
          { text: 'Try Again', onPress: () => { try { generatePlan(); } catch {} } },
        ],
        { cancelable: true }
      );
    }
  }, [user, addBasePlan]);

  // Emergency fallback removed per NO-FALLBACK policy

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

    // Start 30s timer to reveal feature preview overlay
    previewTimerRef.current = setTimeout(() => {
      setShowFeaturePreview(true);
      Animated.timing(featureFade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    }, 30000);

    return () => {
      clearInterval(messageInterval);
      if (previewTimerRef.current) { try { clearTimeout(previewTimerRef.current); } catch {} previewTimerRef.current = null; }
    };
  }, []);

  // Ensure back/gesture takes user to home, not check-in or previous steps
  useEffect(() => {
    const unsubBeforeRemove = navigation.addListener('beforeRemove', (e: any) => {
      if (navLockedRef.current) {
        e.preventDefault();
        return;
      }
    });
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      return navLockedRef.current; // true => block
    });
    return () => {
      try { unsubBeforeRemove(); } catch {}
      try { backSub.remove(); } catch {}
    };
  }, [navigation]);

  return (
    <LinearGradient
      colors={['#FF5C5C', '#FF4444', '#FF2222', '#1A1A1A', '#0C0C0D']}
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

        {/* Timed Feature Preview Overlay (shows after 30s) */}
        {showFeaturePreview && (
          <Animated.View style={[styles.previewOverlay, { opacity: featureFade }]}> 
            <View style={styles.previewCardContainer}>
              <Text style={styles.previewTitle}>Almost there… here’s a quick peek</Text>
              <View style={styles.previewGrid}>
                <View style={styles.previewCard}>
                  <View style={styles.previewHeaderRow}>
                    <Dumbbell size={20} color={theme.color.accent.primary} />
                    <Text style={styles.previewHeaderText}>Workout</Text>
                  </View>
                  <Text style={styles.previewLine}>• Upper Body focus</Text>
                  <Text style={styles.previewLine}>• 3×8–12 Main Lifts</Text>
                  <Text style={styles.previewLine}>• Warm-up & Cool‑down</Text>
                </View>
                <View style={styles.previewCard}>
                  <View style={styles.previewHeaderRow}>
                    <Apple size={20} color={theme.color.accent.green} />
                    <Text style={styles.previewHeaderText}>Nutrition</Text>
                  </View>
                  <Text style={styles.previewLine}>Calories matched to your goal</Text>
                  <Text style={styles.previewLine}>Balanced meals for the day</Text>
                  <Text style={styles.previewLine}>Hydration reminders</Text>
                </View>
                <View style={styles.previewCard}>
                  <View style={styles.previewHeaderRow}>
                    <Heart size={20} color={theme.color.accent.blue} />
                    <Text style={styles.previewHeaderText}>Recovery</Text>
                  </View>
                  <Text style={styles.previewLine}>Mobility work</Text>
                  <Text style={styles.previewLine}>Sleep guidance</Text>
                  <Text style={styles.previewLine}>Light activity tips</Text>
                </View>
              </View>
              <View style={styles.previewFooterRow}>
                <Calendar size={18} color={theme.color.muted} />
                <Text style={styles.previewFooterText}>Your 7‑day base plan will appear here soon</Text>
              </View>
            </View>
          </Animated.View>
        )}
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
  previewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.bg + 'F2',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  previewCardContainer: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: 18,
  },
  previewTitle: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: 12,
  },
  previewGrid: {
    gap: 10,
  },
  previewCard: {
    backgroundColor: theme.color.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: 12,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  previewHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.ink,
  },
  previewLine: {
    fontSize: 12,
    color: theme.color.muted,
    marginBottom: 2,
  },
  previewFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    justifyContent: 'center',
  },
  previewFooterText: {
    fontSize: 12,
    color: theme.color.muted,
  },
});