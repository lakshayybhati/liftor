/**
 * Plan Building Screen
 * 
 * Shows while base plan is being generated in the background.
 * Premium, aesthetic loading screen with glassmorphism and smooth animations.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
  TouchableOpacity,
  Platform,
  BackHandler,
  AppState,
  AppStateStatus,
  Dimensions,
  Easing
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Dumbbell, Apple, Brain, Sparkles, RefreshCw, Clock, Lightbulb, Gamepad2, ArrowRight, Check, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { theme } from '@/constants/colors';
import { useUserStore } from '@/hooks/useUserStore';
import { useAuth } from '@/hooks/useAuth';
import { BasePlanSkeleton } from '@/components/BasePlanSkeleton';
import PlanLoadingMiniGameOverlay from '@/components/PlanLoadingMiniGameOverlay';
import { saveGameScore } from '@/utils/game-storage';
import {
  getSmartEstimate,
  formatTimeEstimate,
  getProgressMessage,
  getRemainingTimeMessage,
} from '@/utils/plan-time-estimator';
import {
  getActiveJob,
  getMostRecentJob,
  getJobStatus,
  createAndTriggerServerPlanJob,
  triggerQueueProcessing,
  resetStuckJob,
  cancelJob,
  isJobStuck,
  ServerPlanJob,
} from '@/utils/server-plan-generation';

// Status type for display (simplified from server status)
type BasePlanStatus = 'pending' | 'ready' | 'error' | 'idle';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Default fallback values - will be replaced by intelligent estimates
const DEFAULT_ESTIMATED_TIME_SECONDS = 360; // 6 minutes based on real testing (5-7 min typical)
const GAME_SHOW_DELAY_SECONDS = 30; // Show game option after 30 seconds

// Error codes that should trigger auto-retry on client
// These match server-side retry behavior
const RECOVERABLE_ERROR_CODES = new Set([
  'AI_TIMEOUT',
  'RATE_LIMITED',
  'JSON_PARSE_ERROR',
  'UNEXPECTED_ERROR',
  'VALIDATION_FAILED',
  'AI_ERROR',
]);

const GENERATION_PHASES = [
  { id: 0, text: "Designing your weekly split", icon: Brain },
  { id: 1, text: "Building daily workouts", icon: Dumbbell },
  { id: 2, text: "Tuning nutrition to match training", icon: Apple },
  { id: 3, text: "Finalizing your custom plan", icon: Sparkles },
];

const HEALTH_TIPS = [
  "Your muscles are an endocrine organ. They release 'myokines' that fight inflammation and boost brain health.",
  "Music can increase strength output by 15%. It triggers 'psycho-motor arousal' that primes your nervous system.",
  "Grip strength is one of the most reliable predictors of overall longevity and heart health.",
  "The 'Afterburn Effect' (EPOC) keeps your body burning calories for hours after a heavy strength session.",
  "Human Growth Hormone (HGH) spikes during deep sleep. That's when your muscles actually grow, not at the gym.",
  "The 'lowering' phase of a lift (eccentric) builds more muscle than the lifting phase. Control the descent!",
  "Exercise releases BDNF, a protein that acts like 'fertilizer' for your brain cells and improves memory.",
  "A 3% drop in hydration can reduce strength by 10%. Water is the most underrated performance supplement.",
  "More muscle mass improves insulin sensitivity, making your body better at using carbs for fuel instead of fat storage.",
  "Focusing mentally on the muscle you're working (mind-muscle connection) creates higher muscle fiber activation."
];

const { width } = Dimensions.get('window');

// ============================================================================
// COMPONENT
// ============================================================================

export default function PlanBuildingScreen() {
  const { user, addBasePlan } = useUserStore();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  // Get redo reason from params (if this is a redo request)
  const params = useLocalSearchParams<{ redoReason?: string }>();
  const redoReason = params.redoReason;
  const isRedoRequest = !!redoReason;

  // State
  const [planStatus, setPlanStatus] = useState<BasePlanStatus>('pending');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showMiniGame, setShowMiniGame] = useState(false);
  const [showLongWaitMessage, setShowLongWaitMessage] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Server-side job tracking
  const [serverJobId, setServerJobId] = useState<string | null>(null);
  const [useServerGeneration, setUseServerGeneration] = useState(false);

  // Intelligent time estimation state
  const [estimatedTime, setEstimatedTime] = useState(DEFAULT_ESTIMATED_TIME_SECONDS);
  const [minTime, setMinTime] = useState(180); // 3 min minimum
  const [maxTime, setMaxTime] = useState(480); // 8 min max
  const [estimateConfidence, setEstimateConfidence] = useState<'low' | 'medium' | 'high'>('low');
  const [progressMessage, setProgressMessage] = useState('Analyzing your profile...');
  const [errorDetails, setErrorDetails] = useState<{ code?: string | null; message?: string | null } | null>(null);

  // Cancel button state
  const [canCancel, setCanCancel] = useState(true);
  const [cancelTimer, setCancelTimer] = useState(10);
  const cancelButtonFade = useRef(new Animated.Value(1)).current;

  // Animations
  const tipFadeAnim = useRef(new Animated.Value(1)).current;
  const gameOptionFadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const autoRetryJobIdsRef = useRef<Set<string>>(new Set());
  const errorDetailsRef = useRef<{ code?: string | null; message?: string | null } | null>(null);
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    errorDetailsRef.current = errorDetails;
  }, [errorDetails]);

  // Start pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );

    if (planStatus === 'pending') {
      pulse.start();
    } else {
      pulse.stop();
      pulseAnim.setValue(1);
    }

    return () => pulse.stop();
  }, [planStatus]);

  // --------------------------------------------------------------------------
  // 1. Lifecycle & Status Polling
  // --------------------------------------------------------------------------

  // Cancel timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCancelTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          // Fade out before removing
          Animated.timing(cancelButtonFade, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true
          }).start(() => setCanCancel(false));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Fetch intelligent time estimate on mount
  useEffect(() => {
    const fetchEstimate = async () => {
      if (!user) return;

      try {
        const estimate = await getSmartEstimate(user);
        setEstimatedTime(estimate.estimatedSeconds);
        setMinTime(estimate.minSeconds);
        setMaxTime(estimate.maxSeconds);
        setEstimateConfidence(estimate.confidence);

        console.log('[PlanBuilding] Smart estimate loaded:', {
          estimated: estimate.estimatedSeconds,
          min: estimate.minSeconds,
          max: estimate.maxSeconds,
          confidence: estimate.confidence,
          source: estimate.source,
          complexity: estimate.complexity,
        });
      } catch (error) {
        console.warn('[PlanBuilding] Failed to get smart estimate, using defaults');
      }
    };

    fetchEstimate();
  }, [user]);

  // Validate job state on mount - SERVER ONLY
  useEffect(() => {
    const validateOnMount = async () => {
      // Check for active server-side job
      console.log('[PlanBuilding] Checking for server-side job...');
      const serverJob = await getActiveJob();

      if (serverJob && (serverJob.status === 'pending' || serverJob.status === 'processing')) {
        console.log('[PlanBuilding] Found active server job:', serverJob.id, 'status:', serverJob.status);
        setServerJobId(serverJob.id);
        setUseServerGeneration(true);
        setPlanStatus('pending');

        // Ensure the processor is triggered for pending jobs
        if (serverJob.status === 'pending') {
          console.log('[PlanBuilding] Job is pending, triggering queue processor...');
          triggerQueueProcessing().catch((err) => {
            console.warn('[PlanBuilding] Failed to trigger processing:', err);
          });
        }
        return;
      }

      // Check if server job recently completed
      if (serverJob && serverJob.status === 'completed') {
        console.log('[PlanBuilding] Server job already completed, fetching plan...');
        const result = await getJobStatus(serverJob.id);
        if (result.success && result.plan) {
          await addBasePlan(result.plan);
          if (!hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
            router.replace('/plan-preview');
          }
          return;
        }
      }

      // No active job found - check for recently completed job
      // This handles the case where the job completed very quickly before the screen mounted
      console.log('[PlanBuilding] No active server job found, checking for recent completed job...');
      const recentJob = await getMostRecentJob();

      if (recentJob) {
        console.log('[PlanBuilding] Found recent job:', recentJob.id, 'status:', recentJob.status);

        if (recentJob.status === 'completed' && recentJob.result_plan_id) {
          console.log('[PlanBuilding] Recent job completed, fetching plan...');
          const result = await getJobStatus(recentJob.id);
          if (result.success && result.plan) {
            await addBasePlan(result.plan);
            if (!hasNavigatedRef.current) {
              hasNavigatedRef.current = true;
              router.replace('/plan-preview');
            }
            return;
          }
        }

        // If recent job is still pending/processing, track it
        if (recentJob.status === 'pending' || recentJob.status === 'processing') {
          console.log('[PlanBuilding] Recent job still in progress, tracking...');
          setServerJobId(recentJob.id);
          setUseServerGeneration(true);
          setPlanStatus('pending');

          if (recentJob.status === 'pending') {
            triggerQueueProcessing().catch((err) => {
              console.warn('[PlanBuilding] Failed to trigger processing:', err);
            });
          }
          return;
        }
      }

      // No active or recent job found - redirect to home
      console.log('[PlanBuilding] No active or recent server job found, redirecting to home');
      if (!hasNavigatedRef.current) {
        hasNavigatedRef.current = true;
        router.replace('/(tabs)/home');
      }
    };

    validateOnMount();
  }, [userId, addBasePlan]);

  // Poll for status updates - SERVER ONLY
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    let lastStuckResetAttempt = 0;
    let lastFallbackCheck = 0;

    const checkStatus = async () => {
      // If no serverJobId, try to find any active job as fallback
      if (!serverJobId) {
        const now = Date.now();
        // Only check fallback every 5 seconds to avoid spam
        if (now - lastFallbackCheck > 5000) {
          lastFallbackCheck = now;
          console.log('[PlanBuilding] No server job ID, checking for any active job...');
          const fallbackJob = await getActiveJob();
          if (fallbackJob) {
            console.log('[PlanBuilding] Found fallback job:', fallbackJob.id, 'status:', fallbackJob.status);
            if (fallbackJob.status === 'completed') {
              const result = await getJobStatus(fallbackJob.id);
              if (result.success && result.plan) {
                console.log('[PlanBuilding] 🎉 Fallback: Plan ready! Navigating...');
                await addBasePlan(result.plan);
                setPlanStatus('ready');
                if (!hasNavigatedRef.current) {
                  hasNavigatedRef.current = true;
                  router.replace('/plan-preview');
                }
                return;
              }
            } else if (fallbackJob.status === 'pending' || fallbackJob.status === 'processing') {
              // Found an active job, update state to track it
              console.log('[PlanBuilding] Found active job, updating state to track:', fallbackJob.id);
              setServerJobId(fallbackJob.id);
            }
          }
        }
        return;
      }

      const result = await getJobStatus(serverJobId);

      if (result.success && result.job) {
        const serverStatus = result.job.status;
        console.log('[PlanBuilding] Server job status:', serverStatus, 'hasPlan:', !!result.plan);

        if (serverStatus === 'completed') {
          if (result.plan) {
            console.log('[PlanBuilding] 🎉 Server plan ready! Saving and navigating...');
            setErrorDetails(null);
            // Save the plan from server to local store
            await addBasePlan(result.plan);
            setPlanStatus('ready');
            if (!hasNavigatedRef.current) {
              hasNavigatedRef.current = true;
              router.replace('/plan-preview');
            }
            return;
          } else {
            // Job completed but plan not returned - this can happen with RLS or timing issues
            // Try fetching the latest plan from the store directly
            console.warn('[PlanBuilding] ⚠️ Job completed but plan not returned, trying fallback fetch...');
            console.log('[PlanBuilding] result_plan_id:', result.job.result_plan_id);

            // Navigate anyway - the plan should be in the database
            // The plan-preview screen will fetch it
            setErrorDetails(null);
            setPlanStatus('ready');
            if (!hasNavigatedRef.current) {
              hasNavigatedRef.current = true;
              router.replace('/plan-preview');
            }
            return;
          }
        }

        if (serverStatus === 'failed') {
          console.log('[PlanBuilding] Server job failed:', result.job.error_message);
          const jobError = {
            code: result.job.error_code,
            message: result.job.error_message,
          };
          if (
            serverJobId &&
            jobError.code &&
            RECOVERABLE_ERROR_CODES.has(jobError.code) &&
            !autoRetryJobIdsRef.current.has(serverJobId)
          ) {
            console.log('[PlanBuilding] Recoverable error detected, auto-retrying...');
            autoRetryJobIdsRef.current.add(serverJobId);
            setProgressMessage('We hit a hiccup, retrying automatically...');
            await handleRetry();
            return;
          }
          setErrorDetails(jobError);
          setPlanStatus('error');
          return;
        }

        // Still processing
        if (serverStatus === 'pending' || serverStatus === 'processing') {
          if (errorDetailsRef.current) {
            setErrorDetails(null);
          }
          setPlanStatus('pending');

          // Check if job appears stuck (processing for too long)
          if (serverStatus === 'processing' && isJobStuck(result.job)) {
            const now = Date.now();
            // Only attempt reset once per minute to avoid spam
            if (now - lastStuckResetAttempt > 60000) {
              lastStuckResetAttempt = now;
              console.log('[PlanBuilding] ⚠️ Job appears stuck, attempting reset...');
              const resetSuccess = await resetStuckJob(serverJobId);
              if (resetSuccess) {
                console.log('[PlanBuilding] ✅ Job reset, triggering processor...');
                triggerQueueProcessing().catch(() => { });
              }
            }
          }

          // Re-trigger processor periodically for pending jobs (every 30 seconds)
          if (serverStatus === 'pending' && elapsedSeconds > 0 && elapsedSeconds % 30 === 0) {
            console.log('[PlanBuilding] Re-triggering queue processor for pending job...');
            triggerQueueProcessing().catch(() => { });
          }
        }
      } else {
        console.warn('[PlanBuilding] getJobStatus failed:', result.error);
      }
    };

    // Poll every 2 seconds
    interval = setInterval(checkStatus, 2000);
    // Also check immediately on mount
    checkStatus();
    return () => clearInterval(interval);
  }, [serverJobId, addBasePlan]); // Removed elapsedSeconds to prevent re-running effect on every tick

  // Check on app resume - SERVER ONLY
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[PlanBuilding] App resumed, checking server job status...');

        // Check for active server job
        const serverJob = await getActiveJob();

        if (serverJob) {
          if (serverJob.status === 'completed') {
            console.log('[PlanBuilding] Server plan ready on resume!');
            const result = await getJobStatus(serverJob.id);
            if (result.success && result.plan) {
              await addBasePlan(result.plan);
              setPlanStatus('ready');
              if (!hasNavigatedRef.current) {
                hasNavigatedRef.current = true;
                router.replace('/plan-preview');
              }
              return;
            }
          }
          if (serverJob.status === 'failed') {
            console.log('[PlanBuilding] Server job failed');
            setPlanStatus('error');
            return;
          }
          // Update job ID if we found one
          if (serverJob.status === 'pending' || serverJob.status === 'processing') {
            setServerJobId(serverJob.id);
            setUseServerGeneration(true);
            setPlanStatus('pending');
          }
        }
      }
    });
    return () => subscription.remove();
  }, [addBasePlan]);

  // --------------------------------------------------------------------------
  // 2. UI Logic (Timers, Phases, Tips)
  // --------------------------------------------------------------------------

  // Elapsed time counter & Dynamic progress updates
  useEffect(() => {
    if (planStatus !== 'pending') return;

    const interval = setInterval(() => {
      setElapsedSeconds(prev => {
        const newTime = prev + 1;

        // Update progress bar based on intelligent estimate
        // Cap at 95% until actually complete
        const progress = Math.min(newTime / estimatedTime, 0.95);
        Animated.timing(progressAnim, {
          toValue: progress,
          duration: 1000,
          useNativeDriver: false,
        }).start();

        // Get dynamic progress message
        const { message, isDelayed, showGame } = getProgressMessage(newTime, estimatedTime, maxTime);
        setProgressMessage(message);

        // Show game option after fixed delay
        if (newTime >= GAME_SHOW_DELAY_SECONDS && !showLongWaitMessage) {
          setShowLongWaitMessage(true);
          Animated.timing(gameOptionFadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }).start();
        }

        return newTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [planStatus, showLongWaitMessage, estimatedTime, maxTime]);

  // Simulate phase progress based on intelligent estimate
  // Phases are distributed across the estimated time
  useEffect(() => {
    if (planStatus !== 'pending') return;

    // Distribute phases across 90% of estimated time
    // Phase 0: 0-25% (Analyzing profile)
    // Phase 1: 25-50% (Structuring workouts)
    // Phase 2: 50-75% (Verifying plan)
    // Phase 3: 75-90% (Finalizing)
    const phasePercentages = [0.25, 0.50, 0.75];
    const phaseTimings = phasePercentages.map(p => Math.round(estimatedTime * p * 1000));

    const timeouts = phaseTimings.map((time, index) => {
      return setTimeout(() => {
        setCurrentPhase(index + 1);
      }, time);
    });

    return () => timeouts.forEach(clearTimeout);
  }, [planStatus, estimatedTime]);

  // Cycle health tips
  useEffect(() => {
    const tipInterval = setInterval(() => {
      if (planStatus === 'pending') {
        Animated.sequence([
          Animated.timing(tipFadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(tipFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true })
        ]).start();

        setTimeout(() => {
          setCurrentTipIndex(prev => (prev + 1) % HEALTH_TIPS.length);
        }, 300);
      }
    }, 7000);

    return () => clearInterval(tipInterval);
  }, [planStatus]);

  // Prevent back navigation (unless error)
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (planStatus === 'error') {
          router.replace('/(tabs)/home');
          return true;
        }
        // Allow explicit "cancel" action via button, but block hardware back to prevent accidental exit
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [planStatus])
  );

  // --------------------------------------------------------------------------
  // 3. Handlers
  // --------------------------------------------------------------------------

  async function handleRetry() {
    if (!user || isRetrying) return;

    setIsRetrying(true);
    setErrorDetails(null);
    setPlanStatus('pending');
    setElapsedSeconds(0);
    setCurrentPhase(0);
    setShowLongWaitMessage(false);
    setCanCancel(true);
    setCancelTimer(10);
    cancelButtonFade.setValue(1);
    progressAnim.setValue(0);
    setProgressMessage('Retrying plan generation...');

    // Refresh estimate for retry (slightly increase expected time)
    try {
      const estimate = await getSmartEstimate(user);
      // Add a small buffer for retries since they often take longer
      setEstimatedTime(Math.round(estimate.estimatedSeconds * 1.1));
      setMinTime(estimate.minSeconds);
      setMaxTime(estimate.maxSeconds);
    } catch (e) {
      // Keep existing estimate
    }

    try {
      // Retry via server-side generation ONLY
      console.log('[PlanBuilding] Retrying via server-side generation...');
      const serverResult = await createAndTriggerServerPlanJob(user);

      if (serverResult.success) {
        const jobId = serverResult.jobId || serverResult.existingJobId;
        console.log('[PlanBuilding] Server retry started, job ID:', jobId);
        setServerJobId(jobId || null);
        setUseServerGeneration(true);
        if (jobId) {
          autoRetryJobIdsRef.current.delete(jobId);
        }
      } else {
        console.error('[PlanBuilding] Server retry failed:', serverResult.error);
        setPlanStatus('error');
      }
    } catch (error) {
      console.error('[PlanBuilding] Retry failed:', error);
      setPlanStatus('error');
    } finally {
      setIsRetrying(false);
    }
  }

  const handleCancel = async () => {
    console.log('[PlanBuilding] User cancelling generation');

    // Cancel the server-side job if one exists
    if (serverJobId) {
      try {
        await cancelJob(serverJobId);
        console.log('[PlanBuilding] Server job cancelled');
      } catch (e) {
        console.warn('[PlanBuilding] Failed to cancel server job:', e);
      }
    }

    setErrorDetails(null);

    router.replace('/onboarding'); // Redirect to onboarding to restart
  };

  const handleGameEnd = async (score: number) => {
    console.log('[PlanBuilding] Game ended with score:', score);
    try {
      if (score > 0) {
        await saveGameScore(score, userId ?? undefined);
      }
    } catch (error) {
      console.warn('[PlanBuilding] Failed to save game score', error);
    }
  };

  // --------------------------------------------------------------------------
  // 4. Render Helpers
  // --------------------------------------------------------------------------

  const renderPhaseItem = (phase: typeof GENERATION_PHASES[0], index: number) => {
    const isActive = index === currentPhase && planStatus === 'pending';
    const isCompleted = index < currentPhase && planStatus === 'pending';
    const isPending = index > currentPhase || planStatus === 'error';
    const isLast = index === GENERATION_PHASES.length - 1;

    return (
      <View key={phase.id} style={styles.phaseWrapper}>
        <View style={styles.phaseRow}>
          {/* Icon / Indicator */}
          <View style={styles.indicatorColumn}>
            <View style={[
              styles.phaseIconContainer,
              isActive && styles.phaseIconActive,
              isCompleted && styles.phaseIconCompleted,
              planStatus === 'error' && styles.phaseIconError
            ]}>
              {isCompleted ? (
                <Check size={14} color="#000" strokeWidth={3} />
              ) : isActive ? (
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <phase.icon size={16} color={theme.color.accent.primary} />
                </Animated.View>
              ) : (
                <View style={styles.phaseDot} />
              )}
            </View>

            {/* Vertical Line */}
            {!isLast && (
              <View style={[
                styles.connectorLine,
                isCompleted && styles.connectorLineCompleted
              ]} />
            )}
          </View>

          {/* Text */}
          <View style={styles.phaseContent}>
            <Text style={[
              styles.phaseText,
              isActive && styles.phaseTextActive,
              isCompleted && styles.phaseTextCompleted,
              isPending && styles.phaseTextPending
            ]}>
              {phase.text}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      {/* Deep Background Gradient */}
      <LinearGradient
        colors={[theme.color.bg, '#1F0A0A', '#2A0F0F']} // Subtle deep red shift
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Background Skeleton */}
      <BasePlanSkeleton />

      {/* Premium Overlay */}
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.overlayContainer} pointerEvents="box-none">

        {/* Top Right: Cancel Button (Fades out) */}
        {canCancel && (
          <Animated.View
            style={[styles.cancelButtonContainer, { opacity: cancelButtonFade }]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              activeOpacity={0.7}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <Text style={styles.cancelButtonText}>Cancel ({cancelTimer}s)</Text>
              <X size={14} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Main Content Centered */}
        <View style={styles.centerContent}>

          {/* Header */}
          <View style={styles.headerContainer}>
            <Text style={styles.progressTitle}>
              {planStatus === 'error' ? 'Generation Paused' : isRedoRequest ? 'Regenerating Your Plan' : 'Creating Your Plan'}
            </Text>
            <Text style={styles.progressSubtitle}>
              {isRedoRequest ? 'Applying your feedback' : 'Crafting your perfect plan'}
            </Text>
            {isRedoRequest && redoReason && (
              <View style={styles.redoReasonBadge}>
                <Text style={styles.redoReasonLabel}>Your request:</Text>
                <Text style={styles.redoReasonText} numberOfLines={2}>"{redoReason}"</Text>
              </View>
            )}
          </View>

          {/* Main Progress Card */}
          <LinearGradient
            colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.progressCard, planStatus === 'error' && styles.progressCardError]}
          >
            {/* Progress Bar (Top Border) */}
            {planStatus === 'pending' && (
              <View style={styles.progressBarBg}>
                <Animated.View
                  style={[
                    styles.progressBarFill,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%']
                      })
                    }
                  ]}
                />
              </View>
            )}

            <View style={styles.phasesContainer}>
              {GENERATION_PHASES.map((phase, index) => renderPhaseItem(phase, index))}
            </View>

            {/* Error State */}
            {planStatus === 'error' && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                  {errorDetails?.code === 'RATE_LIMITED' ? 'Our AI service is busy right now.' :
                    errorDetails?.code === 'AI_TIMEOUT' ? 'This is taking longer than expected.' :
                      errorDetails?.code === 'VALIDATION_FAILED' ? 'We need to adjust your plan details.' :
                        errorDetails?.code?.includes('REDO') ? 'We couldn\'t apply your changes.' :
                          'We encountered an issue generating your plan.'}
                </Text>
                {errorDetails && (
                  <Text style={styles.errorDetailText}>
                    {errorDetails.code?.includes('REDO')
                      ? 'Try using the "Edit Day" option to make specific changes to individual days.'
                      : (errorDetails.message || 'Please try again in a moment.')}
                  </Text>
                )}
                <View style={styles.errorButtonRow}>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={handleRetry}
                    disabled={isRetrying}
                    activeOpacity={0.7}
                  >
                    <RefreshCw size={18} color="#FFFFFF" />
                    <Text style={styles.retryButtonText}>
                      {isRetrying ? 'Retrying...' : 'Try Again'}
                    </Text>
                  </TouchableOpacity>
                  {errorDetails?.code?.includes('REDO') && (
                    <TouchableOpacity
                      style={[styles.retryButton, styles.secondaryButton]}
                      onPress={() => router.replace('/plan-preview')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.retryButtonText}>Edit Days Instead</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </LinearGradient>

          {/* Timer / Status */}
          {planStatus === 'pending' && (
            <View style={styles.timerContainer}>
              <Clock size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.timerText}>
                {getRemainingTimeMessage(elapsedSeconds, estimatedTime)}
              </Text>
              {estimateConfidence === 'high' && (
                <View style={styles.confidenceBadge}>
                  <Text style={styles.confidenceText}>●</Text>
                </View>
              )}
            </View>
          )}

          {/* Game Option */}
          {showLongWaitMessage && planStatus === 'pending' && (
            <Animated.View style={[styles.gameOptionContainer, { opacity: gameOptionFadeAnim }]}>
              <Text style={styles.gameOptionText}>
                {elapsedSeconds > estimatedTime
                  ? 'Taking a bit longer than expected...'
                  : 'Want to play while you wait?'}
              </Text>
              <TouchableOpacity
                style={styles.miniGameButton}
                onPress={() => setShowMiniGame(true)}
              >
                <LinearGradient
                  colors={[theme.color.accent.primary, '#FF6B6B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.miniGameButtonGradient}
                >
                  <Gamepad2 size={16} color="#FFF" />
                  <Text style={styles.miniGameButtonText}>Play Mini-Game</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>

        {/* Floating Tip Card (Hide on error) */}
        {planStatus !== 'error' && (
          <Animated.View style={[styles.tipCard, { opacity: tipFadeAnim }]}>
            <View style={styles.tipIcon}>
              <Lightbulb size={18} color={theme.color.accent.yellow} fill={theme.color.accent.yellow + '40'} />
            </View>
            <View style={styles.tipContent}>
              <Text style={styles.tipLabel}>DID YOU KNOW?</Text>
              <Text style={styles.tipText}>
                {HEALTH_TIPS[currentTipIndex]}
              </Text>
            </View>
          </Animated.View>
        )}
      </SafeAreaView>

      {/* Mini-Game Overlay */}
      <PlanLoadingMiniGameOverlay
        visible={showMiniGame}
        planStatus={planStatus === 'pending' ? 'loading' : planStatus === 'ready' ? 'success' : 'error'}
        onGameEnd={handleGameEnd}
        loadingMessage="Building your plan..."
        onExit={() => setShowMiniGame(false)}
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    zIndex: 10,
  },
  centerContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },

  // Header
  headerContainer: {
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  progressTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  progressSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  redoReasonBadge: {
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 12,
    maxWidth: '90%',
  },
  redoReasonLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  redoReasonText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontStyle: 'italic',
    lineHeight: 20,
  },

  // Cancel Button
  cancelButtonContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    zIndex: 100,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },

  // Progress Card
  progressCard: {
    borderRadius: 24,
    padding: 24,
    width: width * 0.85,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginBottom: 24,
  },
  progressCardError: {
    borderColor: theme.color.accent.primary,
  },
  progressBarBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.color.accent.primary,
    borderRadius: 2,
  },

  // Phases
  phasesContainer: {
    gap: 0, // Handled by connector
    paddingTop: 8,
  },
  phaseWrapper: {
    marginBottom: 0,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 44, // Give space for connector
  },
  indicatorColumn: {
    alignItems: 'center',
    width: 30,
    marginRight: 16,
  },
  phaseIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 2,
  },
  phaseIconActive: {
    borderColor: theme.color.accent.primary,
    backgroundColor: 'rgba(255,68,68,0.1)',
  },
  phaseIconCompleted: {
    backgroundColor: theme.color.accent.green,
    borderColor: theme.color.accent.green,
  },
  phaseIconError: {
    borderColor: theme.color.muted,
    opacity: 0.5,
  },
  phaseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  connectorLine: {
    width: 2,
    flex: 1, // Fill remaining height
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 4,
    minHeight: 20,
  },
  connectorLineCompleted: {
    backgroundColor: theme.color.accent.green,
    opacity: 0.3,
  },
  phaseContent: {
    flex: 1,
    paddingTop: 2,
    paddingBottom: 24,
  },
  phaseText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
  },
  phaseTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
    textShadowColor: 'rgba(255,68,68,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  phaseTextCompleted: {
    color: 'rgba(255,255,255,0.4)',
  },
  phaseTextPending: {
    color: 'rgba(255,255,255,0.3)',
  },

  // Timer
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    fontVariant: ['tabular-nums'],
  },
  confidenceBadge: {
    marginLeft: 4,
  },
  confidenceText: {
    fontSize: 8,
    color: theme.color.accent.green,
  },

  // Error State
  errorContainer: {
    marginTop: 16,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: theme.color.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorDetailText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.color.accent.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    shadowColor: theme.color.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  errorButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },

  // Game Option
  gameOptionContainer: {
    marginTop: 24,
    alignItems: 'center',
    gap: 12,
  },
  gameOptionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  miniGameButton: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: theme.color.accent.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  miniGameButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  miniGameButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Tips
  tipCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    padding: 16,
    width: width * 0.9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 20,
    gap: 16,
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,210,94,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipContent: {
    flex: 1,
  },
  tipLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.color.accent.yellow,
    letterSpacing: 1,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
    fontWeight: '500',
  },
});
