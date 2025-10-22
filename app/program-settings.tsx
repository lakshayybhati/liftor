import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Settings, Save, Calendar } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { useUserStore } from '@/hooks/useUserStore';
import { GOALS } from '@/constants/fitness';
import { router } from 'expo-router';
import { theme } from '@/constants/colors';
import type { User, Equipment, DietaryPref, WorkoutIntensity } from '@/types/user';
import { useAuth } from '@/hooks/useAuth';
import { confirmNumericWithinRange, NumberSpecs } from '@/utils/number-guards';

const WORKOUT_SPLITS = [
  { id: '3', label: 'Full Body (3 days)', description: 'Complete body workout 3x per week' },
  { id: '4', label: 'Upper/Lower (4 days)', description: 'Alternating upper and lower body' },
  { id: '5', label: 'Push/Pull/Legs + Upper/Lower (5 days)', description: 'PPL with additional upper/lower' },
  { id: '6', label: 'Push/Pull/Legs x2 (6 days)', description: 'PPL routine twice per week' },
  { id: '2', label: 'Full Body + Pump (2 days)', description: 'Basic full body with pump session' },
];

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
        preferredWorkoutSplit: user.preferredWorkoutSplit || '',
        specialRequests: user.specialRequests || '',
        workoutIntensity: user.workoutIntensity || 'Optimal',
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
        preferredWorkoutSplit: user.preferredWorkoutSplit || '',
        specialRequests: user.specialRequests || '',
        workoutIntensity: user.workoutIntensity || 'Optimal',
      });
    }
  }, [user]);

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
      // Best-effort: persist preferences to Supabase profiles
      try {
        if (session?.user?.id) {
          await supabase
            .from('profiles')
            .update({ 
              goal_weight: typeof formData.goalWeight === 'number' ? Math.round(formData.goalWeight) : formData.goalWeight ?? null,
              dietary_notes: formData.dietaryNotes || null,
              workout_intensity: formData.workoutIntensity || null
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
    <View style={[styles.container, { backgroundColor: theme.color.bg }]}>
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
              <Text style={styles.fieldLabel}>Preferred Workout Split</Text>
              <View style={styles.chipContainer}>
                {WORKOUT_SPLITS.map((split) => (
                  <Chip
                    key={split.id}
                    label={split.label}
                    selected={formData.preferredWorkoutSplit === split.id}
                    onPress={() => updateFormField('preferredWorkoutSplit', split.id)}

                  />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Workout Intensity Preference</Text>
              <View style={styles.chipContainer}>
                {WORKOUT_INTENSITY_OPTIONS.map((intensity) => (
                  <Chip
                    key={intensity.id}
                    label={intensity.label}
                    selected={formData.workoutIntensity === intensity.id}
                    onPress={() => updateFormField('workoutIntensity', intensity.id)}
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
              <View style={styles.chipContainer}>
                {MEAL_COUNTS.map((count) => (
                  <Chip
                    key={count}
                    label={`${count} meals`}
                    selected={formData.mealCount === count}
                    onPress={() => updateFormField('mealCount', count)}

                  />
                ))}
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
              icon={<Save color={theme.color.bg} size={20} />}
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
    </View>
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
});