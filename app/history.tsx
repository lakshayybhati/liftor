import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Calendar, TrendingUp, Activity, Target, Scale } from 'lucide-react-native';
import Svg, { Line, Circle, Polyline } from 'react-native-svg';
import { Card } from '@/components/ui/Card';
import { useUserStore } from '@/hooks/useUserStore';
import { MOOD_OPTIONS } from '@/constants/fitness';
import { theme } from '@/constants/colors';

type TimeRange = '7d' | '14d' | '30d';

// Map our rich moodCharacter ids/labels to a representative emoji
const MOOD_CHARACTER_EMOJI: Record<string, string> = {
  excited: '🤩',
  joyful: '😄',
  grateful: '🤗',
  energized: '😁',
  sensitive: '😌',
  confused: '😕',
  bored: '😐',
  stressed: '😫',
  angry: '😠',
  insecure: '😟',
  hurt: '😢',
  guilty: '😞',
};

// Mood mapping function: converts mood (string/number or moodCharacter id/label) to emoji with fallback
const getMoodEmoji = (mood?: string | number): string => {
  if (typeof mood === 'number') {
    // Handle 1-5 numeric scale
    const moodIndex = Math.max(0, Math.min(4, mood - 1)); // Convert 1-5 to 0-4 index
    return MOOD_OPTIONS[moodIndex]?.emoji || '😐'; // Fallback to neutral
  }
  
  if (typeof mood === 'string') {
    // If it's already an emoji string, return it
    if (mood.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u)) {
      return mood;
    }
    // Try to find matching mood option by label
    const lower = mood.toLowerCase().trim();
    const moodOption = MOOD_OPTIONS.find(option => option.label.toLowerCase() === lower);
    if (moodOption) return moodOption.emoji;
    // Try mapping moodCharacter id/label to an emoji
    if (MOOD_CHARACTER_EMOJI[lower]) return MOOD_CHARACTER_EMOJI[lower];
    // Also support label variants like "Very Excited" → "excited"
    for (const key in MOOD_CHARACTER_EMOJI) {
      if (lower.includes(key)) return MOOD_CHARACTER_EMOJI[key];
    }
    return '😐';
  }
  
  // Fallback to neutral emoji when no mood data
  return '😐';
};

// Get latest check-in for a specific date
const getLatestCheckinForDate = (checkins: any[], date: string) => {
  const dayCheckins = checkins.filter(checkin => checkin.date === date);
  return dayCheckins.length > 0 ? dayCheckins[dayCheckins.length - 1] : null;
};

export default function HistoryScreen() {
  const userStore = useUserStore();
  
  // Handle case where user store is temporarily unavailable during data clearing
  if (!userStore) {
    return (
      <View style={styles.container}>
        <Stack.Screen 
          options={{ 
            title: 'History & Progress',
            headerStyle: { backgroundColor: theme.color.bg },
            headerTintColor: theme.color.ink,
          }} 
        />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }
  
  const { getRecentCheckins, plans, getWeightData, getWeightProgress, user } = userStore;
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');

  const days = timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : 30;
  
  // Memoized data selectors for performance
  const memoizedData = useMemo(() => {
    const recentCheckins = getRecentCheckins(days);
    const recentPlans = plans.slice(-days);
    const weightData = getWeightData();
    const weightProgress = getWeightProgress();
    
    return {
      recentCheckins,
      recentPlans,
      weightData,
      weightProgress,
      hasCheckins: recentCheckins.length > 0,
      hasPlans: recentPlans.length > 0,
      hasWeightData: weightData.length > 0
    };
  }, [getRecentCheckins, plans, getWeightData, getWeightProgress, days]);
  
  const { recentCheckins, recentPlans, weightData, weightProgress, hasCheckins, hasPlans, hasWeightData } = memoizedData;

  // Memoized statistics calculations with error handling
  const statistics = useMemo(() => {
    const getAverageEnergy = () => {
      if (!hasCheckins) return 0;
      const energyLevels = recentCheckins
        .filter(c => c.energy && typeof c.energy === 'number')
        .map(c => c.energy!);
      
      if (energyLevels.length === 0) return 0;
      return Math.round((energyLevels.reduce((a, b) => a + b, 0) / energyLevels.length) * 10) / 10;
    };

    const getAverageStress = () => {
      if (!hasCheckins) return 0;
      const stressLevels = recentCheckins
        .filter(c => c.stress && typeof c.stress === 'number')
        .map(c => c.stress!);
      
      if (stressLevels.length === 0) return 0;
      return Math.round((stressLevels.reduce((a, b) => a + b, 0) / stressLevels.length) * 10) / 10;
    };

    const getCompletionRate = () => {
      // Prefer adherence when available: weighted average giving more importance to recent days
      const plansWithAdherence = recentPlans.filter(p => typeof p.adherence === 'number');
      if (plansWithAdherence.length > 0) {
        // Use weighted average: recent days have more weight
        // Most recent day has weight 1.0, second most recent 0.9, etc.
        let weightedSum = 0;
        let totalWeight = 0;
        
        plansWithAdherence.forEach((p, index) => {
          // Calculate weight: more recent = higher weight
          const weight = 1 - (index * 0.1); // Decreases by 10% for each day back
          const actualWeight = Math.max(0.3, weight); // Minimum weight of 0.3
          
          weightedSum += (p.adherence || 0) * actualWeight;
          totalWeight += actualWeight;
        });
        
        const avg = totalWeight > 0 ? weightedSum / totalWeight : 0;
        return Math.round(avg * 100);
      }

      // Fallback: compute completion as coverage of days with a check-in
      if (hasCheckins) {
        const today = new Date();
        const dateKeys = new Set<string>();
        for (let i = 0; i < days; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          dateKeys.add(d.toISOString().split('T')[0]);
        }
        const checkinDates = new Set(recentCheckins.map(c => c.date));
        let covered = 0;
        dateKeys.forEach(d => { if (checkinDates.has(d)) covered++; });
        return Math.round((covered / Math.max(days, 1)) * 100);
      }

      return 0;
    };
    
    return {
      averageEnergy: getAverageEnergy(),
      averageStress: getAverageStress(),
      completionRate: getCompletionRate()
    };
  }, [recentCheckins, recentPlans, hasCheckins, hasPlans, days]);

  const renderTimeRangeSelector = () => (
    <View style={styles.timeRangeSelector}>
      {(['7d', '14d', '30d'] as TimeRange[]).map((range) => (
        <TouchableOpacity
          key={range}
          style={[
            styles.timeRangeButton,
            timeRange === range && styles.activeTimeRange,
          ]}
          onPress={() => setTimeRange(range)}
        >
          <Text style={[
            styles.timeRangeText,
            timeRange === range && styles.activeTimeRangeText,
          ]}>
            {range === '7d' ? '7 Days' : range === '14d' ? '14 Days' : '30 Days'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStatsCards = () => (
    <View style={styles.statsGrid}>
      <Card style={styles.statCard}>
        <View style={styles.statContent}>
          <Activity color={theme.color.accent.primary} size={24} />
          <Text style={styles.statValue}>{recentCheckins.length}</Text>
          <Text style={styles.statLabel}>Check-ins</Text>
        </View>
      </Card>

      <Card style={styles.statCard}>
        <View style={styles.statContent}>
          <TrendingUp color={theme.color.accent.green} size={24} />
          <Text style={styles.statValue}>
            {hasCheckins ? statistics.averageEnergy.toFixed(1) : '--'}
          </Text>
          <Text style={styles.statLabel}>Avg Energy</Text>
        </View>
      </Card>

      <Card style={styles.statCard}>
        <View style={styles.statContent}>
          <Calendar color={theme.color.accent.blue} size={24} />
          <Text style={styles.statValue}>
            {(hasPlans || hasCheckins) ? `${statistics.completionRate}%` : '--'}
          </Text>
          <Text style={styles.statLabel} numberOfLines={1}>Completion</Text>
        </View>
      </Card>
    </View>
  );

  const renderWeightChart = () => {
    if (!hasWeightData) {
      return (
        <Card style={styles.weightCard}>
          <Text style={styles.chartTitle}>Weight Progress</Text>
          <Text style={styles.noDataText}>
            {'No weight data available'}
          </Text>
        </Card>
      );
    }

    // Filter weight data to respect selected time range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const recentWeightData = weightData
      .filter(point => new Date(point.date) >= cutoffDate)
      .slice(-Math.min(days, 15)); // Show up to 15 entries for readability
    
    // Safety check: if no weight data in selected time range, show message
    if (recentWeightData.length === 0) {
      return (
        <Card style={styles.weightCard}>
          <Text style={styles.chartTitle}>Weight Progress</Text>
          <Text style={styles.noDataText}>No weight data available for selected time range</Text>
        </Card>
      );
    }
    
    const withGoal = typeof user?.goalWeight === 'number' && !Number.isNaN(user.goalWeight);
    const rawMin = Math.min(...recentWeightData.map(d => d.weight), withGoal ? user!.goalWeight! : Infinity);
    const rawMax = Math.max(...recentWeightData.map(d => d.weight), withGoal ? user!.goalWeight! : -Infinity);

    // Compute nice axis bounds and step to prevent odd ordering like 58 appearing below 57
    const computeNiceStep = (r: number) => {
      const candidates = [0.5, 1, 2, 5];
      const target = r / 4;
      let best = candidates[0];
      for (const c of candidates) {
        if (Math.abs(c - target) < Math.abs(best - target)) best = c;
      }
      return best;
    };
    const step = computeNiceStep(Math.max(1, rawMax - rawMin));
    const minWeight = Math.floor(rawMin / step) * step - step;
    const maxWeight = Math.ceil(rawMax / step) * step + step;
    const weightRange = Math.max(1, maxWeight - minWeight);
    const yTicks: number[] = [];
    for (let v = minWeight; v <= maxWeight + 1e-6; v += step) yTicks.push(Number(v.toFixed(2)));

    return (
      <Card style={styles.weightCard}>
        <View style={styles.weightHeader}>
          <View style={styles.weightTitleContainer}>
            <Scale color={theme.color.accent.primary} size={24} />
            <Text style={styles.chartTitle}>Weight</Text>
          </View>
          {weightProgress && (
            <View style={styles.progressContainer}>
              <Text style={styles.progressText}>
                {weightProgress.remaining.toFixed(1)} kg {weightProgress.isGaining ? 'to gain' : 'to lose'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.weightChart}>
          {/* Zone background */}
          <View style={styles.weightZone} />

          {/* Goal line (dashed) */}
          {withGoal && (
            <View 
              style={[
                styles.goalLine,
                { bottom: `${(((user!.goalWeight! - minWeight) / weightRange) * 100)}%` }
              ]}
            >
              <View style={styles.goalDash} />
              <Text style={styles.goalLabel}>Goal Weight</Text>
            </View>
          )}

          {/* Horizontal grid + y-axis labels */}
          {yTicks.map((tick, idx) => (
            <View key={`grid-${idx}`} style={[styles.gridLine, { bottom: `${(((tick - minWeight) / weightRange) * 100)}%` }]}>
              <Text style={styles.yTickLabel}>{tick}</Text>
            </View>
          ))}

          {/* SVG Chart - proper line rendering */}
          <Svg 
            width="100%" 
            height="100%" 
            style={styles.svgChart}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* Draw connecting line only if we have at least 2 points */}
            {recentWeightData.length > 1 && (
              <Polyline
                points={recentWeightData.map((point, index) => {
                  const denom = Math.max(1, recentWeightData.length - 1);
                  const x = (index / denom) * 100;
                  const y = 100 - ((point.weight - minWeight) / weightRange) * 100;
                  return `${x},${y}`;
                }).join(' ')}
                fill="none"
                stroke="#FF4444"
                strokeWidth="0.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            
            {/* Draw points */}
            {recentWeightData.map((point, index) => {
              const denom = Math.max(1, recentWeightData.length - 1);
              const x = (index / denom) * 100;
              const y = 100 - ((point.weight - minWeight) / weightRange) * 100;
              return (
                <Circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="1.5"
                  fill="#FF4444"
                  stroke={theme.color.bg}
                  strokeWidth="0.4"
                />
              );
            })}
          </Svg>

          {/* X-axis */}
          <View style={styles.xAxis}>
            {recentWeightData.map((point, idx) => {
              const date = new Date(point.date);
              const showLabel = idx === 0 || idx === Math.floor((recentWeightData.length - 1) / 2) || idx === recentWeightData.length - 1;
              const left = (idx / (recentWeightData.length - 1)) * 100;
              return (
                <View key={`x-${idx}`} style={[styles.xTick, { left: `${left}%` }]}>
                  <View style={styles.xTickMark} />
                  {showLabel && (
                    <Text style={styles.xTickLabel}>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </Card>
    );
  };

  const renderEnergyChart = () => {
    // Memoized energy data processing - respects selected time range
    const energyData = useMemo(() => {
      if (!hasCheckins) return [];
      return recentCheckins
        .filter(c => c.energy && typeof c.energy === 'number')
        .slice(0, Math.min(days, 10)) // Show up to 10 entries for readability, but respect time range
        .reverse();
    }, [recentCheckins, hasCheckins, days]);

    if (energyData.length === 0) {
      return (
        <Card style={styles.chartCard}>
          <Text style={styles.chartTitle}>Energy Levels</Text>
          <Text style={styles.noDataText}>No energy data available</Text>
        </Card>
      );
    }

    const maxEnergy = Math.max(10, ...energyData.map(c => c.energy!)); // Ensure min scale of 10

    // Dynamic title based on selected time range
    const timeRangeLabel = timeRange === '7d' ? '7 Days' : timeRange === '14d' ? '14 Days' : '30 Days';

    return (
      <Card style={styles.chartCard}>
        <Text style={styles.chartTitle}>Energy Levels (Last {timeRangeLabel})</Text>
        <View style={styles.chart}>
          {energyData.map((checkin, index) => {
            const height = (checkin.energy! / maxEnergy) * 100;
            const date = new Date(checkin.date);
            
            return (
              <View key={index} style={styles.chartBar}>
                <View style={styles.barContainer}>
                  <View 
                    style={[
                      styles.bar, 
                      { height: `${height}%` }
                    ]} 
                  />
                </View>
                <Text style={styles.barLabel}>
                  {date.getDate()}/{date.getMonth() + 1}
                </Text>
                <Text style={styles.barValue}>{checkin.energy}</Text>
              </View>
            );
          })}
        </View>
      </Card>
    );
  };

  const renderRecentCheckins = () => {
    const timeRangeLabel = timeRange === '7d' ? '7 Days' : timeRange === '14d' ? '14 Days' : '30 Days';
    
    return (
      <Card style={styles.checkinsCard}>
        <Text style={styles.checkinsTitle}>Recent Check-ins (Last {timeRangeLabel})</Text>
      {recentCheckins.length === 0 ? (
        <Text style={styles.noDataText}>No check-ins yet</Text>
      ) : (
        <ScrollView style={styles.checkinsList}>
          {recentCheckins.slice(0, Math.min(days, 20)).map((checkin, index) => {
            const date = new Date(checkin.date);
            
            return (
              <View key={index} style={styles.checkinItem}>
                <View style={styles.checkinDate}>
                  <Text style={styles.checkinDateText}>
                    {date.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </Text>
                  <Text style={styles.checkinMode}>{checkin.mode}</Text>
                </View>
                
                <View style={styles.checkinMetrics}>
                  {checkin.energy && (
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>Energy</Text>
                      <Text style={styles.metricValue}>{checkin.energy}/10</Text>
                    </View>
                  )}
                  {checkin.stress && (
                    <View style={styles.metric}>
                      <Text style={styles.metricLabel}>Stress</Text>
                      <Text style={styles.metricValue}>{checkin.stress}/10</Text>
                    </View>
                  )}
                  <View style={styles.metric}>
                    <Text style={styles.metricLabel}>Mood</Text>
                    <Text style={styles.metricValue}>{getMoodEmoji((checkin as any).moodCharacter || checkin.mood)}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'History & Progress',
          headerStyle: { backgroundColor: theme.color.bg },
          headerTintColor: theme.color.ink,
        }} 
      />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {renderTimeRangeSelector()}
          {renderStatsCards()}
          {renderWeightChart()}
          {renderEnergyChart()}
          {renderRecentCheckins()}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.space.lg,
  },
  timeRangeSelector: {
    flexDirection: 'row',
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.md,
    padding: 4,
    marginBottom: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeTimeRange: {
    backgroundColor: theme.color.accent.primary,
  },
  timeRangeText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.color.muted,
  },
  activeTimeRangeText: {
    color: theme.color.bg,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minHeight: 100,
  },
  statContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.ink,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: theme.color.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  chartCard: {
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 16,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 120,
  },
  chartBar: {
    alignItems: 'center',
    flex: 1,
  },
  barContainer: {
    height: 80,
    width: 20,
    backgroundColor: theme.color.card,
    borderRadius: 10,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  bar: {
    backgroundColor: theme.color.accent.primary,
    width: '100%',
    borderRadius: 10,
  },
  barLabel: {
    fontSize: 10,
    color: theme.color.muted,
    marginTop: 4,
  },
  barValue: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.color.ink,
    marginTop: 2,
  },
  checkinsCard: {
    marginBottom: 20,
  },
  checkinsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 16,
  },
  checkinsList: {
    maxHeight: 300,
  },
  checkinItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
  },
  checkinDate: {
    width: 80,
    alignItems: 'center',
  },
  checkinDateText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.ink,
  },
  checkinMode: {
    fontSize: 10,
    color: theme.color.muted,
    marginTop: 2,
    backgroundColor: theme.color.card,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  checkinMetrics: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
    marginLeft: 16,
  },
  metric: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    color: theme.color.muted,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.ink,
    marginTop: 2,
  },
  noDataText: {
    fontSize: 14,
    color: theme.color.muted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 20,
  },
  // Weight chart styles
  weightCard: {
    marginBottom: 20,
    minHeight: 200,
  },
  weightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  weightTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressContainer: {
    alignItems: 'flex-end',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.accent.primary,
  },
  weightChart: {
    height: 150,
    position: 'relative',
    marginHorizontal: 10,
  },
  weightZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 10,
    bottom: 10,
    backgroundColor: theme.color.accent.blue + '10',
    borderRadius: 8,
  },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    zIndex: 1,
  },
  goalDash: {
    borderTopWidth: 2,
    borderTopColor: '#FFFFFF',
    borderStyle: 'dashed',
  },
  goalLabel: {
    position: 'absolute',
    right: 6,
    top: -10,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  svgChart: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
    zIndex: 0,
  },
  yTickLabel: {
    position: 'absolute',
    left: 0,
    transform: [{ translateY: -8 }],
    color: theme.color.muted,
    fontSize: 10,
  },
  xAxis: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -18,
    height: 18,
  },
  xTick: {
    position: 'absolute',
    alignItems: 'center',
  },
  xTickMark: {
    width: 1,
    height: 6,
    backgroundColor: theme.color.line,
  },
  xTickLabel: {
    marginTop: 2,
    color: theme.color.muted,
    fontSize: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.space.lg,
  },
  loadingText: {
    fontSize: 16,
    color: theme.color.muted,
    textAlign: 'center',
  },
});