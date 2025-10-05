import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  SafeAreaView, 
  TouchableOpacity, 
  TextInput,
  useWindowDimensions,
  Animated
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import Constants from 'expo-constants';

import { useUserStore } from '@/hooks/useUserStore';
import { 
  GOALS, 
  EQUIPMENT_OPTIONS, 
  DIETARY_PREFS,
  ACTIVITY_LEVELS,
  COMMON_SUPPLEMENTS,
  PERSONAL_GOALS,
  PERCEIVED_LACKS,
  PREFERRED_EXERCISES,
  AVOID_EXERCISES,
  TRAINING_TIMES,
  SESSION_LENGTHS,
  FASTING_WINDOWS,
  MEAL_COUNTS,
  CAFFEINE_FREQUENCY,
  ALCOHOL_FREQUENCY,
  WORKOUT_SPLITS
} from '@/constants/fitness';
import type { Goal, Equipment, DietaryPref, Sex, ActivityLevel } from '@/types/user';
import { theme } from '@/constants/colors';
import { useProfile } from '@/hooks/useProfile';





// BMR calculation using Mifflin-St Jeor equation
const calculateBMR = (weight: number, height: number, age: number, sex: Sex): number => {
  if (sex === 'Male') {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
};

// TDEE calculation
const calculateTDEE = (bmr: number, activityLevel: ActivityLevel): number => {
  const level = ACTIVITY_LEVELS.find(l => l.id === activityLevel);
  const multiplier = level?.multiplier || 1.2;
  return Math.round(bmr * multiplier);
};

export default function OnboardingScreen() {
  const { updateUser } = useUserStore();
  const { width: screenWidth } = useWindowDimensions();
  const isSmallScreen = screenWidth < 380;
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { updateProfile } = useProfile();
  
  // Form state
  const [name] = useState('');
  const [goal, setGoal] = useState<Goal>('GENERAL_FITNESS');
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [dietaryPrefs, setDietaryPrefs] = useState<DietaryPref[]>([]);
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [trainingDays, setTrainingDays] = useState(3);
  
  // Body stats
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex>('Male');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('Moderately Active');
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState('');
  const [showCalorieEdit, setShowCalorieEdit] = useState(false);
  
  // Supplementation & personal needs
  const [supplements, setSupplements] = useState<string[]>([]);
  const [supplementNotes, setSupplementNotes] = useState('');
  const [personalGoals, setPersonalGoals] = useState<string[]>([]);
  const [perceivedLacks, setPerceivedLacks] = useState<string[]>([]);
  
  // New specifics state
  const [preferredExercises, setPreferredExercises] = useState<string[]>([]);
  const [avoidExercises, setAvoidExercises] = useState<string[]>([]);
  const [preferredTrainingTime, setPreferredTrainingTime] = useState('');
  const [sessionLength, setSessionLength] = useState(45);
  const [travelDays, setTravelDays] = useState(0);
  const [fastingWindow, setFastingWindow] = useState('No Fasting');
  const [mealCount, setMealCount] = useState(4);
  const [injuries, setInjuries] = useState('');
  const [stepTarget, setStepTarget] = useState(8000);
  const [preferredWorkoutSplit, setPreferredWorkoutSplit] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  
  // Removed VMN transcription per requirements

  // Animate step change
  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [step, fadeAnim]);

  // Calculate calories when body stats change
  useEffect(() => {
    if (age && weight && height && sex && activityLevel) {
      const bmr = calculateBMR(
        parseFloat(weight),
        parseFloat(height),
        parseInt(age),
        sex
      );
      const tdee = calculateTDEE(bmr, activityLevel);
      
      // Adjust based on goal
      let adjusted = tdee;
      if (goal === 'WEIGHT_LOSS') adjusted = Math.round(tdee * 0.85);
      else if (goal === 'MUSCLE_GAIN') adjusted = Math.round(tdee * 1.15);
      
      if (!showCalorieEdit) {
        setDailyCalorieTarget(adjusted.toString());
      }
    }
  }, [age, weight, height, sex, activityLevel, goal, showCalorieEdit]);

  const handleEquipmentToggle = (item: Equipment) => {
    setEquipment(prev => 
      prev.includes(item) 
        ? prev.filter(e => e !== item)
        : [...prev, item]
    );
  };

  const handleDietaryToggle = (pref: DietaryPref) => {
    // Single select for dietary preference
    setDietaryPrefs([pref]);
  };

  const handleSupplementToggle = (supp: string) => {
    setSupplements(prev =>
      prev.includes(supp)
        ? prev.filter(s => s !== supp)
        : [...prev, supp]
    );
  };

  const handlePersonalGoalToggle = (goal: string) => {
    setPersonalGoals(prev =>
      prev.includes(goal)
        ? prev.filter(g => g !== goal)
        : [...prev, goal]
    );
  };

  const handlePerceivedLackToggle = (lack: string) => {
    setPerceivedLacks(prev =>
      prev.includes(lack)
        ? prev.filter(l => l !== lack)
        : [...prev, lack]
    );
  };

  const handlePreferredExerciseToggle = (exercise: string) => {
    setPreferredExercises(prev =>
      prev.includes(exercise)
        ? prev.filter(e => e !== exercise)
        : [...prev, exercise]
    );
  };

  const handleAvoidExerciseToggle = (exercise: string) => {
    setAvoidExercises(prev =>
      prev.includes(exercise)
        ? prev.filter(e => e !== exercise)
        : [...prev, exercise]
    );
  };

  // Auto-select workout split based on training days
  useEffect(() => {
    const matchingSplit = WORKOUT_SPLITS.find(split => split.days === trainingDays);
    if (matchingSplit && !preferredWorkoutSplit) {
      setPreferredWorkoutSplit(matchingSplit.split);
    }
  }, [trainingDays, preferredWorkoutSplit]);

  // Validation logic for required fields
  const getRequiredFieldsForStep = (stepIndex: number): { isValid: boolean; missingFields: string[] } => {
    const missingFields: string[] = [];
    
    switch (stepIndex) {
      case 0: // Goal selection
        if (!goal) missingFields.push('Fitness Goal');
        break;
        
      case 1: // Equipment
        if (equipment.length === 0) missingFields.push('Equipment');
        break;
        
      case 2: // Dietary preferences (required)
        if (dietaryPrefs.length === 0) missingFields.push('Dietary Preference');
        break;
        
      case 3: // Body stats - REQUIRED FIELDS
        if (!age || !age.trim()) missingFields.push('Age');
        if (!weight || !weight.trim()) missingFields.push('Weight');
        if (!height || !height.trim()) missingFields.push('Height');
        if (!sex) missingFields.push('Gender');
        break;
        
      case 4: // Training days
        if (!trainingDays || trainingDays < 1) missingFields.push('Training Days');
        break;
        
      case 5: // Supplements & personal needs (optional)
        // All fields in this step are optional
        break;
        
      case 6: // Specifics (all optional)
        break;
        
      default:
        break;
    }
    
    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  };

  // Check if current step is valid
  const currentStepValidation = getRequiredFieldsForStep(step);
  const canProceed = currentStepValidation.isValid;
  
  // Create stacked required label (each word on new line) for compact layout
  const stackedRequiredLabel = !canProceed && currentStepValidation.missingFields.length > 0
    ? ['Required:', ...currentStepValidation.missingFields].join(' ').split(' ').join('\n')
    : '';

  const handleComplete = async () => {
    const mappedDietaryPrefs = dietaryPrefs.length > 0 ? dietaryPrefs : ['Non-veg' as DietaryPref];

    const userData = {
      id: Date.now().toString(),
      name: name || 'User',
      goal,
      equipment,
      dietaryPrefs: mappedDietaryPrefs.length > 0 ? mappedDietaryPrefs : ['Non-veg' as DietaryPref],
      dietaryNotes: dietaryNotes || undefined,
      trainingDays,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      onboardingComplete: true,
      age: age ? parseInt(age) : undefined,
      sex: sex || undefined,
      height: height ? parseFloat(height) : undefined,
      weight: weight ? parseFloat(weight) : undefined,
      activityLevel: activityLevel || undefined,
      dailyCalorieTarget: dailyCalorieTarget ? parseInt(dailyCalorieTarget) : undefined,
      supplements: supplements.length > 0 ? supplements : undefined,
      supplementNotes: supplementNotes || undefined,
      personalGoals: personalGoals.length > 0 ? personalGoals : undefined,
      perceivedLacks: perceivedLacks.length > 0 ? perceivedLacks : undefined,
      preferredExercises: preferredExercises.length > 0 ? preferredExercises : undefined,
      avoidExercises: avoidExercises.length > 0 ? avoidExercises : undefined,
      preferredTrainingTime: preferredTrainingTime || undefined,
      sessionLength: sessionLength || undefined,
      travelDays: travelDays || undefined,
      fastingWindow: fastingWindow !== 'No Fasting' ? fastingWindow : undefined,
      mealCount: mealCount || undefined,
      injuries: injuries || undefined,
      stepTarget: stepTarget || undefined,
      preferredWorkoutSplit: preferredWorkoutSplit || undefined,
      specialRequests: specialRequests || undefined,
      goalWeight: goalWeight ? parseFloat(goalWeight) : undefined,
    };

    try {
      await updateUser(userData);
    } catch (e) {
      console.log('[Onboarding] local store update error', e);
    }

    try {
      await updateProfile({
        name: (name || 'User'),
        goal: goal as any,
        equipment: equipment,
        dietary_prefs: mappedDietaryPrefs as any,
        dietary_notes: dietaryNotes || null,
        training_days: trainingDays,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        onboarding_complete: true,
        age: age ? parseInt(age) : null,
        sex: sex || null,
        height: height ? parseFloat(height) : null,
        weight: weight ? parseFloat(weight) : null,
        activity_level: activityLevel as any,
        daily_calorie_target: dailyCalorieTarget ? parseInt(dailyCalorieTarget) : null,
        supplements: supplements,
        supplement_notes: supplementNotes || null,
        personal_goals: personalGoals,
        perceived_lacks: perceivedLacks,
        preferred_exercises: preferredExercises,
        avoid_exercises: avoidExercises,
        preferred_training_time: preferredTrainingTime || null,
        session_length: sessionLength,
        travel_days: travelDays,
        fasting_window: fastingWindow !== 'No Fasting' ? fastingWindow : null,
        meal_count: mealCount,
        injuries: injuries || null,
        step_target: stepTarget,
        preferred_workout_split: preferredWorkoutSplit || null,
        special_requests: specialRequests || null,
        goal_weight: goalWeight ? parseFloat(goalWeight) : null,
      });
      console.log('[Onboarding] Profile synced to Supabase');
    } catch (e) {
      console.log('[Onboarding] profile sync error', e);
    }

    try {
      const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
      const requiredEntitlement = extra.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT || 'pro';
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: requiredEntitlement,
      });
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED || result === PAYWALL_RESULT.NOT_PRESENTED) {
        router.replace('/generating-base-plan');
      } else {
        router.replace('/(tabs)/home');
      }
    } catch (e) {
      router.replace('/(tabs)/home');
    }
  };

  const steps = [
    {
      title: "What's your fitness goal?",
      content: (
        <View style={styles.optionsContainer}>
          {GOALS.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={[
                styles.goalOption,
                goal === g.id && styles.selectedGoal,
              ]}
              onPress={() => setGoal(g.id as Goal)}
            >
              <Text style={[
                styles.goalTitle,
                goal === g.id && styles.selectedGoalText,
              ]}>
                {g.label}
              </Text>
              <Text style={[
                styles.goalDescription,
                goal === g.id && styles.selectedGoalText,
              ]}>
                {g.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ),
    },
    {
      title: "What equipment do you have?",
      content: (
        <View style={styles.chipsContainer}>
          {EQUIPMENT_OPTIONS.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={equipment.includes(item)}
              onPress={() => handleEquipmentToggle(item)}
            />
          ))}
        </View>
      ),
    },
    {
      title: "Your dietary preference?",
      content: (
        <View>
          <View style={styles.chipsContainer}>
            {DIETARY_PREFS.map((pref) => (
              <Chip
                key={pref}
                label={pref}
                selected={dietaryPrefs.includes(pref)}
                onPress={() => handleDietaryToggle(pref)}
                color={theme.color.accent.green}
              />
            ))}
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Foods you prefer or avoid (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={dietaryNotes}
              onChangeText={setDietaryNotes}
              placeholder="e.g., No dairy, love chicken, allergic to nuts..."
              placeholderTextColor={theme.color.muted}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>
      ),
    },
    {
      title: "Let's calculate your daily calories",
      content: (
        <ScrollView style={styles.bodyStatsContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.statsRow}>
            <View style={styles.statInput}>
              <Text style={styles.inputLabel}>Age *</Text>
              <TextInput
                style={[styles.numberInput, !age.trim() && styles.requiredField]}
                value={age}
                onChangeText={setAge}
                placeholder="25"
                placeholderTextColor={theme.color.muted}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.statInput}>
              <Text style={styles.inputLabel}>Gender *</Text>
              <View style={styles.sexButtons}>
                <TouchableOpacity
                  style={[styles.sexButton, sex === 'Male' && styles.selectedSexButton]}
                  onPress={() => setSex('Male')}
                >
                  <Text style={[styles.sexButtonText, sex === 'Male' && styles.selectedSexButtonText]}>M</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sexButton, sex === 'Female' && styles.selectedSexButton]}
                  onPress={() => setSex('Female')}
                >
                  <Text style={[styles.sexButtonText, sex === 'Female' && styles.selectedSexButtonText]}>F</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statInput}>
              <Text style={styles.inputLabel}>Height (cm) *</Text>
              <TextInput
                style={[styles.numberInput, !height.trim() && styles.requiredField]}
                value={height}
                onChangeText={setHeight}
                placeholder="175"
                placeholderTextColor={theme.color.muted}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.statInput}>
              <Text style={styles.inputLabel}>Weight (kg) *</Text>
              <TextInput
                style={[styles.numberInput, !weight.trim() && styles.requiredField]}
                value={weight}
                onChangeText={setWeight}
                placeholder="70"
                placeholderTextColor={theme.color.muted}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.activitySection}>
            <Text style={styles.inputLabel}>Activity Level</Text>
            {ACTIVITY_LEVELS.map((level) => (
              <TouchableOpacity
                key={level.id}
                style={[
                  styles.activityOption,
                  activityLevel === level.id && styles.selectedActivity,
                ]}
                onPress={() => setActivityLevel(level.id as ActivityLevel)}
              >
                <View>
                  <Text style={[
                    styles.activityTitle,
                    activityLevel === level.id && styles.selectedActivityText,
                  ]}>
                    {level.label}
                  </Text>
                  <Text style={[
                    styles.activityDescription,
                    activityLevel === level.id && styles.selectedActivityText,
                  ]}>
                    {level.description}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {dailyCalorieTarget && (
            <View style={styles.calorieResult}>
              <Text style={styles.calorieLabel}>Your Daily Target</Text>
              <TouchableOpacity
                style={styles.calorieDisplay}
                onPress={() => setShowCalorieEdit(true)}
              >
                {showCalorieEdit ? (
                  <TextInput
                    style={styles.calorieEditInput}
                    value={dailyCalorieTarget}
                    onChangeText={setDailyCalorieTarget}
                    keyboardType="numeric"
                    onBlur={() => setShowCalorieEdit(false)}
                    autoFocus
                  />
                ) : (
                  <Text style={styles.calorieValue}>{dailyCalorieTarget} kcal</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.calorieHint}>Tap to adjust if needed</Text>
            </View>
          )}
        </ScrollView>
      ),
    },
    {
      title: "How many days per week can you train?",
      content: (
        <View style={styles.daysContainer}>
          {[1, 2, 3, 4, 5, 6, 7].map((days) => (
            <TouchableOpacity
              key={days}
              style={[
                styles.dayOption,
                trainingDays === days && styles.selectedDay,
              ]}
              onPress={() => {
                if (days >= 1 && days <= 7) {
                  setTrainingDays(days);
                }
              }}
            >
              <Text style={[
                styles.dayText,
                trainingDays === days && styles.selectedDayText,
              ]}>
                {days}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ),
    },
    {
      title: "Supplements & personal needs (optional)",
      content: (
        <ScrollView style={styles.supplementsContainer} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>Current supplements</Text>
          <View style={styles.chipsContainer}>
            {COMMON_SUPPLEMENTS.map((supp) => (
              <Chip
                key={supp}
                label={supp}
                selected={supplements.includes(supp)}
                onPress={() => handleSupplementToggle(supp)}
                color={theme.color.accent.blue}
              />
            ))}
          </View>
          
          <TextInput
            style={[styles.textInput, { marginTop: theme.space.sm }]}
            value={supplementNotes}
            onChangeText={setSupplementNotes}
            placeholder="Other supplements or notes..."
            placeholderTextColor={theme.color.muted}
            multiline
            numberOfLines={2}
          />

          <Text style={[styles.sectionLabel, { marginTop: theme.space.lg }]}>Personal goals</Text>
          <View style={styles.chipsContainer}>
            {PERSONAL_GOALS.map((goal) => (
              <Chip
                key={goal}
                label={goal}
                selected={personalGoals.includes(goal)}
                onPress={() => handlePersonalGoalToggle(goal)}
                color={theme.color.accent.yellow}
              />
            ))}
          </View>

          <Text style={[styles.sectionLabel, { marginTop: theme.space.lg }]}>What you feel you lack</Text>
          <View style={styles.chipsContainer}>
            {PERCEIVED_LACKS.map((lack) => (
              <Chip
                key={lack}
                label={lack}
                selected={perceivedLacks.includes(lack)}
                onPress={() => handlePerceivedLackToggle(lack)}
                color={theme.color.luxe.orchid}
              />
            ))}
          </View>
        </ScrollView>
      ),
    },
    {
      title: "Let's get specific about your journey",
      content: (
        <ScrollView style={styles.specificsContainer} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>Exercises you prefer</Text>
          <View style={styles.chipsContainer}>
            {PREFERRED_EXERCISES.map((exercise) => (
              <Chip
                key={exercise}
                label={exercise}
                selected={preferredExercises.includes(exercise)}
                onPress={() => handlePreferredExerciseToggle(exercise)}
                color={theme.color.accent.green}
              />
            ))}
          </View>

          <Text style={styles.sectionLabel}>Exercises to avoid</Text>
          <View style={styles.chipsContainer}>
            {AVOID_EXERCISES.map((exercise) => (
              <Chip
                key={exercise}
                label={exercise}
                selected={avoidExercises.includes(exercise)}
                onPress={() => handleAvoidExerciseToggle(exercise)}
                color={theme.color.accent.primary}
              />
            ))}
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputHalf}>
              <Text style={styles.inputLabel}>Preferred training time</Text>
              <View style={styles.timeChips}>
                {TRAINING_TIMES.map((time) => (
                  <TouchableOpacity
                    key={time}
                    style={[
                      styles.timeChip,
                      preferredTrainingTime === time && styles.selectedTimeChip,
                    ]}
                    onPress={() => setPreferredTrainingTime(time)}
                  >
                    <Text style={[
                      styles.timeChipText,
                      preferredTrainingTime === time && styles.selectedTimeChipText,
                    ]}>
                      {time}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.inputHalf}>
              <Text style={styles.inputLabel}>Session length</Text>
              <View style={styles.sessionLengthContainer}>
                {SESSION_LENGTHS.map((length) => (
                  <TouchableOpacity
                    key={length.value}
                    style={[
                      styles.sessionOption,
                      sessionLength === length.value && styles.selectedSession,
                    ]}
                    onPress={() => setSessionLength(length.value)}
                  >
                    <Text style={[
                      styles.sessionText,
                      sessionLength === length.value && styles.selectedSessionText,
                    ]}>
                      {length.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputHalf}>
              <Text style={styles.inputLabel}>Travel days/month</Text>
              <TextInput
                style={styles.numberInput}
                value={travelDays.toString()}
                onChangeText={(text) => setTravelDays(parseInt(text) || 0)}
                placeholder="0"
                placeholderTextColor={theme.color.muted}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputHalf}>
              <Text style={styles.inputLabel}>Step target</Text>
              <TextInput
                style={styles.numberInput}
                value={stepTarget.toString()}
                onChangeText={(text) => setStepTarget(parseInt(text) || 8000)}
                placeholder="8000"
                placeholderTextColor={theme.color.muted}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputHalf}>
              <Text style={styles.inputLabel}>Goal weight (kg)</Text>
              <TextInput
                style={styles.numberInput}
                value={goalWeight}
                onChangeText={setGoalWeight}
                placeholder={weight ? (parseFloat(weight) - 5).toString() : "65"}
                placeholderTextColor={theme.color.muted}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputHalf}>
              <Text style={styles.inputLabel}>Current weight</Text>
              <Text style={[styles.numberInput, { color: theme.color.muted, textAlignVertical: 'center' }]}>
                {weight ? `${weight} kg` : 'Not set'}
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { marginTop: theme.space.lg }]}>Fasting window</Text>
          <View style={styles.chipsContainer}>
            {FASTING_WINDOWS.map((window) => (
              <Chip
                key={window}
                label={window}
                selected={fastingWindow === window}
                onPress={() => setFastingWindow(window)}
                color={theme.color.accent.blue}
              />
            ))}
          </View>

          <Text style={styles.sectionLabel}>Meals per day</Text>
          <View style={styles.mealCountContainer}>
            {MEAL_COUNTS.map((count) => (
              <TouchableOpacity
                key={count.value}
                style={[
                  styles.mealOption,
                  mealCount === count.value && styles.selectedMeal,
                ]}
                onPress={() => setMealCount(count.value)}
              >
                <Text style={[
                  styles.mealText,
                  mealCount === count.value && styles.selectedMealText,
                ]}>
                  {count.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Injuries or limitations</Text>
            <TextInput
              style={styles.textInput}
              value={injuries}
              onChangeText={setInjuries}
              placeholder="e.g., Lower back pain, knee issues..."
              placeholderTextColor={theme.color.muted}
              multiline
              numberOfLines={2}
            />
          </View>

          

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Special requests (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={specialRequests}
              onChangeText={setSpecialRequests}
              placeholder="Anything we must honor? (e.g., no barbell, Jain diet, hostel mess, Ramadan)..."
              placeholderTextColor={theme.color.muted}
              multiline
              numberOfLines={3}
            />
          </View>
        </ScrollView>
      ),
    },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FF5C5C', '#FF4444', '#FF2222', '#1A1A1A', '#0C0C0D']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.welcomeText}>Welcome to</Text>
            <Text style={styles.appName}>Liftor</Text>
            <Text style={styles.subtitle}>Your AI-powered fitness companion</Text>
          </View>

          <Animated.View style={[styles.fadeWrapper, { opacity: fadeAnim }]}>
            <Card style={styles.stepCard}>
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${((step + 1) / steps.length) * 100}%` }
                    ]} 
                  />
                </View>
                <Text style={styles.stepText}>
                  {step + 1} of {steps.length}
                </Text>
              </View>

              <Text style={styles.stepTitle}>{steps[step].title}</Text>
              {steps[step].content}

              <View style={[
                styles.buttonContainer,
                (step === 0 && !isSmallScreen) ? styles.firstStepButtonContainer : undefined,
                ((step === 1 || step === 2) ? styles.alignedButtonContainer : undefined)
              ]}>
                {step > 0 && (
                  <Button
                    title="Back"
                    onPress={() => setStep(step - 1)}
                    variant="outline"
                    style={[styles.backButton, ((step === 1 || step === 2) ? styles.alignedButton : undefined)]}
                  />
                )}
                <Button
                  title={
                    !canProceed && currentStepValidation.missingFields.length > 0
                      ? stackedRequiredLabel
                      : step === steps.length - 1 
                        ? "Build My Journey" 
                        : "Next"
                  }
                  onPress={step === steps.length - 1 ? handleComplete : () => setStep(step + 1)}
                  disabled={!canProceed}
                  style={[
                    styles.nextButton,
                    (step === 0 && !isSmallScreen) ? styles.firstStepNextButton : undefined,
                    ((step === 1 || step === 2) ? styles.alignedButton : undefined),
                    !canProceed && styles.disabledButton
                  ]}
                  textStyle={!canProceed ? styles.requiredButtonText : undefined}
                />
              </View>
            </Card>
          </Animated.View>
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
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 300,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.space.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.space.xl,
    marginTop: theme.space.lg,
  },
  welcomeText: {
    fontSize: 18,
    color: theme.color.muted,
    opacity: 0.9,
    marginTop: theme.space.sm,
  },
  appName: {
    fontSize: 48,
    fontWeight: '700',
    color: theme.color.ink,
    marginVertical: theme.space.xs,
  },
  subtitle: {
    fontSize: theme.size.body,
    color: theme.color.muted,
    opacity: 0.8,
    textAlign: 'center',
  },
  stepCard: {
    flex: 1,
    minHeight: 450,
  },
  progressContainer: {
    marginBottom: theme.space.xxl,
  },
  progressBar: {
    height: 6,
    backgroundColor: theme.color.line,
    borderRadius: theme.radius.pill,
    marginBottom: theme.space.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.color.accent.primary,
    borderRadius: theme.radius.pill,
  },
  stepText: {
    fontSize: 14,
    color: theme.color.muted,
    textAlign: 'center',
  },
  stepTitle: {
    fontSize: theme.size.h2,
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
    marginBottom: theme.space.xxl,
  },
  optionsContainer: {
    gap: theme.space.sm,
    marginBottom: theme.space.xxl,
  },
  goalOption: {
    padding: theme.space.lg,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
  },
  selectedGoal: {
    borderColor: theme.color.accent.primary,
    backgroundColor: theme.color.accent.primary,
  },
  goalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 4,
  },
  goalDescription: {
    fontSize: 14,
    color: theme.color.muted,
  },
  selectedGoalText: {
    color: theme.color.bg,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.space.lg,
  },
  inputContainer: {
    marginTop: theme.space.md,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.muted,
    marginBottom: theme.space.xs,
  },
  textInput: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.md,
    color: theme.color.ink,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  bodyStatsContainer: {
    maxHeight: 400,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.space.md,
    marginBottom: theme.space.lg,
  },
  statInput: {
    flex: 1,
  },
  numberInput: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.md,
    color: theme.color.ink,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  sexButtons: {
    flexDirection: 'row',
    gap: theme.space.xs,
  },
  sexButton: {
    flex: 1,
    height: 48,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedSexButton: {
    borderColor: theme.color.accent.primary,
    backgroundColor: theme.color.accent.primary,
  },
  sexButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
  },
  selectedSexButtonText: {
    color: theme.color.bg,
  },
  activitySection: {
    marginTop: theme.space.md,
  },
  activityOption: {
    padding: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
    marginBottom: theme.space.xs,
  },
  selectedActivity: {
    borderColor: theme.color.accent.green,
    backgroundColor: theme.color.accent.green,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.ink,
  },
  activityDescription: {
    fontSize: 14,
    color: theme.color.muted,
    marginTop: 2,
  },
  selectedActivityText: {
    color: theme.color.bg,
  },
  calorieResult: {
    marginTop: theme.space.xl,
    padding: theme.space.lg,
    backgroundColor: theme.color.luxe.champagne + '20',
    borderRadius: theme.radius.lg,
    alignItems: 'center',
  },
  calorieLabel: {
    fontSize: 14,
    color: theme.color.muted,
    marginBottom: theme.space.xs,
  },
  calorieDisplay: {
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    backgroundColor: theme.color.luxe.champagne,
    borderRadius: theme.radius.pill,
  },
  calorieValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.bg,
  },
  calorieEditInput: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.bg,
    minWidth: 100,
    textAlign: 'center',
  },
  calorieHint: {
    fontSize: 12,
    color: theme.color.muted,
    marginTop: theme.space.xs,
    opacity: 0.7,
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.space.sm,
    marginBottom: theme.space.xxl,
  },
  dayOption: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedDay: {
    borderColor: theme.color.accent.primary,
    backgroundColor: theme.color.accent.primary,
  },
  dayText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
  },
  selectedDayText: {
    color: theme.color.bg,
  },
  supplementsContainer: {
    maxHeight: 350,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.sm,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: theme.space.sm,
    marginTop: 'auto',
    paddingHorizontal: theme.space.sm,
    paddingBottom: theme.space.sm,
    width: '100%',
    alignItems: 'center',
  },
  firstStepButtonContainer: {
    justifyContent: 'flex-end',
  },
  backButton: {
    flex: 1,
  },
  nextButton: {
    flex: 1,
    minWidth: 0,
  },
  firstStepNextButton: {
    flex: 0,
    minWidth: 120,
  },

  alignedButtonContainer: {
    paddingTop: theme.space.xs,
  },
  alignedButton: {
    marginTop: theme.space.xs,
  },
  fadeWrapper: {
    flex: 1,
  },
  // New styles for specifics step
  specificsContainer: {
    maxHeight: 400,
  },
  inputRow: {
    flexDirection: 'row',
    gap: theme.space.md,
    marginBottom: theme.space.lg,
  },
  inputHalf: {
    flex: 1,
  },
  timeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.xs,
  },
  timeChip: {
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
  },
  selectedTimeChip: {
    borderColor: theme.color.accent.primary,
    backgroundColor: theme.color.accent.primary,
  },
  timeChipText: {
    fontSize: 12,
    color: theme.color.ink,
    fontWeight: '500',
  },
  selectedTimeChipText: {
    color: theme.color.bg,
  },
  sessionLengthContainer: {
    gap: theme.space.xs,
  },
  sessionOption: {
    padding: theme.space.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
    alignItems: 'center',
  },
  selectedSession: {
    borderColor: theme.color.accent.primary,
    backgroundColor: theme.color.accent.primary,
  },
  sessionText: {
    fontSize: 12,
    color: theme.color.ink,
    fontWeight: '500',
  },
  selectedSessionText: {
    color: theme.color.bg,
  },
  mealCountContainer: {
    flexDirection: 'row',
    gap: theme.space.sm,
    marginBottom: theme.space.lg,
  },
  mealOption: {
    flex: 1,
    padding: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
    alignItems: 'center',
  },
  selectedMeal: {
    borderColor: theme.color.accent.primary,
    backgroundColor: theme.color.accent.primary,
  },
  mealText: {
    fontSize: 14,
    color: theme.color.ink,
    fontWeight: '500',
  },
  selectedMealText: {
    color: theme.color.bg,
  },
  requiredField: {
    borderColor: theme.color.accent.primary,
    borderWidth: 2,
  },
  requiredFieldText: {
    fontSize: 12,
    color: theme.color.accent.primary,
    marginTop: theme.space.xs,
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.6,
  },
  requiredButtonText: {
    lineHeight: 16,
    textAlign: 'center',
  },
});