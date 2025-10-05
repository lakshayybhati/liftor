import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { router, Stack } from 'expo-router';
import { ChevronLeft, Info } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Slider } from '@/components/ui/Slider';
import { Chip } from '@/components/ui/Chip';
import { useUserStore } from '@/hooks/useUserStore';
import { 
  MOOD_CHARACTERS,
  SORENESS_AREAS, 
  DIGESTION_OPTIONS, 
  WOKE_FEELING_OPTIONS 
} from '@/constants/fitness';
import { MoodCharacter } from '@/components/ui/MoodCharacter';
import type { CheckinMode, CheckinData } from '@/types/user';

export default function CheckinScreen() {
  const { addCheckin, getWeightData } = useUserStore();
  const [mode, setMode] = useState<CheckinMode>('LOW');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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
    waterL: 2.5,
    saltYN: false,
    suppsYN: false,
    steps: undefined,
    kcalEst: undefined,
    caffeineYN: false,
    alcoholYN: false,
    motivation: 7,
    specialRequest: undefined,
  });

  const handleSorenessToggle = (area: string) => {
    setCheckinData(prev => ({
      ...prev,
      soreness: prev.soreness?.includes(area)
        ? prev.soreness.filter(s => s !== area)
        : [...(prev.soreness || []), area]
    }));
  };

  const handleSubmit = async () => {
    // Validate required fields
    const missing: string[] = [];
    if (!checkinData.moodCharacter) missing.push('Mood');
    if (!checkinData.energy) missing.push('Energy');
    if (!checkinData.stress) missing.push('Stress');
    if (!checkinData.sleepHrs) missing.push('Hours of Sleep');
    if (!checkinData.wokeFeeling) missing.push('Woke up feeling');
    if (mode !== 'LOW' && !checkinData.digestion) missing.push('Digestion');
    // Soreness is optional
    if ((mode === 'HIGH' || mode === 'PRO') && (checkinData.waterL === undefined || checkinData.waterL === null)) missing.push('Water Yesterday');

    if (missing.length > 0) {
      Alert.alert(
        'Missing required fields',
        `Please fill: ${missing.join(', ')}`,
        [{ text: 'OK' }]
      );
      return;
    }

    setIsSubmitting(true);
    
    try {
      const checkin: CheckinData = {
        id: Date.now().toString(),
        mode,
        date: new Date().toISOString().split('T')[0],
        ...checkinData,
      };

      await addCheckin(checkin);
      
      router.push('/generating-plan');
    } catch (error) {
      console.error('Error submitting checkin:', error);
    } finally {
      setIsSubmitting(false);
    }
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

    const rounded = Math.round(estimate * 10) / 10;
    setCheckinData(prev => ({ ...prev, currentWeight: rounded }));
  };

  const renderModeSelector = () => (
    <Card style={styles.modeCard}>
      <Text style={styles.modeTitle}>Check-in Mode</Text>
      <View style={styles.modeButtons}>
        {(['LOW', 'HIGH', 'PRO'] as CheckinMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[
              styles.modeButton,
              mode === m && styles.selectedMode,
            ]}
            onPress={() => setMode(m)}
          >
            <Text style={[
              styles.modeButtonText,
              mode === m && styles.selectedModeText,
            ]}>
              {m}
            </Text>
            <Text style={[styles.modeDescription, mode === m && styles.selectedModeText]}>
              {m === 'LOW' ? 'about 5 questions' : m === 'HIGH' ? 'about 8 questions' : 'about 12 questions'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );

  const renderBasicMetrics = () => (
    <Card style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>How are you feeling?</Text>
      
      <View style={styles.moodContainer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Text style={styles.fieldLabel}>How are you today? <Text style={{ color: '#FF6FB2' }}>*</Text></Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Why this?', 'Your mood helps us tailor motivation and recovery suggestions for today.', [{ text: 'OK' }])}
            accessibilityRole="button"
            accessibilityLabel="About mood question"
            style={styles.infoIcon}
          >
            <Info color={'#A6A6AD'} size={16} />
          </TouchableOpacity>
        </View>
        <View style={styles.moodCharactersGrid}>
          {MOOD_CHARACTERS.map((mood) => (
            <MoodCharacter
              key={mood.id}
              mood={mood}
              selected={checkinData.moodCharacter === mood.id}
              onPress={() => setCheckinData(prev => ({ ...prev, moodCharacter: mood.id }))}
              size={70}
            />
          ))}
        </View>
      </View>

      <Slider
        label="Energy Level"
        required
        infoText="Energy helps us adjust your workout intensity and recovery. Rate 1-10 based on how energized you feel now."
        value={checkinData.energy || 7}
        onValueChange={(value) => setCheckinData(prev => ({ ...prev, energy: value }))}
        minimumValue={1}
        maximumValue={10}
      />

      <Slider
        label="Stress Level"
        required
        infoText="Stress impacts performance and recovery. Rate 1-10 based on your current stress."
        value={checkinData.stress || 3}
        onValueChange={(value) => setCheckinData(prev => ({ ...prev, stress: value }))}
        minimumValue={1}
        maximumValue={10}
      />
    </Card>
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
      />

      <View style={styles.fieldContainer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Text style={styles.fieldLabel}>Woke up feeling <Text style={{ color: '#FF6FB2' }}>*</Text></Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Why this?', 'Morning readiness helps adjust training load and recovery focus.', [{ text: 'OK' }])}
            accessibilityRole="button"
            accessibilityLabel="About woke up feeling"
            style={styles.infoIcon}
          >
            <Info color={'#A6A6AD'} size={16} />
          </TouchableOpacity>
        </View>
        <View style={styles.chipsContainer}>
          {WOKE_FEELING_OPTIONS.map((feeling) => (
            <Chip
              key={feeling}
              label={feeling}
              selected={checkinData.wokeFeeling === feeling}
              onPress={() => setCheckinData(prev => ({ ...prev, wokeFeeling: feeling }))}
              color="#4ECDC4"
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Text style={styles.fieldLabel}>Any soreness?</Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Why this?', 'Soreness guides exercise selection and recovery emphasis.', [{ text: 'OK' }])}
            accessibilityRole="button"
            accessibilityLabel="About soreness"
            style={styles.infoIcon}
          >
            <Info color={'#A6A6AD'} size={16} />
          </TouchableOpacity>
        </View>
        <View style={styles.chipsContainer}>
          {SORENESS_AREAS.map((area) => (
            <Chip
              key={area}
              label={area}
              selected={checkinData.soreness?.includes(area) || false}
              onPress={() => handleSorenessToggle(area)}
              color="#FF6B9D"
            />
          ))}
        </View>
      </View>

      {mode !== 'LOW' && (
        <View style={styles.fieldContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Text style={styles.fieldLabel}>Digestion <Text style={{ color: '#FF6FB2' }}>*</Text></Text>
            <TouchableOpacity
              onPress={() => Alert.alert('Why this?', 'Digestion influences today’s nutrition suggestions and tolerance for intensity.', [{ text: 'OK' }])}
              accessibilityRole="button"
              accessibilityLabel="About digestion"
              style={styles.infoIcon}
            >
              <Info color={'#A6A6AD'} size={16} />
            </TouchableOpacity>
          </View>
          <View style={styles.chipsContainer}>
            {DIGESTION_OPTIONS.map((digestion) => (
              <Chip
                key={digestion}
                label={digestion}
                selected={checkinData.digestion === digestion}
                onPress={() => setCheckinData(prev => ({ ...prev, digestion }))}
                color="#44A08D"
              />
            ))}
          </View>
        </View>
      )}
    </Card>
  );

  const renderHighModeExtras = () => {
    if (mode === 'LOW') return null;

    return (
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Additional Metrics</Text>
        
        <Slider
          label="Motivation Level"
          infoText="Motivation helps us tailor coaching tone and suggest supportive actions."
          value={checkinData.motivation || 7}
          onValueChange={(value) => setCheckinData(prev => ({ ...prev, motivation: value }))}
          minimumValue={1}
          maximumValue={10}
        />

        {/* Water input only shown in HIGH mode, not PRO (PRO has its own) */}
        {mode === 'HIGH' && (
          <View style={styles.waterInputContainer}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Water Yesterday (L) <Text style={{ color: '#FF6FB2' }}>*</Text></Text>
              <TouchableOpacity
                onPress={() => Alert.alert('Why this?', 'Hydration affects performance and recovery. Enter approximate liters from yesterday.', [{ text: 'OK' }])}
                accessibilityRole="button"
                accessibilityLabel="About water intake"
                style={styles.infoIcon}
              >
                <Info color={'#A6A6AD'} size={16} />
              </TouchableOpacity>
            </View>
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
              placeholder="Enter liters of water"
              placeholderTextColor="#A6A6AD"
              keyboardType="numeric"
            />
          </View>
        )}

        {/* Remove weight input in HIGH mode as requested */}

        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              checkinData.caffeineYN && styles.toggleActive,
            ]}
            onPress={() => setCheckinData(prev => ({ ...prev, caffeineYN: !prev.caffeineYN }))}
          >
            <Text style={[
              styles.toggleText,
              checkinData.caffeineYN && styles.toggleActiveText,
            ]}>
              Had Caffeine ☕
            </Text>
          </TouchableOpacity>

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
              Had Alcohol 🍷
            </Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  const renderProModeExtras = () => {
    if (mode !== 'PRO') return null;

    return (
      <>
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Weight Tracking</Text>
          
          <View style={styles.weightInputContainer}>
            <Text style={styles.fieldLabel}>Today's Weight (kg) <Text style={{ color: '#FF6FB2' }}>*</Text></Text>
            <TextInput
              style={[
                styles.weightInput,
                !checkinData.currentWeight && styles.requiredField
              ]}
              value={checkinData.currentWeight?.toString() || ''}
              onChangeText={(text) => {
                const weight = parseFloat(text);
                setCheckinData(prev => ({ 
                  ...prev, 
                  currentWeight: isNaN(weight) ? undefined : weight 
                }));
              }}
              placeholder="Enter your current weight"
              placeholderTextColor="#A6A6AD"
              keyboardType="numeric"
            />
            <View style={styles.assumeRow}>
              <TouchableOpacity
                style={styles.assumeButton}
                onPress={handleAssumeWeight}
                accessibilityRole="button"
                accessibilityLabel="Assume today's weight from recent trend"
              >
                <Text style={styles.assumeText}>Assume</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.labelRow}>
            <Text style={styles.sectionTitle}>Special Request</Text>
            <TouchableOpacity
              onPress={() => Alert.alert('Optional', 'Add any special considerations for today (e.g., time limit, focus area, avoid joints).', [{ text: 'OK' }])}
              accessibilityRole="button"
              accessibilityLabel="About special request"
              style={styles.infoIcon}
            >
              <Info color={'#A6A6AD'} size={18} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Any special requests for today’s plan? (e.g., focus on pull, short on time, avoid knees)"
            placeholderTextColor="#A6A6AD"
            value={checkinData.specialRequest || ''}
            onChangeText={(text) => setCheckinData(prev => ({ ...prev, specialRequest: text }))}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Yesterday's Intake</Text>
          
          <View style={styles.waterInputContainer}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Water Yesterday (L) <Text style={{ color: '#FF6FB2' }}>*</Text></Text>
              <TouchableOpacity
                onPress={() => Alert.alert('Why this?', 'Hydration affects performance and recovery. Enter approximate liters from yesterday.', [{ text: 'OK' }])}
                accessibilityRole="button"
                accessibilityLabel="About water intake"
                style={styles.infoIcon}
              >
                <Info color={'#A6A6AD'} size={16} />
              </TouchableOpacity>
            </View>
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
              placeholder="Enter liters of water"
              placeholderTextColor="#A6A6AD"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.toggleContainer}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Y/N Yesterday</Text>
              <TouchableOpacity
                onPress={() => Alert.alert('Why this?', 'Salt and supplements affect hydration and recovery, informing plan adjustments.', [{ text: 'OK' }])}
                accessibilityRole="button"
                accessibilityLabel="About Y/N yesterday"
                style={styles.infoIcon}
              >
                <Info color={'#A6A6AD'} size={16} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                checkinData.saltYN && styles.toggleActive,
              ]}
              onPress={() => setCheckinData(prev => ({ ...prev, saltYN: !prev.saltYN }))}
            >
              <Text style={[
                styles.toggleText,
                checkinData.saltYN && styles.toggleActiveText,
              ]}>
                Salt Yesterday (Y/N) 🧂
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.toggleButton,
                checkinData.suppsYN && styles.toggleActive,
              ]}
              onPress={() => setCheckinData(prev => ({ ...prev, suppsYN: !prev.suppsYN }))}
            >
              <Text style={[
                styles.toggleText,
                checkinData.suppsYN && styles.toggleActiveText,
              ]}>
                Supps Yesterday (Y/N) 💊
              </Text>
            </TouchableOpacity>
          </View>
        </Card>
      </>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Check-in time',
          headerStyle: { backgroundColor: '#0C0C0D' },
          headerTintColor: '#F7F7F8',
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: '600',
          },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 8 }} accessibilityRole="button" accessibilityLabel="Go back">
              <ChevronLeft color={'#F7F7F8'} size={22} />
            </TouchableOpacity>
          ),
        }} 
      />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>How are you today?</Text>
            <Text style={styles.subtitle}>
              Help us create the perfect plan for you
            </Text>
          </View>

          {renderModeSelector()}
          {renderBasicMetrics()}
          {renderSleepMetrics()}
          {renderPhysicalMetrics()}
          {renderHighModeExtras()}
          {renderProModeExtras()}

          <Button
            title={
              isSubmitting 
                ? "Generating Plan..." 
                : (mode === 'PRO') && !checkinData.currentWeight
                  ? "Enter Weight to Continue"
                  : "Generate My Plan"
            }
            onPress={handleSubmit}
            disabled={isSubmitting || ((mode === 'PRO') && !checkinData.currentWeight)}
            size="large"
            style={[
              styles.submitButton,
              ((mode === 'PRO') && !checkinData.currentWeight) && styles.disabledButton
            ]}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0C0D',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 44,
    fontWeight: '700',
    color: '#F7F7F8',
    textAlign: 'center',
    lineHeight: 44 * 0.9,
  },
  subtitle: {
    fontSize: 16,
    color: '#A6A6AD',
    textAlign: 'center',
    marginTop: 12,
  },
  modeCard: {
    marginBottom: 24,
    backgroundColor: '#131316',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#26262B',
    padding: 24,
  },
  modeTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F7F7F8',
    marginBottom: 16,
    textAlign: 'center',
  },
  modeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    padding: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#26262B',
    backgroundColor: '#131316',
    alignItems: 'center',
  },
  selectedMode: {
    borderColor: '#FF6FB2',
    backgroundColor: '#FF6FB2',
  },
  modeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F7F7F8',
  },
  modeDescription: {
    fontSize: 12,
    color: '#A6A6AD',
    marginTop: 2,
  },
  selectedModeText: {
    color: '#0C0C0D',
  },
  sectionCard: {
    marginBottom: 24,
    backgroundColor: '#131316',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#26262B',
    padding: 24,
  },
  sectionTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: '#F7F7F8',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 30,
  },
  moodContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F7F7F8',
    marginBottom: 16,
    textAlign: 'center',
  },
  moodCharactersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  toggleContainer: {
    gap: 12,
  },
  toggleButton: {
    padding: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#26262B',
    backgroundColor: '#131316',
    alignItems: 'center',
  },
  toggleActive: {
    borderColor: '#7EE08A',
    backgroundColor: '#7EE08A',
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F7F7F8',
  },
  toggleActiveText: {
    color: '#0C0C0D',
  },
  weightInputContainer: {
    marginBottom: 20,
  },
  weightInput: {
    backgroundColor: '#131316',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26262B',
    padding: 16,
    color: '#F7F7F8',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  waterInputContainer: {
    marginBottom: 20,
  },
  waterInput: {
    backgroundColor: '#131316',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26262B',
    padding: 16,
    color: '#F7F7F8',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  submitButton: {
    marginTop: 20,
    marginBottom: 40,
  },
  disabledButton: {
    opacity: 0.6,
  },
  requiredField: {
    borderColor: '#FF6B6B',
    borderWidth: 2,
  },
  assumeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  assumeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26262B',
    backgroundColor: '#131316',
  },
  assumeText: {
    color: '#A6A6AD',
    fontSize: 14,
    fontWeight: '600',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: '#131316',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26262B',
    padding: 16,
    color: '#F7F7F8',
    fontSize: 16,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  infoIcon: {
    padding: 4,
    marginTop: -15,
  },
});