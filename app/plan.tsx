import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Platform, Modal, Animated, Easing, BackHandler, ActivityIndicator, Alert } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Dumbbell, Apple, Heart, Sparkles, CheckCircle, Check, Camera, ChevronDown, ChevronLeft, RefreshCw, Zap, Trophy, Flame, Pill, Gauge, AlertCircle, History } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';
import { useNavigation } from '@react-navigation/native';
import { MoodCharacter } from '@/components/ui/MoodCharacter';
import { MOOD_CHARACTERS } from '@/constants/fitness';

import ConfettiOverlay from '@/components/ConfettiOverlay';

type PlanTab = 'workout' | 'nutrition' | 'recovery' | 'motivation';

// Solid colors that roughly match the header gradients for each tab
const TAB_COLORS: Record<PlanTab, string> = {
  workout: '#FF512F',   // matches workout header gradient start
  nutrition: '#11998e', // matches nutrition header gradient start
  recovery: '#8E2DE2',  // matches recovery header gradient start
  motivation: '#EF4444' // matches motivation header gradient start
};

// Animation Helper Component
const FadeInView = ({ children, delay = 0, style }: { children: React.ReactNode, delay?: number, style?: any }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 500,
        delay,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.5)),
      }),
    ]).start();
  }, [delay, fadeAnim, translateY]);

  return (
    <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
};

// Bouncy Checkbox Component
const BouncyCheckbox = ({ checked, onPress, color = theme.color.accent.green }: { checked: boolean, onPress: () => void, color?: string }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.8, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1.2, duration: 150, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Animated.View style={[
        {
          width: 32,
          height: 32,
          borderRadius: 16,
          borderWidth: 2,
          borderColor: checked ? color : theme.color.muted,
          backgroundColor: checked ? color : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        },
        { transform: [{ scale: scaleAnim }] }
      ]}>
        {checked && <Check size={18} color={theme.color.bg} strokeWidth={3} />}
      </Animated.View>
    </TouchableOpacity>
  );
};

interface MockFood {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

const MOCK_FOODS: MockFood[] = [
  { name: 'Grilled Chicken Breast', calories: 165, protein: 31, fat: 3.6, carbs: 0 },
  { name: 'Brown Rice (1 cup)', calories: 216, protein: 5, fat: 1.8, carbs: 45 },
  { name: 'Avocado (half)', calories: 160, protein: 2, fat: 15, carbs: 9 },
  { name: 'Greek Yogurt (1 cup)', calories: 130, protein: 23, fat: 0, carbs: 9 },
  { name: 'Banana', calories: 105, protein: 1.3, fat: 0.4, carbs: 27 },
  { name: 'Almonds (1 oz)', calories: 164, protein: 6, fat: 14, carbs: 6 },
  { name: 'Salmon Fillet', calories: 206, protein: 22, fat: 12, carbs: 0 },
  { name: 'Sweet Potato', calories: 112, protein: 2, fat: 0.1, carbs: 26 },
  { name: 'Spinach Salad', calories: 23, protein: 2.9, fat: 0.4, carbs: 3.6 },
  { name: 'Oatmeal (1 cup)', calories: 147, protein: 5.3, fat: 2.8, carbs: 25 },
];

interface ExtraFood {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  timestamp: string;
}

export default function PlanScreen() {
  const { user, plans, checkins, foodLogs, getCompletedMealsForDate, getCompletedExercisesForDate, getCompletedSupplementsForDate, toggleMealCompleted, toggleExerciseCompleted, toggleSupplementCompleted, addCheckin, deleteTodayPlan } = useUserStore();
  const { tab, celebrate } = useLocalSearchParams<{ tab?: string; celebrate?: string }>();
  const [activeTab, setActiveTab] = useState<PlanTab>('workout');
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set());
  const [completedMeals, setCompletedMeals] = useState<Set<string>>(new Set());
  const [completedSupplements, setCompletedSupplements] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [showConfetti, setShowConfetti] = useState(celebrate === '1');
  const [confettiAnim] = useState(new Animated.Value(0));
  const [isWaitingForPlan, setIsWaitingForPlan] = useState(false);
  const navigation = useNavigation();

  // ...

  const handleRetryPlan = async () => {
    if (isRetrying) return;

    const todayKey = new Date().toISOString().split('T')[0];
    if (selectedDate !== todayKey) return; // Only allow for today

    Alert.alert(
      "Re-do Today's Check-in?",
      "This will delete today's plan and previous check-in data, letting you start fresh.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Re-do Check-in",
          style: "destructive",
          onPress: async () => {
            // Delete today's plan, check-in and completions first
            try {
              await deleteTodayPlan();
              console.log('[Plan] Today\'s data deleted, navigating to check-in');
            } catch (e) {
              console.warn('[Plan] Failed to delete today\'s data:', e);
            }
            // Navigate to check-in screen for a fresh start
            router.push({ pathname: '/checkin', params: { isRedo: 'true' } });
          }
        }
      ]
    );
  };

  // Set initial tab from URL parameter
  useEffect(() => {
    if (tab && ['workout', 'nutrition', 'recovery', 'motivation'].includes(tab)) {
      setActiveTab(tab as PlanTab);
    }
  }, [tab]);

  // Override hardware back to go home instead of previous (e.g., check-in)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(tabs)/home');
      return true;
    });
    return () => sub.remove();
  }, []);

  // Intercept gesture/back to avoid returning to generating screen
  useEffect(() => {
    const unsubBeforeRemove = navigation.addListener('beforeRemove', (e: any) => {
      const actionType = e?.data?.action?.type;
      if (actionType === 'GO_BACK' || actionType === 'POP') {
        e.preventDefault();
        router.replace('/(tabs)/home');
      }
    });
    return () => {
      try { unsubBeforeRemove(); } catch { }
    };
  }, [navigation]);

  // Animate confetti banner in → hold → out, then auto-dismiss
  useEffect(() => {
    if (!showConfetti) return;
    
    // Keep visible long enough for particles to fall
    const timer = setTimeout(() => {
      setShowConfetti(false);
      try { router.setParams({ celebrate: undefined as any }); } catch { }
    }, 4500);
    
    return () => clearTimeout(timer);
  }, [showConfetti]);

  const plan = useMemo(() => plans.find(p => p.date === selectedDate), [plans, selectedDate]);
  const todayCheckin = useMemo(() => checkins.find(c => c.date === selectedDate), [checkins, selectedDate]);
  const dayExtras = useMemo(() => (foodLogs.find(l => l.date === selectedDate)?.extras) || [], [foodLogs, selectedDate]);
  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  // Handle race condition: Wait for plan to be available if navigated from generating-plan
  useEffect(() => {
    if (!plan && isToday && celebrate === '1') {
      console.log('[PlanScreen] Navigated from generation but no plan found yet, waiting...');
      setIsWaitingForPlan(true);

      let attempts = 0;
      const maxAttempts = 8; // Wait up to 4 seconds (8 * 500ms)

      const checkInterval = setInterval(() => {
        attempts++;
        const currentPlan = plans.find(p => p.date === selectedDate);

        console.log(`[PlanScreen] Waiting attempt ${attempts}/${maxAttempts} - Plan exists:`, currentPlan ? 'YES' : 'NO');

        if (currentPlan) {
          console.log('[PlanScreen] ✅ Plan appeared after waiting!');
          clearInterval(checkInterval);
          setIsWaitingForPlan(false);
          return;
        }

        if (attempts >= maxAttempts) {
          console.warn('[PlanScreen] ⚠️ No plan after waiting, staying on plan screen');
          clearInterval(checkInterval);
          setIsWaitingForPlan(false);
        }
      }, 500);

      return () => clearInterval(checkInterval);
    }
  }, [plan, isToday, celebrate, selectedDate, plans]);

  // Load persisted ticks for selected date
  useEffect(() => {
    const meals = new Set(getCompletedMealsForDate(selectedDate));
    const ex = new Set(getCompletedExercisesForDate(selectedDate));
    const supps = new Set(getCompletedSupplementsForDate(selectedDate));
    setCompletedMeals(meals);
    setCompletedExercises(ex);
    setCompletedSupplements(supps);
  }, [selectedDate, getCompletedMealsForDate, getCompletedExercisesForDate, getCompletedSupplementsForDate]);

  const totalCalorieTarget = plan?.nutrition?.total_kcal || 2000;
  const proteinTarget = plan?.nutrition?.protein_g || 150;
  const fatTarget = Math.round((totalCalorieTarget * 0.25) / 9);
  const carbTarget = Math.round((totalCalorieTarget - (proteinTarget * 4) - (fatTarget * 9)) / 4);

  // Generate dynamic meals based on user preferences (supports 1-8 meals)
  const generateMealsData = useCallback(() => {
    // Priority: 1) Actual meals in the plan, 2) User's mealCount preference, 3) Default to 3
    const planMealsCount = plan?.nutrition?.meals?.length || 0;
    const userMealCount = user?.mealCount || 3;

    // Use plan's actual meal count if available and valid (1-8), otherwise use user preference
    const mealCount = Math.min(8, Math.max(1, planMealsCount > 0 ? planMealsCount : userMealCount));

    // Calorie distributions for 1-8 meals
    // Designed to distribute calories appropriately throughout the day
    const baseCalorieDistribution: Record<number, number[]> = {
      1: [1.0], // OMAD - single feeding window
      2: [0.45, 0.55], // Two meals - brunch/dinner style
      3: [0.3, 0.4, 0.3], // breakfast, lunch, dinner
      4: [0.25, 0.35, 0.15, 0.25], // breakfast, lunch, snack, dinner
      5: [0.22, 0.08, 0.35, 0.10, 0.25], // breakfast, morning snack, lunch, afternoon snack, dinner
      6: [0.20, 0.08, 0.30, 0.10, 0.25, 0.07], // breakfast, morning snack, lunch, afternoon snack, dinner, evening snack
      7: [0.18, 0.07, 0.25, 0.08, 0.22, 0.08, 0.12], // 7 meals - bodybuilder style
      8: [0.15, 0.06, 0.20, 0.07, 0.18, 0.07, 0.15, 0.12], // 8 meals - frequent feeding
    };

    // Comprehensive meal templates for all possible meal slots
    const mealTemplates: Record<number, { name: string; insight: string; emoji: string; mealType: string }[]> = {
      1: [
        { name: 'Main Meal', insight: 'Your complete daily nutrition in one satisfying meal 🍽️', emoji: '🥘', mealType: 'main_meal' },
      ],
      2: [
        { name: 'First Meal', insight: 'Start your feeding window strong 💪', emoji: '🍳', mealType: 'first_meal' },
        { name: 'Second Meal', insight: 'Finish the day with a nourishing meal 🌙', emoji: '🍲', mealType: 'second_meal' },
      ],
      3: [
        { name: 'Breakfast', insight: 'All you need is some breakfast ☀️', emoji: '🍳', mealType: 'breakfast' },
        { name: 'Lunch', insight: "Don't miss lunch 😋 It's time to get a tasty meal", emoji: '🍽️', mealType: 'lunch' },
        { name: 'Dinner', insight: 'End your day with a nutritious dinner 🌙', emoji: '🍲', mealType: 'dinner' },
      ],
      4: [
        { name: 'Breakfast', insight: 'Fuel your morning right ☀️', emoji: '🍳', mealType: 'breakfast' },
        { name: 'Lunch', insight: 'Power through your day 💪', emoji: '🍽️', mealType: 'lunch' },
        { name: 'Afternoon Snack', insight: 'Keep your energy steady 🍎', emoji: '🥗', mealType: 'afternoon_snack' },
        { name: 'Dinner', insight: 'Wind down with a great meal 🌙', emoji: '🍲', mealType: 'dinner' },
      ],
      5: [
        { name: 'Breakfast', insight: 'Start strong with breakfast ☀️', emoji: '🍳', mealType: 'breakfast' },
        { name: 'Morning Snack', insight: 'Quick energy boost 🥜', emoji: '🥨', mealType: 'morning_snack' },
        { name: 'Lunch', insight: 'Midday fuel for peak performance 💪', emoji: '🍽️', mealType: 'lunch' },
        { name: 'Afternoon Snack', insight: 'Beat the afternoon slump 🍎', emoji: '🥗', mealType: 'afternoon_snack' },
        { name: 'Dinner', insight: 'Recover and refuel 🌙', emoji: '🍲', mealType: 'dinner' },
      ],
      6: [
        { name: 'Breakfast', insight: 'Rise and shine with breakfast ☀️', emoji: '🍳', mealType: 'breakfast' },
        { name: 'Morning Snack', insight: 'Keep metabolism humming 🥜', emoji: '🥨', mealType: 'morning_snack' },
        { name: 'Lunch', insight: 'Power lunch time 💪', emoji: '🍽️', mealType: 'lunch' },
        { name: 'Afternoon Snack', insight: 'Stay fueled through the day 🍎', emoji: '🥗', mealType: 'afternoon_snack' },
        { name: 'Dinner', insight: 'Evening nourishment 🌙', emoji: '🍲', mealType: 'dinner' },
        { name: 'Evening Snack', insight: 'Light bite before rest 🌜', emoji: '🍪', mealType: 'evening_snack' },
      ],
      7: [
        { name: 'Breakfast', insight: 'First meal of the day ☀️', emoji: '🍳', mealType: 'breakfast' },
        { name: 'Mid-Morning', insight: 'Keep the gains coming 💪', emoji: '🥜', mealType: 'mid_morning' },
        { name: 'Lunch', insight: 'Midday protein hit 🍽️', emoji: '🍽️', mealType: 'lunch' },
        { name: 'Afternoon Snack', insight: 'Pre-workout fuel 🔥', emoji: '🍌', mealType: 'afternoon_snack' },
        { name: 'Post-Workout', insight: 'Recovery window nutrition 🏋️', emoji: '🥤', mealType: 'post_workout' },
        { name: 'Dinner', insight: 'Evening muscle fuel 🌙', emoji: '🍲', mealType: 'dinner' },
        { name: 'Before Bed', insight: 'Overnight recovery support 😴', emoji: '🥛', mealType: 'before_bed' },
      ],
      8: [
        { name: 'Breakfast', insight: 'Wake up your metabolism ☀️', emoji: '🍳', mealType: 'breakfast' },
        { name: 'Snack 1', insight: 'Keep blood sugar stable 📈', emoji: '🥜', mealType: 'snack_1' },
        { name: 'Lunch', insight: 'Main midday meal 🍽️', emoji: '🍽️', mealType: 'lunch' },
        { name: 'Snack 2', insight: 'Afternoon energy boost ⚡', emoji: '🍎', mealType: 'snack_2' },
        { name: 'Pre-Workout', insight: 'Fuel for training 🔥', emoji: '🍌', mealType: 'pre_workout' },
        { name: 'Post-Workout', insight: 'Recovery starts now 🏋️', emoji: '🥤', mealType: 'post_workout' },
        { name: 'Dinner', insight: 'Evening nourishment 🌙', emoji: '🍲', mealType: 'dinner' },
        { name: 'Before Bed', insight: 'Casein time for overnight gains 😴', emoji: '🥛', mealType: 'before_bed' },
      ],
    };

    const distribution = baseCalorieDistribution[mealCount] || baseCalorieDistribution[3];
    const templates = mealTemplates[mealCount] || mealTemplates[3];

    // If the plan has meals from AI, try to use their names
    const planMeals = plan?.nutrition?.meals || [];

    return templates.map((template, index) => {
      // Use AI-generated meal name if available, otherwise use template
      const aiMealName = planMeals[index]?.name;
      const displayName = aiMealName && aiMealName.length > 0 ? aiMealName : template.name;

      return {
        ...template,
        name: displayName,
        targetCalories: Math.round(totalCalorieTarget * distribution[index]),
      };
    });
  }, [user?.mealCount, totalCalorieTarget, plan?.nutrition?.meals, plan?.nutrition?.meals?.length]);

  // Calculate totals from completed meals + extras
  const completedMealTotals = useMemo(() => {
    const mealsData = generateMealsData();
    let calories = 0, protein = 0, fat = 0, carbs = 0;

    mealsData.forEach(meal => {
      if (completedMeals.has(meal.mealType)) {
        calories += meal.targetCalories;
        // Estimate macros based on target calories (rough approximation)
        protein += Math.round(meal.targetCalories * 0.25 / 4); // 25% protein
        fat += Math.round(meal.targetCalories * 0.25 / 9); // 25% fat  
        carbs += Math.round(meal.targetCalories * 0.5 / 4); // 50% carbs
      }
    });

    return { calories, protein, fat, carbs };
  }, [completedMeals, generateMealsData]);

  const extraTotals = useMemo(() => {
    return dayExtras.reduce((totals, food) => ({
      calories: totals.calories + food.calories,
      protein: totals.protein + food.protein,
      fat: totals.fat + food.fat,
      carbs: totals.carbs + food.carbs,
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
  }, [dayExtras]);
  const manualEntries = useMemo(() => dayExtras.filter((f: any) => (f.source ? f.source === 'manual' : !f.imagePath)), [dayExtras]);
  const snapEntries = useMemo(() => dayExtras.filter((f: any) => (f.source ? f.source === 'snap' : !!f.imagePath)), [dayExtras]);

  const currentCalories = completedMealTotals.calories + extraTotals.calories;
  const currentProtein = completedMealTotals.protein + extraTotals.protein;
  const currentFat = completedMealTotals.fat + extraTotals.fat;
  const currentCarbs = completedMealTotals.carbs + extraTotals.carbs;

  const toggleMealComplete = useCallback((mealType: string) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    setCompletedMeals(prev => {
      const next = new Set(prev);
      if (next.has(mealType)) next.delete(mealType); else next.add(mealType);
      // Persist in background
      toggleMealCompleted(selectedDate, mealType);
      return next;
    });
  }, [selectedDate, toggleMealCompleted]);

  const handleSnapFood = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }

    router.push('/snap-food');
  }, []);
  const handleManualEntry = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    router.push({ pathname: '/snap-food', params: { manual: '1' } as any });
  }, []);



  // Do not redirect when viewing past dates; show empty state instead

  const toggleExerciseComplete = (exerciseId: string) => {
    setCompletedExercises(prev => {
      const next = new Set(prev);
      if (next.has(exerciseId)) next.delete(exerciseId); else next.add(exerciseId);
      // Persist in background
      toggleExerciseCompleted(selectedDate, exerciseId);
      return next;
    });
  };

  const toggleSupplementComplete = (supplementName: string) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    setCompletedSupplements(prev => {
      const next = new Set(prev);
      if (next.has(supplementName)) next.delete(supplementName); else next.add(supplementName);
      // Persist in background
      toggleSupplementCompleted(selectedDate, supplementName);
      return next;
    });
  };



  const renderTabBar = () => (
    <View style={styles.tabBar}>
      {[
        { id: 'workout', icon: Dumbbell, label: 'Workout' },
        { id: 'nutrition', icon: Apple, label: 'Nutrition' },
        { id: 'recovery', icon: Heart, label: 'Recovery' },
        { id: 'motivation', icon: Sparkles, label: 'Motivation' },
      ].map((tab) => {
        const tabId = tab.id as PlanTab;
        const isActive = activeTab === tabId;
        const activeColor = TAB_COLORS[tabId];
        return (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tabButton,
              isActive && styles.activeTab,
              isActive && { backgroundColor: activeColor },
            ]}
            onPress={() => setActiveTab(tabId)}
            activeOpacity={0.7}
          >
            <tab.icon size={16} color={isActive ? '#FFFFFF' : theme.color.muted} />
            {isActive && <Text style={styles.activeTabText}>{tab.label}</Text>}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderWorkout = () => {
    if (!plan?.workout) {
      return (
        <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} bounces={true} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <FadeInView>
            <Card style={styles.headerCard}>
              <Text style={[styles.headerTitle, { color: theme.color.ink }]}>No Workout Plan</Text>
              <Text style={[styles.headerSubtitle, { color: theme.color.muted }]}>Complete a check-in to generate today's plan</Text>
            </Card>
          </FadeInView>
        </ScrollView>
      );
    }

    const workoutBlocks = plan?.workout?.blocks || [];
    const hasAdjustments = (plan?.adjustments?.length || 0) + (plan?.memoryAdjustments?.length || 0) > 0;

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} bounces={true} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <FadeInView delay={0}>
          <Card gradient gradientColors={['#FF512F', '#DD2476']} style={styles.headerCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8, gap: 8 }}>
              <Flame fill="#fff" color="#fff" size={24} />
              <Text style={[styles.headerTitle, styles.headerTitleCompact]}>Today's Workout</Text>
            </View>
            <Text style={styles.headerSubtitle}>Focus: {plan.workout?.focus?.join(', ') || 'General'}</Text>
            {plan?.isFromBasePlan ? (
              <View style={styles.tagContainer}>
                <Text style={styles.tagText}>Based on your week - adjusted today</Text>
              </View>
            ) : null}
            {plan?.workout?.notes ? <Text style={styles.headerNotes}>{plan.workout.notes}</Text> : null}
          </Card>
        </FadeInView>
        {hasAdjustments ? (
          <FadeInView delay={100}>
            <Card style={styles.adjustmentCard}>
              <View style={styles.adjustmentHeader}>
                <Zap size={20} color={theme.color.accent.yellow} fill={theme.color.accent.yellow} />
                <Text style={styles.adjustmentTitle}>Smart Adjustments</Text>
              </View>
              <View style={{ paddingBottom: 8 }}>
                {(plan?.adjustments || []).map((adjustment, index) => (
                  <View key={`adj-${index}`} style={styles.adjustmentRow}>
                    <View style={styles.bullet} />
                    <Text style={styles.adjustmentItem}>{adjustment}</Text>
                  </View>
                ))}
                {(plan?.memoryAdjustments || []).map((adjustment, index) => (
                  <View key={`mem-${index}`} style={styles.adjustmentRow}>
                    <View style={[styles.bullet, { backgroundColor: theme.color.accent.primary }]} />
                    <Text style={[styles.adjustmentItem, { color: theme.color.accent.primary, fontWeight: '500' }]}>{adjustment}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </FadeInView>
        ) : null}
        {workoutBlocks.map((block, blockIndex) => (
          <FadeInView key={blockIndex} delay={200 + (blockIndex * 100)}>
            <Card style={styles.blockCard}>
              <Text style={styles.blockTitle}>{block?.name || 'Block'}</Text>
              {(block?.items || []).map((item, itemIndex) => {
                const exerciseId = `${blockIndex}-${itemIndex}`;
                const isCompleted = completedExercises.has(exerciseId);
                const showSetsReps = item.sets && item.reps;
                const showRIR = item.RIR;
                const showDuration = item.duration_min;
                return (
                  <View key={itemIndex} style={styles.exerciseItem}>
                    <View style={styles.exerciseInfo}>
                      <Text style={[styles.exerciseName, isCompleted && styles.completedText]}>{item.exercise || item.type}</Text>
                      <View style={styles.exerciseMetaContainer}>
                        {showSetsReps ? <View style={styles.metaTag}><Text style={styles.metaText}>{item.sets} x {item.reps}</Text></View> : null}
                        {showRIR ? <View style={[styles.metaTag, { backgroundColor: theme.color.bg }]}><Text style={styles.metaText}>RIR {item.RIR}</Text></View> : null}
                        {showDuration ? <View style={styles.metaTag}><Text style={styles.metaText}>{item.duration_min} min</Text></View> : null}
                      </View>
                    </View>
                    <BouncyCheckbox checked={isCompleted} onPress={() => toggleExerciseComplete(exerciseId)} />
                  </View>
                );
              })}
            </Card>
          </FadeInView>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  const renderNutrition = () => {
    const mealsData = generateMealsData();
    const hasNutritionAdjustments = (plan?.nutritionAdjustments?.length || 0) > 0;

    return (
      <ScrollView
        style={styles.tabContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Calorie Summary */}
        <FadeInView delay={0}>
          <Card gradient gradientColors={['#11998e', '#38ef7d']} style={styles.headerCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <Apple fill="#fff" color="#fff" size={24} />
              <Text style={[styles.headerTitle, styles.headerTitleCompact]}>Nutrition Plan</Text>
            </View>
            <View style={styles.calorieHeader}>
              <Text style={styles.calorieCount}>
                {currentCalories} <Text style={{ fontSize: 16, fontWeight: '500', opacity: 0.8 }}>/ {totalCalorieTarget.toLocaleString()} kcal</Text>
              </Text>
            </View>

            <View style={styles.macroInsights}>
              <View style={styles.macroRow}>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{Math.round(currentProtein)}g</Text>
                  <Text style={styles.macroLabel}>Protein</Text>
                  <Text style={styles.macroTarget}>/{proteinTarget}g</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{Math.round(currentFat)}g</Text>
                  <Text style={styles.macroLabel}>Fat</Text>
                  <Text style={styles.macroTarget}>/{fatTarget}g</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{Math.round(currentCarbs)}g</Text>
                  <Text style={styles.macroLabel}>Carbs</Text>
                  <Text style={styles.macroTarget}>/{carbTarget}g</Text>
                </View>
              </View>
              {extraTotals.calories > 0 && (
                <Text style={styles.extrasLine}>
                  + {extraTotals.calories} Cal from extras
                </Text>
              )}
            </View>
          </Card>
        </FadeInView>

        {/* Nutrition Smart Adjustments Card */}
        {hasNutritionAdjustments ? (
          <FadeInView delay={100}>
            <Card style={styles.adjustmentCard}>
              <View style={styles.adjustmentHeader}>
                <Zap size={20} color={theme.color.accent.green} fill={theme.color.accent.green} />
                <Text style={styles.adjustmentTitle}>Today's Nutrition Adjustments</Text>
              </View>
              <View style={{ paddingBottom: 8 }}>
                {(plan?.nutritionAdjustments || []).map((adjustment, index) => (
                  <View key={`nutr-adj-${index}`} style={styles.adjustmentRow}>
                    <View style={[styles.bullet, { backgroundColor: theme.color.accent.green }]} />
                    <Text style={styles.adjustmentItem}>{adjustment}</Text>
                  </View>
                ))}
              </View>
            </Card>
          </FadeInView>
        ) : null}

        {/* Meals List with Checkbox Actions */}
        <View style={styles.mealsContainer}>
          {mealsData.map((meal, index) => {
            const isCompleted = completedMeals.has(meal.mealType);

            return (
              <FadeInView key={meal.name} delay={100 + (index * 50)}>
                <Card style={[styles.mealCard, isCompleted ? styles.completedMealCard : undefined] as any}>
                  <View style={styles.mealHeader}>
                    <View style={styles.mealInfo}>
                      <Text style={[styles.mealName, isCompleted && styles.completedMealText]}>
                        {meal.name}
                      </Text>
                      <Text style={[styles.mealCalories, isCompleted && styles.completedMealText]}>
                        {meal.targetCalories} Cal {isCompleted ? '✓ Eaten' : ''}
                      </Text>
                    </View>

                    <BouncyCheckbox
                      checked={isCompleted}
                      onPress={() => toggleMealComplete(meal.mealType)}
                      color={theme.color.accent.green}
                    />
                  </View>

                  {/* Meal Insight */}
                  <View style={styles.insightContainer}>
                    <Text style={[styles.insightText, isCompleted && styles.completedMealText]}>
                      {meal.insight}
                    </Text>
                  </View>

                  {/* Show planned meals if available */}
                  {plan?.nutrition?.meals && plan.nutrition.meals[index] && (
                    <View style={styles.plannedMealsContainer}>
                      <Text style={[styles.plannedMealsTitle, isCompleted && styles.completedMealText]}>
                        Suggested:
                      </Text>
                      {(plan.nutrition.meals[index]?.items || []).map((item, itemIndex) => (
                        <Text key={itemIndex} style={[styles.plannedMealItem, isCompleted && styles.completedMealText]}>
                          • {item?.food || 'Item'} - {item?.qty || ''}
                        </Text>
                      ))}
                    </View>
                  )}
                </Card>
              </FadeInView>
            );
          })}
        </View>

        {/* Quick Actions Row */}
        <FadeInView delay={400}>
          <View style={styles.quickActionsContainer}>
            {/* Manual Entry */}
            <Card style={styles.quickActionCard}>
              <TouchableOpacity
                onPress={() => router.push('/food-entries')}
                style={styles.quickHistoryButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <History size={16} color={theme.color.muted} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleManualEntry}
                style={styles.quickActionContent}
                disabled={isLoading}
              >
                <View style={[styles.quickIconCircle, { backgroundColor: theme.color.accent.green + '15' }]}>
                  <Apple color={theme.color.accent.green} size={24} />
                </View>
                <Text style={styles.quickActionTitle}>Manual Entry</Text>
                <Text style={styles.quickActionSubtitle}>
                  {manualEntries.length > 0 ? `${manualEntries.length} added` : 'Log text'}
                </Text>
              </TouchableOpacity>
            </Card>

            {/* Snap Food AI */}
            <Card style={styles.quickActionCard}>
              <TouchableOpacity
                onPress={() => router.push('/food-snaps')}
                style={styles.quickHistoryButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <History size={16} color={theme.color.muted} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSnapFood}
                style={styles.quickActionContent}
                disabled={isLoading}
              >
                <View style={[styles.quickIconCircle, { backgroundColor: theme.color.accent.primary + '15' }]}>
                  <Camera color={theme.color.accent.primary} size={24} />
                </View>
                <Text style={styles.quickActionTitle}>Snap Food</Text>
                <Text style={styles.quickActionSubtitle}>
                  {snapEntries.length > 0 ? `${snapEntries.length} added` : 'Scan food'}
                </Text>
              </TouchableOpacity>
            </Card>
          </View>
        </FadeInView>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  const renderRecovery = () => {
    if (!plan?.recovery) {
      return (
        <ScrollView
          style={styles.tabContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          <FadeInView>
            <Card style={styles.headerCard}>
              <Text style={[styles.headerTitle, { color: theme.color.ink }]}>No Recovery Plan</Text>
              <Text style={[styles.headerSubtitle, { color: theme.color.muted }]}>Complete a check-in to generate today's plan</Text>
            </Card>
          </FadeInView>
        </ScrollView>
      );
    }

    return (
      <ScrollView
        style={styles.tabContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <FadeInView delay={0}>
          <Card gradient gradientColors={['#8E2DE2', '#4A00E0']} style={styles.headerCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <Heart fill="#fff" color="#fff" size={24} />
              <Text style={[styles.headerTitle, styles.headerTitleCompact]}>Recovery Plan</Text>
            </View>
            <Text style={styles.headerSubtitle}>
              Rest and recharge for tomorrow
            </Text>
          </Card>
        </FadeInView>

        <FadeInView delay={100}>
          <Card style={styles.recoveryCard}>
            <Text style={styles.recoveryTitle}>🧘‍♀️ Mobility & Movement</Text>
            {(plan?.recovery?.mobility || []).map((item, index) => (
              <Text key={index} style={styles.recoveryItem}>
                • {item}
              </Text>
            ))}
          </Card>
        </FadeInView>

        <FadeInView delay={200}>
          <Card style={styles.recoveryCard}>
            <Text style={styles.recoveryTitle}>😴 Sleep Optimization</Text>
            {(plan?.recovery?.sleep || []).map((item, index) => (
              <Text key={index} style={styles.recoveryItem}>
                • {item}
              </Text>
            ))}
          </Card>
        </FadeInView>

        {/* Supplements Card - Check both supplements array and supplementCard */}
        {(() => {
          // Combine supplements from both sources
          const directSupplements = plan?.recovery?.supplements || [];
          const cardCurrent = plan?.recovery?.supplementCard?.current || [];
          const cardAddOns = plan?.recovery?.supplementCard?.addOns || [];

          // Merge and dedupe all supplements
          const allSupplements = [...new Set([...directSupplements, ...cardCurrent, ...cardAddOns])];

          if (allSupplements.length === 0) return null;

          return (
            <FadeInView delay={300}>
              <Card style={styles.recoveryCard}>
                <Text style={styles.recoveryTitle}>💊 Today's Supplements</Text>
                {allSupplements.map((item: string, index: number) => {
                  const isCompleted = completedSupplements.has(item);
                  return (
                    <View key={index} style={styles.supplementRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.recoveryItem, isCompleted && styles.completedText, { marginBottom: 0 }]}>
                          {item}
                        </Text>
                      </View>
                      <BouncyCheckbox
                        checked={isCompleted}
                        onPress={() => toggleSupplementComplete(item)}
                        color={theme.color.accent.primary} // Purple for recovery tab
                      />
                    </View>
                  );
                })}
              </Card>
            </FadeInView>
          );
        })()}

        {/* Daily Debrief Card */}
        {plan?.recovery?.careNotes && (
          <FadeInView delay={400}>
            <Card style={styles.recoveryCard}>
              <Text style={styles.recoveryTitle}>Daily Debrief</Text>
              <Text style={styles.careNotesText}>{plan.recovery.careNotes}</Text>
            </Card>
          </FadeInView>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  const getPositiveMetricColor = (value?: number) => {
    if (!value || value <= 0) return theme.color.line;
    if (value >= 7) return theme.color.accent.green;
    if (value >= 4) return theme.color.accent.yellow;
    return '#EF4444';
  };

  const getStressMetricColor = (value?: number) => {
    if (!value || value <= 0) return theme.color.line;
    if (value <= 3) return theme.color.accent.green;
    if (value <= 6) return theme.color.accent.yellow;
    return '#EF4444';
  };

  const renderMotivation = () => {
    const moodChar = todayCheckin?.moodCharacter ? MOOD_CHARACTERS.find(m => m.id === todayCheckin.moodCharacter) : null;
    const motivationColor = getPositiveMetricColor(todayCheckin?.motivation);
    const energyColor = getPositiveMetricColor(todayCheckin?.energy);
    const stressColor = getStressMetricColor(todayCheckin?.stress);

    return (
      <ScrollView
        style={styles.tabContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Card gradient gradientColors={['#EF4444', '#B91C1C']} style={styles.motivationCard}>
          <Sparkles size={40} color="#FFFFFF" style={styles.motivationIcon} />
          <Text style={styles.motivationTitle}>Your Daily Motivation</Text>
          <Text style={styles.motivationText}>{plan?.motivation || ''}</Text>
        </Card>

        <FadeInView delay={100}>
          <Card style={styles.snapshotCard}>
            <Text style={styles.snapshotTitle}>Daily Snapshot</Text>

            {/* Mood */}
            {moodChar && (
              <View style={styles.snapshotRow}>
                <MoodCharacter mood={moodChar} selected={false} onPress={() => { }} size={60} />
                <View style={{ marginLeft: 16, flex: 1 }}>
                  <Text style={styles.snapshotLabel}>Mood</Text>
                  <Text style={styles.snapshotValue}>{moodChar.label}</Text>
                </View>
              </View>
            )}

            {/* Mental State Grid */}
            <View style={styles.mentalGrid}>
              {/* Motivation */}
              <View style={styles.mentalItem}>
                <Text style={styles.mentalLabel}>Motivation</Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${(todayCheckin?.motivation || 0) * 10}%`, backgroundColor: motivationColor }]} />
                </View>
                <Text style={styles.mentalValue}>{todayCheckin?.motivation || '-'}/10</Text>
              </View>
              {/* Energy */}
              <View style={styles.mentalItem}>
                <Text style={styles.mentalLabel}>Energy</Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${(todayCheckin?.energy || 0) * 10}%`, backgroundColor: energyColor }]} />
                </View>
                <Text style={styles.mentalValue}>{todayCheckin?.energy || '-'}/10</Text>
              </View>
              {/* Stress */}
              <View style={styles.mentalItem}>
                <Text style={styles.mentalLabel}>Stress</Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${(todayCheckin?.stress || 0) * 10}%`, backgroundColor: stressColor }]} />
                </View>
                <Text style={styles.mentalValue}>{todayCheckin?.stress || '-'}/10</Text>
              </View>
            </View>

            {/* Special Request */}
            {todayCheckin?.specialRequest ? (
              <View style={styles.requestContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <AlertCircle size={16} color={theme.color.accent.blue} />
                  <Text style={[styles.snapshotLabel, { marginLeft: 6, color: theme.color.accent.blue }]}>Special Request</Text>
                </View>
                <Text style={styles.requestText}>{todayCheckin.specialRequest}</Text>
              </View>
            ) : null}

            {/* Bottom Row: Supplements & Intensity */}
            <View style={styles.bottomRow}>
              <View style={styles.bottomItem}>
                <Pill size={20} color={todayCheckin?.suppsYN ? theme.color.accent.green : theme.color.muted} />
                <View style={{ marginLeft: 8 }}>
                  <Text style={styles.snapshotLabel}>Supplements</Text>
                  <Text style={[styles.snapshotValue, { color: todayCheckin?.suppsYN ? theme.color.accent.green : theme.color.muted }]}>
                    {todayCheckin?.suppsYN ? 'Taken' : 'Not Taken'}
                  </Text>
                </View>
              </View>

              <View style={styles.bottomItem}>
                <Gauge size={20} color={theme.color.accent.primary} />
                <View style={{ marginLeft: 8 }}>
                  <Text style={styles.snapshotLabel}>Intensity</Text>
                  <Text style={styles.snapshotValue}>{todayCheckin?.workoutIntensity || '-'}/10</Text>
                </View>
              </View>
            </View>

          </Card>
        </FadeInView>

        <Card style={styles.actionCard}>
          <Text style={styles.actionTitle}>Reset & Breathe</Text>
          <View style={styles.actionButtons}>
            <Button
              title="stressed? just breathe"
              onPress={() => router.push('/breathe' as any)}
              style={styles.actionButton}
            />
          </View>
        </Card>
      </ScrollView>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'workout':
        return renderWorkout();
      case 'nutrition':
        return renderNutrition();
      case 'recovery':
        return renderRecovery();
      case 'motivation':
        return renderMotivation();
      default:
        return renderWorkout();
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <TouchableOpacity onPress={() => setShowDatePicker(true)} accessibilityRole="button" accessibilityLabel="Open recent days selector" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: theme.color.ink, fontWeight: '700', fontSize: 18, marginRight: 6 }}>
                {isToday ? "Today's Plan" : new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
              <ChevronDown color={theme.color.ink} size={18} />
            </TouchableOpacity>
          ),
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.replace('/(tabs)/home')} style={{ paddingHorizontal: 8 }} accessibilityRole="button" accessibilityLabel="Go to Home">
              <ChevronLeft color={theme.color.ink} size={20} />
            </TouchableOpacity>
          ),
          headerRight: () => isToday && plan && (
            <TouchableOpacity
              onPress={handleRetryPlan}
              style={{ paddingHorizontal: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Regenerate plan"
              disabled={isRetrying}
            >
              <RefreshCw color={theme.color.muted} size={20} opacity={isRetrying ? 0.5 : 1} />
            </TouchableOpacity>
          ),
          headerStyle: { backgroundColor: theme.color.bg },
          headerTintColor: theme.color.ink,
        }}
      />

      <SafeAreaView style={styles.safeArea}>
        <ConfettiOverlay visible={showConfetti} />
        <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Jump to day</Text>
              <View style={styles.dateList}>
                {Array.from({ length: 10 }).map((_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - i);
                  const iso = d.toISOString().split('T')[0];
                  const label = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const isSelected = iso === selectedDate;
                  return (
                    <TouchableOpacity key={iso} style={[styles.dateItem, isSelected && styles.dateItemActive]} onPress={() => { setSelectedDate(iso); setShowDatePicker(false); }}>
                      <Text style={[styles.dateItemText, isSelected && styles.dateItemTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!isToday && (
                <TouchableOpacity style={styles.todayBtn} onPress={() => { setSelectedDate(new Date().toISOString().split('T')[0]); setShowDatePicker(false); }}>
                  <Text style={styles.todayBtnText}>Return to Today</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        {renderTabBar()}
        {plan ? renderContent() : isWaitingForPlan ? (
          <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: theme.space.lg }} keyboardDismissMode="on-drag">
            <Card style={{ padding: theme.space.lg, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.color.accent.primary} style={{ marginBottom: 12 }} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: theme.color.ink, marginBottom: 6 }}>Loading your plan...</Text>
              <Text style={{ color: theme.color.muted, textAlign: 'center' }}>Just a moment while we finalize everything.</Text>
            </Card>
          </ScrollView>
        ) : (
          <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: theme.space.lg }} keyboardDismissMode="on-drag">
            <Card style={{ padding: theme.space.lg }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: theme.color.ink, marginBottom: 6 }}>No plan found</Text>
              <Text style={{ color: theme.color.muted }}>We couldn't find a plan for this day. {isToday ? 'Please complete your check-in to generate today\'s plan.' : 'Try another day or return to Today.'}</Text>
            </Card>
          </ScrollView>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.color.bg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: theme.space.md,
    textAlign: 'center',
  },
  dateList: {
    gap: 8,
    marginBottom: theme.space.md,
  },
  dateItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
  },
  dateItemActive: {
    borderColor: theme.color.accent.blue,
    backgroundColor: theme.color.accent.blue + '20',
  },
  dateItemText: {
    color: theme.color.ink,
    textAlign: 'center',
    fontWeight: '600',
  },
  dateItemTextActive: {
    color: theme.color.accent.blue,
  },
  todayBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.color.accent.green,
    backgroundColor: theme.color.card,
    marginBottom: theme.space.sm,
  },
  todayBtnText: {
    color: theme.color.accent.green,
    fontWeight: '700',
  },
  modalClose: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  modalCloseText: {
    color: theme.color.muted,
  },
  confettiBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
    alignItems: 'center',
    zIndex: 2,
  },
  confettiBannerText: {
    backgroundColor: theme.color.accent.primary + '20',
    color: theme.color.accent.primary,
    borderWidth: 1,
    borderColor: theme.color.accent.primary + '40',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: '700',
  },
  safeArea: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.color.card,
    marginHorizontal: theme.space.lg,
    marginVertical: theme.space.sm,
    borderRadius: 100,
    padding: 6,
    borderWidth: 1,
    borderColor: theme.color.line,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 100,
    gap: 6,
  },
  activeTab: {
    backgroundColor: theme.color.accent.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.color.muted,
  },
  activeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tabContent: {
    flex: 1,
    padding: 20,
  },
  headerCard: {
    marginBottom: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  headerTitleCompact: {
    marginBottom: 0,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center',
  },
  headerNotes: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.8,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 16,
    width: '100%',
    paddingHorizontal: 16,
  },
  macroItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  macroValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  macroLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.8,
    marginTop: 2,
  },
  blockCard: {
    marginBottom: 16,
  },
  blockTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 12,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
  },
  exerciseInfo: {
    flex: 1,
    paddingRight: 12,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.color.ink,
  },
  exerciseDetails: {
    fontSize: 14,
    color: theme.color.muted,
    marginTop: 2,
  },
  completedText: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  checkButton: {
    padding: 8,
  },
  checkedButton: {
    backgroundColor: theme.color.accent.green,
    borderRadius: 20,
  },
  mealCard: {
    marginBottom: 16,
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mealName: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
  },
  mealItem: {
    fontSize: 14,
    color: theme.color.muted,
    marginBottom: 4,
  },
  recoveryCard: {
    marginBottom: 16,
  },
  recoveryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 12,
  },
  recoveryItem: {
    fontSize: 14,
    color: theme.color.muted,
    marginBottom: 6,
    lineHeight: 20,
  },
  careNotesText: {
    fontSize: 14,
    color: theme.color.ink,
    lineHeight: 20,
  },
  motivationCard: {
    alignItems: 'center',
    padding: 30,
    marginBottom: 20,
  },
  motivationIcon: {
    marginBottom: 16,
  },
  motivationTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  motivationText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 24,
  },
  snapshotCard: {
    marginBottom: 20,
    padding: 20,
  },
  snapshotTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: 16,
  },
  snapshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  snapshotLabel: {
    fontSize: 12,
    color: theme.color.muted,
    marginBottom: 4,
  },
  snapshotValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.ink,
  },
  mentalGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  mentalItem: {
    flex: 1,
  },
  mentalLabel: {
    fontSize: 11,
    color: theme.color.muted,
    marginBottom: 6,
  },
  mentalValue: {
    fontSize: 12,
    color: theme.color.ink,
    fontWeight: '500',
    textAlign: 'right',
    marginTop: 4,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: theme.color.line,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  requestContainer: {
    backgroundColor: theme.color.accent.blue + '10',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.color.accent.blue + '30',
  },
  requestText: {
    fontSize: 14,
    color: theme.color.ink,
    lineHeight: 20,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  bottomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  actionCard: {
    alignItems: 'center',
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 16,
  },
  actionButtons: {
    gap: 12,
    width: '100%',
  },
  actionButton: {
    width: '100%',
  },
  calorieHeader: {
    alignItems: 'center',
    marginBottom: theme.space.md,
  },
  calorieCount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  calorieLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  macroInsights: {
    alignItems: 'center',
  },
  insightsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: theme.space.xs,
  },
  macroBreakdown: {
    fontSize: 13,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
    opacity: 0.9,
  },
  macroTargets: {
    fontSize: 11,
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.7,
  },
  mealsContainer: {
    gap: theme.space.md,
  },
  mealInfo: {
    flex: 1,
  },
  mealCalories: {
    fontSize: 14,
    color: theme.color.muted,
  },

  completedMealCard: {
    backgroundColor: theme.color.line + '40',
    opacity: 0.8,
  },
  completedMealText: {
    opacity: 0.7,
  },
  checkboxButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedMealButton: {
    backgroundColor: theme.color.accent.green,
  },
  extrasLine: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.8,
    marginTop: 4,
    fontStyle: 'italic',
  },
  snapFoodCard: {
    marginTop: theme.space.md,
  },
  manualCard: {
    marginTop: theme.space.md,
  },
  snapFoodButton: {
    padding: 0,
  },
  snapFoodContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.space.lg,
    gap: theme.space.md,
  },
  snapFoodTextContainer: {
    flex: 1,
  },
  snapFoodTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 4,
  },
  snapFoodSubtitle: {
    fontSize: 14,
    color: theme.color.muted,
    lineHeight: 18,
  },
  insightContainer: {
    alignItems: 'center',
    marginBottom: theme.space.sm,
  },
  insightText: {
    fontSize: 14,
    color: theme.color.muted,
    textAlign: 'center',
    opacity: 0.8,
  },
  plannedMealsContainer: {
    marginTop: theme.space.sm,
    paddingTop: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  plannedMealsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.xs,
  },
  plannedMealItem: {
    fontSize: 13,
    color: theme.color.muted,
    marginBottom: 2,
  },

  basePlanIndicator: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  adjustmentCard: {
    marginBottom: 16,
    backgroundColor: theme.color.card,
    borderColor: theme.color.line,
    borderWidth: 1,
    padding: 0, // Override padding to control it via children
    overflow: 'hidden',
  },
  adjustmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
  },
  adjustmentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.color.ink,
  },
  adjustmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.accent.yellow,
    marginTop: 6,
  },
  adjustmentItem: {
    flex: 1,
    fontSize: 14,
    color: theme.color.ink,
    lineHeight: 20,
  },
  tagContainer: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  tagText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  exerciseMetaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  metaTag: {
    backgroundColor: theme.color.line,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaText: {
    fontSize: 12,
    color: theme.color.muted,
    fontWeight: '500',
  },
  macroTarget: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.6,
    marginTop: -2,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  quickActionCard: {
    flex: 1,
    padding: 16,
    minHeight: 140,
  },
  quickActionContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  quickHistoryButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    padding: 4,
  },
  quickIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  quickActionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 4,
    textAlign: 'center',
  },
  quickActionSubtitle: {
    fontSize: 12,
    color: theme.color.muted,
    textAlign: 'center',
  },
  supplementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
    gap: 12,
  },
});