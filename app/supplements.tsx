import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Pill, Calendar } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';

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
  const { getCurrentBasePlan } = useUserStore();
  const [selectedView, setSelectedView] = useState<'overview' | 'daily'>('overview');
  
  const basePlan = getCurrentBasePlan();

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

    const allSuppsSet = new Set<string>();
    const dailySupps: Record<DayKey, string[]> = {} as Record<DayKey, string[]>;
    const userSuppsSet = new Set<string>();
    const recommendedSuppsSet = new Set<string>();

    // Process each day
    DAY_ORDER.forEach((day) => {
      const dayData = basePlan.days[day];
      if (!dayData?.recovery) return;

      // Get daily supplements
      const daySupplements = dayData.recovery.supplements || [];
      dailySupps[day] = daySupplements;
      
      // Add to overall set
      daySupplements.forEach((supp: string) => allSuppsSet.add(supp));

      // Get user's current supplements
      if (dayData.recovery.supplementCard?.current) {
        dayData.recovery.supplementCard.current.forEach((supp: string) => {
          userSuppsSet.add(supp);
          allSuppsSet.add(supp);
        });
      }

      // Get recommended add-ons
      if (dayData.recovery.supplementCard?.addOns) {
        dayData.recovery.supplementCard.addOns.forEach((supp: string) => {
          recommendedSuppsSet.add(supp);
          allSuppsSet.add(supp);
        });
      }
    });

    return {
      allSupplements: Array.from(allSuppsSet),
      dailySupplements: dailySupps,
      userSupplements: Array.from(userSuppsSet),
      recommendedSupplements: Array.from(recommendedSuppsSet)
    };
  }, [basePlan]);

  const renderOverview = () => {
    const { allSupplements, userSupplements, recommendedSupplements } = supplementsData;

    if (allSupplements.length === 0) {
      return (
        <Card style={styles.emptyCard}>
          <Pill size={48} color={theme.color.muted} />
          <Text style={styles.emptyTitle}>No Supplements Yet</Text>
          <Text style={styles.emptySubtitle}>
            Complete your onboarding and generate a plan to see supplement recommendations
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
              <Text style={styles.statLabel}>Current</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{recommendedSupplements.length}</Text>
              <Text style={styles.statLabel}>Recommended</Text>
            </View>
          </View>
        </Card>

        {/* User's Current Supplements */}
        {userSupplements.length > 0 && (
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>💊 Currently Taking</Text>
              <Text style={styles.sectionSubtitle}>
                Supplements you're already using
              </Text>
            </View>
            {userSupplements.map((supp, index) => (
              <View key={`current-${index}`} style={styles.supplementItem}>
                <Text style={styles.supplementBullet}>•</Text>
                <Text style={styles.supplementText}>{supp}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Recommended Add-ons */}
        {recommendedSupplements.length > 0 && (
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>✨ Recommended Add-ons</Text>
              <Text style={styles.sectionSubtitle}>
                Evidence-based supplements tailored to your goals
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
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
    padding: theme.space.md,
  },
  toggleContainer: {
    flexDirection: 'row',
    padding: theme.space.md,
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
  },
});

