import React, { useState, useRef, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { KeyboardDismissView } from '@/components/ui/KeyboardDismissView';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Info } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Slider } from '@/components/ui/Slider';
import { Chip } from '@/components/ui/Chip';
import { useUserStore, REDO_CHECKIN_LIMIT, CHECKIN_LIMIT_ERROR } from '@/hooks/useUserStore';
import {
  MOOD_CHARACTERS,
  SORENESS_AREAS,
  DIGESTION_OPTIONS,
  WOKE_FEELING_OPTIONS
} from '@/constants/fitness';
import { MoodCharacter } from '@/components/ui/MoodCharacter';
import type { CheckinMode, CheckinData } from '@/types/user';
import { confirmNumericWithinRange, NumberSpecs } from '@/utils/number-guards';
import { theme } from '@/constants/colors';

const DEFAULT_WORKOUT_QUALITY = 7;

export default function CheckinScreen() {
  const params = useLocalSearchParams<{ isRedo?: string }>();
  const { addCheckin, getWeightData, checkins, getCheckinCountForDate } = useUserStore();
  const isRedo = params.isRedo === 'true';
  const mode: CheckinMode = 'PRO';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllMoods, setShowAllMoods] = useState(false);

  const [checkinData, setCheckinData] = useState<Partial<CheckinData>>({
    bodyWeight: undefined,
    mood: '🙂',
    moodCharacter: 'excited',
    energy: 7,
    sleepHrs: 7,
    sleepQuality: 3,
    wokeFeeling: 'Refreshed',
    soreness: [],
    digestion: 'Normal',
    stress: 3,
    waterL: 3.5,
    suppsYN: false,
    steps: undefined,
    kcalEst: undefined,
    alcoholYN: false,
    motivation: 7,
    specialRequest: undefined,
    workoutIntensity: 5,
    yesterdayWorkoutQuality: DEFAULT_WORKOUT_QUALITY,
  });

  // Local string state to allow decimals while typing (up to 2 dp)
  const [currentWeightInput, setCurrentWeightInput] = useState('');
  const clampAlertShownRef = useRef(false);

  // Maximum allowed change per day; scales with days since last weight entry
  const MAX_WEIGHT_CHANGE_PER_DAY_KG = 5;

  const yesterdayKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  const hadCheckinYesterday = useMemo(() => {
    if (!checkins || checkins.length === 0) return false;
    return checkins.some((checkin) => checkin.date === yesterdayKey);
  }, [checkins, yesterdayKey]);

  const lastWorkoutQualityDisabled = !hadCheckinYesterday;

  useEffect(() => {
    setCheckinData((prev) => {
      const shouldClear = !hadCheckinYesterday && prev.yesterdayWorkoutQuality !== undefined;
      const shouldRestore = hadCheckinYesterday && prev.yesterdayWorkoutQuality === undefined;
      if (!shouldClear && !shouldRestore) return prev;
      return {
        ...prev,
        yesterdayWorkoutQuality: shouldClear ? undefined : (prev.yesterdayWorkoutQuality ?? DEFAULT_WORKOUT_QUALITY),
      };
    });
  }, [hadCheckinYesterday]);

  const handleSorenessToggle = (area: string) => {
    setCheckinData(prev => ({
      ...prev,
      soreness: prev.soreness?.includes(area)
        ? prev.soreness.filter(s => s !== area)
        : [...(prev.soreness || []), area]
    }));
  };

  const todayKey = useMemo(() => new Date().toISOString().split('T')[0], []);
  const redoCountToday = getCheckinCountForDate(todayKey);
  const checkinLimitReached = isRedo && redoCountToday >= REDO_CHECKIN_LIMIT;

  const handleSubmit = async () => {
    // Prevent double-clicks: immediately disable button
    if (isSubmitting) return;
    if (checkinLimitReached) {
      Alert.alert(
        'Redo limit reached',
        `You can redo your check-in up to ${REDO_CHECKIN_LIMIT} times per day. Note: The mini-game is only available on your first check-in. Please come back tomorrow!`,
        [{ text: 'OK' }]
      );
      return;
    }
    setIsSubmitting(true);

    // Validate required fields
    const missing: string[] = [];
    if (!checkinData.moodCharacter) missing.push('Mood');
    if (!checkinData.energy) missing.push('Energy');
    if (!checkinData.stress) missing.push('Stress');
    if (!checkinData.sleepHrs) missing.push('Hours of Sleep');
    if (!checkinData.wokeFeeling) missing.push('Woke up feeling');
    if (!checkinData.digestion) missing.push('Digestion');
    // Soreness is optional
    if (checkinData.waterL === undefined || checkinData.waterL === null) missing.push('Water Yesterday');

    if (missing.length > 0) {
      Alert.alert(
        'Missing required fields',
        `Please fill: ${missing.join(', ')}`,
        [{ text: 'OK' }]
      );
      setIsSubmitting(false); // Re-enable on validation failure
      return;
    }

    try {
      const checkin: CheckinData = {
        id: Date.now().toString(),
        mode,
        date: todayKey,
        ...checkinData,
      };

      await addCheckin(checkin);

      // Always force regeneration when submitting a new check-in
      // This ensures the plan is regenerated with the new check-in data
      // NOTE: Don't reset isSubmitting here - let the navigation happen
      // The button stays disabled until we leave the screen
      router.push({
        pathname: '/generating-plan',
        params: {
          force: 'true',
          isRedo: isRedo ? 'true' : 'false'
        }
      });
    } catch (error) {
      console.error('Error submitting checkin:', error);
      if (error instanceof Error && error.message === CHECKIN_LIMIT_ERROR) {
        Alert.alert(
          'Redo limit reached',
          `You can only redo your check-in ${REDO_CHECKIN_LIMIT} times per day. Note: The mini-game is only available on your first check-in.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Unable to submit', 'Something went wrong while saving your check-in. Please try again.', [{ text: 'OK' }]);
      }
      setIsSubmitting(false); // Only re-enable on error
    }
    // Removed finally block - don't re-enable button after successful navigation
  };

  // Estimate today's weight using the last 4 entries of weight data
  const handleAssumeWeight = () => {
    const weights = getWeightData();
    const recent = weights.slice(-4);
    if (recent.length < 2) {
      Alert.alert(
        "Can't assume weight",
        'We need at least 2 recent weight entries to estimate. Please enter your weight manually.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Simple trend: linear fit using first and last values over their dates
    const first = recent[0];
    const last = recent[recent.length - 1];
    const daysBetween = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24));
    const slopePerDay = (last.weight - first.weight) / daysBetween;
    const daysFromLast = Math.max(0, (new Date().getTime() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24));
    const estimate = last.weight + slopePerDay * daysFromLast;

    const rounded = Math.round(estimate * 100) / 100;
    setCheckinData(prev => ({ ...prev, currentWeight: rounded }));
    setCurrentWeightInput(String(rounded));
  };

  const renderBasicMetrics = () => (
    <View style={styles.sectionContainer}>
      <Card style={[styles.sectionCard, styles.moodCard]} gradient gradientColors={['#1A1A20', '#0C0C0D']}>
        <Text style={styles.sectionTitle}>How are you feeling?</Text>

        <View style={styles.moodContainer}>
          <View style={styles.labelRow}>
            <Text style={styles.fieldLabel}>Select your mood <Text style={{ color: theme.color.accent.primary }}>*</Text></Text>
            <TouchableOpacity
              onPress={() => Alert.alert('Why this?', 'Your mood helps us tailor motivation and recovery suggestions for today.', [{ text: 'OK' }])}
              accessibilityRole="button"
              accessibilityLabel="About mood"
              style={styles.infoIcon}
            >
              <Info color={theme.color.muted} size={16} />
            </TouchableOpacity>
          </View>
          <View style={styles.moodCharactersGrid}>
            {(showAllMoods ? MOOD_CHARACTERS : MOOD_CHARACTERS.slice(0, 6)).map((mood) => (
              <MoodCharacter
                key={mood.id}
                mood={mood}
                selected={checkinData.moodCharacter === mood.id}
                onPress={() => setCheckinData(prev => ({ ...prev, moodCharacter: mood.id }))}
                size={70}
              />
            ))}
          </View>

          <TouchableOpacity
            onPress={() => setShowAllMoods(!showAllMoods)}
            style={styles.showMoreButton}
            accessibilityRole="button"
            accessibilityLabel={showAllMoods ? "Show less mood options" : "Show more mood options"}
          >
            <Text style={styles.showMoreText}>{showAllMoods ? "Show less" : "Show more"}</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Mental State</Text>

        <View style={styles.sliderGroup}>
          <Slider
            label="Motivation Level"
            infoText="Motivation helps us tailor coaching tone and suggest supportive actions."
            value={checkinData.motivation || 7}
            onValueChange={(value) => setCheckinData(prev => ({ ...prev, motivation: value }))}
            minimumValue={1}
            maximumValue={10}
            minLabel="1 (Low)"
            maxLabel="10 (High)"
            formatValue={(v) => `${v}/10`}
          />

          <View style={styles.divider} />

          <Slider
            label="Energy Level"
            required
            infoText="Energy helps us adjust your workout intensity and recovery. Rate 1-10 based on how energized you feel now."
            value={checkinData.energy || 7}
            onValueChange={(value) => setCheckinData(prev => ({ ...prev, energy: value }))}
            minimumValue={1}
            maximumValue={10}
            minLabel="1 (Drained)"
            maxLabel="10 (Charged)"
            formatValue={(v) => `${v}/10`}
          />

          <View style={styles.divider} />

          <Slider
            label="Stress Level"
            required
            infoText="Stress impacts performance and recovery. Rate 1-10 based on your current stress."
            value={checkinData.stress || 3}
            onValueChange={(value) => setCheckinData(prev => ({ ...prev, stress: value }))}
            minimumValue={1}
            maximumValue={10}
            minLabel="1 (Chill)"
            maxLabel="10 (Panic)"
            formatValue={(v) => `${v}/10`}
          />
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Workout Preference</Text>
        <Slider
          label="Intensity Target"
          required
          infoText="How intense do you want today's workout? 1 = Recovery focused, 5 = Optimal, 10 = Ego lifts"
          value={checkinData.workoutIntensity || 5}
          onValueChange={(value) => setCheckinData(prev => ({ ...prev, workoutIntensity: value }))}
          minimumValue={1}
          maximumValue={10}
          minLabel="1 (Recovery)"
          maxLabel="10 (Max)"
          formatValue={(v) => {
            if (v <= 3) return `${v} (Recovery)`;
            if (v <= 7) return `${v} (Optimal)`;
            return `${v} (Push)`;
          }}
        />
      </Card>
    </View>
  );

  const renderSleepMetrics = () => (
    <Card style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Sleep & Recovery</Text>

      <Slider
        label="Hours of Sleep"
        required
        infoText="We use sleep duration to tune training volume and recovery focus."
        value={checkinData.sleepHrs || 7}
        onValueChange={(value) => setCheckinData(prev => ({ ...prev, sleepHrs: value }))}
        minimumValue={3}
        maximumValue={12}
        step={0.5}
        minLabel="3h"
        maxLabel="12h+"
        formatValue={(v) => `${v} hrs`}
      />

      <View style={styles.divider} />

      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.fieldLabel}>Woke up feeling <Text style={{ color: theme.color.accent.primary }}>*</Text></Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Why this?', 'Morning readiness helps adjust training load and recovery focus.', [{ text: 'OK' }])}
            accessibilityRole="button"
            accessibilityLabel="About woke up feeling"
            style={styles.infoIcon}
          >
            <Info color={theme.color.muted} size={16} />
          </TouchableOpacity>
        </View>
        <View style={styles.chipsContainer}>
          {WOKE_FEELING_OPTIONS.map((feeling) => (
            <Chip
              key={feeling}
              label={feeling}
              selected={checkinData.wokeFeeling === feeling}
              onPress={() => setCheckinData(prev => ({ ...prev, wokeFeeling: feeling }))}
              color={theme.color.accent.green}
            />
          ))}
        </View>
      </View>
    </Card>
  );

  const renderPhysicalMetrics = () => (
    <Card style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Physical State</Text>

      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.fieldLabel}>Any soreness?</Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Why this?', 'Soreness guides exercise selection and recovery emphasis.', [{ text: 'OK' }])}
            accessibilityRole="button"
            accessibilityLabel="About soreness"
            style={styles.infoIcon}
          >
            <Info color={theme.color.muted} size={16} />
          </TouchableOpacity>
        </View>
        <View style={styles.chipsContainer}>
          {SORENESS_AREAS.map((area) => (
            <Chip
              key={area}
              label={area}
              selected={checkinData.soreness?.includes(area) || false}
              onPress={() => handleSorenessToggle(area)}
              color={theme.color.accent.primary}
            />
          ))}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.fieldLabel}>Digestion <Text style={{ color: theme.color.accent.primary }}>*</Text></Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Why this?', 'Digestion influences today’s nutrition suggestions and tolerance for intensity.', [{ text: 'OK' }])}
            accessibilityRole="button"
            accessibilityLabel="About digestion"
            style={styles.infoIcon}
          >
            <Info color={theme.color.muted} size={16} />
          </TouchableOpacity>
        </View>
        <View style={styles.chipsContainer}>
          {DIGESTION_OPTIONS.map((digestion) => (
            <Chip
              key={digestion}
              label={digestion}
              selected={checkinData.digestion === digestion}
              onPress={() => setCheckinData(prev => ({ ...prev, digestion }))}
              color={theme.color.accent.green}
            />
          ))}
        </View>
      </View>
    </Card>
  );

  const renderProModeExtras = () => {
    return (
      <>
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Weight Tracking</Text>

          <View style={styles.inputWrapper}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Today's Weight <Text style={{ color: theme.color.accent.primary }}>*</Text></Text>
              <TouchableOpacity
                onPress={() => Alert.alert('Why this?', 'Regular weight tracking helps adjust calorie targets and monitor progress.', [{ text: 'OK' }])}
                accessibilityRole="button"
                accessibilityLabel="About weight"
                style={styles.infoIcon}
              >
                <Info color={theme.color.muted} size={16} />
              </TouchableOpacity>
            </View>
            <View style={[
              styles.weightInputContainer,
              !checkinData.currentWeight && styles.requiredField
            ]}>
              <TextInput
                style={styles.weightInput}
                value={currentWeightInput}
                onChangeText={(text) => {
                  // Allow only numbers with optional single dot and up to 2 decimals
                  const decimalPattern = /^\d*\.?\d{0,2}$/;
                  if (text === '' || decimalPattern.test(text)) {
                    const numeric = parseFloat(text);

                    // Just accept the input while typing - no validation yet
                    setCurrentWeightInput(text);
                    setCheckinData(prev => ({
                      ...prev,
                      currentWeight: text && !isNaN(numeric) ? numeric : undefined,
                    }));
                  }
                }}
                placeholder="00.0"
                placeholderTextColor={theme.color.muted}
                keyboardType="decimal-pad"
                onBlur={async () => {
                  const input = currentWeightInput.trim();
                  if (!input) {
                    setCheckinData(prev => ({ ...prev, currentWeight: undefined }));
                    return;
                  }
                  const numeric = parseFloat(input);
                  if (isNaN(numeric)) {
                    setCheckinData(prev => ({ ...prev, currentWeight: undefined }));
                    setCurrentWeightInput('');
                    return;
                  }

                  // Validate weight range on blur (after user finishes typing)
                  const v = await confirmNumericWithinRange(numeric, NumberSpecs.weightKg);
                  if (v === null) {
                    setCheckinData(prev => ({ ...prev, currentWeight: undefined }));
                    setCurrentWeightInput('');
                    return;
                  }

                  const rounded = Math.round(v * 100) / 100;
                  setCheckinData(prev => ({ ...prev, currentWeight: rounded }));
                  setCurrentWeightInput(String(rounded));

                  // Check for large weight change warning (only on blur, after typing is complete)
                  const weights = getWeightData?.() || [];
                  const last = weights.length > 0 ? weights[weights.length - 1] : undefined;

                  if (last && isFinite(last.weight) && last.date) {
                    const now = Date.now();
                    const lastTime = new Date(last.date).getTime();
                    const rawDays = (now - lastTime) / (1000 * 60 * 60 * 24);
                    const daysBetween = isFinite(rawDays) ? Math.max(1, Math.round(rawDays)) : 1;
                    const allowedDelta = MAX_WEIGHT_CHANGE_PER_DAY_KG * daysBetween;
                    const minBound = last.weight - allowedDelta;
                    const maxBound = last.weight + allowedDelta;

                    // Show warning if outside bounds, but DON'T change the value
                    if ((rounded < minBound || rounded > maxBound) && !clampAlertShownRef.current) {
                      const diff = Math.abs(rounded - last.weight).toFixed(1);
                      Alert.alert(
                        'Large weight change',
                        `This is a ${diff} kg change from your last recorded weight (${last.weight} kg). If this is correct, you can continue.`,
                        [{ text: 'OK' }]
                      );
                      clampAlertShownRef.current = true;
                    } else if (rounded >= minBound && rounded <= maxBound) {
                      // Back within bounds → allow warnings again
                      clampAlertShownRef.current = false;
                    }
                  }
                }}
              />
              <Text style={styles.unitText}>kg</Text>
            </View>
            <TouchableOpacity
              style={styles.assumeButton}
              onPress={handleAssumeWeight}
            >
              <Text style={styles.assumeText}>Use estimate</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.labelRow}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Special Request</Text>
            <TouchableOpacity
              onPress={() => Alert.alert('Optional', 'Add any special considerations for today (e.g., time limit, focus area, avoid joints).', [{ text: 'OK' }])}
              accessibilityRole="button"
              accessibilityLabel="About special request"
              style={styles.infoIcon}
            >
              <Info color={theme.color.muted} size={18} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Any special requests for today’s plan? (e.g., focus on pull, short on time, avoid knees)"
            placeholderTextColor={theme.color.muted}
            value={checkinData.specialRequest || ''}
            onChangeText={(text) => setCheckinData(prev => ({ ...prev, specialRequest: text }))}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Yesterday's Data</Text>

          <View style={styles.inputWrapper}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Water Intake <Text style={{ color: theme.color.accent.primary }}>*</Text></Text>
            </View>
            <View style={styles.waterInputContainer}>
              <TextInput
                style={styles.waterInput}
                value={checkinData.waterL?.toString() || ''}
                onChangeText={(text) => {
                  const water = parseFloat(text);
                  setCheckinData(prev => ({
                    ...prev,
                    waterL: isNaN(water) ? undefined : water
                  }));
                }}
                placeholder="0.0"
                placeholderTextColor={theme.color.muted}
                keyboardType="numeric"
                onBlur={async () => {
                  if (checkinData.waterL === undefined || checkinData.waterL === null) return;
                  const v = await confirmNumericWithinRange(checkinData.waterL, NumberSpecs.waterL);
                  if (v === null) setCheckinData(prev => ({ ...prev, waterL: undefined }));
                  else setCheckinData(prev => ({ ...prev, waterL: v }));
                }}
              />
              <Text style={styles.unitText}>L</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Slider
            label="Last Workout Quality"
            infoText="Rate how your last workout felt overall. 1 = Very bad, 10 = Excellent."
            value={checkinData.yesterdayWorkoutQuality ?? DEFAULT_WORKOUT_QUALITY}
            onValueChange={(value) => {
              if (lastWorkoutQualityDisabled) return;
              setCheckinData(prev => ({ ...prev, yesterdayWorkoutQuality: value }));
            }}
            minimumValue={1}
            maximumValue={10}
            minLabel="1 (Bad)"
            maxLabel="10 (Great)"
            formatValue={(v) => lastWorkoutQualityDisabled ? 'No data' : `${v}/10`}
            disabled={lastWorkoutQualityDisabled}
            helperText={lastWorkoutQualityDisabled ? "No check-in yesterday • We'll mark this as no data" : undefined}
          />

          <View style={styles.divider} />

          <View style={styles.toggleContainer}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Extras</Text>
              <TouchableOpacity
                onPress={() => Alert.alert('Why this?', 'Track additional factors that impact recovery and performance.', [{ text: 'OK' }])}
                accessibilityRole="button"
                accessibilityLabel="About extras"
                style={styles.infoIcon}
              >
                <Info color={theme.color.muted} size={16} />
              </TouchableOpacity>
            </View>

            <View style={styles.togglesRow}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  checkinData.alcoholYN && styles.toggleActive,
                ]}
                onPress={() => setCheckinData(prev => ({ ...prev, alcoholYN: !prev.alcoholYN }))}
              >
                <Text style={[
                  styles.toggleText,
                  checkinData.alcoholYN && styles.toggleActiveText,
                ]}>
                  Alcohol 🍷
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      </>
    );
  };

  return (
    <KeyboardDismissView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Check-in time',
          headerStyle: { backgroundColor: theme.color.bg },
          headerTintColor: theme.color.ink,
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: '600',
          },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 8 }} accessibilityRole="button" accessibilityLabel="Go back">
              <ChevronLeft color={theme.color.ink} size={22} />
            </TouchableOpacity>
          ),
        }}
      />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <Text style={styles.title}>How are you today?</Text>
            <Text style={styles.subtitle}>
              Help us create the perfect plan for you
            </Text>
          </View>

          {checkinLimitReached && (
            <View style={styles.limitBanner}>
              <Text style={styles.limitTitle}>Redo limit reached</Text>
              <Text style={styles.limitSubtitle}>
                You've already redone today's check-in {REDO_CHECKIN_LIMIT} times. Note: The mini-game is only available on your first check-in. Try again tomorrow!
              </Text>
            </View>
          )}
          {renderBasicMetrics()}
          {renderSleepMetrics()}
          {renderPhysicalMetrics()}
          {renderProModeExtras()}

          <Button
            title={
              checkinLimitReached
                ? "Redo Limit Reached"
                : isSubmitting
                  ? "Generating Plan..."
                  : (mode === 'PRO') && !checkinData.currentWeight
                    ? "Enter Weight to Continue"
                    : "Generate My Plan"
            }
            onPress={handleSubmit}
            disabled={isSubmitting || ((mode === 'PRO') && !checkinData.currentWeight) || checkinLimitReached}
            size="large"
            style={[
              styles.submitButton,
              (((mode === 'PRO') && !checkinData.currentWeight) || checkinLimitReached) && styles.disabledButton
            ]}
          />
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
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 8,
    fontFamily: theme.font.display,
  },
  subtitle: {
    fontSize: 16,
    color: theme.color.muted,
    textAlign: 'center',
    fontFamily: theme.font.ui,
  },
  limitBanner: {
    backgroundColor: 'rgba(255,99,132,0.12)',
    borderColor: 'rgba(255,99,132,0.35)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
  },
  limitTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.color.ink,
    textAlign: 'center',
    marginBottom: 6,
    fontFamily: theme.font.display,
  },
  limitSubtitle: {
    fontSize: 14,
    color: theme.color.muted,
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: theme.font.ui,
  },
  sectionContainer: {
    gap: 16,
    marginBottom: 16,
  },
  sectionCard: {
    backgroundColor: theme.color.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.color.line,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  moodCard: {
    paddingTop: 32,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.color.ink,
    marginBottom: 20,
    textAlign: 'center',
    fontFamily: theme.font.display,
  },
  moodContainer: {
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.color.muted,
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: theme.font.ui,
  },
  moodCharactersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  fieldContainer: {
    marginBottom: 0,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  toggleContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  togglesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
  },
  toggleButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    alignItems: 'center',
    minWidth: 140,
  },
  toggleActive: {
    borderColor: theme.color.accent.green,
    backgroundColor: 'rgba(126, 224, 138, 0.15)',
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.color.muted,
  },
  toggleActiveText: {
    color: theme.color.accent.green,
  },
  inputWrapper: {
    alignItems: 'center',
    marginBottom: 16,
  },
  weightInputContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.color.line,
    paddingHorizontal: 24,
    paddingVertical: 16,
    minWidth: 180,
  },
  waterInputContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.color.line,
    paddingHorizontal: 24,
    paddingVertical: 16,
    minWidth: 160,
  },
  weightInput: {
    color: theme.color.ink,
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 80,
    fontFamily: theme.font.display,
  },
  waterInput: {
    color: theme.color.ink,
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    minWidth: 60,
    fontFamily: theme.font.display,
  },
  unitText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.muted,
    marginLeft: 4,
  },
  submitButton: {
    marginTop: 24,
    marginBottom: 16,
    shadowColor: theme.color.accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    marginHorizontal: 16,
  },
  disabledButton: {
    opacity: 0.6,
    shadowOpacity: 0,
  },
  requiredField: {
    borderColor: theme.color.accent.primary,
    borderWidth: 2,
  },
  assumeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  assumeButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  assumeText: {
    color: theme.color.accent.blue,
    fontSize: 14,
    fontWeight: '600',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  textArea: {
    backgroundColor: '#000',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: 16,
    color: theme.color.ink,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    width: '100%',
  },
  infoIcon: {
    padding: 2,
    transform: [{ translateY: -5 }],
  },
  showMoreButton: {
    alignSelf: 'center',
    marginTop: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  showMoreText: {
    color: theme.color.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  sliderGroup: {
    gap: 8,
  },
  divider: {
    height: 1,
    backgroundColor: theme.color.line,
    marginVertical: 24,
    width: '100%',
    opacity: 0.5,
  },
});
