import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Alert, 
  TextInput, 
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { 
  ChevronLeft, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  Edit2, 
  Check, 
  X, 
  Trash2,
  Play,
  Pause,
  Eye,
  Calendar,
  Dumbbell,
  Target,
  AlertTriangle,
  Info,
  Archive,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';
import type { WeeklyBasePlan } from '@/types/user';
import { 
  getLocalPlans, 
  saveLocalPlan, 
  updateLocalPlanStatus, 
  renameLocalPlan, 
  deleteLocalPlan,
  hasSeenDataWarning,
  markDataWarningShown,
  calculatePlanStats,
  type LocalPlanWithStats,
} from '@/utils/localPlanStorage';
import { useAuth } from '@/hooks/useAuth';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ManagePlansScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? 'anon';
  const { basePlans, checkins, plans, activateBasePlan: storeActivatePlan, user } = useUserStore();
  
  // State
  const [localPlans, setLocalPlans] = useState<LocalPlanWithStats[]>([]);
  const [renamingPlanId, setRenamingPlanId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [isActivating, setIsActivating] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showDataWarning, setShowDataWarning] = useState(false);
  const [selectedPlanForStats, setSelectedPlanForStats] = useState<LocalPlanWithStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Animation for warning modal
  const warningAnim = useState(new Animated.Value(0))[0];

  // Load and merge all plans from local storage and store
  useEffect(() => {
    const loadPlans = async () => {
      setIsLoading(true);
      try {
        // Check if we need to show data warning
        const hasSeenWarning = await hasSeenDataWarning(userId);
        if (!hasSeenWarning && basePlans.length > 0) {
          setShowDataWarning(true);
          Animated.spring(warningAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }).start();
        }
        
        // Load local plans from storage
        const storedLocalPlans = await getLocalPlans(userId);
        
        // Create a map of all plans by ID (merge local + store)
        const planMap = new Map<string, LocalPlanWithStats>();
        
        // First, add all basePlans from the store (source of truth for current state)
        for (const plan of basePlans) {
          const stats = calculatePlanStats(plan, checkins, plans);
          planMap.set(plan.id, {
            ...plan,
            localId: plan.id,
            savedAt: plan.createdAt,
            stats: stats || plan.stats || {},
          });
        }
        
        // Then merge in any additional local plans (historical plans not in store)
        for (const localPlan of storedLocalPlans) {
          const planId = localPlan.id || localPlan.localId;
          if (!planMap.has(planId)) {
            // This is a historical plan not in the current store - add it
            planMap.set(planId, localPlan);
          } else {
            // Plan exists in both - prefer store version but keep local stats if better
            const storePlan = planMap.get(planId)!;
            if (localPlan.stats && Object.keys(localPlan.stats).length > 0) {
              planMap.set(planId, {
                ...storePlan,
                stats: { ...localPlan.stats, ...storePlan.stats },
              });
            }
          }
        }
        
        // Convert map to array
        const allPlans = Array.from(planMap.values());
        
        // Save any new plans from store to local storage (for persistence)
        for (const plan of basePlans) {
          const existsLocally = storedLocalPlans.some(
            lp => lp.id === plan.id || lp.localId === plan.id
          );
          if (!existsLocally) {
            try {
              await saveLocalPlan(userId, plan, checkins, plans);
              console.log('[ManagePlans] Saved new plan to local storage:', plan.id);
            } catch (e) {
              console.warn('[ManagePlans] Failed to save plan to local storage:', e);
            }
          }
        }
        
        console.log('[ManagePlans] Total plans loaded:', allPlans.length);
        console.log('[ManagePlans] From store:', basePlans.length, 'From local:', storedLocalPlans.length);
        
        setLocalPlans(allPlans);
      } catch (error) {
        console.error('[ManagePlans] Error loading plans:', error);
        // Fallback to basePlans from store
        const plansWithStats: LocalPlanWithStats[] = basePlans.map(plan => ({
          ...plan,
          localId: plan.id,
          savedAt: plan.createdAt,
          stats: plan.stats || {},
        }));
        setLocalPlans(plansWithStats);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadPlans();
  }, [userId, basePlans, checkins, plans]);

  // Sort plans: active first, then by creation date (newest first)
  const sortedPlans = useMemo(() => {
    return [...localPlans].sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [localPlans]);

  // Handle dismissing the data warning
  const handleDismissWarning = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await markDataWarningShown(userId);
    Animated.timing(warningAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setShowDataWarning(false));
  };

  // Rename handlers
  const handleStartRename = (plan: LocalPlanWithStats) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRenamingPlanId(plan.id);
    setRenameText(plan.name || formatDefaultName(plan.createdAt));
  };

  const handleConfirmRename = async () => {
    if (!renamingPlanId || !renameText.trim()) {
      setRenamingPlanId(null);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const success = await renameLocalPlan(userId, renamingPlanId, renameText.trim());
    
    if (success) {
      setLocalPlans(prev => prev.map(p => 
        p.id === renamingPlanId ? { ...p, name: renameText.trim() } : p
      ));
    } else {
      Alert.alert('Error', 'Failed to rename the plan. Please try again.');
    }
    
    setRenamingPlanId(null);
    setRenameText('');
  };

  const handleCancelRename = () => {
    setRenamingPlanId(null);
    setRenameText('');
  };

  // Activate/Deactivate handlers
  const handleActivate = async (planId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const plan = localPlans.find(p => p.id === planId);
    const actionText = plan?.isActive ? 'Deactivate' : 'Activate';
    
    Alert.alert(
      `${actionText} This Plan?`,
      plan?.isActive 
        ? 'This will archive this plan. You can reactivate it anytime.'
        : 'This will set this plan as your active base plan for daily workouts and nutrition.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionText,
          onPress: async () => {
            setIsActivating(planId);
            
            try {
              const newStatus = plan?.isActive ? 'archived' : 'active';
              const success = await updateLocalPlanStatus(userId, planId, newStatus);
              
              if (success) {
                // Also update the main store
                if (newStatus === 'active') {
                  await storeActivatePlan(planId);
                }
                
                // Refresh local plans
                const updatedPlans = await getLocalPlans(userId);
                setLocalPlans(updatedPlans.length > 0 ? updatedPlans : localPlans.map(p => ({
                  ...p,
                  isActive: p.id === planId ? newStatus === 'active' : false,
                  status: p.id === planId ? newStatus : (p.isActive ? 'archived' : p.status),
                })));
                
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } else {
                Alert.alert('Error', 'Failed to update the plan. Please try again.');
              }
            } catch (error) {
              console.error('[ManagePlans] Activate error:', error);
              Alert.alert('Error', 'Failed to update the plan. Please try again.');
            } finally {
              setIsActivating(null);
            }
          },
        },
      ]
    );
  };

  // View plan handler
  const handleViewPlan = (planId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/plan-preview',
      params: { planId }
    });
  };

  // View stats handler
  const handleViewStats = (plan: LocalPlanWithStats) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlanForStats(plan);
  };

  // Delete handler
  const handleDeletePlan = (plan: LocalPlanWithStats) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (plan.isActive) {
      Alert.alert(
        'Cannot Delete Active Plan',
        'You cannot delete the currently active plan. Please activate a different plan first.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (localPlans.length === 1) {
      Alert.alert(
        'Cannot Delete',
        'You cannot delete your only plan. Generate a new plan first.',
        [{ text: 'OK' }]
      );
      return;
    }

    const displayName = plan.name || formatDefaultName(plan.createdAt);
    
    Alert.alert(
      'Delete Plan Forever?',
      `Are you sure you want to delete "${displayName}"?\n\n⚠️ This action cannot be undone. The plan will be permanently removed from your device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(plan.id);
            const success = await deleteLocalPlan(userId, plan.id);
            setIsDeleting(null);
            
            if (success) {
              setLocalPlans(prev => prev.filter(p => p.id !== plan.id));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Alert.alert('Error', 'Failed to delete the plan. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Helpers
  const formatDefaultName = (createdAt: string) => {
    const date = new Date(createdAt);
    return `Plan - ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const formatWeightChange = (weightChange: number | undefined): string => {
    if (weightChange === undefined || weightChange === null) return '—';
    const sign = weightChange >= 0 ? '+' : '';
    return `${sign}${weightChange.toFixed(1)} kg`;
  };

  const getWorkoutDaysCount = (plan: LocalPlanWithStats): number => {
    if (!plan.days) return 0;
    return Object.values(plan.days).filter(day => 
      day.workout?.blocks && day.workout.blocks.length > 0
    ).length;
  };

  // Render plan card
  const renderPlanItem = ({ item: plan, index }: { item: LocalPlanWithStats; index: number }) => {
    const isRenaming = renamingPlanId === plan.id;
    const isThisActivating = isActivating === plan.id;
    const isThisDeleting = isDeleting === plan.id;
    const displayName = plan.name || formatDefaultName(plan.createdAt);
    const weightChange = plan.stats?.weightChangeKg;
    const isWeightPositive = weightChange !== undefined && weightChange >= 0;
    const consistency = plan.stats?.consistencyPercent;
    const canDelete = !plan.isActive && localPlans.length > 1;
    const workoutDays = getWorkoutDaysCount(plan);

    return (
      <Animated.View
        style={{
          opacity: 1,
          transform: [{ scale: 1 }],
        }}
      >
        <Card style={[styles.planCard, plan.isActive && styles.activePlanCard]}>
          {/* Status Badge */}
          {plan.isActive && (
            <LinearGradient
              colors={[theme.color.accent.green + '20', theme.color.accent.green + '05']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.activeGradient}
            />
          )}
          
          {/* Header Row */}
          <View style={styles.planHeader}>
            {isRenaming ? (
              <View style={styles.renameContainer}>
                <TextInput
                  style={styles.renameInput}
                  value={renameText}
                  onChangeText={setRenameText}
                  autoFocus
                  selectTextOnFocus
                  maxLength={50}
                  returnKeyType="done"
                  onSubmitEditing={handleConfirmRename}
                  placeholderTextColor={theme.color.muted}
                />
                <TouchableOpacity onPress={handleConfirmRename} style={styles.renameAction}>
                  <Check color={theme.color.accent.green} size={22} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCancelRename} style={styles.renameAction}>
                  <X color={theme.color.accent.primary} size={22} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <TouchableOpacity 
                  onPress={() => handleStartRename(plan)} 
                  style={styles.nameContainer}
                  activeOpacity={0.7}
                >
                  <Text style={styles.planName} numberOfLines={1}>{displayName}</Text>
                  <Edit2 color={theme.color.muted} size={14} style={styles.editIcon} />
                </TouchableOpacity>
                <View style={styles.headerActions}>
                  {plan.isActive ? (
                    <View style={styles.activeBadge}>
                      <Play color={theme.color.bg} size={10} fill={theme.color.bg} />
                      <Text style={styles.activeBadgeText}>ACTIVE</Text>
                    </View>
                  ) : (
                    <View style={styles.archivedBadge}>
                      <Archive color={theme.color.muted} size={10} />
                      <Text style={styles.archivedBadgeText}>SAVED</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Plan Info */}
          <View style={styles.planInfo}>
            <View style={styles.infoItem}>
              <Calendar color={theme.color.muted} size={14} />
              <Text style={styles.infoText}>
                {new Date(plan.createdAt).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  year: '2-digit'
                })}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Dumbbell color={theme.color.muted} size={14} />
              <Text style={styles.infoText}>{workoutDays} workout days</Text>
            </View>
            <View style={styles.infoItem}>
              <Target color={theme.color.muted} size={14} />
              <Text style={styles.infoText}>{user?.goal?.replace('_', ' ').toLowerCase() || 'Fitness'}</Text>
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <TouchableOpacity 
              style={styles.statCard}
              onPress={() => handleViewStats(plan)}
              activeOpacity={0.7}
            >
              {isWeightPositive ? (
                <TrendingUp color={theme.color.accent.green} size={18} />
              ) : weightChange !== undefined ? (
                <TrendingDown color={theme.color.accent.primary} size={18} />
              ) : (
                <TrendingUp color={theme.color.muted} size={18} />
              )}
              <Text style={[
                styles.statValue,
                weightChange !== undefined && (isWeightPositive ? styles.positiveValue : styles.negativeValue)
              ]}>
                {formatWeightChange(weightChange)}
              </Text>
              <Text style={styles.statLabel}>Weight</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.statCard}
              onPress={() => handleViewStats(plan)}
              activeOpacity={0.7}
            >
              <BarChart3 color={theme.color.accent.blue} size={18} />
              <Text style={styles.statValue}>
                {consistency !== undefined ? `${consistency}%` : '—'}
              </Text>
              <Text style={styles.statLabel}>Consistency</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.statCard}
              onPress={() => handleViewStats(plan)}
              activeOpacity={0.7}
            >
              <Calendar color={theme.color.accent.yellow} size={18} />
              <Text style={styles.statValue}>
                {plan.stats?.daysActive !== undefined ? plan.stats.daysActive : '—'}
              </Text>
              <Text style={styles.statLabel}>Days</Text>
            </TouchableOpacity>
          </View>

          {/* Actions */}
          <View style={styles.planActions}>
            <TouchableOpacity 
              onPress={() => handleViewPlan(plan.id)}
              style={styles.actionButton}
              activeOpacity={0.7}
            >
              <Eye color={theme.color.accent.primary} size={18} />
              <Text style={styles.actionButtonText}>View Plan</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => handleActivate(plan.id)}
              style={[
                styles.actionButton, 
                plan.isActive ? styles.deactivateButton : styles.activateButton
              ]}
              disabled={isThisActivating}
              activeOpacity={0.7}
            >
              {plan.isActive ? (
                <>
                  <Pause color={theme.color.accent.yellow} size={18} />
                  <Text style={[styles.actionButtonText, styles.deactivateText]}>
                    {isThisActivating ? 'Saving...' : 'Archive'}
                  </Text>
                </>
              ) : (
                <>
                  <Play color={theme.color.accent.green} size={18} fill={theme.color.accent.green} />
                  <Text style={[styles.actionButtonText, styles.activateText]}>
                    {isThisActivating ? 'Starting...' : 'Activate'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {canDelete && (
              <TouchableOpacity 
                onPress={() => handleDeletePlan(plan)} 
                style={styles.deleteButton}
                disabled={isThisDeleting}
                activeOpacity={0.7}
              >
                <Trash2 
                  color={isThisDeleting ? theme.color.muted : theme.color.accent.primary} 
                  size={18} 
                />
              </TouchableOpacity>
            )}
          </View>
        </Card>
      </Animated.View>
    );
  };

  // Empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Archive color={theme.color.muted} size={48} />
      </View>
      <Text style={styles.emptyTitle}>No Saved Plans</Text>
      <Text style={styles.emptySubtitle}>
        Complete onboarding to generate your first personalized fitness plan.
      </Text>
      <Button
        title="Go to Onboarding"
        onPress={() => router.push('/onboarding')}
        style={styles.emptyButton}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'My Saved Plans',
          headerShown: true,
          headerStyle: { backgroundColor: theme.color.bg },
          headerTintColor: theme.color.ink,
          headerTitleStyle: { fontWeight: '700' },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
              <ChevronLeft color={theme.color.ink} size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Info color={theme.color.accent.blue} size={16} />
        <Text style={styles.infoBannerText}>
          Plans are saved locally on your device
        </Text>
      </View>

      {sortedPlans.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={sortedPlans}
          keyExtractor={(item) => item.id || item.localId}
          contentContainerStyle={styles.listContent}
          renderItem={renderPlanItem}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}

      {/* Data Warning Modal */}
      <Modal
        visible={showDataWarning}
        transparent
        animationType="none"
        onRequestClose={handleDismissWarning}
      >
        <View style={styles.modalOverlay}>
          <Animated.View 
            style={[
              styles.warningModal,
              {
                opacity: warningAnim,
                transform: [
                  {
                    scale: warningAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.warningIconContainer}>
              <AlertTriangle color={theme.color.accent.yellow} size={40} />
            </View>
            
            <Text style={styles.warningTitle}>Important Notice</Text>
            
            <Text style={styles.warningMessage}>
              Your fitness plans are saved <Text style={styles.warningBold}>locally on this device</Text>.
            </Text>
            
            <View style={styles.warningBox}>
              <Text style={styles.warningBoxText}>
                ⚠️ If you delete the app or clear app data, all your saved plans will be permanently lost.
              </Text>
            </View>
            
            <Text style={styles.warningTip}>
              💡 Tip: Take screenshots of your favorite plans to keep a backup!
            </Text>
            
            <TouchableOpacity 
              style={styles.warningButton}
              onPress={handleDismissWarning}
              activeOpacity={0.8}
            >
              <Text style={styles.warningButtonText}>I Understand</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* Stats Detail Modal */}
      <Modal
        visible={selectedPlanForStats !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPlanForStats(null)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedPlanForStats(null)}
        >
          <View style={styles.statsModal}>
            <View style={styles.statsModalHeader}>
              <Text style={styles.statsModalTitle}>Plan Statistics</Text>
              <TouchableOpacity onPress={() => setSelectedPlanForStats(null)}>
                <X color={theme.color.ink} size={24} />
              </TouchableOpacity>
            </View>
            
            {selectedPlanForStats && (
              <>
                <Text style={styles.statsModalPlanName}>
                  {selectedPlanForStats.name || formatDefaultName(selectedPlanForStats.createdAt)}
                </Text>
                
                <View style={styles.statsGrid}>
                  <View style={styles.statsGridItem}>
                    <TrendingUp color={theme.color.accent.green} size={24} />
                    <Text style={styles.statsGridValue}>
                      {formatWeightChange(selectedPlanForStats.stats?.weightChangeKg)}
                    </Text>
                    <Text style={styles.statsGridLabel}>Weight Change</Text>
                  </View>
                  
                  <View style={styles.statsGridItem}>
                    <BarChart3 color={theme.color.accent.blue} size={24} />
                    <Text style={styles.statsGridValue}>
                      {selectedPlanForStats.stats?.consistencyPercent !== undefined 
                        ? `${selectedPlanForStats.stats.consistencyPercent}%` 
                        : '—'}
                    </Text>
                    <Text style={styles.statsGridLabel}>Consistency</Text>
                  </View>
                  
                  <View style={styles.statsGridItem}>
                    <Calendar color={theme.color.accent.yellow} size={24} />
                    <Text style={styles.statsGridValue}>
                      {selectedPlanForStats.stats?.daysActive ?? '—'}
                    </Text>
                    <Text style={styles.statsGridLabel}>Days Active</Text>
                  </View>
                  
                  <View style={styles.statsGridItem}>
                    <Dumbbell color={theme.color.accent.primary} size={24} />
                    <Text style={styles.statsGridValue}>
                      {selectedPlanForStats.stats?.totalWorkouts ?? '—'}
                    </Text>
                    <Text style={styles.statsGridLabel}>Workouts Done</Text>
                  </View>
                </View>
                
                <View style={styles.statsDateRange}>
                  <Text style={styles.statsDateLabel}>Active Period:</Text>
                  <Text style={styles.statsDateValue}>
                    {new Date(selectedPlanForStats.activatedAt || selectedPlanForStats.createdAt).toLocaleDateString()}
                    {' → '}
                    {selectedPlanForStats.deactivatedAt 
                      ? new Date(selectedPlanForStats.deactivatedAt).toLocaleDateString()
                      : 'Present'}
                  </Text>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  headerBackButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
    backgroundColor: theme.color.accent.blue + '10',
    borderBottomWidth: 1,
    borderBottomColor: theme.color.accent.blue + '20',
  },
  infoBannerText: {
    fontSize: 13,
    color: theme.color.accent.blue,
    flex: 1,
  },
  listContent: {
    padding: theme.space.lg,
    paddingBottom: theme.space.xxl,
  },
  planCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.color.line,
    position: 'relative',
  },
  activePlanCard: {
    borderColor: theme.color.accent.green + '40',
  },
  activeGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  planHeader: {
    marginBottom: theme.space.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: theme.space.sm,
  },
  planName: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.color.ink,
    flex: 1,
  },
  editIcon: {
    marginLeft: theme.space.xs,
    opacity: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.color.accent.green,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.color.bg,
    letterSpacing: 0.5,
  },
  archivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.color.line,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
  },
  archivedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.color.muted,
    letterSpacing: 0.5,
  },
  renameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  renameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.ink,
    backgroundColor: theme.color.bg,
    borderWidth: 2,
    borderColor: theme.color.accent.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.sm,
  },
  renameAction: {
    padding: theme.space.xs,
  },
  planInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
    marginBottom: theme.space.md,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 12,
    color: theme.color.muted,
    textTransform: 'capitalize',
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.space.sm,
    marginBottom: theme.space.md,
    paddingTop: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: theme.space.sm,
    backgroundColor: theme.color.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.color.ink,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 10,
    color: theme.color.muted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  positiveValue: {
    color: theme.color.accent.green,
  },
  negativeValue: {
    color: theme.color.accent.primary,
  },
  planActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingTop: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.color.accent.primary,
  },
  activateButton: {
    borderColor: theme.color.accent.green + '40',
    backgroundColor: theme.color.accent.green + '10',
  },
  activateText: {
    color: theme.color.accent.green,
  },
  deactivateButton: {
    borderColor: theme.color.accent.yellow + '40',
    backgroundColor: theme.color.accent.yellow + '10',
  },
  deactivateText: {
    color: theme.color.accent.yellow,
  },
  deleteButton: {
    padding: theme.space.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.accent.primary + '30',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.xl,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.color.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space.lg,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.color.ink,
    marginBottom: theme.space.sm,
  },
  emptySubtitle: {
    fontSize: 15,
    color: theme.color.muted,
    textAlign: 'center',
    marginBottom: theme.space.xl,
    lineHeight: 22,
    paddingHorizontal: theme.space.lg,
  },
  emptyButton: {
    paddingHorizontal: theme.space.xl,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.lg,
  },
  warningModal: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.lg,
    padding: theme.space.xl,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  warningIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.color.accent.yellow + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space.lg,
  },
  warningTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.color.ink,
    marginBottom: theme.space.md,
    textAlign: 'center',
  },
  warningMessage: {
    fontSize: 15,
    color: theme.color.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.space.md,
  },
  warningBold: {
    fontWeight: '700',
    color: theme.color.ink,
  },
  warningBox: {
    backgroundColor: theme.color.accent.primary + '15',
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.color.accent.primary,
  },
  warningBoxText: {
    fontSize: 14,
    color: theme.color.ink,
    lineHeight: 20,
  },
  warningTip: {
    fontSize: 13,
    color: theme.color.accent.blue,
    textAlign: 'center',
    marginBottom: theme.space.lg,
  },
  warningButton: {
    backgroundColor: theme.color.accent.primary,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radius.pill,
    width: '100%',
  },
  warningButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
  },
  // Stats modal
  statsModal: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    width: '100%',
    maxWidth: 360,
  },
  statsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space.md,
  },
  statsModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.ink,
  },
  statsModalPlanName: {
    fontSize: 14,
    color: theme.color.muted,
    marginBottom: theme.space.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
    marginBottom: theme.space.lg,
  },
  statsGridItem: {
    width: (SCREEN_WIDTH - theme.space.lg * 4 - theme.space.md) / 2 - 20,
    alignItems: 'center',
    padding: theme.space.md,
    backgroundColor: theme.color.bg,
    borderRadius: theme.radius.md,
  },
  statsGridValue: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.color.ink,
    marginTop: theme.space.sm,
  },
  statsGridLabel: {
    fontSize: 11,
    color: theme.color.muted,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsDateRange: {
    alignItems: 'center',
    paddingTop: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  statsDateLabel: {
    fontSize: 12,
    color: theme.color.muted,
    marginBottom: 4,
  },
  statsDateValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.ink,
  },
});
