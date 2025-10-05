import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Platform, Modal, Animated, Easing, BackHandler } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Dumbbell, Apple, Heart, Sparkles, CheckCircle, Check, Camera, ChevronDown, ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';

type PlanTab = 'workout' | 'nutrition' | 'recovery' | 'motivation';

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
  const { user, plans, foodLogs, getCompletedMealsForDate, getCompletedExercisesForDate, toggleMealCompleted, toggleExerciseCompleted } = useUserStore();
  const { tab, celebrate } = useLocalSearchParams<{ tab?: string; celebrate?: string }>();
  const [activeTab, setActiveTab] = useState<PlanTab>('workout');
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set());
  const [completedMeals, setCompletedMeals] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [showConfetti, setShowConfetti] = useState(celebrate === '1');
  const [confettiAnim] = useState(new Animated.Value(0));

  // Set initial tab from URL parameter
  useEffect(() => {
    if (tab && ['workout', 'nutrition', 'recovery', 'motivation'].includes(tab)) {
      setActiveTab(tab as PlanTab);
    }
  }, [tab]);

  // Override hardware back to go home instead of previous (e.g., check-in)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/home');
      return true;
    });
    return () => sub.remove();
  }, []);

  // Animate confetti banner in → hold → out, then auto-dismiss
  useEffect(() => {
    if (!showConfetti) return;
    Animated.sequence([
      Animated.timing(confettiAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(confettiAnim, { toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]).start(() => {
      setShowConfetti(false);
      try { router.setParams({ celebrate: undefined as any }); } catch {}
    });
  }, [showConfetti, confettiAnim]);

  const plan = useMemo(() => plans.find(p => p.date === selectedDate), [plans, selectedDate]);
  const dayExtras = useMemo(() => (foodLogs.find(l => l.date === selectedDate)?.extras) || [], [foodLogs, selectedDate]);
  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  // Load persisted ticks for selected date
  useEffect(() => {
    const meals = new Set(getCompletedMealsForDate(selectedDate));
    const ex = new Set(getCompletedExercisesForDate(selectedDate));
    setCompletedMeals(meals);
    setCompletedExercises(ex);
  }, [selectedDate, getCompletedMealsForDate, getCompletedExercisesForDate]);

  const totalCalorieTarget = plan?.nutrition?.total_kcal || 2000;
  const proteinTarget = plan?.nutrition?.protein_g || 150;
  const fatTarget = Math.round((totalCalorieTarget * 0.25) / 9);
  const carbTarget = Math.round((totalCalorieTarget - (proteinTarget * 4) - (fatTarget * 9)) / 4);
  
  // Generate dynamic meals based on user preferences
  const generateMealsData = useCallback(() => {
    const mealCount = user?.mealCount || 3;
    const baseCalorieDistribution = {
      3: [0.3, 0.4, 0.3], // breakfast, lunch, dinner
      4: [0.25, 0.15, 0.35, 0.25], // breakfast, snack, lunch, dinner
      5: [0.25, 0.125, 0.35, 0.1, 0.275], // breakfast, morning snack, lunch, afternoon snack, dinner
      6: [0.2, 0.1, 0.3, 0.1, 0.25, 0.05] // breakfast, morning snack, lunch, afternoon snack, dinner, evening snack
    };
    
    const mealTemplates = [
      { name: 'Breakfast', insight: 'All you need is some breakfast ☀️', emoji: '🍳', mealType: 'breakfast' },
      { name: 'Morning Snack', insight: 'Get energized by grabbing a morning snack 🥜', emoji: '🥨', mealType: 'morning_snack' },
      { name: 'Lunch', insight: "Don't miss lunch 😋 It's time to get a tasty meal", emoji: '🍽️', mealType: 'lunch' },
      { name: 'Afternoon Snack', insight: 'Perfect time for a healthy snack 🍎', emoji: '🥗', mealType: 'afternoon_snack' },
      { name: 'Dinner', insight: 'End your day with a nutritious dinner 🌙', emoji: '🍲', mealType: 'dinner' },
      { name: 'Evening Snack', insight: 'A light evening treat before bed 🌜', emoji: '🍪', mealType: 'evening_snack' }
    ];
    
    const distribution = baseCalorieDistribution[mealCount as keyof typeof baseCalorieDistribution] || baseCalorieDistribution[3];
    
    // Select appropriate meals based on count
    let selectedMeals: typeof mealTemplates = [];
    
    if (mealCount === 3) {
      selectedMeals = [mealTemplates[0], mealTemplates[2], mealTemplates[4]]; // breakfast, lunch, dinner
    } else if (mealCount === 4) {
      selectedMeals = [mealTemplates[0], mealTemplates[1], mealTemplates[2], mealTemplates[4]]; // breakfast, morning snack, lunch, dinner
    } else if (mealCount === 5) {
      selectedMeals = [mealTemplates[0], mealTemplates[1], mealTemplates[2], mealTemplates[3], mealTemplates[4]]; // all except evening snack
    } else if (mealCount === 6) {
      selectedMeals = mealTemplates; // all meals
    } else {
      selectedMeals = [mealTemplates[0], mealTemplates[2], mealTemplates[4]]; // default to 3 meals
    }
    
    return selectedMeals.map((meal, index) => ({
      ...meal,
      targetCalories: Math.round(totalCalorieTarget * distribution[index]),
    }));
  }, [user?.mealCount, totalCalorieTarget]);
  
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



  const renderTabBar = () => (
    <View style={styles.tabBar}>
      {[
        { id: 'workout', icon: Dumbbell, label: 'Workout' },
        { id: 'nutrition', icon: Apple, label: 'Nutrition' },
        { id: 'recovery', icon: Heart, label: 'Recovery' },
        { id: 'motivation', icon: Sparkles, label: 'Motivation' },
      ].map((tab) => (
        <TouchableOpacity
          key={tab.id}
          style={[
            styles.tabButton,
            activeTab === tab.id && styles.activeTab,
          ]}
          onPress={() => setActiveTab(tab.id as PlanTab)}
        >
          <tab.icon 
            size={20} 
            color={activeTab === tab.id ? theme.color.bg : theme.color.muted} 
          />
          <Text style={[
            styles.tabText,
            activeTab === tab.id && styles.activeTabText,
          ]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderWorkout = () => (
    <ScrollView style={styles.tabContent}>
      <Card gradient gradientColors={['#FF6B9D', '#C147E9']} style={styles.headerCard}>
        <Text style={styles.headerTitle}>Today&apos;s Workout</Text>
        {plan && (
          <Text style={styles.headerSubtitle}>
            Focus: {plan.workout.focus.join(', ')}
          </Text>
        )}
        {plan?.isFromBasePlan && (
          <Text style={styles.basePlanIndicator}>
            Based on your week • adjusted today
          </Text>
        )}
        {plan?.workout?.notes && (
          <Text style={styles.headerNotes}>{plan.workout.notes}</Text>
        )}
      </Card>

      {plan?.adjustments && plan.adjustments.length > 0 && (
        <Card style={styles.adjustmentCard}>
          <Text style={styles.adjustmentTitle}>🎯 Adjusted Today</Text>
          {plan.adjustments.map((adjustment, index) => (
            <Text key={index} style={styles.adjustmentItem}>
              • {adjustment}
            </Text>
          ))}
        </Card>
      )}

      {plan?.workout?.blocks.map((block, blockIndex) => (
        <Card key={blockIndex} style={styles.blockCard}>
          <Text style={styles.blockTitle}>{block.name}</Text>
          {block.items.map((item, itemIndex) => {
            const exerciseId = `${blockIndex}-${itemIndex}`;
            const isCompleted = completedExercises.has(exerciseId);
            
            return (
              <View key={itemIndex} style={styles.exerciseItem}>
                <View style={styles.exerciseInfo}>
                  <Text style={[
                    styles.exerciseName,
                    isCompleted && styles.completedText,
                  ]}>
                    {item.exercise || item.type}
                  </Text>
                  {item.sets && item.reps && (
                    <Text style={styles.exerciseDetails}>
                      {item.sets} sets × {item.reps} {item.RIR ? `(RIR ${item.RIR})` : ''}
                    </Text>
                  )}
                  {item.duration_min && (
                    <Text style={styles.exerciseDetails}>
                      {item.duration_min} minutes
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    styles.checkButton,
                    isCompleted && styles.checkedButton,
                  ]}
                  onPress={() => toggleExerciseComplete(exerciseId)}
                >
                  <CheckCircle 
                    size={24} 
                    color={isCompleted ? theme.color.bg : theme.color.muted} 
                  />
                </TouchableOpacity>
              </View>
            );
          })}
        </Card>
      ))}
    </ScrollView>
  );

  const renderNutrition = () => {
    const mealsData = generateMealsData();

    return (
      <ScrollView style={styles.tabContent}>
        {/* Calorie Summary */}
        <Card gradient gradientColors={['#4ECDC4', '#44A08D']} style={styles.headerCard}>
          <Text style={styles.headerTitle}>Nutrition Plan</Text>
          <View style={styles.calorieHeader}>
            <Text style={styles.calorieCount}>
              {currentCalories} of {totalCalorieTarget.toLocaleString()}
            </Text>
            <Text style={styles.calorieLabel}>Cal Eaten</Text>
          </View>
          
          <View style={styles.macroInsights}>
            <Text style={styles.insightsTitle}>Insights</Text>
            <Text style={styles.macroBreakdown}>
              {Math.round(currentProtein)}g Protein / {Math.round(currentFat)}g Fat / {Math.round(currentCarbs)}g Carb
            </Text>
            <Text style={styles.macroTargets}>
              Target: {proteinTarget}g / {fatTarget}g / {carbTarget}g
            </Text>
            {extraTotals.calories > 0 && (
              <Text style={styles.extrasLine}>
                Extras: {extraTotals.calories} Cal
              </Text>
            )}
          </View>
        </Card>

        {/* Meals List with Checkbox Actions */}
        <View style={styles.mealsContainer}>
          {mealsData.map((meal, index) => {
            const isCompleted = completedMeals.has(meal.mealType);
            
            return (
              <Card key={meal.name} style={[styles.mealCard, isCompleted ? styles.completedMealCard : undefined] as any}>
                <View style={styles.mealHeader}>
                  <View style={styles.mealInfo}>
                    <Text style={[styles.mealName, isCompleted && styles.completedMealText]}>
                      {meal.name}
                    </Text>
                    <Text style={[styles.mealCalories, isCompleted && styles.completedMealText]}>
                      {meal.targetCalories} Cal {isCompleted ? '✓ Eaten' : ''}
                    </Text>
                  </View>
                  
                  <TouchableOpacity 
                    onPress={() => toggleMealComplete(meal.mealType)}
                    style={[styles.checkboxButton, isCompleted && styles.checkedMealButton]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Check 
                      color={isCompleted ? theme.color.bg : theme.color.muted} 
                      size={20} 
                    />
                  </TouchableOpacity>
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
                    {plan.nutrition.meals[index].items.map((item, itemIndex) => (
                      <Text key={itemIndex} style={[styles.plannedMealItem, isCompleted && styles.completedMealText]}>
                        • {item.food} - {item.qty}
                      </Text>
                    ))}
                  </View>
                )}
              </Card>
            );
          })}
        </View>
        
        {/* SNAP FOOD Card */}
        <Card style={styles.snapFoodCard}>
          <TouchableOpacity 
            onPress={handleSnapFood}
            style={styles.snapFoodButton}
            disabled={isLoading}
            accessibilityLabel="Open Snap Food camera"
          >
            <View style={styles.snapFoodContent}>
              <Camera color={theme.color.accent.primary} size={24} />
              <View style={styles.snapFoodTextContainer}>
                <Text style={styles.snapFoodTitle}>SNAP FOOD</Text>
                <Text style={styles.snapFoodSubtitle}>
                  {dayExtras.length === 0 
                    ? 'NO FOOD SNAP (additional from the plan)' 
                    : `${dayExtras.length} snap${dayExtras.length > 1 ? 's' : ''} added`
                  }
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => router.push('/food-snaps')}
            style={[styles.snapFoodButton, { marginTop: 8 }]}
            accessibilityRole="button"
            accessibilityLabel="Manage your food snaps"
          >
            <View style={styles.snapFoodContent}>
              <Text style={[styles.snapFoodSubtitle, { color: theme.color.accent.blue }]}>Manage snaps</Text>
            </View>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    );
  };

  const renderRecovery = () => (
    <ScrollView style={styles.tabContent}>
      <Card gradient gradientColors={['#667eea', '#764ba2']} style={styles.headerCard}>
        <Text style={styles.headerTitle}>Recovery Plan</Text>
        <Text style={styles.headerSubtitle}>
          Rest and recharge for tomorrow
        </Text>
      </Card>

      <Card style={styles.recoveryCard}>
        <Text style={styles.recoveryTitle}>🧘‍♀️ Mobility & Movement</Text>
        {plan?.recovery?.mobility.map((item, index) => (
          <Text key={index} style={styles.recoveryItem}>
            • {item}
          </Text>
        ))}
      </Card>

      <Card style={styles.recoveryCard}>
        <Text style={styles.recoveryTitle}>😴 Sleep Optimization</Text>
        {plan?.recovery?.sleep.map((item, index) => (
          <Text key={index} style={styles.recoveryItem}>
            • {item}
          </Text>
        ))}
      </Card>
    </ScrollView>
  );

  const renderMotivation = () => (
    <ScrollView style={styles.tabContent}>
      <Card gradient gradientColors={['#FF9A9E', '#FECFEF']} style={styles.motivationCard}>
        <Sparkles size={40} color="#FFFFFF" style={styles.motivationIcon} />
        <Text style={styles.motivationTitle}>Your Daily Motivation</Text>
        <Text style={styles.motivationText}>{plan?.motivation || ''}</Text>
      </Card>

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
            <TouchableOpacity onPress={() => router.replace('/home')} style={{ paddingHorizontal: 8 }} accessibilityRole="button" accessibilityLabel="Go to Home">
              <ChevronLeft color={theme.color.ink} size={20} />
            </TouchableOpacity>
          ),
          headerStyle: { backgroundColor: theme.color.bg },
          headerTintColor: theme.color.ink,
        }} 
      />
      
      <SafeAreaView style={styles.safeArea}>
        {showConfetti && (
          <Animated.View
            style={[
              styles.confettiBanner,
              {
                opacity: confettiAnim,
                transform: [
                  {
                    translateY: confettiAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, 0],
                    }),
                  },
                  {
                    scale: confettiAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}
            onStartShouldSetResponder={() => true}
            onResponderRelease={() => setShowConfetti(false)}
          >
            <Text style={styles.confettiBannerText}>🎉 Plan Ready! 🎉</Text>
          </Animated.View>
        )}
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
        {plan ? renderContent() : (
          <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: theme.space.lg }}>
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
    borderRadius: theme.radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  activeTab: {
    backgroundColor: theme.color.accent.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.color.muted,
  },
  activeTabText: {
    color: theme.color.bg,
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
    justifyContent: 'space-around',
    marginTop: 16,
    width: '100%',
  },
  macroItem: {
    alignItems: 'center',
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
    backgroundColor: theme.color.accent.yellow + '20',
    borderLeftWidth: 4,
    borderLeftColor: theme.color.accent.yellow,
  },
  adjustmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.sm,
  },
  adjustmentItem: {
    fontSize: 14,
    color: theme.color.muted,
    marginBottom: 4,
    lineHeight: 18,
  },
});