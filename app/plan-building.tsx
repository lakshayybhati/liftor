/**
 * Plan Building Screen
 * 
 * Shown while base plan is being generated in the background.
 * User can:
 * - Play a mini-game while waiting
 * - Leave and come back later (generation continues)
 * - See status updates
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Animated,
  BackHandler,
  AppState,
  AppStateStatus,
} from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Gamepad2, ArrowRight, Bell, Sparkles, Clock, RefreshCw } from 'lucide-react-native';
import { theme } from '@/constants/colors';
import { useUserStore } from '@/hooks/useUserStore';
import { useAuth } from '@/hooks/useAuth';
import PlanLoadingMiniGameOverlay from '@/components/PlanLoadingMiniGameOverlay';
import {
  getBasePlanJobState,
  BasePlanStatus,
  isBackgroundGenerationInProgress,
  retryBasePlanGeneration,
} from '@/services/backgroundPlanGeneration';

// ============================================================================
// COMPONENT
// ============================================================================

export default function PlanBuildingScreen() {
  const { user, addBasePlan, basePlans } = useUserStore();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  
  // State
  const [showMiniGame, setShowMiniGame] = useState(false);
  const [planStatus, setPlanStatus] = useState<BasePlanStatus>('pending');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  
  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  // Poll for status updates
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    const checkStatus = async () => {
      const state = await getBasePlanJobState(userId);
      setPlanStatus(state.status);
      
      // If ready, navigate to plan preview
      if (state.status === 'ready') {
        console.log('[PlanBuilding] Plan ready! Navigating to preview...');
        router.replace('/plan-preview');
      }
    };
    
    // Check immediately
    checkStatus();
    
    // Poll every 2 seconds
    interval = setInterval(checkStatus, 2000);
    
    return () => clearInterval(interval);
  }, [userId]);
  
  // Also check when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const state = await getBasePlanJobState(userId);
        setPlanStatus(state.status);
        
        if (state.status === 'ready') {
          router.replace('/plan-preview');
        }
      }
    });
    
    return () => subscription.remove();
  }, [userId]);
  
  // Elapsed time counter
  useEffect(() => {
    if (planStatus !== 'pending') return;
    
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [planStatus]);
  
  // Pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);
  
  // Fade in animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);
  
  // Prevent back navigation
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // Don't allow back - must either wait or explicitly leave
        return true;
      };
      
      BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    }, [])
  );
  
  // Handle retry
  const handleRetry = async () => {
    if (!user || isRetrying) return;
    
    setIsRetrying(true);
    setPlanStatus('pending');
    setElapsedTime(0);
    
    try {
      await retryBasePlanGeneration(user, userId, addBasePlan);
    } catch (error) {
      console.error('[PlanBuilding] Retry failed:', error);
    } finally {
      setIsRetrying(false);
    }
  };
  
  // Handle mini-game end
  const handleGameEnd = (score: number) => {
    console.log('[PlanBuilding] Game ended with score:', score);
    // Game overlay handles its own closing
  };
  
  // Handle leaving screen
  const handleLeave = () => {
    console.log('[PlanBuilding] User leaving - generation continues in background');
    router.replace('/(tabs)/home');
  };
  
  // Format elapsed time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };
  
  // Get status message
  const getStatusMessage = () => {
    switch (planStatus) {
      case 'pending':
        return "We're building your personalized plan";
      case 'ready':
        return "Your plan is ready!";
      case 'error':
        return "Something went wrong";
      default:
        return "Starting...";
    }
  };
  
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      
      <LinearGradient
        colors={['#0a0a0a', '#1a1a2e', '#0a0a0a']}
        style={styles.container}
      >
        <SafeAreaView style={styles.safeArea}>
          <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
            {/* Header */}
            <View style={styles.header}>
              <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
                <Sparkles size={48} color={theme.color.accent} />
              </Animated.View>
              <Text style={styles.title}>{getStatusMessage()}</Text>
              
              {planStatus === 'pending' && (
                <View style={styles.timerContainer}>
                  <Clock size={16} color={theme.color.muted} />
                  <Text style={styles.timerText}>{formatTime(elapsedTime)}</Text>
                </View>
              )}
            </View>
            
            {/* Info Card */}
            <View style={styles.infoCard}>
              <Bell size={24} color={theme.color.accent} style={styles.infoIcon} />
              <Text style={styles.infoTitle}>You'll get a notification</Text>
              <Text style={styles.infoText}>
                We'll notify you when your plan is ready. You can keep the app in the background, 
                play a game while you wait, or come back later.
              </Text>
            </View>
            
            {/* Status-specific content */}
            {planStatus === 'error' && (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Generation Failed</Text>
                <Text style={styles.errorText}>
                  We had trouble creating your plan. This can happen due to high demand. 
                  Please try again.
                </Text>
                <TouchableOpacity 
                  style={styles.retryButton} 
                  onPress={handleRetry}
                  disabled={isRetrying}
                >
                  <RefreshCw size={20} color="#fff" />
                  <Text style={styles.retryButtonText}>
                    {isRetrying ? 'Retrying...' : 'Try Again'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Action Buttons */}
            <View style={styles.actions}>
              {/* Play Game Button */}
              <TouchableOpacity
                style={styles.gameButton}
                onPress={() => setShowMiniGame(true)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[theme.color.accent, '#ff6b4a']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.gameButtonGradient}
                >
                  <Gamepad2 size={24} color="#fff" />
                  <Text style={styles.gameButtonText}>Play a Game</Text>
                </LinearGradient>
              </TouchableOpacity>
              
              {/* Leave Button */}
              <TouchableOpacity
                style={styles.leaveButton}
                onPress={handleLeave}
                activeOpacity={0.7}
              >
                <Text style={styles.leaveButtonText}>I'll come back later</Text>
                <ArrowRight size={18} color={theme.color.muted} />
              </TouchableOpacity>
            </View>
            
            {/* Tips */}
            <View style={styles.tipsContainer}>
              <Text style={styles.tipsTitle}>Did you know?</Text>
              <Text style={styles.tipsText}>
                Your plan is customized based on your goals, experience level, available equipment, 
                and dietary preferences. This takes a moment to get right!
              </Text>
            </View>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>
      
      {/* Mini-Game Overlay */}
      <PlanLoadingMiniGameOverlay
        visible={showMiniGame}
        planStatus={planStatus === 'pending' ? 'loading' : planStatus === 'ready' ? 'success' : 'error'}
        onGameEnd={handleGameEnd}
        loadingMessage="Building your plan..."
        onExit={() => setShowMiniGame(false)}
      />
    </>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 87, 51, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
    marginBottom: 8,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  timerText: {
    fontSize: 14,
    color: theme.color.muted,
    fontWeight: '500',
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoIcon: {
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: theme.color.muted,
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: theme.color.muted,
    lineHeight: 20,
    marginBottom: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actions: {
    gap: 16,
    marginBottom: 32,
  },
  gameButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  gameButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  gameButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  leaveButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.color.muted,
  },
  tipsContainer: {
    marginTop: 'auto',
    paddingBottom: 24,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.accent,
    marginBottom: 8,
  },
  tipsText: {
    fontSize: 13,
    color: theme.color.muted,
    lineHeight: 18,
    opacity: 0.8,
  },
});

