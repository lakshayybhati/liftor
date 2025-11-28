import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Pill, Calendar, Pen, X, Plus, Trash2, Check } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';
import type { User } from '@/types/user';

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const DAY_LABELS: Record<DayKey, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};

const DAY_ORDER: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function SupplementsScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateUser, getCurrentBasePlan, updateWeeklyBasePlan } = useUserStore();
  const [selectedView, setSelectedView] = useState<'overview' | 'daily'>('overview');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSupplement, setNewSupplement] = useState('');
  const [isEveryday, setIsEveryday] = useState(true);
  const [selectedDays, setSelectedDays] = useState<Set<DayKey>>(new Set(DAY_ORDER));

  const basePlan = getCurrentBasePlan();

  // Helper to extract base supplement name for deduplication
  // "Magnesium Glycinate (400mg) - Before bed" -> "magnesium glycinate"
  const getSupplementBaseName = (supp: string): string => {
    return supp
      .toLowerCase()
      .split('(')[0]      // Remove dosage like "(400mg)"
      .split('-')[0]      // Remove timing like "- Before bed"  
      .trim();
  };

  // Helper to check if two supplements are essentially the same
  const isSameSupplement = (supp1: string, supp2: string): boolean => {
    const base1 = getSupplementBaseName(supp1);
    const base2 = getSupplementBaseName(supp2);
    return base1 === base2 || base1.includes(base2) || base2.includes(base1);
  };

  // Helper to deduplicate supplements, keeping the most detailed version
  const deduplicateSupplements = (supplements: string[]): string[] => {
    const result: string[] = [];
    const seenBaseNames = new Set<string>();
    
    // Sort by length descending to prefer more detailed versions
    const sorted = [...supplements].sort((a, b) => b.length - a.length);
    
    for (const supp of sorted) {
      const baseName = getSupplementBaseName(supp);
      
      // Check if we already have a supplement with this base name
      let isDuplicate = false;
      for (const seen of seenBaseNames) {
        if (baseName === seen || baseName.includes(seen) || seen.includes(baseName)) {
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        result.push(supp);
        seenBaseNames.add(baseName);
      }
    }
    
    return result;
  };

  // Aggregate all supplements from the weekly plan
  const supplementsData = useMemo(() => {
    if (!basePlan?.days) {
      return {
        allSupplements: [] as string[],
        dailySupplements: {} as Record<DayKey, string[]>,
        userSupplements: [] as string[],
        recommendedSupplements: [] as string[]
      };
    }

    const allSuppsList: string[] = [];
    const dailySupps: Record<DayKey, string[]> = {} as Record<DayKey, string[]>;
    const userSuppsList: string[] = [];
    const recommendedSuppsList: string[] = [];

    // 1. First, get the user's current supplements from their profile (these are "Custom")
    const userProfileSupplements = user?.supplements || [];
    userProfileSupplements.forEach((supp: string) => {
      userSuppsList.push(supp);
      allSuppsList.push(supp);
    });

    // 2. Process each day to get AI-generated supplements from the base plan
    DAY_ORDER.forEach((day) => {
      const dayData = basePlan.days[day];
      if (!dayData?.recovery) return;

      // Get daily supplements from the base plan
      const daySupplements = dayData.recovery.supplements || [];
      dailySupps[day] = daySupplements;

      // Add all daily supplements to the overall list
      daySupplements.forEach((supp: string) => allSuppsList.push(supp));

      // Get AI-recommended add-ons from supplementCard if available
      if (dayData.recovery.supplementCard?.addOns) {
        dayData.recovery.supplementCard.addOns.forEach((supp: string) => {
          // Only add to recommended if not similar to user's profile supplements
          const isUserSupplement = userProfileSupplements.some((userSupp: string) => 
            isSameSupplement(supp, userSupp)
          );
          if (!isUserSupplement) {
            recommendedSuppsList.push(supp);
          }
          allSuppsList.push(supp);
        });
      }
    });

    // 3. Any supplements from the base plan that aren't in user's profile are AI recommendations
    // This handles cases where AI puts recommendations in the supplements array directly
    allSuppsList.forEach(supp => {
      const isUserSupplement = userProfileSupplements.some((userSupp: string) => 
        isSameSupplement(supp, userSupp)
      );
      
      // Check if already in recommended list
      const alreadyRecommended = recommendedSuppsList.some(rec => 
        isSameSupplement(supp, rec)
      );
      
      if (!isUserSupplement && !alreadyRecommended) {
        recommendedSuppsList.push(supp);
      }
    });

    // 4. Deduplicate all lists
    const dedupedAll = deduplicateSupplements(allSuppsList);
    const dedupedUser = deduplicateSupplements(userSuppsList);
    const dedupedRecommended = deduplicateSupplements(recommendedSuppsList);

    // 5. Final cleanup - remove from recommended if it matches any user supplement
    const finalRecommended = dedupedRecommended.filter(rec => 
      !dedupedUser.some(userSupp => isSameSupplement(rec, userSupp))
    );

    return {
      allSupplements: dedupedAll,
      dailySupplements: dailySupps,
      userSupplements: dedupedUser,
      recommendedSupplements: finalRecommended
    };
  }, [basePlan, user?.supplements]);

  const handleAddSupplement = async () => {
    if (!newSupplement.trim()) return;

    const supplementName = newSupplement.trim();
    const daysToUpdate = isEveryday ? DAY_ORDER : Array.from(selectedDays);

    if (daysToUpdate.length === 0) {
      Alert.alert('Error', 'Please select at least one day');
      return;
    }

    // 1. Update User Profile (only if everyday, or maybe just add it to list regardless?)
    // We'll add it to user profile if it's being added to the plan, to keep track of "known" supplements
    if (user) {
      const currentSupps = user.supplements || [];
      if (!currentSupps.includes(supplementName)) {
        const updatedSupplements = [...currentSupps, supplementName];
        await updateUser({ ...user, supplements: updatedSupplements } as User);
      }
    }

    // 2. Update Base Plan
    if (basePlan) {
      const updatedDays = { ...basePlan.days };
      let hasChanges = false;

      daysToUpdate.forEach(day => {
        if (updatedDays[day]?.recovery) {
          // Ensure supplementCard exists
          if (!updatedDays[day].recovery.supplementCard) {
            updatedDays[day].recovery.supplementCard = { current: [], addOns: [] };
          }

          const currentList = updatedDays[day].recovery.supplementCard!.current || [];
          if (!currentList.includes(supplementName)) {
            updatedDays[day].recovery.supplementCard!.current = [...currentList, supplementName];
            hasChanges = true;

            // Also update legacy supplements array
            if (updatedDays[day].recovery.supplements) {
              updatedDays[day].recovery.supplements = [...updatedDays[day].recovery.supplements, supplementName];
            } else {
              updatedDays[day].recovery.supplements = [...currentList, supplementName, ...(updatedDays[day].recovery.supplementCard!.addOns || [])];
            }
          }
        }
      });

      if (hasChanges) {
        await updateWeeklyBasePlan({ ...basePlan, days: updatedDays });
      }
    }

    setNewSupplement('');
    setIsEveryday(true);
    setSelectedDays(new Set(DAY_ORDER));
    setShowAddModal(false);
    Alert.alert('Success', 'Supplement added to your plan!');
  };

  const handleRemoveSupplement = async (supplementName: string) => {
    Alert.alert(
      'Remove Supplement',
      `Are you sure you want to remove ${supplementName} from your plan?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            // 1. Remove from User Profile
            if (user && user.supplements) {
              const updatedSupplements = user.supplements.filter(s => s !== supplementName);
              await updateUser({ ...user, supplements: updatedSupplements } as User);
            }

            // 2. Remove from Base Plan (all days)
            if (basePlan) {
              const updatedDays = { ...basePlan.days };
              let hasChanges = false;

              DAY_ORDER.forEach(day => {
                if (updatedDays[day]?.recovery) {
                  // Update supplementCard.current
                  if (updatedDays[day].recovery.supplementCard?.current) {
                    const currentList = updatedDays[day].recovery.supplementCard!.current;
                    if (currentList.includes(supplementName)) {
                      updatedDays[day].recovery.supplementCard!.current = currentList.filter(s => s !== supplementName);
                      hasChanges = true;
                    }
                  }

                  // Update legacy supplements array
                  if (updatedDays[day].recovery.supplements) {
                    const supps = updatedDays[day].recovery.supplements;
                    if (supps.includes(supplementName)) {
                      updatedDays[day].recovery.supplements = supps.filter(s => s !== supplementName);
                      hasChanges = true;
                    }
                  }
                }
              });

              if (hasChanges) {
                await updateWeeklyBasePlan({ ...basePlan, days: updatedDays });
              }
            }
          }
        }
      ]
    );
  };

  const toggleDay = (day: DayKey) => {
    const newSelected = new Set(selectedDays);
    if (newSelected.has(day)) {
      newSelected.delete(day);
    } else {
      newSelected.add(day);
    }
    setSelectedDays(newSelected);
    if (newSelected.size !== 7) {
      setIsEveryday(false);
    } else {
      setIsEveryday(true);
    }
  };

  const renderOverview = () => {
    const { allSupplements, userSupplements, recommendedSupplements } = supplementsData;

    if (allSupplements.length === 0) {
      return (
        <Card style={styles.emptyCard}>
          <Pill size={48} color={theme.color.muted} />
          <Text style={styles.emptyTitle}>No Supplements Yet</Text>
          <Text style={styles.emptySubtitle}>
            Add your supplements or generate a plan to see recommendations
          </Text>
          <TouchableOpacity
            style={styles.addButtonEmpty}
            onPress={() => setShowAddModal(true)}
          >
            <Plus size={20} color="#FFF" />
            <Text style={styles.addButtonText}>Add Supplement</Text>
          </TouchableOpacity>
        </Card>
      );
    }

    return (
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={true}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        keyboardDismissMode="on-drag"
      >
        {/* Header Card */}
        <Card gradient gradientColors={['#34d399', '#f97316']} style={styles.headerCard}>
          <Text style={styles.headerTitle}>Supplement Overview</Text>
          <Text style={styles.headerSubtitle}>
            All supplements from your weekly plan
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{allSupplements.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{userSupplements.length}</Text>
              <Text style={styles.statLabel}>Yours</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{recommendedSupplements.length}</Text>
              <Text style={styles.statLabel}>Our Picks</Text>
            </View>
          </View>
        </Card>

        {/* User's Current Supplements from their profile */}
        {userSupplements.length > 0 && (
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>💊 Your Current Stack</Text>
              <Text style={styles.sectionSubtitle}>
                Supplements you're already taking
              </Text>
            </View>
            {userSupplements.map((supp, index) => (
              <View key={`current-${index}`} style={styles.supplementItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: theme.space.sm }}>
                  <Text style={styles.supplementBullet}>•</Text>
                  <Text style={styles.supplementText}>{supp}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleRemoveSupplement(supp)}
                  style={styles.removeButton}
                  accessibilityLabel={`Remove ${supp}`}
                >
                  <Trash2 size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))}
          </Card>
        )}

        {/* AI-Recommended Add-ons from Base Plan */}
        {recommendedSupplements.length > 0 && (
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>✨ Recommended</Text>
              <Text style={styles.sectionSubtitle}>
                Smart suggestions from your personalized plan
              </Text>
            </View>
            {recommendedSupplements.map((supp, index) => (
              <View key={`recommended-${index}`} style={styles.supplementItem}>
                <Text style={styles.supplementBullet}>•</Text>
                <Text style={styles.supplementText}>{supp}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* All Unique Supplements */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📋 Complete List</Text>
            <Text style={styles.sectionSubtitle}>
              All supplements mentioned in your weekly plan
            </Text>
          </View>
          {allSupplements.map((supp, index) => (
            <View key={`all-${index}`} style={styles.supplementItem}>
              <Text style={styles.supplementBullet}>•</Text>
              <Text style={styles.supplementText}>{supp}</Text>
            </View>
          ))}
        </Card>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          ⚠️ Make sure to do your own research before taking any supplements. Consult a healthcare professional if you have any concerns.
        </Text>
      </ScrollView>
    );
  };

  const renderDaily = () => {
    const { dailySupplements } = supplementsData;

    if (Object.keys(dailySupplements).length === 0) {
      return (
        <Card style={styles.emptyCard}>
          <Calendar size={48} color={theme.color.muted} />
          <Text style={styles.emptyTitle}>No Daily Plan</Text>
          <Text style={styles.emptySubtitle}>
            Generate your base plan to see daily supplement schedules
          </Text>
        </Card>
      );
    }

    return (
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={true}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        keyboardDismissMode="on-drag"
      >
        {/* Header Card */}
        <Card gradient gradientColors={['#34d399', '#f97316']} style={styles.headerCard}>
          <Text style={styles.headerTitle}>Daily Supplements</Text>
          <Text style={styles.headerSubtitle}>
            What to take each day of the week
          </Text>
        </Card>

        {/* Daily Breakdown */}
        {DAY_ORDER.map((day) => {
          const supplements = dailySupplements[day] || [];
          if (supplements.length === 0) return null;

          return (
            <Card key={day} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayTitle}>{DAY_LABELS[day]}</Text>
                <View style={styles.dayBadge}>
                  <Text style={styles.dayBadgeText}>{supplements.length}</Text>
                </View>
              </View>
              {supplements.map((supp, index) => (
                <View key={`${day}-${index}`} style={styles.supplementItem}>
                  <Text style={styles.supplementBullet}>•</Text>
                  <Text style={styles.supplementText}>{supp}</Text>
                </View>
              ))}
            </Card>
          );
        })}

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          ⚠️ Make sure to do your own research before taking any supplements. Consult a healthcare professional if you have any concerns.
        </Text>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Supplements',
          headerStyle: {
            backgroundColor: '#000000',
          },
          headerTintColor: theme.color.ink,
          headerTitleStyle: {
            color: theme.color.ink,
            fontWeight: '600',
          },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ paddingHorizontal: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft color={theme.color.ink} size={24} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setShowAddModal(true)}
              style={{ paddingHorizontal: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Add supplement"
            >
              <Pen color={theme.color.accent.primary} size={24} />
            </TouchableOpacity>
          )
        }}
      />

      {/* View Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            selectedView === 'overview' && styles.toggleButtonActive
          ]}
          onPress={() => setSelectedView('overview')}
          accessibilityRole="button"
          accessibilityLabel="Overview view"
        >
          <Pill
            size={18}
            color={selectedView === 'overview' ? theme.color.ink : theme.color.muted}
          />
          <Text style={[
            styles.toggleButtonText,
            selectedView === 'overview' && styles.toggleButtonTextActive
          ]}>
            Overview
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toggleButton,
            selectedView === 'daily' && styles.toggleButtonActive
          ]}
          onPress={() => setSelectedView('daily')}
          accessibilityRole="button"
          accessibilityLabel="Daily view"
        >
          <Calendar
            size={18}
            color={selectedView === 'daily' ? theme.color.ink : theme.color.muted}
          />
          <Text style={[
            styles.toggleButtonText,
            selectedView === 'daily' && styles.toggleButtonTextActive
          ]}>
            Daily
          </Text>
        </TouchableOpacity>
      </View>

      {selectedView === 'overview' ? renderOverview() : renderDaily()}

      {/* Add Supplement Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Supplement</Text>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={styles.closeButton}
              >
                <X size={24} color={theme.color.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Enter the name of the supplement you want to add to your daily routine.
            </Text>

            <TextInput
              style={styles.input}
              value={newSupplement}
              onChangeText={setNewSupplement}
              placeholder="e.g. Creatine, Vitamin D"
              placeholderTextColor={theme.color.muted}
              autoFocus
            />

            <View style={styles.frequencyContainer}>
              <Text style={styles.frequencyLabel}>Frequency</Text>

              <TouchableOpacity
                style={styles.everydayToggle}
                onPress={() => {
                  const newState = !isEveryday;
                  setIsEveryday(newState);
                  if (newState) {
                    setSelectedDays(new Set(DAY_ORDER));
                  } else {
                    setSelectedDays(new Set());
                  }
                }}
              >
                <View style={[styles.checkbox, isEveryday && styles.checkboxChecked]}>
                  {isEveryday && <Check size={12} color="#FFF" />}
                </View>
                <Text style={styles.everydayText}>Everyday</Text>
              </TouchableOpacity>

              {!isEveryday && (
                <View style={styles.daysGrid}>
                  {DAY_ORDER.map((day) => {
                    const isSelected = selectedDays.has(day);
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[styles.daySelector, isSelected && styles.daySelectorSelected]}
                        onPress={() => toggleDay(day)}
                      >
                        <Text style={[styles.daySelectorText, isSelected && styles.daySelectorTextSelected]}>
                          {DAY_LABELS[day].charAt(0)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.saveButton,
                !newSupplement.trim() && styles.saveButtonDisabled
              ]}
              onPress={handleAddSupplement}
              disabled={!newSupplement.trim()}
            >
              <Text style={styles.saveButtonText}>Add to Plan</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.sm,
  },
  toggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.space.md,
    paddingBottom: theme.space.sm,
    paddingTop: 0,
    gap: theme.space.sm,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.card,
    gap: theme.space.xs,
  },
  toggleButtonActive: {
    backgroundColor: '#f97316',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.muted,
  },
  toggleButtonTextActive: {
    color: theme.color.ink,
  },
  headerCard: {
    marginBottom: theme.space.md,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: theme.space.xs,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: theme.space.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: theme.space.sm,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.color.ink,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: theme.space.xs,
  },
  sectionCard: {
    marginBottom: theme.space.md,
  },
  sectionHeader: {
    marginBottom: theme.space.md,
    paddingBottom: theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.muted + '20',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: theme.space.xs,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: theme.color.muted,
  },
  supplementItem: {
    flexDirection: 'row',
    paddingVertical: theme.space.xs,
    gap: theme.space.sm,
  },
  supplementBullet: {
    fontSize: 16,
    color: '#10b981',
    fontWeight: '700',
    width: 20,
  },
  supplementText: {
    flex: 1,
    fontSize: 14,
    color: theme.color.ink,
    lineHeight: 20,
  },
  dayCard: {
    marginBottom: theme.space.md,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space.md,
    paddingBottom: theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.muted + '20',
  },
  dayTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.ink,
  },
  dayBadge: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  dayBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.color.ink,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.xl,
    margin: theme.space.md,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.color.ink,
    marginTop: theme.space.md,
    marginBottom: theme.space.xs,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.color.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  disclaimer: {
    fontSize: 11,
    color: theme.color.muted,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: theme.space.md,
    marginBottom: theme.space.lg,
    paddingHorizontal: theme.space.md,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: theme.color.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.color.ink,
  },
  modalSubtitle: {
    fontSize: 14,
    color: theme.color.muted,
    marginBottom: 20,
    lineHeight: 20,
  },
  closeButton: {
    padding: 4,
  },
  input: {
    backgroundColor: theme.color.bg,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: 12,
    padding: 16,
    color: theme.color.ink,
    fontSize: 16,
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: theme.color.accent.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  addButtonEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.accent.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 100,
    gap: 8,
  },
  addButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  removeButton: {
    padding: 8,
  },
  frequencyContainer: {
    marginBottom: 20,
  },
  frequencyLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 12,
  },
  everydayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.color.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.color.accent.primary,
  },
  everydayText: {
    fontSize: 14,
    color: theme.color.ink,
  },
  daysGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  daySelector: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.color.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.bg,
  },
  daySelectorSelected: {
    backgroundColor: theme.color.accent.primary,
    borderColor: theme.color.accent.primary,
  },
  daySelectorText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.color.muted,
  },
  daySelectorTextSelected: {
    color: '#FFF',
  }
});