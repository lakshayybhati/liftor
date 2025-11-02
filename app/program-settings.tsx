import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardDismissView } from '@/components/ui/KeyboardDismissView';
import { ArrowLeft, Settings, Save, Calendar } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { useUserStore } from '@/hooks/useUserStore';
import { GOALS, TRAINING_LEVELS } from '@/constants/fitness';
import { router } from 'expo-router';
import { theme } from '@/constants/colors';
import type { User, Equipment, DietaryPref, WorkoutIntensity, TrainingLevel } from '@/types/user';
import Slider from '@react-native-community/slider';
import { useAuth } from '@/hooks/useAuth';
import { confirmNumericWithinRange, NumberSpecs } from '@/utils/number-guards';

// Simple vertical wheel component (alarm-like) with snap-to-item behavior
function ScrollWheel({ data, index, onChange }: { data: string[]; index: number; onChange: (i: number) => void }) {
  const ITEM_HEIGHT = 44;
  const scrollRef = useRef<ScrollView>(null);
  const topBottomPad = ITEM_HEIGHT * 2; // to center selected item

  useEffect(() => {
    try {
      scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
    } catch {}
  }, [index]);

  const onEnd = (e: any) => {
    const y = e?.nativeEvent?.contentOffset?.y || 0;
    const i = Math.max(0, Math.min(data.length - 1, Math.round(y / ITEM_HEIGHT)));
    if (i !== index) onChange(i);
  };

  return (
    <View style={styles.wheel}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={onEnd}
        onScrollEndDrag={onEnd}
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: topBottomPad }}
      >
        {data.map((item, i) => (
          <View key={`${item}-${i}`} style={styles.wheelItem}>
            <Text style={[styles.wheelItemText, i === index && styles.wheelItemSelected]}>{item}</Text>
          </View>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={styles.wheelOverlay} />
    </View>
  );
}

// Placeholder for potential future reuse; currently unused visual wrapper
function ScrollWheelComponent() { return null; }


const TRAINING_TIMES = [
  'Early Morning (5-7 AM)',
  'Morning (7-10 AM)',
  'Late Morning (10-12 PM)',
  'Afternoon (12-4 PM)',
  'Evening (4-7 PM)',
  'Night (7-10 PM)',
  'Late Night (10+ PM)',
];

const SESSION_LENGTHS = [30, 45, 60, 75, 90, 120];
const MEAL_COUNTS = [3, 4, 5, 6];
const FASTING_WINDOWS = ['None', '12:12', '14:10', '16:8', '18:6', '20:4'];

const EQUIPMENT_OPTIONS_WITH_LABELS = [
  { id: 'Dumbbells', label: 'Dumbbells' },
  { id: 'Bands', label: 'Bands' },
  { id: 'Bodyweight', label: 'Bodyweight' },
  { id: 'Gym', label: 'Gym' },
];

const DIETARY_PREFS_WITH_LABELS = [
  { id: 'Vegetarian', label: 'Vegetarian' },
  { id: 'Eggitarian', label: 'Eggitarian' },
  { id: 'Non-veg', label: 'Non-veg' },
];

const WORKOUT_INTENSITY_OPTIONS: { id: WorkoutIntensity; label: WorkoutIntensity }[] = [
  { id: 'Optimal', label: 'Optimal' },
  { id: 'Ego lifts', label: 'Ego lifts' },
  { id: 'Recovery focused', label: 'Recovery focused' },
];

export default function ProgramSettingsScreen() {
  const { user, updateUser, basePlans } = useUserStore();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [formData, setFormData] = useState<Partial<User>>({});
  const [initialSnapshot, setInitialSnapshot] = useState<Partial<User> | null>(null);
  const navigation = useNavigation();

  // --- Alarm-style time picker state for Daily Check-in ---
  const HOURS = useMemo(() => Array.from({ length: 12 }, (_, i) => String(i + 1)), []);
  const MINUTES = useMemo(() => Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')), []);
  const PERIODS = ['AM', 'PM'] as const;
  const parseTimeParts = useCallback((time: string | undefined | null) => {
    const str = (time || '9:00 AM').toUpperCase().trim();
    const isPM = str.includes('PM');
    const isAM = str.includes('AM');
    const t = str.replace(/AM|PM/gi, '').trim();
    const [hStr, mStr = '0'] = t.split(':');
    let h = parseInt(hStr || '9', 10);
    const m = Math.min(59, Math.max(0, parseInt(mStr || '0', 10)));
    if (Number.isNaN(h)) h = 9;
    // Normalize hour to 1-12 for wheel
    if (h === 0) h = 12;
    if (h > 12) h = h - 12;
    const p = isPM ? 'PM' : 'AM';
    return { hour12: h, minute: m, period: p as 'AM' | 'PM' };
  }, []);
  const [hourIndex, setHourIndex] = useState(8); // 9 AM default (index 8)
  const [minuteIndex, setMinuteIndex] = useState(0);
  const [periodIndex, setPeriodIndex] = useState(0);

  // Handle case where auth context isn't ready yet
  if (!auth) {
    return (
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.color.accent.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const { session, supabase } = auth;

  useEffect(() => {
    if (user) {
      setFormData({
        goal: user.goal,
        trainingDays: user.trainingDays,
        equipment: user.equipment,
        // Enforce single-select dietary preference like Onboarding
        dietaryPrefs: (user.dietaryPrefs && user.dietaryPrefs.length > 0) 
          ? [user.dietaryPrefs[0] as DietaryPref] 
          : [],
        dietaryNotes: user.dietaryNotes || '',
        goalWeight: user.goalWeight,
        preferredExercises: user.preferredExercises || [],
        avoidExercises: user.avoidExercises || [],
        preferredTrainingTime: user.preferredTrainingTime || '',
        sessionLength: user.sessionLength || 60,
        travelDays: user.travelDays || 0,
        fastingWindow: user.fastingWindow || 'None',
        mealCount: user.mealCount || 4,
        injuries: user.injuries || '',
        budgetConstraints: user.budgetConstraints || '',
        wakeTime: user.wakeTime || '',
        sleepTime: user.sleepTime || '',
        stepTarget: user.stepTarget || 8000,
        caffeineFrequency: user.caffeineFrequency || '',
        alcoholFrequency: user.alcoholFrequency || '',
        stressBaseline: user.stressBaseline || 5,
        sleepQualityBaseline: user.sleepQualityBaseline || 7,
        specialRequests: user.specialRequests || '',
        workoutIntensity: user.workoutIntensity || 'Optimal',
        workoutIntensityLevel: user.workoutIntensityLevel || 6,
        trainingLevel: user.trainingLevel || 'Beginner',
        checkInReminderTime: user.checkInReminderTime || '9:00 AM',
      });
      // Capture initial snapshot for dirty checks
      setInitialSnapshot({
        goal: user.goal,
        trainingDays: user.trainingDays,
        equipment: [...(user.equipment || [])],
        dietaryPrefs: (user.dietaryPrefs && user.dietaryPrefs.length > 0) 
          ? [user.dietaryPrefs[0] as DietaryPref] 
          : [],
        dietaryNotes: user.dietaryNotes || '',
        goalWeight: user.goalWeight,
        preferredExercises: [...(user.preferredExercises || [])],
        avoidExercises: [...(user.avoidExercises || [])],
        preferredTrainingTime: user.preferredTrainingTime || '',
        sessionLength: user.sessionLength || 60,
        travelDays: user.travelDays || 0,
        fastingWindow: user.fastingWindow || 'None',
        mealCount: user.mealCount || 4,
        injuries: user.injuries || '',
        budgetConstraints: user.budgetConstraints || '',
        wakeTime: user.wakeTime || '',
        sleepTime: user.sleepTime || '',
        stepTarget: user.stepTarget || 8000,
        caffeineFrequency: user.caffeineFrequency || '',
        alcoholFrequency: user.alcoholFrequency || '',
        stressBaseline: user.stressBaseline || 5,
        sleepQualityBaseline: user.sleepQualityBaseline || 7,
        specialRequests: user.specialRequests || '',
        workoutIntensity: user.workoutIntensity || 'Optimal',
        workoutIntensityLevel: user.workoutIntensityLevel || 6,
        trainingLevel: user.trainingLevel || 'Beginner',
        checkInReminderTime: user.checkInReminderTime || '9:00 AM',
      });
      // Initialize wheel indices from existing value
      try {
        const parts = parseTimeParts(user.checkInReminderTime || '9:00 AM');
        setHourIndex(Math.max(0, HOURS.indexOf(String(parts.hour12))));
        setMinuteIndex(Math.max(0, MINUTES.indexOf(String(parts.minute).padStart(2, '0'))));
        setPeriodIndex(parts.period === 'PM' ? 1 : 0);
      } catch {}
    }
  }, [user, parseTimeParts, HOURS, MINUTES]);

  // Normalize and compare to detect unsaved changes
  const normalizeForm = (data: Partial<User> = {}) => {
    const clone: any = { ...data };
    const sort = (arr?: string[]) => Array.isArray(arr) ? [...arr].sort() : [];
    clone.equipment = sort(clone.equipment);
    clone.dietaryPrefs = sort(clone.dietaryPrefs);
    clone.preferredExercises = sort(clone.preferredExercises);
    clone.avoidExercises = sort(clone.avoidExercises);
    return clone;
  };

  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    try {
      const a = JSON.stringify(normalizeForm(formData));
      const b = JSON.stringify(normalizeForm(initialSnapshot));
      return a !== b;
    } catch {
      return false;
    }
  }, [formData, initialSnapshot]);

  // Intercept navigation when there are unsaved changes
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (!isDirty) return;
      e.preventDefault();
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to leave without saving?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]
      );
    });
    return () => {
      try { unsub(); } catch {}
    };
  }, [navigation, isDirty]);

  const handleSavePreferences = async () => {
    if (!user) return;
    
    try {
      const updatedUser = { ...user, ...formData };
      await updateUser(updatedUser);
      // Reschedule daily check-in reminder if time changed
      try {
        const { scheduleDailyCheckInReminderFromString } = await import('@/utils/notifications');
        await scheduleDailyCheckInReminderFromString(updatedUser.checkInReminderTime || '9:00 AM');
      } catch {}
      // Best-effort: persist preferences to Supabase profiles
      try {
        if (session?.user?.id) {
          await supabase
            .from('profiles')
            .update({ 
              goal_weight: typeof formData.goalWeight === 'number' ? Math.round(formData.goalWeight) : formData.goalWeight ?? null,
              dietary_notes: formData.dietaryNotes || null,
              workout_intensity: formData.workoutIntensity || null,
              workout_intensity_level: formData.workoutIntensityLevel || null,
              training_level: formData.trainingLevel || null,
              // Store the chosen check-in reminder time (if column exists, otherwise ignored by PostgREST)
              checkin_reminder_time: updatedUser.checkInReminderTime || null
            })
            .eq('id', session.user.id);
        }
      } catch {}
      Alert.alert('Success', 'Preferences saved successfully!');
      // Reset dirty state baseline
      setInitialSnapshot(JSON.parse(JSON.stringify(formData)));
    } catch (error) {
      console.error('Error saving preferences:', error);
      Alert.alert('Error', 'Failed to save preferences. Please try again.');
    }
  };

  const handleBackPress = () => {
    if (!isDirty) {
      router.back();
      return;
    }
    Alert.alert(
      'Discard changes?',
      'You have unsaved changes. Are you sure you want to leave without saving?',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]
    );
  };

  const updateFormField = (field: keyof User, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardDismissView style={[styles.container, { backgroundColor: theme.color.bg }]}>
      <View style={[styles.safeArea, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={handleBackPress}
          >
            <ArrowLeft color={theme.color.ink} size={24} />
          </TouchableOpacity>
          <Text style={styles.title}>Program Settings</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Inline component: vertical scroll wheel */}
          <ScrollWheelComponent />
          {/* Basic Settings */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Settings color={theme.color.accent.primary} size={20} />
              <Text style={styles.sectionTitle}>Basic Settings</Text>
            </View>
            
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Fitness Goal</Text>
              <View style={styles.chipContainer}>
                {GOALS.map((goal) => (
                  <Chip
                    key={goal.id}
                    label={goal.label}
                    selected={formData.goal === goal.id}
                    onPress={() => updateFormField('goal', goal.id)}

                  />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Training Days per Week</Text>
              <View style={styles.chipContainer}>
                {[2, 3, 4, 5, 6, 7].map((days) => (
                  <Chip
                    key={days}
                    label={`${days} days`}
                    selected={formData.trainingDays === days}
                    onPress={() => updateFormField('trainingDays', days)}

                  />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Equipment Available</Text>
              <View style={styles.chipContainer}>
                {EQUIPMENT_OPTIONS_WITH_LABELS.map((equipment) => (
                  <Chip
                    key={equipment.id}
                    label={equipment.label}
                    selected={formData.equipment?.includes(equipment.id as Equipment)}
                    onPress={() => {
                      const current = formData.equipment || [];
                      const updated = current.includes(equipment.id as Equipment)
                        ? current.filter(e => e !== equipment.id)
                        : [...current, equipment.id as Equipment];
                      updateFormField('equipment', updated);
                    }}
                  />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Dietary Preferences</Text>
              <View style={styles.chipContainer}>
                {DIETARY_PREFS_WITH_LABELS.map((pref) => (
                  <Chip
                    key={pref.id}
                    label={pref.label}
                    selected={formData.dietaryPrefs?.[0] === (pref.id as DietaryPref)}
                    onPress={() => {
                      // Single-select behavior: set the only selected item
                      updateFormField('dietaryPrefs', [pref.id as DietaryPref]);
                    }}
                  />
                ))}
              </View>
              <Text style={styles.fieldDescription}>
                Foods you prefer or avoid (optional)
              </Text>
              <TextInput
                style={styles.textInput}
                value={formData.dietaryNotes || ''}
                onChangeText={(text) => updateFormField('dietaryNotes', text)}
                placeholder="e.g., No dairy, love chicken, allergic to nuts..."
                placeholderTextColor={theme.color.muted}
                multiline
                numberOfLines={3}
              />
            </View>
          </Card>

          {/* Training Preferences */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Training Preferences</Text>
            
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Preferred Training Time</Text>
              <View style={styles.chipContainer}>
                {TRAINING_TIMES.map((time) => (
                  <Chip
                    key={time}
                    label={time}
                    selected={formData.preferredTrainingTime === time}
                    onPress={() => updateFormField('preferredTrainingTime', time)}

                  />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Session Length (minutes)</Text>
              <View style={styles.chipContainer}>
                {SESSION_LENGTHS.map((length) => (
                  <Chip
                    key={length}
                    label={`${length} min`}
                    selected={formData.sessionLength === length}
                    onPress={() => updateFormField('sessionLength', length)}

                  />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Daily Check-in Reminder Time</Text>
              <Text style={styles.fieldDescription}>Drag the wheels like an alarm clock.</Text>
              <View style={styles.timePickerRow}>
                <ScrollWheel
                  data={HOURS}
                  index={hourIndex}
                  onChange={(i) => {
                    setHourIndex(i);
                    const val = `${HOURS[i]}:${MINUTES[minuteIndex]} ${PERIODS[periodIndex]}`;
                    updateFormField('checkInReminderTime', val);
                  }}
                />
                <Text style={styles.timeColon}>:</Text>
                <ScrollWheel
                  data={MINUTES}
                  index={minuteIndex}
                  onChange={(i) => {
                    setMinuteIndex(i);
                    const val = `${HOURS[hourIndex]}:${MINUTES[i]} ${PERIODS[periodIndex]}`;
                    updateFormField('checkInReminderTime', val);
                  }}
                />
                <ScrollWheel
                  data={[...PERIODS] as unknown as string[]}
                  index={periodIndex}
                  onChange={(i) => {
                    setPeriodIndex(i);
                    const val = `${HOURS[hourIndex]}:${MINUTES[minuteIndex]} ${PERIODS[i]}`;
                    updateFormField('checkInReminderTime', val);
                  }}
                />
              </View>
              <Text style={styles.currentTimePreview}>Selected: {formData.checkInReminderTime || `${HOURS[hourIndex]}:${MINUTES[minuteIndex]} ${PERIODS[periodIndex]}`}</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Workout Intensity</Text>
              <Text style={styles.fieldDescription}>
                How hard do you want to push in each workout? 1 is very light effort, 10 is maximum intensity. We'll estimate your fitness level automatically.
              </Text>
              <View style={styles.sliderContainer}>
                <Text style={styles.sliderValue}>
                  {formData.workoutIntensityLevel || 6}/10
                  {(formData.workoutIntensityLevel || 6) <= 3 ? ' (Light)' : (formData.workoutIntensityLevel || 6) <= 6 ? ' (Moderate)' : ' (High Intensity)'}
                </Text>
                <Slider
                  style={styles.slider}
                  minimumValue={1}
                  maximumValue={10}
                  step={1}
                  value={formData.workoutIntensityLevel || 6}
                  onValueChange={(value) => updateFormField('workoutIntensityLevel', value)}
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

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Training Level</Text>
              <Text style={styles.fieldDescription}>
                Your training experience helps us set appropriate volume and progression.
              </Text>
              <View style={styles.chipContainer}>
                {TRAINING_LEVELS.map((level) => (
                  <Chip
                    key={level.id}
                    label={level.label}
                    selected={formData.trainingLevel === level.id}
                    onPress={() => updateFormField('trainingLevel', level.id)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Exercises to Avoid</Text>
              <TextInput
                style={styles.textInput}
                value={formData.avoidExercises?.join(', ') || ''}
                onChangeText={(text) => updateFormField('avoidExercises', text.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="e.g., Squats, Deadlifts, Overhead Press"
                placeholderTextColor={theme.color.muted}
                multiline
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Injuries or Limitations</Text>
              <TextInput
                style={styles.textInput}
                value={formData.injuries || ''}
                onChangeText={(text) => updateFormField('injuries', text)}
                placeholder="Describe any injuries or physical limitations"
                placeholderTextColor={theme.color.muted}
                multiline
              />
            </View>
          </Card>

          {/* Nutrition Preferences */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Nutrition Preferences</Text>
            
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Goal Weight (kg)</Text>
              <TextInput
                style={styles.textInput}
                value={typeof formData.goalWeight === 'number' ? String(formData.goalWeight) : (formData.goalWeight as any) || ''}
                onChangeText={(text) => {
                  const num = parseFloat(text);
                  updateFormField('goalWeight', isNaN(num) ? undefined : num);
                }}
                placeholder="e.g., 68"
                placeholderTextColor={theme.color.muted}
                keyboardType="numeric"
                onBlur={async () => {
                  const v = await confirmNumericWithinRange(formData.goalWeight as any, NumberSpecs.weightKg);
                  if (v === null) updateFormField('goalWeight', undefined);
                  else updateFormField('goalWeight', Math.round(v));
                }}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Fasting Window</Text>
              <View style={styles.chipContainer}>
                {FASTING_WINDOWS.map((window) => (
                  <Chip
                    key={window}
                    label={window}
                    selected={formData.fastingWindow === window}
                    onPress={() => updateFormField('fastingWindow', window)}

                  />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Meals per Day</Text>
              <View style={styles.sliderContainer}>
                <Text style={styles.sliderValue}>
                  {formData.mealCount || 4} {(formData.mealCount || 4) === 1 ? 'meal' : 'meals'}
                </Text>
                <Slider
                  style={styles.slider}
                  minimumValue={1}
                  maximumValue={8}
                  step={1}
                  value={formData.mealCount || 4}
                  onValueChange={(value) => updateFormField('mealCount', value)}
                  minimumTrackTintColor={theme.color.accent.primary}
                  maximumTrackTintColor={theme.color.line}
                  thumbTintColor={theme.color.accent.primary}
                />
                <View style={styles.sliderLabels}>
                  <Text style={styles.sliderLabelText}>1</Text>
                  <Text style={styles.sliderLabelText}>8</Text>
                </View>
              </View>
            </View>
          </Card>

          {/* Special Requests */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Special Requests</Text>
            <Text style={styles.fieldDescription}>
              Anything we must honor? (e.g., no barbell, dietary restrictions, schedule constraints)
            </Text>
            <TextInput
              style={[styles.textInput, styles.largeTextInput]}
              value={formData.specialRequests || ''}
              onChangeText={(text) => updateFormField('specialRequests', text)}
              placeholder="Describe any special requirements or preferences..."
              placeholderTextColor={theme.color.muted}
              multiline
              numberOfLines={4}
            />
          </Card>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <Button
              title="Save Preferences"
              onPress={handleSavePreferences}
              style={[styles.saveButton, styles.prettyButton]}
              textStyle={styles.prettyButtonText}
              icon={<Save color={theme.color.ink} size={20} />}
            />
          </View>

          {/* Current Plan Info */}
          {basePlans.length > 0 && (
            <Card style={styles.planInfoCard}>
              <View style={styles.planInfoHeader}>
                <Calendar color={theme.color.accent.blue} size={20} />
                <Text style={styles.planInfoTitle}>Current Base Plan</Text>
              </View>
              <Text style={styles.planInfoText}>
                Created: {new Date(basePlans[basePlans.length - 1].createdAt).toLocaleDateString()}
              </Text>
              <Text style={styles.planInfoText}>
                Status: {basePlans[basePlans.length - 1].isLocked ? 'Locked' : 'Active'}
              </Text>
              <TouchableOpacity
                style={styles.viewPlanButton}
                onPress={() => router.push('/plan-preview')}
              >
                <Text style={styles.viewPlanButtonText}>View Plan</Text>
              </TouchableOpacity>
            </Card>
          )}
        </ScrollView>
      </View>
    </KeyboardDismissView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
  },
  backButton: {
    padding: theme.space.xs,
  },
  title: {
    fontSize: theme.size.h2,
    fontWeight: '700',
    color: theme.color.ink,
  },
  placeholder: {
    width: 32,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.space.lg,
  },
  sectionCard: {
    marginBottom: theme.space.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space.md,
    gap: theme.space.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.md,
  },
  field: {
    marginBottom: theme.space.lg,
  },
  fieldLabel: {
    fontSize: theme.size.body,
    fontWeight: '600',
    color: theme.color.ink,
    marginBottom: theme.space.sm,
  },
  fieldDescription: {
    fontSize: theme.size.label,
    color: theme.color.muted,
    marginBottom: theme.space.sm,
    lineHeight: 18,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.sm,
  },

  // Time picker styles
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.md,
  },
  timeColon: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.ink,
  },
  currentTimePreview: {
    marginTop: theme.space.sm,
    color: theme.color.muted,
    fontSize: theme.size.label,
  },
  wheel: {
    width: 72,
    height: 44 * 5,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.card,
    overflow: 'hidden',
  },
  wheelItem: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: 16,
    color: theme.color.muted,
  },
  wheelItemSelected: {
    color: theme.color.ink,
    fontWeight: '600',
  },
  wheelOverlay: {
    position: 'absolute',
    top: (44 * 5) / 2 - 22,
    left: 0,
    right: 0,
    height: 44,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.color.accent.primary + '40',
  },

  textInput: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    fontSize: theme.size.body,
    color: theme.color.ink,
    backgroundColor: theme.color.card,
    minHeight: 44,
  },
  largeTextInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  actionButtons: {
    gap: theme.space.md,
    marginTop: theme.space.lg,
  },
  saveButton: {
    backgroundColor: 'transparent',
  },
  prettyButton: {
    borderWidth: 0,
    borderRadius: theme.radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  prettyButtonText: {
    letterSpacing: 0.2,
  },
  planInfoCard: {
    marginTop: theme.space.lg,
    backgroundColor: theme.color.accent.blue + '10',
    borderColor: theme.color.accent.blue + '30',
  },
  planInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space.sm,
    gap: theme.space.sm,
  },
  planInfoTitle: {
    fontSize: theme.size.body,
    fontWeight: '600',
    color: theme.color.ink,
  },
  planInfoText: {
    fontSize: theme.size.label,
    color: theme.color.muted,
    marginBottom: theme.space.xs,
  },
  viewPlanButton: {
    marginTop: theme.space.sm,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
    backgroundColor: theme.color.accent.blue,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  viewPlanButtonText: {
    color: theme.color.bg,
    fontSize: theme.size.label,
    fontWeight: '600',
  },
  sliderContainer: {
    marginTop: theme.space.sm,
    marginBottom: theme.space.md,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderValue: {
    fontSize: 18,
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
    fontSize: 11,
    color: theme.color.muted,
    fontWeight: '500',
  },
});