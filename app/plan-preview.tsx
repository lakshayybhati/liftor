import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Animated, TextInput, Alert, Modal, BackHandler, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { KeyboardDismissView } from '@/components/ui/KeyboardDismissView';
import { router, Stack } from 'expo-router';
import { Calendar, Dumbbell, Apple, Heart, Lock, Unlock, Edit3, Send, ChevronLeft } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';
import { useNavigation } from '@react-navigation/native';
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
  const { user, basePlans, getCurrentBasePlan, updateBasePlanDay, addBasePlan, isLoading: storeLoading, loadUserData } = useUserStore();
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
  const [showPlanEditModal, setShowPlanEditModal] = useState(false);
  const [planEditText, setPlanEditText] = useState('');
  const [isSubmittingWholePlan, setIsSubmittingWholePlan] = useState(false);
  const wholePlanProgressAnim = useRef(new Animated.Value(0)).current;
  const navigation = useNavigation();
  
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
      try { unsubBeforeRemove(); } catch {}
      try { backSub.remove(); } catch {}
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
  const basePlan = useMemo(() => {
    console.log('[PlanPreview] useMemo triggered, basePlans length:', basePlans?.length ?? 0);
    console.log('[PlanPreview] basePlans array:', basePlans?.map(p => ({ id: p.id, locked: p.isLocked })));
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
  }, [basePlans, getCurrentBasePlan]);
  
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
      
      // Check subscription status
      const { hasActiveSubscription } = await import('@/utils/subscription-helpers');
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
      console.error('[PlanPreview] Error checking subscription:', err);
      
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
              [{ text: 'OK', onPress: () => {
                setShowEditInput(false);
                setEditText('');
              }}]
            );
          } else {
            throw new Error('Failed to save changes');
          }
        } catch (parseError) {
          console.error('Parse error:', parseError);
          // If parsing fails, show the AI response as text
          Alert.alert(
            'Changes Processed',
            `The AI has processed your request:\n\n${result.completion}\n\nNote: The changes may not have been saved to your plan due to formatting issues.`,
            [{ text: 'OK', onPress: () => {
              setShowEditInput(false);
              setEditText('');
            }}]
          );
        }
      } else {
        throw new Error('No response from AI');
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

  const handleSubmitWholePlan = async () => {
    try {
      setIsSubmittingWholePlan(true);
      wholePlanProgressAnim.setValue(0);
      Animated.timing(wholePlanProgressAnim, {
        toValue: 1,
        duration: 8000, // Slow the whole-plan progress bar
        useNativeDriver: false,
      }).start();

      // Lazy-load the AI generator to keep bundle light
      const { generateWeeklyBasePlan } = await import('@/services/plan-generation');

      // Compose special requests with user input (without mutating profile)
      const combinedRequest = `${user?.specialRequests ? user.specialRequests + ' | ' : ''}User requested changes: ${planEditText || 'Rebuild my weekly base plan'}`;
      const modifiedUser = { ...(user as any), specialRequests: combinedRequest } as any;

      const newPlan = await generateWeeklyBasePlan(modifiedUser);
      await addBasePlan(newPlan);

      Alert.alert('Base Plan Updated', 'Your weekly base plan was regenerated successfully.', [
        { text: 'OK', onPress: () => setShowPlanEditModal(false) }
      ]);
      setPlanEditText('');
      // Reset selection to monday for clarity
      setSelectedDay('monday');
    } catch (e) {
      console.error('[PlanPreview] Whole-plan edit failed:', e);
      Alert.alert('Error', 'We could not update your base plan. Please try again.');
    } finally {
      setIsSubmittingWholePlan(false);
      wholePlanProgressAnim.setValue(0);
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
        style={[
          styles.dayCard,
          isSelected && styles.selectedDayCard,
        ]}
        onPress={() => setSelectedDay(day.key)}
      >
        <Text style={[
          styles.dayLabel,
          isSelected && styles.selectedDayLabel,
        ]}>
          {day.label}
        </Text>
        <View style={styles.dayPreview}>
          <Text style={[
            styles.dayFocus,
            isSelected && styles.selectedDayText,
          ]}>
            {dayData.workout?.focus?.[0] || 'Rest'}
          </Text>
          <Text style={[
            styles.dayCalories,
            isSelected && styles.selectedDayText,
          ]}>
            {dayData.nutrition?.total_kcal || 0}kcal
          </Text>
        </View>
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

  // Calculate expected weeks to reach goal
  const calculateExpectedWeeks = () => {
    if (!user) return null;
    
    // Weight-based goals
    if (user.goal === 'WEIGHT_LOSS' || user.goal === 'MUSCLE_GAIN') {
      const currentWeight = user.weight;
      const goalWeight = user.goalWeight;
      
      if (!currentWeight || !goalWeight) return null;
      
      const weightDiff = Math.abs(currentWeight - goalWeight);
      
      // Healthy rate: 0.5-1kg per week for weight loss, 0.25-0.5kg per week for muscle gain
      const weeklyRate = user.goal === 'WEIGHT_LOSS' ? 0.75 : 0.35;
      const weeks = Math.ceil(weightDiff / weeklyRate);
      
      return {
        weeks,
        text: user.goal === 'WEIGHT_LOSS' 
          ? `reach your target weight of ${goalWeight}kg`
          : `build ${weightDiff.toFixed(1)}kg of muscle`
      };
    }
    
    // Fitness goals (fixed timeline based on commitment level)
    const trainingDays = user.trainingDays || 3;
    if (user.goal === 'ENDURANCE') {
      const weeks = trainingDays >= 5 ? 8 : trainingDays >= 4 ? 10 : 12;
      return { weeks, text: 'significantly boost your endurance' };
    }
    
    if (user.goal === 'FLEXIBILITY_MOBILITY') {
      const weeks = trainingDays >= 5 ? 6 : trainingDays >= 4 ? 8 : 10;
      return { weeks, text: 'see major improvements in mobility' };
    }
    
    // General fitness
    const weeks = trainingDays >= 5 ? 8 : trainingDays >= 4 ? 10 : 12;
    return { weeks, text: 'feel noticeably fitter and stronger' };
  };

  const renderTimelineBadge = () => {
    const timeline = calculateExpectedWeeks();
    if (!timeline) return null;
    
    return (
      <View style={styles.timelineContainer}>
        <View style={styles.timelinePill}>
          <Text style={styles.timelinePillText}>EXPECTED TIMELINE</Text>
        </View>
        <View style={styles.timelineBubble}>
          <Text style={styles.timelineText}>
            {timeline.weeks} {timeline.weeks === 1 ? 'week' : 'weeks'} to {timeline.text}
          </Text>
        </View>
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
      </Card>
    );
  };

  return (
    <KeyboardDismissView style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Your Base Plan',
          headerStyle: { backgroundColor: theme.color.bg },
          headerTintColor: theme.color.ink,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)/home')}
              accessibilityRole="button"
              accessibilityLabel="Go to Home"
              style={{ paddingHorizontal: 8 }}
            >
              <ChevronLeft size={20} color={theme.color.accent.primary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setShowPlanEditModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit base plan"
              style={{ paddingHorizontal: 8 }}
            >
              <Edit3 size={20} color={theme.color.accent.primary} />
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
            <Calendar size={32} color={theme.color.accent.primary} />
            <Text style={styles.headerTitle}>Your Base Plan</Text>
            <Text style={styles.headerSubtitle}>
              This is your foundation plan that will be adjusted daily based on your check-ins
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

          {/* Edit Day Section */}
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

          {/* Lock Toggle */}
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
        </ScrollView>

        {/* Whole-Plan Edit Modal */}
        <Modal visible={showPlanEditModal} transparent animationType="fade" onRequestClose={() => setShowPlanEditModal(false)}>
          <View style={styles.editModalOverlay}>
            <View style={styles.editModalCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: theme.space.sm }}>
                <Edit3 size={20} color={theme.color.accent.primary} />
                <Text style={[styles.editTitle, { marginLeft: theme.space.xs }]}>Edit Your Base Plan</Text>
              </View>
              <Text style={styles.editDescription}>Describe how you want your entire 7-day plan to change. We’ll regenerate a new weekly plan that matches your request.</Text>

              <TextInput
                style={styles.planEditInput}
                placeholder="e.g., Make workouts 30 minutes, focus on legs and core, 4 meals/day, vegetarian meals only, higher protein."
                placeholderTextColor={theme.color.muted}
                value={planEditText}
                onChangeText={setPlanEditText}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                editable={!isSubmittingWholePlan}
                returnKeyType="send"
                blurOnSubmit
                onSubmitEditing={() => {
                  if (!isSubmittingWholePlan && (planEditText || '').trim()) {
                    Keyboard.dismiss();
                    handleSubmitWholePlan();
                  }
                }}
              />

              {isSubmittingWholePlan && (
                <View style={styles.progressContainer}>
                  <Text style={styles.progressText}>Updating your base plan…</Text>
                  <View style={styles.progressBarBackground}>
                    <Animated.View 
                      style={[
                        styles.progressBarFill,
                        {
                          width: wholePlanProgressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressSubtext}>This usually takes a few seconds</Text>
                </View>
              )}

              {!isSubmittingWholePlan && (
                <View style={styles.editActions}>
                  <Button
                    title="Cancel"
                    onPress={() => setShowPlanEditModal(false)}
                    variant="outline"
                    size="small"
                    style={styles.cancelButton}
                  />
                  <Button
                    title="Apply Changes"
                    onPress={handleSubmitWholePlan}
                    size="small"
                    style={styles.applyButton}
                    icon={<Send size={16} color="#FFFFFF" />}
                  />
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* Bottom Action */}
        <View style={styles.bottomAction}>
          <Button
            title="Start My Journey"
            onPress={handleStartJourney}
            size="medium"
            style={styles.startButton}
          />
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
    alignItems: 'center',
    padding: theme.space.xl,
    paddingTop: theme.space.lg,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
    marginTop: theme.space.sm,
    marginBottom: theme.space.xs,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.color.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  daySelector: {
    marginBottom: theme.space.lg,
  },
  daySelectorContent: {
    paddingHorizontal: theme.space.lg,
    gap: theme.space.sm,
  },
  dayCard: {
    width: 80,
    padding: theme.space.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
    alignItems: 'center',
  },
  selectedDayCard: {
    borderColor: theme.color.accent.primary,
    backgroundColor: theme.color.accent.primary,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.xs,
  },
  selectedDayLabel: {
    color: theme.color.bg,
  },
  dayPreview: {
    alignItems: 'center',
  },
  dayFocus: {
    fontSize: 10,
    color: theme.color.muted,
    textAlign: 'center',
    marginBottom: 2,
  },
  dayCalories: {
    fontSize: 10,
    color: theme.color.muted,
    fontWeight: '500',
  },
  selectedDayText: {
    color: theme.color.bg,
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
  planEditInput: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    fontSize: 14,
    color: theme.color.ink,
    backgroundColor: theme.color.bg,
    minHeight: 120,
    marginBottom: theme.space.md,
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
    marginTop: theme.space.lg,
    alignSelf: 'stretch',
  },
  timelinePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#2F80ED',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  timelinePillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  timelineBubble: {
    marginTop: 6,
    backgroundColor: '#0F3D2E',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  timelineText: {
    color: '#E9F6EC',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.space.lg,
  },
  editModalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: theme.color.bg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.lg,
  },
});