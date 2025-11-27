import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated, Alert, Platform, BackHandler, ActivityIndicator, Dimensions, TouchableOpacity } from 'react-native';
import { router, Stack } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { useUserStore } from '@/hooks/useUserStore';
import type { WeeklyBasePlan } from '@/types/user';
import { theme } from '@/constants/colors';
import { Dumbbell, Apple, Heart, Calendar, Check, Lightbulb, Brain, Sparkles, RefreshCw } from 'lucide-react-native';
import { generateWeeklyBasePlan, BasePlanGenerationError } from '@/services/plan-generation';
import { runPlanGenerationDiagnostics, logPlanGenerationAttempt } from '@/utils/plan-generation-diagnostics';
import { getProductionConfig } from '@/utils/production-config';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';
import { BasePlanSkeleton } from '@/components/BasePlanSkeleton';

const GENERATION_PHASES = [
  { id: 0, text: "Analyzing your profile & goals", icon: Brain },
  { id: 1, text: "Structuring weekly workout splits", icon: Dumbbell },
  { id: 2, text: "Verifying plan accuracy", icon: Apple },
  { id: 3, text: "Finalizing your custom plan", icon: Sparkles },
];

const HEALTH_TIPS = [
  "Consistency beats intensity. It's about showing up every day.",
  "Muscle tissue burns more calories at rest than fat tissue does.",
  "Sleep is when your muscles actually repair and grow stronger.",
  "Drinking water before meals can help manage appetite.",
  "Protein is essential for recovery, not just for bodybuilders.",
  "Active recovery days help reduce soreness and improve mobility."
];

const SLOW_PROMPTS = [
  "Your data is one of a kind – we're tailoring this plan just right",
  "This one is special. Give us a moment to fine-tune everything",
  "Your plan is being crafted with extra care. Give us a moment",
  "This isn't just any plan… it's yours. Hold tight",
  "We're refining every detail to make this match you perfectly",
  "Unique input calls for a custom touch – just a few seconds more",
];

export default function GeneratingBasePlanScreen() {
  const { user, addBasePlan } = useUserStore();
  const [currentPhase, setCurrentPhase] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [lastRetryTime, setLastRetryTime] = useState<number | null>(null);
  const fadeAnim = useMemo(() => new Animated.Value(1), []);
  const tipFadeAnim = useMemo(() => new Animated.Value(1), []);
  const startedRef = useRef(false);
  const navigation = useNavigation();
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [navLocked, setNavLocked] = useState(true);
  const navLockedRef = useRef(true);
  const unlockNavigation = () => { navLockedRef.current = false; setNavLocked(false); };

  // Minimum time between retries (3 minutes)
  const MIN_RETRY_INTERVAL_MS = 3 * 60 * 1000;

  const canRetry = useCallback(() => {
    if (!lastRetryTime) return true;
    const elapsed = Date.now() - lastRetryTime;
    return elapsed >= MIN_RETRY_INTERVAL_MS;
  }, [lastRetryTime]);

  const getRetryWaitTime = useCallback(() => {
    if (!lastRetryTime) return 0;
    const elapsed = Date.now() - lastRetryTime;
    const remaining = MIN_RETRY_INTERVAL_MS - elapsed;
    return Math.max(0, Math.ceil(remaining / 1000));
  }, [lastRetryTime]);

  const handleRetry = useCallback(() => {
    if (!canRetry()) {
      const waitSeconds = getRetryWaitTime();
      const minutes = Math.floor(waitSeconds / 60);
      const seconds = waitSeconds % 60;
      Alert.alert(
        'Please Wait',
        `To ensure the best experience, please wait ${minutes > 0 ? `${minutes} minute${minutes > 1 ? 's' : ''} and ` : ''}${seconds} second${seconds !== 1 ? 's' : ''} before trying again.`,
        [{ text: 'OK' }]
      );
      return;
    }
    
    // Reset state and retry
    setHasError(false);
    setIsGenerating(true);
    setCurrentPhase(0);
    setRetryCount(prev => prev + 1);
    setLastRetryTime(Date.now());
    startedRef.current = false;
    
    // Trigger generation again
    generatePlan();
  }, [canRetry, getRetryWaitTime]);

  const generatePlan = useCallback(async () => {
    try {
      // Validate configuration before starting
      const config = getProductionConfig();
      const isDev = __DEV__;
      
      console.log('[GeneratePlan] Starting plan generation...');
      console.log('[GeneratePlan] Environment:', isDev ? 'development' : 'production');
      console.log('[GeneratePlan] Config valid:', config.isValid);
      console.log('[GeneratePlan] Retry count:', retryCount);
      
      // Check for critical missing configuration
      if (!config.isValid && !isDev) {
        console.error('[GeneratePlan] ⚠️ Configuration issues detected:', config.errors);
        
        // Show user-friendly message for missing AI config
        if (config.errors.some(e => e.includes('AI'))) {
          Alert.alert(
            'Service Configuration',
            'AI service is not fully configured. Please try again later.',
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
            [{ text: 'OK' }]
          );
          setHasError(true);
          setIsGenerating(false);
          return;
        }
      }
      
      // Log subscription status (non-blocking)
      console.log('[GeneratePlan] 🎯 Starting plan generation (subscription check will happen after plan is displayed)');

      if (!user) {
        throw new Error('No user data available');
      }

      // Use the new AI service for plan generation (two-stage pipeline)
      const startTime = Date.now();
      
      // Show a friendly message if generation exceeds 45 seconds
      slowTimerRef.current = setTimeout(() => {
        const msg = SLOW_PROMPTS[Math.floor(Math.random() * SLOW_PROMPTS.length)];
        Alert.alert('Crafting Your Plan', msg, [{ text: 'OK' }], { cancelable: true });
      }, 45000);

      const basePlan = await generateWeeklyBasePlan(user);
      
      // When complete, ensure we show the final phase briefly
      setCurrentPhase(3);
      
      const generationTime = Date.now() - startTime;
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
      
      // Log successful generation
      await logPlanGenerationAttempt('base', true, null, {
        generationTime,
        planDays: Object.keys(basePlan.days || {}).length,
        retryCount
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
      setHasError(false);
      
      // Wait extra time to ensure state propagates through React and AsyncStorage
      console.log('[GenerateBasePlan] ⏳ Waiting for state propagation...');
      
      // Navigation approach - Always go to plan-preview
      setTimeout(async () => {
        try {
          unlockNavigation();
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
      }, 1500);

    } catch (error) {
      // Clear timers
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
      
      console.error('❌ Error in plan generation screen:', error);
      
      // Determine error details
      const isBasePlanError = error instanceof BasePlanGenerationError;
      const errorStage = isBasePlanError ? (error as BasePlanGenerationError).stage : 'unknown';
      const errorDetails = isBasePlanError ? (error as BasePlanGenerationError).details : [];

      // Log the failure
      await logPlanGenerationAttempt('base', false, error, {
        userDataPresent: !!user,
        errorMessage: String(error),
        errorType: error instanceof Error ? error.name : 'Unknown',
        errorStage,
        retryCount
      });

      // Update state to show error UI
      setIsGenerating(false);
      setHasError(true);
      setLastRetryTime(Date.now());

      // Show error alert - NO FALLBACK, user stays on screen
      Alert.alert(
        "We're experiencing high demand",
        "Due to high demand, we're having trouble generating your plan. Please try again shortly.",
        [
          { 
            text: 'Go Home', 
            onPress: () => { 
              unlockNavigation(); 
              router.replace('/(tabs)/home'); 
            },
            style: 'cancel'
          },
          { 
            text: 'Try Again', 
            onPress: handleRetry
          },
        ],
        { cancelable: false }
      );
    }
  }, [user, addBasePlan, retryCount, handleRetry]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Animate through phases to simulate progress
    // Updated timing for two-stage pipeline (Generation + Verification)
    const phaseTimings = [3000, 10000, 18000]; // Faster progression
    
    const timeouts = phaseTimings.map((time, index) => {
      return setTimeout(() => {
        if (isGenerating && !hasError) {
          setCurrentPhase(index + 1);
        }
      }, time);
    });

    // Cycle health tips every 5 seconds
    const tipInterval = setInterval(() => {
      if (!hasError) {
        Animated.sequence([
          Animated.timing(tipFadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(tipFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true })
        ]).start();
        
        setTimeout(() => {
          setCurrentTipIndex(prev => (prev + 1) % HEALTH_TIPS.length);
        }, 300);
      }
    }, 5000);

    generatePlan();

    return () => {
      timeouts.forEach(clearTimeout);
      clearInterval(tipInterval);
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
    };
  }, []);

  // Ensure back/gesture takes user to home, not check-in or previous steps
  useEffect(() => {
    const unsubBeforeRemove = navigation.addListener('beforeRemove', (e: any) => {
      if (navLockedRef.current && !hasError) {
        e.preventDefault();
        return;
      }
    });
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (hasError) {
        unlockNavigation();
        router.replace('/(tabs)/home');
        return true;
      }
      return navLockedRef.current; // true => block
    });
    return () => {
      try { unsubBeforeRemove(); } catch {}
      try { backSub.remove(); } catch {}
    };
  }, [navigation, hasError]);

  // Helper to render phase item
  const renderPhaseItem = (phase: typeof GENERATION_PHASES[0], index: number) => {
    const isActive = index === currentPhase && !hasError;
    const isCompleted = index < currentPhase && !hasError;
    const isPending = index > currentPhase || hasError;
    const Icon = phase.icon;

    return (
      <View key={phase.id} style={styles.phaseRow}>
        <View style={[
          styles.phaseIconContainer, 
          isActive && styles.phaseIconActive,
          isCompleted && styles.phaseIconCompleted,
          hasError && styles.phaseIconError
        ]}>
          {isCompleted ? (
            <Check size={16} color="#FFFFFF" strokeWidth={3} />
          ) : isActive ? (
            <ActivityIndicator size="small" color={theme.color.accent.primary} />
          ) : (
            <View style={styles.phaseDot} />
          )}
        </View>
        <Text style={[
          styles.phaseText, 
          isActive && styles.phaseTextActive,
          isCompleted && styles.phaseTextCompleted,
          isPending && styles.phaseTextPending
        ]}>
          {phase.text}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          headerShown: false,
          gestureEnabled: false,
        }} 
      />
      
      <BasePlanSkeleton />

      <SafeAreaView style={styles.overlayContainer} pointerEvents="box-none">
        {/* Progress Card */}
        <View style={[styles.progressCard, hasError && styles.progressCardError]}>
          <Text style={styles.progressTitle}>
            {hasError ? 'Generation Paused' : 'Creating Your Plan'}
          </Text>
          <View style={styles.phasesContainer}>
            {GENERATION_PHASES.map((phase, index) => renderPhaseItem(phase, index))}
          </View>
          
          {/* Error state with retry button */}
          {hasError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>
                We encountered an issue generating your plan.
              </Text>
              <TouchableOpacity 
                style={styles.retryButton} 
                onPress={handleRetry}
                activeOpacity={0.7}
              >
                <RefreshCw size={18} color="#FFFFFF" />
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.homeButton} 
                onPress={() => {
                  unlockNavigation();
                  router.replace('/(tabs)/home');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.homeButtonText}>Go Home</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Floating Tip Card - hide on error */}
        {!hasError && (
          <Animated.View style={[styles.tipCard, { opacity: tipFadeAnim }]}>
            <View style={styles.tipHeader}>
              <Lightbulb size={16} color={theme.color.accent.primary} fill={theme.color.accent.primary + '20'} />
              <Text style={styles.tipLabel}>DID YOU KNOW?</Text>
            </View>
            <Text style={styles.tipText}>
              {HEALTH_TIPS[currentTipIndex]}
            </Text>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 60,
    zIndex: 10,
  },
  progressCard: {
    backgroundColor: theme.color.card,
    borderRadius: 24,
    padding: 24,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  progressCardError: {
    borderColor: theme.color.accent.red || '#FF6B6B',
  },
  progressTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: 20,
    textAlign: 'center',
  },
  phasesContainer: {
    gap: 16,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  phaseIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.color.bg,
    borderWidth: 1.5,
    borderColor: theme.color.line,
  },
  phaseIconActive: {
    borderColor: theme.color.accent.primary,
    backgroundColor: theme.color.bg,
  },
  phaseIconCompleted: {
    backgroundColor: theme.color.accent.primary,
    borderColor: theme.color.accent.primary,
  },
  phaseIconError: {
    borderColor: theme.color.muted,
    opacity: 0.5,
  },
  phaseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.muted,
    opacity: 0.3,
  },
  phaseText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.color.ink,
  },
  phaseTextActive: {
    color: theme.color.ink,
    fontWeight: '600',
  },
  phaseTextCompleted: {
    color: theme.color.muted,
    textDecorationLine: 'line-through',
  },
  phaseTextPending: {
    color: theme.color.muted,
    opacity: 0.6,
  },
  
  // Error state styles
  errorContainer: {
    marginTop: 24,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: theme.color.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.color.accent.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  homeButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  homeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.color.muted,
  },
  
  // Tip Card Styles
  tipCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    padding: 16,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    marginBottom: 20,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  tipLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.color.accent.primary,
    letterSpacing: 1,
  },
  tipText: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
});
