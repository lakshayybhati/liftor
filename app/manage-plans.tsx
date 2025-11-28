import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, TrendingUp, TrendingDown, BarChart3, Edit2, Check, X, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';
import type { WeeklyBasePlan } from '@/types/user';

export default function ManagePlansScreen() {
  const insets = useSafeAreaInsets();
  const { basePlans, renameBasePlan, activateBasePlan, deleteBasePlan, user } = useUserStore();
  const [renamingPlanId, setRenamingPlanId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [isActivating, setIsActivating] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Sort plans: active first, then by creation date (newest first)
  const sortedPlans = useMemo(() => {
    return [...basePlans].sort((a, b) => {
      // Active plan comes first
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      // Then sort by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [basePlans]);

  const handleStartRename = (plan: WeeklyBasePlan) => {
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
    const success = await renameBasePlan(renamingPlanId, renameText.trim());
    
    if (!success) {
      Alert.alert('Error', 'Failed to rename the plan. Please try again.');
    }
    
    setRenamingPlanId(null);
    setRenameText('');
  };

  const handleCancelRename = () => {
    setRenamingPlanId(null);
    setRenameText('');
  };

  const handleActivate = async (planId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    Alert.alert(
      'Activate This Plan?',
      'This will set this plan as your active base plan for daily workouts and nutrition.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            setIsActivating(planId);
            const success = await activateBasePlan(planId);
            setIsActivating(null);
            
            if (success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Alert.alert('Error', 'Failed to activate the plan. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleViewPlan = (planId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/plan-preview',
      params: { planId }
    });
  };

  const handleDeletePlan = (plan: WeeklyBasePlan) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Prevent deleting the active plan
    if (plan.isActive) {
      Alert.alert(
        'Cannot Delete Active Plan',
        'You cannot delete the currently active plan. Please activate a different plan first.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Prevent deleting the only plan
    if (basePlans.length === 1) {
      Alert.alert(
        'Cannot Delete',
        'You cannot delete your only plan. Generate a new plan first before deleting this one.',
        [{ text: 'OK' }]
      );
      return;
    }

    const displayName = plan.name || formatDefaultName(plan.createdAt);
    
    Alert.alert(
      'Delete Plan?',
      `Are you sure you want to delete "${displayName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(plan.id);
            const success = await deleteBasePlan(plan.id);
            setIsDeleting(null);
            
            if (success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Alert.alert('Error', 'Failed to delete the plan. Please try again.');
            }
          },
        },
      ]
    );
  };

  const formatDefaultName = (createdAt: string) => {
    const date = new Date(createdAt);
    return `Plan - ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const getPlanSummary = (plan: WeeklyBasePlan): string => {
    const equipment = user?.equipment?.join(', ') || 'Not specified';
    return equipment;
  };

  const formatWeightChange = (weightChange: number | undefined): string => {
    if (weightChange === undefined || weightChange === null) return 'N/A';
    const sign = weightChange >= 0 ? '+' : '';
    return `${sign}${weightChange.toFixed(1)} kg`;
  };

  const renderPlanItem = ({ item: plan }: { item: WeeklyBasePlan }) => {
    const isRenaming = renamingPlanId === plan.id;
    const isThisActivating = isActivating === plan.id;
    const isThisDeleting = isDeleting === plan.id;
    const displayName = plan.name || formatDefaultName(plan.createdAt);
    const weightChange = plan.stats?.weightChangeKg;
    const isWeightPositive = weightChange !== undefined && weightChange >= 0;
    const consistency = plan.stats?.consistencyPercent;
    const canDelete = !plan.isActive && basePlans.length > 1;

    return (
      <Card style={[styles.planCard, plan.isActive && styles.activePlanCard]}>
        {/* Header Row: Name + Active Badge */}
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
              />
              <TouchableOpacity onPress={handleConfirmRename} style={styles.renameAction}>
                <Check color={theme.color.accent.green} size={20} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCancelRename} style={styles.renameAction}>
                <X color={theme.color.accent.primary} size={20} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.nameRow}>
              <TouchableOpacity onPress={() => handleStartRename(plan)} style={styles.nameContainer}>
                <Text style={styles.planName} numberOfLines={1}>{displayName}</Text>
                <Edit2 color={theme.color.muted} size={14} style={styles.editIcon} />
              </TouchableOpacity>
              <View style={styles.headerActions}>
                {plan.isActive && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                  </View>
                )}
                {canDelete && (
                  <TouchableOpacity 
                    onPress={() => handleDeletePlan(plan)} 
                    style={styles.deleteButton}
                    disabled={isThisDeleting}
                  >
                    <Trash2 
                      color={isThisDeleting ? theme.color.muted : theme.color.accent.primary} 
                      size={18} 
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Summary Line */}
        <Text style={styles.planSummary}>{getPlanSummary(plan)}</Text>

        {/* Stats Row */}
        {(plan.stats || plan.isActive) && (
          <View style={styles.statsRow}>
            {/* Weight Change */}
            <View style={styles.statItem}>
              {isWeightPositive ? (
                <TrendingUp color={theme.color.accent.green} size={16} />
              ) : weightChange !== undefined ? (
                <TrendingDown color={theme.color.accent.primary} size={16} />
              ) : (
                <TrendingUp color={theme.color.muted} size={16} />
              )}
              <Text style={[
                styles.statValue,
                weightChange !== undefined && (isWeightPositive ? styles.positiveValue : styles.negativeValue)
              ]}>
                {formatWeightChange(weightChange)}
              </Text>
            </View>

            {/* Consistency */}
            <View style={styles.statItem}>
              <BarChart3 color={theme.color.accent.blue} size={16} />
              <Text style={styles.statValue}>
                {consistency !== undefined ? `${consistency}% consistent` : 'No data'}
              </Text>
            </View>

            {/* Days Active */}
            {plan.stats?.daysActive !== undefined && (
              <Text style={styles.daysActiveText}>
                {plan.stats.daysActive} day{plan.stats.daysActive !== 1 ? 's' : ''} active
              </Text>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.planActions}>
          <TouchableOpacity 
            onPress={() => handleViewPlan(plan.id)}
            style={styles.viewPlanLink}
          >
            <Text style={styles.viewPlanText}>See the whole plan</Text>
          </TouchableOpacity>

          {!plan.isActive && (
            <Button
              title={isThisActivating ? 'Activating...' : 'Activate'}
              onPress={() => handleActivate(plan.id)}
              disabled={isThisActivating}
              size="small"
              variant="outline"
              style={styles.activateButton}
            />
          )}
        </View>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen
        options={{
          title: 'My Base Plans',
          headerShown: true,
          headerStyle: { backgroundColor: theme.color.bg },
          headerTintColor: theme.color.ink,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 8 }}>
              <ChevronLeft color={theme.color.ink} size={22} />
            </TouchableOpacity>
          ),
        }}
      />

      {sortedPlans.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Plans Yet</Text>
          <Text style={styles.emptySubtitle}>
            Complete onboarding to generate your first personalized base plan.
          </Text>
          <Button
            title="Go to Onboarding"
            onPress={() => router.push('/onboarding/start')}
            style={styles.emptyButton}
          />
        </View>
      ) : (
        <FlatList
          data={sortedPlans}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderPlanItem}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={5}
          windowSize={5}
          initialNumToRender={5}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  listContent: {
    padding: theme.space.lg,
    paddingBottom: theme.space.xxl,
  },
  planCard: {
    marginBottom: theme.space.md,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  activePlanCard: {
    borderColor: theme.color.accent.green + '60',
    backgroundColor: theme.color.accent.green + '08',
  },
  planHeader: {
    marginBottom: theme.space.xs,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  deleteButton: {
    padding: theme.space.xs,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.ink,
    flex: 1,
  },
  editIcon: {
    marginLeft: theme.space.xs,
  },
  activeBadge: {
    backgroundColor: theme.color.accent.green,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.color.bg,
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
    borderWidth: 1,
    borderColor: theme.color.accent.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
  },
  renameAction: {
    padding: theme.space.xs,
  },
  planSummary: {
    fontSize: 13,
    color: theme.color.muted,
    marginBottom: theme.space.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.space.md,
    marginBottom: theme.space.md,
    paddingTop: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  statValue: {
    fontSize: 13,
    color: theme.color.muted,
    fontWeight: '500',
  },
  positiveValue: {
    color: theme.color.accent.green,
  },
  negativeValue: {
    color: theme.color.accent.primary,
  },
  daysActiveText: {
    fontSize: 12,
    color: theme.color.muted,
    fontStyle: 'italic',
  },
  planActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  viewPlanLink: {
    paddingVertical: theme.space.xs,
  },
  viewPlanText: {
    fontSize: 14,
    color: theme.color.accent.primary,
    fontWeight: '600',
  },
  activateButton: {
    paddingHorizontal: theme.space.lg,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: theme.space.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.color.muted,
    textAlign: 'center',
    marginBottom: theme.space.lg,
    lineHeight: 20,
  },
  emptyButton: {
    paddingHorizontal: theme.space.xl,
  },
});

