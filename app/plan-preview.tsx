import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Animated, TextInput, Alert } from 'react-native';
import { router, Stack } from 'expo-router';
import { Calendar, Dumbbell, Apple, Heart, Lock, Unlock, Edit3, Send } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/hooks/useUserStore';
import { theme } from '@/constants/colors';

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
  const { getCurrentBasePlan, updateBasePlanDay } = useUserStore();
  const [selectedDay, setSelectedDay] = useState<string>('monday');
  const [isLocked, setIsLocked] = useState(false);
  const [confettiAnim] = useState(new Animated.Value(0));
  const [showEditInput, setShowEditInput] = useState(false);
  const [editText, setEditText] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const basePlan = getCurrentBasePlan();

  useEffect(() => {
    // Confetti animation on mount
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
  }, [confettiAnim]);

  if (!basePlan) {
    router.replace('/onboarding');
    return null;
  }

  const selectedDayData = basePlan.days[selectedDay];

  const handleLockPlan = () => {
    setIsLocked(!isLocked);
    // TODO: Update the base plan's locked status in storage
  };

  const handleStartJourney = () => {
    router.replace('/(tabs)/home');
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
      duration: 3000, // 3 seconds for the progress bar
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

  const renderDayCard = (day: typeof DAYS_OF_WEEK[0]) => {
    const dayData = basePlan.days[day.key];
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
            {dayData.workout.focus[0]}
          </Text>
          <Text style={[
            styles.dayCalories,
            isSelected && styles.selectedDayText,
          ]}>
            {dayData.nutrition.total_kcal}kcal
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderWorkoutPreview = () => (
    <Card style={styles.previewCard}>
      <View style={styles.previewHeader}>
        <Dumbbell size={24} color={theme.color.accent.primary} />
        <Text style={styles.previewTitle}>Workout</Text>
      </View>
      <Text style={styles.focusText}>
        Focus: {selectedDayData.workout.focus.join(', ')}
      </Text>
      {selectedDayData.workout.blocks.map((block, index) => (
        <View key={index} style={styles.blockPreview}>
          <Text style={styles.blockName}>{block.name}</Text>
          {block.items.slice(0, 2).map((item, itemIndex) => (
            <Text key={itemIndex} style={styles.exercisePreview}>
              • {item.exercise} {item.sets && item.reps ? `${item.sets}×${item.reps}` : ''}
            </Text>
          ))}
          {block.items.length > 2 && (
            <Text style={styles.moreText}>+{block.items.length - 2} more exercises</Text>
          )}
        </View>
      ))}
      {selectedDayData.workout.notes && (
        <Text style={styles.notesText}>{selectedDayData.workout.notes}</Text>
      )}
    </Card>
  );

  const renderNutritionPreview = () => (
    <Card style={styles.previewCard}>
      <View style={styles.previewHeader}>
        <Apple size={24} color={theme.color.accent.green} />
        <Text style={styles.previewTitle}>Nutrition</Text>
      </View>
      <View style={styles.macroRow}>
        <View style={styles.macroItem}>
          <Text style={styles.macroValue}>{selectedDayData.nutrition.total_kcal}</Text>
          <Text style={styles.macroLabel}>Calories</Text>
        </View>
        <View style={styles.macroItem}>
          <Text style={styles.macroValue}>{selectedDayData.nutrition.protein_g}g</Text>
          <Text style={styles.macroLabel}>Protein</Text>
        </View>
        <View style={styles.macroItem}>
          <Text style={styles.macroValue}>{selectedDayData.nutrition.hydration_l}L</Text>
          <Text style={styles.macroLabel}>Water</Text>
        </View>
      </View>
      {selectedDayData.nutrition.meals.slice(0, 3).map((meal, index) => (
        <View key={index} style={styles.mealPreview}>
          <Text style={styles.mealName}>{meal.name}</Text>
          <Text style={styles.mealItems}>
            {meal.items.map(item => item.food).join(', ')}
          </Text>
        </View>
      ))}
      {selectedDayData.nutrition.meals.length > 3 && (
        <Text style={styles.moreText}>+{selectedDayData.nutrition.meals.length - 3} more meals</Text>
      )}
    </Card>
  );

  const renderRecoveryPreview = () => (
    <Card style={styles.previewCard}>
      <View style={styles.previewHeader}>
        <Heart size={24} color={theme.color.accent.blue} />
        <Text style={styles.previewTitle}>Recovery</Text>
      </View>
      <View style={styles.recoverySection}>
        <Text style={styles.recoveryTitle}>🧘‍♀️ Mobility</Text>
        {selectedDayData.recovery.mobility.slice(0, 2).map((item, index) => (
          <Text key={index} style={styles.recoveryItem}>• {item}</Text>
        ))}
      </View>
      <View style={styles.recoverySection}>
        <Text style={styles.recoveryTitle}>😴 Sleep</Text>
        {selectedDayData.recovery.sleep.slice(0, 2).map((item, index) => (
          <Text key={index} style={styles.recoveryItem}>• {item}</Text>
        ))}
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Your 7-Day Plan',
          headerStyle: { backgroundColor: theme.color.bg },
          headerTintColor: theme.color.ink,
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
      >
        <Text style={styles.confettiText}>🎉 Your Plan is Ready! 🎉</Text>
      </Animated.View>
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Calendar size={32} color={theme.color.accent.primary} />
            <Text style={styles.headerTitle}>Your 7-Day Base Plan</Text>
            <Text style={styles.headerSubtitle}>
              This is your foundation plan that will be adjusted daily based on your check-ins
            </Text>
          </View>

          {/* Day Selector */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.daySelector}
            contentContainerStyle={styles.daySelectorContent}
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
                
                <View style={styles.editActions}>
                  <Button
                    title="Cancel"
                    onPress={() => {
                      if (!isSubmittingEdit) {
                        setShowEditInput(false);
                        setEditText('');
                      }
                    }}
                    variant="outline"
                    style={styles.editActionButton}
                    disabled={isSubmittingEdit}
                  />
                  <Button
                    title={isSubmittingEdit ? "Applying..." : "Apply Changes"}
                    onPress={handleSubmitEdit}
                    disabled={isSubmittingEdit || !editText.trim()}
                    style={styles.editActionButton}
                    icon={!isSubmittingEdit ? <Send size={16} color={theme.color.bg} /> : undefined}
                  />
                </View>
              </View>
            )}
            
            {!showEditInput && (
              <Button
                title="Edit This Day"
                onPress={handleEditDay}
                variant="outline"
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
              style={styles.lockButton}
            />
          </Card>
        </ScrollView>

        {/* Bottom Action */}
        <View style={styles.bottomAction}>
          <Button
            title="Start My Journey"
            onPress={handleStartJourney}
            style={styles.startButton}
          />
        </View>
      </SafeAreaView>
    </View>
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
  lockCard: {
    margin: theme.space.lg,
    alignItems: 'center',
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
    minWidth: 120,
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
    gap: theme.space.sm,
  },
  editActionButton: {
    flex: 1,
  },
  editButton: {
    minWidth: 140,
    alignSelf: 'center',
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
});