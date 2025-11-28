import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Animated, TextInput, Alert, BackHandler, Keyboard, TouchableWithoutFeedback, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardDismissView } from '@/components/ui/KeyboardDismissView';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Calendar, Dumbbell, Apple, Heart, Lock, Unlock, Edit3, Send, ChevronLeft, Play } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';
import { hasActiveSubscription } from '@/utils/subscription-helpers';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { verifyBasePlan, getBasePlanJobState } from '@/services/backgroundPlanGeneration';
// 10s paywall logic removed per request

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Mon', fullLabel: 'Monday' },
  { key: 'tuesday', label: 'Tue', fullLabel: 'Tuesday' },
  { key: 'wednesday', label: 'Wed', fullLabel: 'Wednesday' },
  { key: 'thursday', label: 'Thu', fullLabel: 'Thursday' },
  { key: 'friday', label: 'Fri', fullLabel: 'Friday' },
  { key: 'saturday', label: 'Sat', fullLabel: 'Saturday' },
  { key: 'sunday', label: 'Sun', fullLabel: 'Sunday' },
];

export default function PlanPreviewScreen() {
  const { user, basePlans, getCurrentBasePlan, updateBasePlanDay, updateWeeklyBasePlan, addBasePlan, activateBasePlan, isLoading: storeLoading, loadUserData } = useUserStore();
  const auth = useAuth();
  const { updateProfile, refetch: refetchProfile } = useProfile();
  const params = useLocalSearchParams<{ planId?: string }>();
  const viewingPlanId = params.planId;
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  const [selectedDay, setSelectedDay] = useState<string>('monday');
  const [isLocked, setIsLocked] = useState(false);
  const [confettiAnim] = useState(new Animated.Value(0));
  const [showEditInput, setShowEditInput] = useState(false);
  const [editText, setEditText] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [forceReloadAttempts, setForceReloadAttempts] = useState(0);
  const [expandedWorkout, setExpandedWorkout] = useState(false);
  const [expandedNutrition, setExpandedNutrition] = useState(false);
  const navigation = useNavigation();
  const [isActivatingPlan, setIsActivatingPlan] = useState(false);

  // Reset expansion when day changes
  useEffect(() => {
    setExpandedWorkout(false);
    setExpandedNutrition(false);
  }, [selectedDay]);

  // Ensure back gestures/buttons go to Home instead of loading screens
  useEffect(() => {
    const unsubBeforeRemove = navigation.addListener('beforeRemove', (e: any) => {
      const actionType = e?.data?.action?.type;
      if (actionType === 'GO_BACK' || actionType === 'POP') {
        e.preventDefault();
        router.replace('/(tabs)/home');
      }
    });
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(tabs)/home');
      return true;
    });
    return () => {
      try { unsubBeforeRemove(); } catch { }
      try { backSub.remove(); } catch { }
    };
  }, [navigation]);

  // Removed paywall timer & navigation refs

  // Force reload from storage if store is empty
  useEffect(() => {
    console.log('[PlanPreview] Component mounted, storeLoading:', storeLoading);
    console.log('[PlanPreview] Initial basePlans length:', basePlans?.length ?? 0);

    if (!storeLoading && (!basePlans || basePlans.length === 0) && forceReloadAttempts < 3) {
      console.log('[PlanPreview] Store empty, forcing reload from AsyncStorage...');
      setForceReloadAttempts(prev => prev + 1);
      loadUserData?.();
    }
  }, [storeLoading, basePlans, forceReloadAttempts, loadUserData]);

  // Get basePlan reactively - this will cause re-render when basePlans array updates
  // If planId is provided via params, find that specific plan (historical view)
  const basePlan = useMemo(() => {
    console.log('[PlanPreview] useMemo triggered, basePlans length:', basePlans?.length ?? 0);
    console.log('[PlanPreview] viewingPlanId:', viewingPlanId || 'none (current plan)');
    
    // If viewing a specific plan by ID (historical view)
    if (viewingPlanId && basePlans) {
      const specificPlan = basePlans.find(p => p.id === viewingPlanId);
      console.log('[PlanPreview] Found specific plan:', specificPlan ? `Plan ID: ${specificPlan.id}` : 'NOT FOUND');
      return specificPlan;
    }
    
    // Default: Get the current active plan
    console.log('[PlanPreview] basePlans array:', basePlans?.map(p => ({ id: p.id, locked: p.isLocked, isActive: p.isActive })));
    const plan = getCurrentBasePlan();
    console.log('[PlanPreview] useMemo computed basePlan:', plan ? `Plan ID: ${plan.id}` : 'NULL');

    // Debug: Check what getCurrentBasePlan logic would return
    if (basePlans && basePlans.length > 0) {
      const unlocked = basePlans.find(plan => !plan.isLocked);
      const latest = basePlans[basePlans.length - 1];
      console.log('[PlanPreview] Debug - unlocked plan:', unlocked ? `ID: ${unlocked.id}` : 'NONE');
      console.log('[PlanPreview] Debug - latest plan:', latest ? `ID: ${latest.id}` : 'NONE');
    }

    return plan;
  }, [basePlans, getCurrentBasePlan, viewingPlanId]);

  // Determine if viewing a historical (non-active) plan
  const isHistoricalView = useMemo(() => {
    if (!viewingPlanId || !basePlan) return false;
    return !basePlan.isActive;
  }, [viewingPlanId, basePlan]);

  // Handle activating this historical plan
  const handleActivateThisPlan = async () => {
    if (!basePlan?.id) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    Alert.alert(
      'Activate This Plan?',
      'This will set this plan as your active base plan for daily workouts and nutrition.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            setIsActivatingPlan(true);
            const success = await activateBasePlan(basePlan.id);
            setIsActivatingPlan(false);
            
            if (success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Plan Activated', 'This plan is now your active base plan.', [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } else {
              Alert.alert('Error', 'Failed to activate the plan. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Aggregate all supplements from the weekly plan
  const weeklySupplementsData = useMemo(() => {
    const currentPlan = getCurrentBasePlan();
    if (!currentPlan?.days) {
      return {
        allSupplements: [] as string[],
        dailySupplements: {} as Record<string, string[]>,
        userSupplements: [] as string[],
        recommendedSupplements: [] as string[]
      };
    }

    const allSuppsSet = new Set<string>();
    const dailySupps: Record<string, string[]> = {};
    const userSuppsSet = new Set<string>();
    const recommendedSuppsSet = new Set<string>();

    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    dayKeys.forEach((day) => {
      const dayData = currentPlan.days[day];
      if (!dayData?.recovery) return;

      // Get daily supplements
      const daySupplements = dayData.recovery.supplements || [];
      if (daySupplements.length > 0) {
        dailySupps[day] = daySupplements;
      }

      // Add to overall set
      daySupplements.forEach((supp: string) => allSuppsSet.add(supp));

      // Get user's current supplements (only need to check once)
      if (dayData.recovery.supplementCard?.current) {
        dayData.recovery.supplementCard.current.forEach((supp: string) => {
          userSuppsSet.add(supp);
        });
      }

      // Get recommended add-ons
      if (dayData.recovery.supplementCard?.addOns) {
        dayData.recovery.supplementCard.addOns.forEach((supp: string) => {
          recommendedSuppsSet.add(supp);
        });
      }
    });

    return {
      allSupplements: Array.from(allSuppsSet),
      dailySupplements: dailySupps,
      userSupplements: Array.from(userSuppsSet),
      recommendedSupplements: Array.from(recommendedSuppsSet)
    };
  }, [getCurrentBasePlan]);

  const [isCheckingPlan, setIsCheckingPlan] = useState(true);
  const [hasShownConfetti, setHasShownConfetti] = useState(false);

  useEffect(() => {
    console.log('[PlanPreview] useEffect triggered');
    console.log('[PlanPreview] basePlan:', basePlan ? 'EXISTS' : 'NULL');
    console.log('[PlanPreview] basePlans array length:', basePlans?.length ?? 0);

    // Safety check: if no base plan, wait a bit for state to propagate before redirecting
    // This handles race condition where we navigate before state updates
    if (!basePlan) {
      console.warn('[PlanPreview] No base plan found, waiting for state propagation...');

      let attempts = 0;
      const maxAttempts = 5;

      const checkInterval = setInterval(() => {
        attempts++;
        const planNow = getCurrentBasePlan();
        console.log(`[PlanPreview] Attempt ${attempts}/${maxAttempts} - Plan exists:`, planNow ? 'YES' : 'NO');
        console.log(`[PlanPreview] basePlans length in check:`, basePlans?.length ?? 0);

        if (planNow) {
          console.log('[PlanPreview] ✅ Plan found after waiting!');
          clearInterval(checkInterval);
          setIsCheckingPlan(false);
          return;
        }

        if (attempts >= maxAttempts) {
          console.error('[PlanPreview] ❌ No plan after multiple checks');
          clearInterval(checkInterval);

          // Try to go to home instead of onboarding, since plan may be there
          console.log('[PlanPreview] Redirecting to home to check if plan is available there');
          router.replace('/(tabs)/home');
        }
      }, 500); // Check every 500ms

      return () => clearInterval(checkInterval);
    }

    // Plan exists now
    console.log('[PlanPreview] ✅ Base plan is available immediately');
    setIsCheckingPlan(false);

    // Show confetti animation only once
    if (!hasShownConfetti) {
      setHasShownConfetti(true);
      Animated.sequence([
        Animated.timing(confettiAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(confettiAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [basePlan, basePlans, hasShownConfetti, confettiAnim, getCurrentBasePlan]); // Re-run when basePlan OR basePlans changes

  // Early return if no base plan or still checking
  if (!basePlan || isCheckingPlan) {
    console.log('[PlanPreview] Showing loading state...');
    console.log('[PlanPreview] basePlan:', basePlan);
    console.log('[PlanPreview] isCheckingPlan:', isCheckingPlan);
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.color.bg }}>
        <Text style={{ color: theme.color.ink, fontSize: 16, fontWeight: '600' }}>Loading your plan...</Text>
        <Text style={{ color: theme.color.muted, fontSize: 14, marginTop: 8 }}>This will just take a moment</Text>
        {basePlans?.length > 0 && (
          <Text style={{ color: theme.color.muted, fontSize: 12, marginTop: 4 }}>
            Found {basePlans.length} plans in store
          </Text>
        )}
      </View>
    );
  }

  console.log('[PlanPreview] ✅ Base plan loaded, rendering preview');
  console.log('[PlanPreview] Base plan days:', Object.keys(basePlan.days || {}));
  console.log('[PlanPreview] Selected day:', selectedDay);

  // Safety check for day data
  const selectedDayData = basePlan.days?.[selectedDay];
  if (!selectedDayData) {
    console.error('[PlanPreview] No data for selected day:', selectedDay);
    console.error('[PlanPreview] Available days:', Object.keys(basePlan.days || {}));
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.color.bg }}>
        <Text style={{ color: theme.color.ink }}>Loading day data...</Text>
      </View>
    );
  }

  const handleLockPlan = () => {
    setIsLocked(!isLocked);
    // TODO: Update the base plan's locked status in storage
  };

  const handleStartJourney = async () => {
    try {
      console.log('[PlanPreview] Starting journey...');
      setIsSavingProfile(true);

      // Mark the plan as verified (user committed to starting)
      const userId = auth?.session?.user?.id ?? null;
      await verifyBasePlan(userId);
      console.log('[PlanPreview] ✅ Plan marked as verified');

      // First, save the user profile to the backend (Supabase)
      // This ensures user data is persisted only after they commit to starting
      if (user && auth?.session?.user?.email) {
        console.log('[PlanPreview] Saving user profile to backend...');
        
        const userEmail = auth.session.user.email;
        const sessionUserName = auth.session.user.user_metadata?.name as string | undefined;
        const emailLocalPart = userEmail.split('@')[0] || '';
        const resolvedName = (user.name?.trim() || sessionUserName?.trim() || emailLocalPart || 'User');

        const profileData = {
          email: userEmail,
          name: resolvedName,
          goal: user.goal as any,
          equipment: user.equipment,
          dietary_prefs: user.dietaryPrefs as any,
          dietary_notes: user.dietaryNotes || null,
          training_days: user.trainingDays,
          timezone: user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          onboarding_complete: true,
          age: user.age ?? null,
          sex: user.sex || null,
          height: user.height ?? null,
          weight: user.weight ?? null,
          activity_level: user.activityLevel as any,
          daily_calorie_target: user.dailyCalorieTarget ?? null,
          supplements: user.supplements || [],
          supplement_notes: user.supplementNotes || null,
          personal_goals: user.personalGoals || [],
          perceived_lacks: user.perceivedLacks || [],
          training_style_preferences: user.trainingStylePreferences || [],
          avoid_exercises: user.avoidExercises || [],
          preferred_training_time: user.preferredTrainingTime || null,
          session_length: user.sessionLength ?? null,
          travel_days: user.travelDays ?? null,
          fasting_window: user.fastingWindow || null,
          meal_count: user.mealCount ?? null,
          injuries: user.injuries || null,
          step_target: user.stepTarget ?? null,
          special_requests: user.specialRequests || null,
          goal_weight: user.goalWeight ?? null,
          workout_intensity: user.workoutIntensity || null,
        };

        try {
          await updateProfile(profileData);
          console.log('[PlanPreview] ✅ Profile saved to Supabase successfully');
          await refetchProfile();
          console.log('[PlanPreview] ✅ Profile cache refreshed');
        } catch (profileError) {
          console.error('[PlanPreview] ⚠️ Error saving profile to backend:', profileError);
          // Continue anyway - local data is already saved, backend sync can retry later
        }
      }

      setIsSavingProfile(false);

      // Check subscription status
      const entitled = await hasActiveSubscription();
      console.log('[PlanPreview] Subscription check result:', entitled);

      if (entitled) {
        console.log('[PlanPreview] ✅ User has active subscription, navigating to home');
        router.replace('/(tabs)/home');
        return;
      }

      console.log('[PlanPreview] ❌ No active subscription, showing paywall');
      // Not entitled → show paywall in blocking mode
      // After subscription, user will be navigated to home
      router.push({
        pathname: '/paywall',
        params: {
          next: '/(tabs)/home',
          blocking: 'true'
        } as any
      });
    } catch (err) {
      console.error('[PlanPreview] Error in start journey:', err);
      setIsSavingProfile(false);

      // On error, show paywall to be safe (premium features should be gated)
      console.log('[PlanPreview] Error occurred, showing paywall as fallback');
      router.push({
        pathname: '/paywall',
        params: {
          next: '/(tabs)/home',
          blocking: 'true'
        } as any
      });
    }
  };

  const handleEditDay = () => {
    setShowEditInput(!showEditInput);
    setEditText('');
  };

  const handleSubmitEdit = async () => {
    if (!editText.trim()) {
      Alert.alert('Error', 'Please enter your changes before submitting.');
      return;
    }

    setIsSubmittingEdit(true);

    // Start progress animation
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 12000, // Slow down more per request
      useNativeDriver: false,
    }).start();

    try {
      const selectedDayName = DAYS_OF_WEEK.find(d => d.key === selectedDay)?.fullLabel || selectedDay;

      const response = await fetch('https://toolkit.rork.com/text/llm/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `You are a world-class Personal Trainer & Nutrition Specialist. The user wants to modify their ${selectedDayName} plan. Current plan data: ${JSON.stringify(selectedDayData)}. 
              
Please modify the plan based on their request and return ONLY the updated day data in the exact same JSON format with workout, nutrition, and recovery objects. Do not include any explanatory text, just the JSON object. Only change what they specifically request. Keep all other aspects of the plan intact.`
            },
            {
              role: 'user',
              content: `Please modify my ${selectedDayName} plan with these changes: ${editText}`
            }
          ]
        })
      });

      const result = await response.json();

      if (result.completion) {
        try {
          // Clean the response to extract JSON
          let jsonString = result.completion.trim();

          // Remove markdown code blocks if present
          if (jsonString.startsWith('```json')) {
            jsonString = jsonString.replace(/```json\s*/, '').replace(/\s*```$/, '');
          } else if (jsonString.startsWith('```')) {
            jsonString = jsonString.replace(/```\s*/, '').replace(/\s*```$/, '');
          }

          // Try to parse the AI response as JSON to update the plan
          const updatedDayData = JSON.parse(jsonString);

          // Validate the structure
          if (!updatedDayData.workout || !updatedDayData.nutrition || !updatedDayData.recovery) {
            throw new Error('Invalid day data structure');
          }

          // Update the base plan with the modified day data
          const success = await updateBasePlanDay(selectedDay, updatedDayData);

          if (success) {
            Alert.alert(
              'Changes Applied',
              `Your ${selectedDayName} plan has been updated successfully!`,
              [{
                text: 'OK', onPress: () => {
                  setShowEditInput(false);
                  setEditText('');
                }
              }]
            );
          } else {
            throw new Error('Failed to save changes');
          }
        } catch (parseError) {
          console.error('Parse error:', parseError);
          // If parsing fails, show the AI response as text
          Alert.alert(
            'Changes Processed',
            `We have processed your request:\n\n${result.completion}\n\nNote: The changes may not have been saved to your plan due to formatting issues.`,
            [{
              text: 'OK', onPress: () => {
                setShowEditInput(false);
                setEditText('');
              }
            }]
          );
        }
      } else {
        throw new Error('No response received');
      }
    } catch (error) {
      console.error('Error submitting edit:', error);
      Alert.alert(
        'Error',
        'Failed to process your changes. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSubmittingEdit(false);
      // Reset progress animation
      progressAnim.setValue(0);
    }
  };

  const renderDayCard = (day: typeof DAYS_OF_WEEK[0]) => {
    if (!basePlan) return null;

    const dayData = basePlan.days?.[day.key];
    if (!dayData) return null;

    const isSelected = selectedDay === day.key;

    return (
      <TouchableOpacity
        key={day.key}
        onPress={() => setSelectedDay(day.key)}
        activeOpacity={0.7}
      >
        <Animated.View style={[
          styles.dayCard,
          isSelected && styles.selectedDayCard,
        ]}>
          {isSelected && (
            <LinearGradient
              colors={[theme.color.accent.primary, '#FF6B6B']} // Example gradient
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          )}

          <Text style={[
            styles.dayLabel,
            isSelected && styles.selectedDayLabel,
          ]}>
            {day.label}
          </Text>

          <View style={styles.dayPreview}>
            <Text
              style={[
                styles.dayFocus,
                isSelected && styles.selectedDayText,
              ]}
              numberOfLines={2}
            >
              {dayData.workout?.focus?.[0] || 'Rest'}
            </Text>

            <View style={[
              styles.calorieBadge,
              isSelected ? { backgroundColor: 'rgba(255,255,255,0.2)' } : { backgroundColor: theme.color.bg }
            ]}>
              <Text style={[
                styles.dayCalories,
                isSelected && styles.selectedDayText,
              ]}>
                {dayData.nutrition?.total_kcal || 0}
              </Text>
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderWorkoutPreview = () => {
    if (!selectedDayData?.workout) return null;

    return (
      <Card style={styles.previewCard}>
        <View style={styles.previewHeader}>
          <Dumbbell size={24} color={theme.color.accent.primary} />
          <Text style={styles.previewTitle}>Workout</Text>
        </View>
        <Text style={styles.focusText}>
          Focus: {selectedDayData.workout.focus?.join(', ') || 'General'}
        </Text>
        {(selectedDayData.workout.blocks || []).map((block, index) => {
          const itemsToShow = expandedWorkout ? block.items : (block.items || []).slice(0, 2);
          return (
            <View key={index} style={styles.blockPreview}>
              <Text style={styles.blockName}>{block.name || 'Block'}</Text>
              {(itemsToShow || []).map((item, itemIndex) => (
                <Text key={itemIndex} style={styles.exercisePreview}>
                  • {item.exercise} {item.sets && item.reps ? `${item.sets}×${item.reps}` : ''}
                </Text>
              ))}
              {!expandedWorkout && block.items && block.items.length > 2 && (
                <TouchableOpacity onPress={() => setExpandedWorkout(true)}>
                  <Text style={styles.moreTextLink}>+{block.items.length - 2} more exercises</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        {expandedWorkout && (
          <TouchableOpacity onPress={() => setExpandedWorkout(false)}>
            <Text style={styles.showLessText}>Show less</Text>
          </TouchableOpacity>
        )}
        {selectedDayData.workout.notes && (
          <Text style={styles.notesText}>{selectedDayData.workout.notes}</Text>
        )}
      </Card>
    );
  };

  const renderNutritionPreview = () => {
    if (!selectedDayData?.nutrition) return null;

    const mealsToShow = expandedNutrition
      ? selectedDayData.nutrition.meals
      : (selectedDayData.nutrition.meals || []).slice(0, 3);

    return (
      <Card style={styles.previewCard}>
        <View style={styles.previewHeader}>
          <Apple size={24} color={theme.color.accent.green} />
          <Text style={styles.previewTitle}>Nutrition</Text>
        </View>
        <View style={styles.macroRow}>
          <View style={styles.macroItem}>
            <Text style={styles.macroValue}>{selectedDayData.nutrition.total_kcal || 0}</Text>
            <Text style={styles.macroLabel}>Calories</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={styles.macroValue}>{selectedDayData.nutrition.protein_g || 0}g</Text>
            <Text style={styles.macroLabel}>Protein</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={styles.macroValue}>{selectedDayData.nutrition.hydration_l || 0}L</Text>
            <Text style={styles.macroLabel}>Water</Text>
          </View>
        </View>
        {(mealsToShow || []).map((meal, index) => (
          <View key={index} style={styles.mealPreview}>
            <Text style={styles.mealName}>{meal.name || 'Meal'}</Text>
            <Text style={styles.mealItems}>
              {(meal.items || []).map(item => `${item?.food || 'Item'}${item?.qty ? ` (${item.qty})` : ''}`).join(', ')}
            </Text>
          </View>
        ))}
        {!expandedNutrition && selectedDayData.nutrition.meals && selectedDayData.nutrition.meals.length > 3 && (
          <TouchableOpacity onPress={() => setExpandedNutrition(true)}>
            <Text style={styles.moreTextLink}>+{selectedDayData.nutrition.meals.length - 3} more meals</Text>
          </TouchableOpacity>
        )}
        {expandedNutrition && (
          <TouchableOpacity onPress={() => setExpandedNutrition(false)}>
            <Text style={styles.showLessText}>Show less</Text>
          </TouchableOpacity>
        )}
      </Card>
    );
  };

  // Calculate expected timeline to reach goal (Optimistic/Unrealistic per request)
  const calculateExpectedTimeline = () => {
    if (!user) return null;

    // Weight-based goals
    if (user.goal === 'WEIGHT_LOSS' || user.goal === 'MUSCLE_GAIN') {
      const currentWeight = user.weight;
      const goalWeight = user.goalWeight;

      if (!currentWeight || !goalWeight) return null;

      const weightDiff = Math.abs(currentWeight - goalWeight);

      // Unrealistically good rates:
      // Weight loss: ~1.5kg/week (Normal ~0.5-0.75)
      // Muscle gain: ~0.8kg/week (Normal ~0.25-0.35)
      const weeklyRate = user.goal === 'WEIGHT_LOSS' ? 1.5 : 0.8;
      const weeks = Math.ceil(weightDiff / weeklyRate);
      const months = Math.max(1, Math.ceil(weeks / 4));

      return {
        value: months,
        unit: months === 1 ? 'Month' : 'Months',
        text: user.goal === 'WEIGHT_LOSS'
          ? `reach your target weight of ${goalWeight}kg`
          : `build ${weightDiff.toFixed(1)}kg of muscle`
      };
    }

    // Fitness goals (fixed unrealistic timeline)
    // Normally 8-12 weeks -> Now 1-2 months
    const trainingDays = user.trainingDays || 3;
    if (user.goal === 'ENDURANCE') {
      const months = trainingDays >= 5 ? 1 : 2;
      return { value: months, unit: months === 1 ? 'Month' : 'Months', text: 'significantly boost your endurance' };
    }

    if (user.goal === 'FLEXIBILITY_MOBILITY') {
      const months = 1;
      return { value: months, unit: 'Month', text: 'see major improvements in mobility' };
    }

    // General fitness
    const months = trainingDays >= 5 ? 1 : 2;
    return { value: months, unit: months === 1 ? 'Month' : 'Months', text: 'feel noticeably fitter and stronger' };
  };

  const renderTimelineBadge = () => {
    const timeline = calculateExpectedTimeline();
    if (!timeline) return null;

    return (
      <View style={styles.timelineContainer}>
        <LinearGradient
          colors={['#1a2a3a', '#0F3D2E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.timelineBubble}
        >
          <View style={styles.timelineHeaderRow}>
            <View style={styles.timelinePill}>
              <Text style={styles.timelinePillText}>TIMELINE</Text>
            </View>
            <Text style={styles.timelineValueHighlight}>{timeline.value} {timeline.unit}</Text>
          </View>
          <Text style={styles.timelineText}>
            to {timeline.text}
          </Text>
        </LinearGradient>
      </View>
    );
  };

  const renderRecoveryPreview = () => {
    if (!selectedDayData?.recovery) return null;

    return (
      <Card style={styles.previewCard}>
        <View style={styles.previewHeader}>
          <Heart size={24} color={theme.color.accent.blue} />
          <Text style={styles.previewTitle}>Recovery</Text>
        </View>
        <View style={styles.recoverySection}>
          <Text style={styles.recoveryTitle}>🧘‍♀️ Mobility</Text>
          {(selectedDayData.recovery.mobility || []).slice(0, 2).map((item, index) => (
            <Text key={index} style={styles.recoveryItem}>• {item}</Text>
          ))}
        </View>
        <View style={styles.recoverySection}>
          <Text style={styles.recoveryTitle}>😴 Sleep</Text>
          {(selectedDayData.recovery.sleep || []).slice(0, 2).map((item, index) => (
            <Text key={index} style={styles.recoveryItem}>• {item}</Text>
          ))}
        </View>
        {selectedDayData.recovery.careNotes && (
          <View style={styles.careCard}>
            <Text style={styles.careNotesText}>{selectedDayData.recovery.careNotes}</Text>
          </View>
        )}
      </Card>
    );
  };

  const renderReasonCard = () => {
    const reason = selectedDayData?.reason || selectedDayData?.recovery?.careNotes;
    if (!reason) return null;
    return (
      <Card style={styles.reasonCard}>
        <Text style={styles.reasonTitle}>🤔 Reason</Text>
        <Text style={styles.reasonText}>{reason}</Text>
      </Card>
    );
  };

  // New comprehensive supplement card showing ALL supplements from the weekly plan
  const renderSupplementsCard = () => {
    const { allSupplements, dailySupplements, userSupplements, recommendedSupplements } = weeklySupplementsData;

    if (allSupplements.length === 0 && userSupplements.length === 0 && recommendedSupplements.length === 0) {
      return null;
    }

    const dayLabels: Record<string, string> = {
      monday: 'Mon',
      tuesday: 'Tue',
      wednesday: 'Wed',
      thursday: 'Thu',
      friday: 'Fri',
      saturday: 'Sat',
      sunday: 'Sun'
    };

    return (
      <Card style={styles.supplementCard}>
        <View style={styles.previewHeader}>
          <Text style={styles.supplementCardTitle}>💊 Complete Supplement Guide</Text>
        </View>

        {/* Overview Stats */}
        <View style={styles.supplementStatsRow}>
          <View style={styles.supplementStat}>
            <Text style={styles.supplementStatValue}>{allSupplements.length}</Text>
            <Text style={styles.supplementStatLabel}>Total</Text>
          </View>
          <View style={styles.supplementStat}>
            <Text style={styles.supplementStatValue}>{userSupplements.length}</Text>
            <Text style={styles.supplementStatLabel}>Current</Text>
          </View>
          <View style={styles.supplementStat}>
            <Text style={styles.supplementStatValue}>{recommendedSupplements.length}</Text>
            <Text style={styles.supplementStatLabel}>Recommended</Text>
          </View>
        </View>

        {/* User's Current Supplements */}
        {userSupplements.length > 0 && (
          <View style={styles.supplementSection}>
            <Text style={styles.supplementSectionTitle}>Currently Taking</Text>
            {userSupplements.map((supp, index) => (
              <Text key={`current-${index}`} style={styles.supplementItem}>• {supp}</Text>
            ))}
          </View>
        )}

        {/* Recommended Add-ons */}
        {recommendedSupplements.length > 0 && (
          <View style={styles.supplementSection}>
            <Text style={styles.supplementSectionTitle}>Add-ons We Recommend</Text>
            {recommendedSupplements.map((supp, index) => (
              <Text key={`recommended-${index}`} style={styles.supplementItem}>• {supp}</Text>
            ))}
          </View>
        )}

        {/* Daily Breakdown */}
        {Object.keys(dailySupplements).length > 0 && (
          <View style={styles.supplementSection}>
            <Text style={styles.supplementSectionTitle}>Daily Schedule</Text>
            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
              const supps = dailySupplements[day];
              if (!supps || supps.length === 0) return null;

              return (
                <View key={day} style={styles.dailySupplementRow}>
                  <View style={styles.dayLabelBadge}>
                    <Text style={styles.dayLabelText}>{dayLabels[day]}</Text>
                  </View>
                  <View style={styles.dailySupplementList}>
                    {supps.map((supp, idx) => (
                      <Text key={`${day}-${idx}`} style={styles.dailySupplementText}>
                        {idx === 0 ? '• ' : '  '}{supp}
                      </Text>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Disclaimer */}
        <Text style={styles.supplementDisclaimer}>
          ⚠️ Make sure to do your own research before taking any supplements. Consult a healthcare professional if you have any concerns.
        </Text>
      </Card>
    );
  };

  return (
    <KeyboardDismissView style={styles.container}>
      <Stack.Screen
        options={{
          title: isHistoricalView ? (basePlan?.name || 'Historical Plan') : 'Your Base Plan',
          headerStyle: { backgroundColor: theme.color.bg },
          headerTintColor: theme.color.ink,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => isHistoricalView ? router.back() : router.replace('/(tabs)/home')}
              accessibilityRole="button"
              accessibilityLabel={isHistoricalView ? "Go back" : "Go to Home"}
              style={{ paddingHorizontal: 8 }}
            >
              <ChevronLeft size={20} color={theme.color.accent.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Confetti Animation */}
      <Animated.View
        style={[
          styles.confetti,
          {
            opacity: confettiAnim,
            transform: [{
              translateY: confettiAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-50, 0],
              }),
            }],
          },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.confettiText}>🎉 Your Plan is Ready! 🎉</Text>
      </Animated.View>

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          bounces={true}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View>
                <Text style={styles.headerWelcome}>Welcome back,</Text>
                <Text style={styles.headerTitle}>Your Weekly Plan</Text>
              </View>
              <View style={styles.headerIconContainer}>
                <Calendar size={24} color={theme.color.accent.primary} />
              </View>
            </View>

            <Text style={styles.headerSubtitle}>
              Your personalized roadmap. Adjusted daily based on your progress.
            </Text>

            {/* Expected Timeline - Moved inside header */}
            {renderTimelineBadge()}
          </View>

          {/* Day Selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.daySelector}
            contentContainerStyle={styles.daySelectorContent}
            nestedScrollEnabled={true}
            scrollEventThrottle={16}
          >
            {DAYS_OF_WEEK.map(renderDayCard)}
          </ScrollView>

          {/* Selected Day Details */}
          <View style={styles.dayDetails}>
            <Text style={styles.dayDetailsTitle}>
              {DAYS_OF_WEEK.find(d => d.key === selectedDay)?.fullLabel}
            </Text>

            {renderWorkoutPreview()}
            {renderNutritionPreview()}
            {renderRecoveryPreview()}
            {renderSupplementsCard()}
            {renderReasonCard()}
          </View>

          {/* Edit Day Section - Hidden for historical views */}
          {!isHistoricalView && (
            <Card style={styles.editCard}>
              <View style={styles.editHeader}>
                <Edit3 size={24} color={theme.color.accent.primary} />
                <Text style={styles.editTitle}>
                  Edit {DAYS_OF_WEEK.find(d => d.key === selectedDay)?.fullLabel}
                </Text>
              </View>
              <Text style={styles.editDescription}>
                Want to make changes to this day? Describe what you&apos;d like to modify.
              </Text>

              {showEditInput && (
                <View style={styles.editInputContainer}>
                  <TextInput
                    style={styles.editInput}
                    placeholder="e.g., Replace squats with lunges, add more protein to breakfast, reduce workout time to 30 minutes..."
                    placeholderTextColor={theme.color.muted}
                    value={editText}
                    onChangeText={setEditText}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    editable={!isSubmittingEdit}
                    returnKeyType="send"
                    blurOnSubmit
                    onSubmitEditing={() => {
                      if (!isSubmittingEdit && editText.trim()) {
                        Keyboard.dismiss();
                        handleSubmitEdit();
                      }
                    }}
                  />

                  {/* Loading Progress Bar */}
                  {isSubmittingEdit && (
                    <View style={styles.progressContainer}>
                      <Text style={styles.progressText}>Applying your changes...</Text>
                      <View style={styles.progressBarBackground}>
                        <Animated.View
                          style={[
                            styles.progressBarFill,
                            {
                              width: progressAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0%', '100%'],
                              }),
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressSubtext}>This may take a few seconds...</Text>
                    </View>
                  )}

                  {!isSubmittingEdit && (
                    <View style={styles.editActions}>
                      <Button
                        title="Cancel"
                        onPress={() => {
                          setShowEditInput(false);
                          setEditText('');
                        }}
                        variant="outline"
                        size="small"
                        style={styles.cancelButton}
                      />
                      <Button
                        title="Apply Changes"
                        onPress={handleSubmitEdit}
                        disabled={!editText.trim()}
                        size="small"
                        style={styles.applyButton}
                        icon={<Send size={16} color="#FFFFFF" />}
                      />
                    </View>
                  )}
                </View>
              )}

              {!showEditInput && (
                <Button
                  title="Edit This Day"
                  onPress={handleEditDay}
                  variant="outline"
                  size="small"
                  style={styles.editButton}
                  icon={<Edit3 size={16} color={theme.color.accent.primary} />}
                />
              )}
            </Card>
          )}

          {/* Lock Toggle - Hidden for historical views */}
          {!isHistoricalView && (
            <Card style={styles.lockCard}>
              <View style={styles.lockHeader}>
                {isLocked ? (
                  <Lock size={24} color={theme.color.accent.primary} />
                ) : (
                  <Unlock size={24} color={theme.color.muted} />
                )}
                <Text style={styles.lockTitle}>
                  {isLocked ? 'Plan Locked' : 'Lock This Plan'}
                </Text>
              </View>
              <Text style={styles.lockDescription}>
                {isLocked
                  ? 'Your plan is locked and ready to use. You can unlock it anytime in Settings.'
                  : 'Lock this plan to prevent accidental changes. You can always unlock it later.'
                }
              </Text>
              <Button
                title={isLocked ? 'Unlock Plan' : 'Lock Plan'}
                onPress={handleLockPlan}
                variant={isLocked ? 'outline' : 'primary'}
                size="small"
                style={styles.lockButton}
              />
            </Card>
          )}

          {/* Historical Plan Info Banner */}
          {isHistoricalView && (
            <Card style={styles.historicalBanner}>
              <Text style={styles.historicalBannerTitle}>📋 Historical Plan</Text>
              <Text style={styles.historicalBannerText}>
                This is a previous plan. You can view its details or activate it to use it again.
              </Text>
              {basePlan?.stats && (
                <View style={styles.historicalStats}>
                  {basePlan.stats.daysActive !== undefined && (
                    <Text style={styles.historicalStatItem}>
                      • Was active for {basePlan.stats.daysActive} day{basePlan.stats.daysActive !== 1 ? 's' : ''}
                    </Text>
                  )}
                  {basePlan.stats.consistencyPercent !== undefined && (
                    <Text style={styles.historicalStatItem}>
                      • {basePlan.stats.consistencyPercent}% consistency during active period
                    </Text>
                  )}
                  {basePlan.stats.weightChangeKg !== undefined && (
                    <Text style={styles.historicalStatItem}>
                      • Weight change: {basePlan.stats.weightChangeKg >= 0 ? '+' : ''}{basePlan.stats.weightChangeKg.toFixed(1)} kg
                    </Text>
                  )}
                </View>
              )}
            </Card>
          )}
        </ScrollView>

        {/* Bottom Action */}
        <View style={styles.bottomAction}>
          {isHistoricalView ? (
            <Button
              title={isActivatingPlan ? 'Activating...' : 'Activate This Plan'}
              onPress={handleActivateThisPlan}
              disabled={isActivatingPlan}
              size="medium"
              style={styles.activateThisPlanButton}
              icon={<Play size={18} color={theme.color.ink} />}
            />
          ) : (
            <Button
              title={isSavingProfile ? 'Saving...' : 'Start My Journey'}
              onPress={handleStartJourney}
              disabled={isSavingProfile}
              size="medium"
              style={styles.startButton}
            />
          )}
        </View>
      </SafeAreaView>
    </KeyboardDismissView>
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
  scrollView: {
    flex: 1,
  },
  confetti: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: 'center',
  },
  confettiText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.accent.primary,
    textAlign: 'center',
  },
  header: {
    padding: theme.space.lg,
    paddingTop: theme.space.xl,
    paddingBottom: theme.space.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.space.sm,
  },
  headerWelcome: {
    fontSize: 14,
    color: theme.color.accent.primary,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.color.ink,
    letterSpacing: -0.5,
  },
  headerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.color.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  headerSubtitle: {
    fontSize: 15,
    color: theme.color.muted,
    lineHeight: 22,
    marginBottom: theme.space.md,
    maxWidth: '90%',
  },
  daySelector: {
    marginBottom: theme.space.lg,
  },
  daySelectorContent: {
    paddingHorizontal: theme.space.lg,
    gap: 12, // Increased gap
    paddingBottom: 4, // Space for shadow
  },
  dayCard: {
    width: 105, // Increased width from 80
    height: 130, // Fixed height for uniformity
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
    justifyContent: 'space-between',
    overflow: 'hidden', // For gradient
  },
  selectedDayCard: {
    borderColor: 'transparent',
    // Background handled by LinearGradient
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.color.muted,
    marginBottom: theme.space.xs,
  },
  selectedDayLabel: {
    color: 'rgba(255,255,255,0.9)',
  },
  dayPreview: {
    flex: 1,
    justifyContent: 'space-between',
  },
  dayFocus: {
    fontSize: 13,
    color: theme.color.ink,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 8,
  },
  calorieBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: theme.color.bg,
  },
  dayCalories: {
    fontSize: 11,
    color: theme.color.muted,
    fontWeight: '700',
  },
  selectedDayText: {
    color: '#FFFFFF',
  },
  dayDetails: {
    paddingHorizontal: theme.space.lg,
  },
  dayDetailsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: theme.space.lg,
    textAlign: 'center',
  },
  previewCard: {
    marginBottom: theme.space.lg,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space.md,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginLeft: theme.space.sm,
  },
  focusText: {
    fontSize: 14,
    color: theme.color.muted,
    marginBottom: theme.space.sm,
    fontWeight: '500',
  },
  blockPreview: {
    marginBottom: theme.space.sm,
  },
  blockName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.xs,
  },
  exercisePreview: {
    fontSize: 13,
    color: theme.color.muted,
    marginLeft: theme.space.sm,
    marginBottom: 2,
  },
  moreText: {
    fontSize: 12,
    color: theme.color.muted,
    fontStyle: 'italic',
    marginLeft: theme.space.sm,
  },
  moreTextLink: {
    fontSize: 12,
    color: theme.color.accent.primary,
    fontWeight: '600',
    fontStyle: 'italic',
    marginLeft: theme.space.sm,
    marginTop: theme.space.xs,
  },
  showLessText: {
    fontSize: 12,
    color: theme.color.accent.primary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: theme.space.sm,
  },
  notesText: {
    fontSize: 12,
    color: theme.color.muted,
    fontStyle: 'italic',
    marginTop: theme.space.sm,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.space.md,
    paddingVertical: theme.space.sm,
    backgroundColor: theme.color.bg,
    borderRadius: theme.radius.md,
  },
  macroItem: {
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.color.ink,
  },
  macroLabel: {
    fontSize: 12,
    color: theme.color.muted,
    marginTop: 2,
  },
  mealPreview: {
    marginBottom: theme.space.sm,
  },
  mealName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 2,
  },
  mealItems: {
    fontSize: 12,
    color: theme.color.muted,
    lineHeight: 16,
  },
  recoverySection: {
    marginBottom: theme.space.sm,
  },
  recoveryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.xs,
  },
  recoveryItem: {
    fontSize: 12,
    color: theme.color.muted,
    marginBottom: 2,
    lineHeight: 16,
  },
  careCard: {
    marginTop: theme.space.sm,
    backgroundColor: theme.color.accent.blue + '10',
    borderWidth: 1,
    borderColor: theme.color.accent.blue + '20',
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
  },
  careNotesText: {
    fontSize: 12,
    color: theme.color.ink,
    lineHeight: 16,
  },
  careSuppHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 2,
  },
  careSuppItem: {
    fontSize: 12,
    color: theme.color.muted,
  },
  supplementCard: {
    marginTop: theme.space.md,
    padding: theme.space.lg,
  },
  supplementCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.ink,
  },
  supplementStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: theme.space.md,
    marginBottom: theme.space.lg,
    paddingVertical: theme.space.sm,
    backgroundColor: theme.color.luxe.orchid + '20',
    borderRadius: theme.radius.md,
  },
  supplementStat: {
    alignItems: 'center',
  },
  supplementStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.luxe.orchid,
  },
  supplementStatLabel: {
    fontSize: 11,
    color: theme.color.muted,
    marginTop: 2,
  },
  supplementSection: {
    marginTop: theme.space.md,
    paddingTop: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  supplementSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: theme.space.sm,
  },
  supplementItem: {
    fontSize: 13,
    color: theme.color.muted,
    marginBottom: 4,
    lineHeight: 18,
  },
  dailySupplementRow: {
    flexDirection: 'row',
    marginBottom: theme.space.sm,
    alignItems: 'flex-start',
  },
  dayLabelBadge: {
    backgroundColor: theme.color.accent.primary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: theme.space.sm,
    minWidth: 36,
    alignItems: 'center',
  },
  dayLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dailySupplementList: {
    flex: 1,
    paddingTop: 2,
  },
  dailySupplementText: {
    fontSize: 12,
    color: theme.color.muted,
    lineHeight: 18,
  },
  supplementDisclaimer: {
    fontSize: 10,
    color: theme.color.muted,
    textAlign: 'center',
    lineHeight: 14,
    marginTop: theme.space.lg,
    paddingTop: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
    fontStyle: 'italic',
  },
  lockCard: {
    margin: theme.space.lg,
    alignItems: 'center',
  },
  reasonCard: {
    marginTop: theme.space.md,
    padding: theme.space.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: theme.radius.lg,
    borderColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
  },
  reasonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.xs,
  },
  reasonText: {
    fontSize: 14,
    color: theme.color.muted,
    lineHeight: 20,
  },
  lockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space.sm,
  },
  lockTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.ink,
    marginLeft: theme.space.sm,
  },
  lockDescription: {
    fontSize: 14,
    color: theme.color.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: theme.space.lg,
  },
  lockButton: {
    alignSelf: 'center',
    paddingHorizontal: theme.space.xl,
  },
  bottomAction: {
    padding: theme.space.lg,
    paddingTop: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  startButton: {
    width: '100%',
  },
  editCard: {
    margin: theme.space.lg,
    alignItems: 'center',
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space.sm,
  },
  editTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.ink,
    marginLeft: theme.space.sm,
  },
  editDescription: {
    fontSize: 14,
    color: theme.color.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: theme.space.lg,
  },
  editInputContainer: {
    width: '100%',
    marginBottom: theme.space.md,
  },
  editInput: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    fontSize: 14,
    color: theme.color.ink,
    backgroundColor: theme.color.bg,
    minHeight: 100,
    marginBottom: theme.space.md,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.space.xs,
    marginTop: theme.space.sm,
  },
  cancelButton: {
    paddingHorizontal: 0,
  },
  applyButton: {
    paddingHorizontal: 0,
  },
  editButton: {
    alignSelf: 'center',
    paddingHorizontal: theme.space.xl,
  },
  progressContainer: {
    marginVertical: theme.space.md,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.sm,
  },
  progressBarBackground: {
    width: '100%',
    height: 6,
    backgroundColor: theme.color.line,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: theme.space.xs,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.color.accent.primary,
    borderRadius: 3,
  },
  progressSubtext: {
    fontSize: 12,
    color: theme.color.muted,
    textAlign: 'center',
  },
  timelineContainer: {
    marginTop: theme.space.sm,
    alignSelf: 'stretch',
  },
  timelineBubble: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timelinePill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timelinePillText: {
    color: '#81C784', // Light green
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timelineValueHighlight: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  timelineText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  // Historical Plan Styles
  historicalBanner: {
    margin: theme.space.lg,
    backgroundColor: theme.color.accent.blue + '15',
    borderColor: theme.color.accent.blue + '40',
    borderWidth: 1,
  },
  historicalBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: theme.space.xs,
  },
  historicalBannerText: {
    fontSize: 14,
    color: theme.color.muted,
    lineHeight: 20,
    marginBottom: theme.space.sm,
  },
  historicalStats: {
    paddingTop: theme.space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  historicalStatItem: {
    fontSize: 13,
    color: theme.color.muted,
    marginBottom: 4,
  },
  activateThisPlanButton: {
    width: '100%',
    backgroundColor: theme.color.accent.green,
  },
});