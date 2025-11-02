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
  Animated,
  Alert,
  ActivityIndicator,
  Switch
} from 'react-native';
import { KeyboardDismissView } from '@/components/ui/KeyboardDismissView';
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
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
  WORKOUT_SPLITS,
  TRAINING_LEVELS
} from '@/constants/fitness';
import type { Goal, Equipment, DietaryPref, Sex, ActivityLevel, WorkoutIntensity, TrainingLevel } from '@/types/user';
import { theme } from '@/constants/colors';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { Power, Info } from 'lucide-react-native';
import { confirmNumericWithinRange, NumberSpecs, confirmCaloriesWithBaseline } from '@/utils/number-guards';





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

// Small helper to render a label with an Info ("i") icon that shows an explanation
const LabelWithInfo = ({
  label,
  required,
  infoTitle = 'Why this?',
  infoText,
  labelStyle,
}: {
  label: string;
  required?: boolean;
  infoTitle?: string;
  infoText: string;
  labelStyle?: any;
}) => (
  <View style={styles.labelRow}>
    <Text style={labelStyle || styles.inputLabel}>
      {label}
      {required ? <Text style={{ color: theme.color.accent.primary }}> *</Text> : null}
    </Text>
    <TouchableOpacity
      onPress={() => Alert.alert(infoTitle, infoText, [{ text: 'OK' }])}
      accessibilityRole="button"
      accessibilityLabel={`About ${label}`}
      style={styles.infoIcon}
    >
      <Info color={theme.color.muted} size={16} />
    </TouchableOpacity>
  </View>
);


export default function OnboardingScreen() {
  const { updateUser } = useUserStore();
  const auth = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const isSmallScreen = screenWidth < 380;
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { updateProfile, refetch: refetchProfile } = useProfile();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Handle case where auth context isn't ready yet
  if (!auth) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.color.accent.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const { signOut } = auth;
  
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
  const [calorieSource, setCalorieSource] = useState<'auto' | 'manual'>('auto');
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
  const [intensityLevel, setIntensityLevel] = useState(6);
  const [injuries, setInjuries] = useState('');
  const [stepTarget, setStepTarget] = useState(8000);
  const [stepTargetInput, setStepTargetInput] = useState('8000');
  const [specialRequests, setSpecialRequests] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [workoutIntensity, setWorkoutIntensity] = useState<WorkoutIntensity>('Optimal');
  const [trainingLevel, setTrainingLevel] = useState<TrainingLevel>('Beginner');
  const [includeReasoning, setIncludeReasoning] = useState(true);
  
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

  // Calculate calories when body stats change (only if user hasn't manually overridden)
  useEffect(() => {
    if (age && weight && height && sex && activityLevel && calorieSource === 'auto') {
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
      
      setDailyCalorieTarget(adjusted.toString());
    }
  }, [age, weight, height, sex, activityLevel, goal, calorieSource]);

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
        
      case 5: // Supplements & personal needs
        if (personalGoals.length === 0) missingFields.push('Personal Goals');
        break;
        
      case 6: // Specifics
        if (preferredExercises.length === 0) missingFields.push('Preferred Exercises');
        if (avoidExercises.length === 0) missingFields.push('Exercises to Avoid');
        if (!preferredTrainingTime) missingFields.push('Preferred Training Time');
        if (!sessionLength || sessionLength <= 0) missingFields.push('Session Length');
        if (!Number.isFinite(travelDays)) missingFields.push('Travel Days');
        if (!Number.isFinite(stepTarget)) missingFields.push('Step Target');
        if (!fastingWindow) missingFields.push('Fasting Window');
        if (!mealCount || mealCount < 1) missingFields.push('Meals Per Day');
        if (!trainingLevel) missingFields.push('Training Level');
        if (!goalWeight || !goalWeight.trim()) missingFields.push('Goal Weight');
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
  
  // Generic guidance instead of listing all missing fields
  const stackedRequiredLabel = !canProceed ? 'Fill\nall\nfields' : '';

  const handleComplete = async () => {
    // Prevent multiple simultaneous saves
    if (isSaving) return;
    
    setIsSaving(true);
    setSaveError(null);
    
    const mappedDietaryPrefs = dietaryPrefs.length > 0 ? dietaryPrefs : ['Non-veg' as DietaryPref];

    // Get user's name from session metadata (set during signup) or email
    const sessionUserName = auth?.session?.user?.user_metadata?.name as string | undefined;
    const userEmail = auth?.session?.user?.email || '';
    const emailLocalPart = userEmail.split('@')[0] || '';
    
    // Fallback chain: form name → session name → email local-part → 'User'
    const resolvedName = (name?.trim() || sessionUserName?.trim() || emailLocalPart || 'User');
    
    console.log('[Onboarding] Name resolution:', {
      formName: name?.trim() || null,
      sessionName: sessionUserName?.trim() || null,
      emailLocalPart: emailLocalPart || null,
      resolvedName,
    });

    const userData = {
      id: Date.now().toString(),
      name: resolvedName,
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
      specialRequests: specialRequests || undefined,
      goalWeight: goalWeight ? parseFloat(goalWeight) : undefined,
      workoutIntensity: workoutIntensity || undefined,
      workoutIntensityLevel: intensityLevel || undefined,
      trainingLevel: trainingLevel || undefined,
    };

    // Validate email from auth session (already extracted above)
    if (!userEmail) {
      console.error('[Onboarding] No user email found in session');
      setIsSaving(false);
      setSaveError('User email not found. Please log in again.');
      Alert.alert(
        'Session Error',
        'Your session is invalid. Please log in again.',
        [{ text: 'OK', onPress: () => router.replace('/auth/login') }]
      );
      return;
    }

    // Prepare profile data
    const profileData = {
      email: userEmail,
      name: resolvedName,
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
      special_requests: specialRequests || null,
      goal_weight: goalWeight ? parseFloat(goalWeight) : null,
      workout_intensity: workoutIntensity || null,
    };

    // Helper function to save with retry logic
    const saveWithRetry = async (maxRetries = 3): Promise<boolean> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[Onboarding] Save attempt ${attempt}/${maxRetries}`);
          
          // Save to database first (most critical)
          await updateProfile(profileData);
          console.log('[Onboarding] ✅ Profile synced to Supabase');
          
          // Force refetch to ensure cache is up to date
          await refetchProfile();
          console.log('[Onboarding] ✅ Profile cache refreshed');
          
          // Update local store (this is less critical, can fail without blocking)
          try {
            await updateUser(userData);
            console.log('[Onboarding] ✅ Local store updated');
          } catch (localError) {
            console.warn('[Onboarding] Local store update failed (non-critical):', localError);
          }
          
          return true; // Success!
          
        } catch (error: any) {
          console.error(`[Onboarding] Save attempt ${attempt} failed:`, error);
          
          // If this isn't the last attempt, wait before retrying
          if (attempt < maxRetries) {
            const delay = attempt * 1000; // Progressive delay: 1s, 2s, 3s
            console.log(`[Onboarding] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            // Last attempt failed
            const errorMessage = error?.message || 'Unknown error';
            console.error('[Onboarding] All save attempts failed:', errorMessage);
            setSaveError(`Failed to save your profile: ${errorMessage}`);
            return false;
          }
        }
      }
      return false;
    };

    // Attempt to save with retries
    const success = await saveWithRetry(3);
    
    if (success) {
      // Only proceed if save was successful
      console.log('[Onboarding] ✅ Onboarding complete, proceeding to plan generation');
      router.replace('/generating-base-plan');
    } else {
      // Save failed - show error and stay on page
      setIsSaving(false);
      Alert.alert(
        'Save Failed',
        'We couldn\'t save your profile. Please check your internet connection and try again.',
        [
          {
            text: 'Retry',
            onPress: () => handleComplete(),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    }
  };

  const handleSignOutPress = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } finally {
              router.replace('/auth/login');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const steps = [
    {
      title: "What's your fitness goal?",
      content: (
        <View>
          <LabelWithInfo
            label="Fitness Goal"
            required
            infoText="Your goal guides your training split and nutrition targets."
          />
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
        </View>
      ),
    },
    {
      title: "What equipment do you have?",
      content: (
        <View>
          <LabelWithInfo
            label="Equipment"
            required
            infoText="We tailor exercises to what you can access at home or the gym."
          />
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
        </View>
      ),
    },
    {
      title: "Your dietary preference?",
      content: (
        <View>
          <LabelWithInfo
            label="Dietary Preference"
            required
            infoText="We align meal suggestions and macros to your dietary pattern."
          />
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
            <LabelWithInfo
              label="Foods you prefer or avoid (optional)"
              infoText="Calling out preferences, allergies, or restrictions helps personalize meal ideas."
            />
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
        <View>
          <View style={styles.statsRow}>
            <View style={styles.statInput}>
              <LabelWithInfo
                label="Age"
                required
                infoText="Age improves calorie estimation and training recommendations."
              />
              <TextInput
                style={[styles.numberInput, !age.trim() && styles.requiredField]}
                value={age}
                onChangeText={setAge}
                placeholder="25"
                placeholderTextColor={theme.color.muted}
                keyboardType="decimal-pad"
                onBlur={async () => {
                  if (!age.trim()) return;
                  const v = await confirmNumericWithinRange(age, NumberSpecs.age);
                  if (v === null) setAge('');
                  else setAge(String(Math.round(v)));
                }}
              />
            </View>
            <View style={styles.statInput}>
              <LabelWithInfo
                label="Gender"
                required
                infoText="Sex is used in BMR (calorie) and training volume estimates."
              />
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
              <LabelWithInfo
                label="Height (cm)"
                required
                infoText="Height helps calculate calorie needs and set healthy targets."
              />
              <TextInput
                style={[styles.numberInput, !height.trim() && styles.requiredField]}
                value={height}
                onChangeText={setHeight}
                placeholder="175"
                placeholderTextColor={theme.color.muted}
                keyboardType="decimal-pad"
                onBlur={async () => {
                  if (!height.trim()) return;
                  const v = await confirmNumericWithinRange(height, NumberSpecs.heightCm);
                  if (v === null) setHeight('');
                  else setHeight(String(Math.round(v)));
                }}
              />
            </View>
            <View style={styles.statInput}>
              <LabelWithInfo
                label="Weight (kg)"
                required
                infoText="Weight is needed for calorie estimation and progress tracking."
              />
              <TextInput
                style={[styles.numberInput, !weight.trim() && styles.requiredField]}
                value={weight}
                onChangeText={(text) => {
                  const decimalPattern = /^\d*\.?\d{0,2}$/;
                  if (text === '' || decimalPattern.test(text)) {
                    setWeight(text);
                  }
                }}
                placeholder="70"
                placeholderTextColor={theme.color.muted}
                keyboardType="decimal-pad"
                onBlur={async () => {
                  if (!weight.trim()) return;
                  const v = await confirmNumericWithinRange(weight, NumberSpecs.weightKg);
                  if (v === null) setWeight('');
                  else setWeight(String(Math.round(v * 100) / 100));
                }}
              />
            </View>
          </View>

          <View style={styles.activitySection}>
            <LabelWithInfo
              label="Activity Level"
              infoText="Choose the option that best matches your usual daily movement."
            />
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

          {/* Always show the calorie card; keep the input visible even if empty */}
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
                    onBlur={async () => {
                      const baseline = (() => {
                        const a = parseFloat(age || '');
                        const w = parseFloat(weight || '');
                        const h = parseFloat(height || '');
                        if (!isFinite(a) || !isFinite(w) || !isFinite(h)) return null;
                        const bmr = calculateBMR(w, h, a, sex);
                        let reco = calculateTDEE(bmr, activityLevel);
                        if (goal === 'WEIGHT_LOSS') reco = Math.round(reco * 0.85);
                        else if (goal === 'MUSCLE_GAIN') reco = Math.round(reco * 1.15);
                        return reco;
                      })();

                      if (dailyCalorieTarget && dailyCalorieTarget.trim()) {
                        const v = await confirmCaloriesWithBaseline(dailyCalorieTarget, baseline, 0.25, 0.5);
                        if (v !== null) {
                          setDailyCalorieTarget(String(Math.round(v)));
                          setCalorieSource('manual');
                        }
                      } else if (baseline) {
                        setDailyCalorieTarget(String(baseline));
                        setCalorieSource('auto');
                      }
                      setShowCalorieEdit(false);
                    }}
                    autoFocus
                  />
                ) : (
                  <Text style={styles.calorieValue}>{dailyCalorieTarget ? `${dailyCalorieTarget} kcal` : 'Tap to set'}</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.calorieHint}>Tap to adjust if needed</Text>
            </View>
        </View>
      ),
    },
    {
      title: "How many days per week can you train?",
      content: (
        <View>
          <LabelWithInfo
            label="Training Days"
            required
            infoText="We build your weekly plan around how many days you can train."
          />
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
        </View>
      ),
    },
    {
      title: "Supplements & personal needs (optional)",
      content: (
        <View>
          <LabelWithInfo
            label="Current supplements"
            infoText="Knowing your supplements helps us avoid duplicate advice and optimize recovery."
            labelStyle={styles.sectionLabel}
          />
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

          <View style={{ marginTop: theme.space.lg }}>
            <LabelWithInfo
              label="Personal goals"
              required
              infoText="Your personal goals guide coaching tone and focus areas."
              labelStyle={styles.sectionLabel}
            />
          </View>
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

          <View style={{ marginTop: theme.space.lg }}>
            <LabelWithInfo
              label="What you feel you lack"
              infoText="Telling us where you need support helps shape your program."
              labelStyle={styles.sectionLabel}
            />
          </View>
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
        </View>
      ),
    },
    {
      title: "Let's get specific about your journey",
      content: (
        <View>
          <LabelWithInfo
            label="Exercises you prefer"
            required
            infoText="We’ll prioritize exercises you enjoy to boost consistency."
            labelStyle={styles.sectionLabel}
          />
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

          <LabelWithInfo
            label="Exercises to avoid"
            required
            infoText="We’ll avoid these to reduce injury risk and frustration."
            labelStyle={styles.sectionLabel}
          />
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
              <LabelWithInfo
                label="Preferred training time"
                required
                infoText="We’ll schedule workouts when you tend to have the most energy."
              />
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
              <LabelWithInfo
                label="Session length"
                required
                infoText="Pick the typical time you can dedicate to a session."
              />
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
              <LabelWithInfo
                label="Travel days/month"
                required
                infoText="We’ll plan more flexible training for frequent travel."
              />
              <TextInput
                style={styles.numberInput}
                value={travelDays.toString()}
                onChangeText={(text) => setTravelDays(parseInt(text) || 0)}
                placeholder="0"
                placeholderTextColor={theme.color.muted}
                keyboardType="numeric"
                onBlur={async () => {
                  const v = await confirmNumericWithinRange(travelDays, NumberSpecs.travelDaysPerMonth);
                  if (v === null) setTravelDays(0);
                  else setTravelDays(Math.round(v));
                }}
              />
            </View>
            <View style={styles.inputHalf}>
              <LabelWithInfo
                label="Step target"
                required
                infoText="Daily steps support recovery and calorie balance."
              />
              <TextInput
              style={styles.numberInput}
              value={stepTargetInput}
              onChangeText={setStepTargetInput}
                placeholder="8000"
                placeholderTextColor={theme.color.muted}
                keyboardType="numeric"
                onBlur={async () => {
                  const v = await confirmNumericWithinRange(stepTargetInput, NumberSpecs.steps);
                  if (v === null) {
                    // Revert to prior saved value
                    setStepTargetInput(String(stepTarget));
                  } else {
                    const rounded = Math.round(v);
                    setStepTarget(rounded);
                    setStepTargetInput(String(rounded));
                  }
                }}
              />
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputHalf}>
              <LabelWithInfo
                label="Goal weight (kg)"
                required
                infoText="Your target helps us guide pace and plan adjustments."
              />
              <TextInput
                style={[styles.numberInput, !goalWeight.trim() && styles.requiredField]}
                value={goalWeight}
                onChangeText={(text) => {
                  const decimalPattern = /^\d*\.?\d{0,2}$/;
                  if (text === '' || decimalPattern.test(text)) {
                    setGoalWeight(text);
                  }
                }}
                placeholder={weight ? (parseFloat(weight) - 5).toString() : "65"}
                placeholderTextColor={theme.color.muted}
                keyboardType="decimal-pad"
                onBlur={async () => {
                  if (!goalWeight.trim()) return;
                  const v = await confirmNumericWithinRange(goalWeight, NumberSpecs.weightKg);
                  if (v === null) setGoalWeight('');
                  else setGoalWeight(String(Math.round(v * 100) / 100));
                }}
              />
            </View>
            <View style={styles.inputHalf}>
              <LabelWithInfo
                label="Current weight"
                infoText="Shown from earlier body stats to compare with your goal."
              />
              <Text style={[styles.numberInput, { color: theme.color.muted, textAlignVertical: 'center' }]}>
                {weight ? `${weight} kg` : 'Not set'}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: theme.space.lg }}>
            <LabelWithInfo
              label="Fasting window"
              required
              infoText="If you fast, we’ll time meals and training accordingly."
              labelStyle={styles.sectionLabel}
            />
          </View>
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

          <LabelWithInfo
            label="Meals per day"
            required
            infoText="Choose what's realistic; we'll balance macros across meals."
            labelStyle={styles.sectionLabel}
          />
          <View style={styles.sliderContainer}>
            <Text style={styles.sliderValue}>{mealCount} {mealCount === 1 ? 'meal' : 'meals'}</Text>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={8}
              step={1}
              value={mealCount}
              onValueChange={setMealCount}
              minimumTrackTintColor={theme.color.accent.primary}
              maximumTrackTintColor={theme.color.line}
              thumbTintColor={theme.color.accent.primary}
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabelText}>1</Text>
              <Text style={styles.sliderLabelText}>8</Text>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <LabelWithInfo
              label="Injuries or limitations"
              infoText="We’ll avoid movements that aggravate existing issues."
            />
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

          <View style={{ marginTop: theme.space.lg }}>
            <LabelWithInfo
              label="Workout Intensity"
              required
              infoText="How hard do you want to push in each workout? 1 is very light effort, 10 is maximum intensity. We'll estimate your fitness level automatically."
              labelStyle={styles.sectionLabel}
            />
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderValue}>
                {intensityLevel}/10 
                {intensityLevel <= 3 ? ' (Light)' : intensityLevel <= 6 ? ' (Moderate)' : ' (High Intensity)'}
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={1}
                maximumValue={10}
                step={1}
                value={intensityLevel}
                onValueChange={setIntensityLevel}
                minimumTrackTintColor={theme.color.accent.primary}
                maximumTrackTintColor={theme.color.line}
                thumbTintColor={theme.color.accent.primary}
              />
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabelText}>1 (Very Light)</Text>
                <Text style={styles.sliderLabelText}>10 (Max Effort)</Text>
              </View>
            </View>
          </View>

          <View style={{ marginTop: theme.space.lg }}>
            <LabelWithInfo
              label="Training Level"
              required
              infoText="Your training experience helps us set appropriate volume and progression."
              labelStyle={styles.sectionLabel}
            />
            <View style={styles.optionsContainer}>
              {TRAINING_LEVELS.map((level) => (
                <TouchableOpacity
                  key={level.id}
                  style={[
                    styles.goalOption,
                    trainingLevel === level.id && styles.selectedGoal,
                  ]}
                  onPress={() => setTrainingLevel(level.id as TrainingLevel)}
                >
                  <Text style={[
                    styles.goalTitle,
                    trainingLevel === level.id && styles.selectedGoalText,
                  ]}>
                    {level.label}
                  </Text>
                  <Text style={[
                    styles.goalDescription,
                    trainingLevel === level.id && styles.selectedGoalText,
                  ]}>
                    {level.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputContainer}>
            <LabelWithInfo
              label="Special requests (optional)"
              infoText="Anything we should honor? (e.g., no barbell, religious constraints)"
            />
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
        </View>
      ),
    },
  ];

  return (
    <KeyboardDismissView style={styles.container}>
      <LinearGradient
        colors={['#FF5C5C', '#FF4444', '#FF2222', '#1A1A1A', '#0C0C0D']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleSignOutPress} accessibilityLabel="Sign out" accessibilityRole="button" style={styles.powerButton}>
            <Power color={theme.color.ink} size={20} />
          </TouchableOpacity>
        </View>
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
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

              {step === steps.length - 1 && (
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLabelContainer}>
                    <Text style={styles.toggleLabel}>Quality Boost</Text>
                    <Text style={styles.toggleSubLabel}>(Extra checks for smarter choices and sequencing.)</Text>
                  </View>
                  <Switch
                    value={includeReasoning}
                    onValueChange={setIncludeReasoning}
                    trackColor={{ false: theme.color.line, true: theme.color.accent.primary }}
                    thumbColor={theme.color.bg}
                  />
                </View>
              )}

              {/* Error message display */}
              {saveError && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{saveError}</Text>
                </View>
              )}

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
                    disabled={isSaving}
                    style={[styles.backButton, ((step === 1 || step === 2) ? styles.alignedButton : undefined)]}
                  />
                )}
                <Button
                  title={
                    isSaving
                      ? "Saving..."
                      : !canProceed && currentStepValidation.missingFields.length > 0
                      ? stackedRequiredLabel
                      : step === steps.length - 1 
                        ? "Build My Journey" 
                        : "Next"
                  }
                  onPress={step === steps.length - 1 ? handleComplete : () => setStep(step + 1)}
                  disabled={!canProceed || isSaving}
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
    </KeyboardDismissView>
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: theme.space.sm,
    paddingBottom: theme.space.xs,
  },
  powerButton: {
    padding: 10,
    borderRadius: 20,
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
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.sm,
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginHorizontal: theme.space.sm,
    marginTop: theme.space.md,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: theme.space.sm,
    marginTop: 'auto',
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space.sm,
    paddingBottom: theme.space.sm,
    width: '100%',
    alignItems: 'center',
  },
  firstStepButtonContainer: {
    justifyContent: 'flex-end',
  },
  backButton: {
    flex: 0,
    minWidth: 100,
    maxWidth: 120,
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
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: theme.space.lg,
  },
  mealOption: {
    width: '48.5%',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
    marginBottom: 12,
  },
  selectedMeal: {
    borderColor: theme.color.accent.primary,
    backgroundColor: theme.color.accent.primary,
    borderWidth: 0,
  },
  mealText: {
    fontSize: 18,
    color: theme.color.ink,
    fontWeight: '600',
  },
  selectedMealText: {
    color: '#FFFFFF',
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
    marginTop: theme.space.md,
  },
  toggleLabelContainer: {
    flex: 1,
    marginRight: theme.space.md,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: 2,
  },
  toggleSubLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: theme.color.muted,
  },
  disabledButton: {
    opacity: 0.6,
  },
  requiredButtonText: {
    lineHeight: 16,
    textAlign: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    marginBottom: theme.space.xs,
  },
  infoIcon: {
    padding: 4,
    marginLeft: -6,
    marginTop: -10,
  },
  sliderContainer: {
    marginBottom: theme.space.lg,
    paddingHorizontal: theme.space.sm,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderValue: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
    marginBottom: theme.space.sm,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.xs,
  },
  sliderLabelText: {
    fontSize: 12,
    color: theme.color.muted,
    fontWeight: '500',
  },
});