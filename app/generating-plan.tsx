import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated } from 'react-native';
import { router, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserStore } from '@/hooks/useUserStore';
import type { DailyPlan } from '@/types/user';
import { generateDailyPlan } from '@/services/documented-ai-service';

const LOADING_MESSAGES = [
  "📚 Gathering research specific to your goals and preferences…",
  "🔎 Reviewing your recent check-ins and training history…",
  "🧭 Cross‑checking trusted sources for training, nutrition, and recovery…",
  "🛠️ Customizing recommendations to match your equipment and routine…",
  "✅ Finalizing today’s plan with precise adjustments…",
];

export default function GeneratingPlanScreen() {
  const { user, getRecentCheckins, getTodayCheckin, getTodayPlan, addPlan, getCurrentBasePlan } = useUserStore();
  const [messageIndex, setMessageIndex] = useState(0);
  const [, setIsGenerating] = useState(true);
  const fadeAnim = useMemo(() => new Animated.Value(1), []);
  const startedRef = useRef(false);

  const generatePlan = useCallback(async () => {
    try {
      // If a plan for today already exists, skip regeneration
      const existing = getTodayPlan();
      if (existing) {
        router.replace('/plan');
        return;
      }

      const todayCheckin = getTodayCheckin();
      const recentCheckins = getRecentCheckins(15);

      if (!todayCheckin || !user) {
        throw new Error('Missing checkin or user data');
      }

      // Get current base plan
      const basePlan = getCurrentBasePlan();
      
      if (!basePlan) {
        throw new Error('No base plan available. Please complete onboarding first.');
      }

      // Use the new AI service for daily plan generation
      const planData = await generateDailyPlan(user, todayCheckin, recentCheckins, basePlan);
      
      // Add the plan to store
      await addPlan(planData);
      
      setTimeout(() => {
        setIsGenerating(false);
        router.replace('/plan?celebrate=1');
      }, 1000);

    } catch (error) {
      console.error('Error generating plan:', error);
      
      // Create an emergency fallback plan
      const todayCheckinData = getTodayCheckin();
      const basePlan = getCurrentBasePlan();
      
      if (!user || !todayCheckinData) {
        // If critical data is missing, redirect to home
        console.error('Critical data missing for plan generation');
        router.replace('/(tabs)/home');
        return;
      }
      
      const fallbackPlan = createEmergencyFallbackPlan(todayCheckinData);
      await addPlan(fallbackPlan);
      
      setTimeout(() => {
        setIsGenerating(false);
        router.replace('/plan?celebrate=1');
      }, 1000);
    }
  }, [user, getTodayCheckin, getRecentCheckins, addPlan, getCurrentBasePlan, getTodayPlan]);

  // Emergency fallback function
  const createEmergencyFallbackPlan = (checkin: any): DailyPlan => {
    const targetCalories = user?.dailyCalorieTarget || 2000;
    const targetProtein = user?.weight ? Math.round(user.weight * 2.2 * 0.9) : 150;
        const isLowEnergy = (checkin.energy || 5) < 5;
    const hasEquipment = user?.equipment?.some((eq: string) => eq !== 'Bodyweight') || false;
        
        return {
          id: Date.now().toString(),
          date: new Date().toISOString().split('T')[0],
          workout: {
        focus: isLowEnergy ? ['Recovery', 'Mobility'] : ['Full Body'],
            blocks: [
              {
                name: 'Warm-up',
                items: [
                  { exercise: 'Dynamic stretching', sets: 1, reps: '5-8 min', RIR: 0 }
                ]
              },
              {
                name: isLowEnergy ? 'Light Movement' : 'Main Workout',
                items: isLowEnergy ? [
                  { exercise: 'Gentle yoga flow', sets: 1, reps: '15-20 min', RIR: 0 },
                  { exercise: 'Walking', sets: 1, reps: '10-15 min', RIR: 0 }
                ] : hasEquipment ? [
                  { exercise: 'Compound movement', sets: 3, reps: '8-12', RIR: 2 },
                  { exercise: 'Accessory work', sets: 3, reps: '10-15', RIR: 2 }
                ] : [
                  { exercise: 'Bodyweight Squats', sets: 3, reps: '10-15', RIR: 2 },
                  { exercise: 'Push-ups', sets: 3, reps: '8-12', RIR: 2 },
                  { exercise: 'Plank', sets: 3, reps: '30-60s', RIR: 1 }
                ]
              }
            ],
        notes: `Adaptive plan based on ${checkin.energy}/10 energy level.`
          },
          nutrition: {
        total_kcal: targetCalories,
            protein_g: targetProtein,
            meals: [
              {
                name: 'Breakfast',
            items: [
              { food: 'High-protein breakfast', qty: '1 serving' },
              { food: 'Complex carbs', qty: '1 serving' }
                ]
              },
              {
                name: 'Lunch',
            items: [
              { food: 'Lean protein', qty: '150g' },
              { food: 'Whole grains', qty: '1 cup' },
              { food: 'Vegetables', qty: '2 cups' }
                ]
              },
              {
                name: 'Post-Workout',
            items: [
                  { food: 'Protein shake', qty: '1 scoop' },
                  { food: 'Banana', qty: '1 medium' }
                ]
              },
              {
                name: 'Dinner',
            items: [
              { food: 'Quality protein', qty: '150g' },
              { food: 'Complex carbs', qty: '1 cup' },
              { food: 'Salad', qty: '2 cups' }
                ]
              }
            ],
            hydration_l: 2.5
          },
          recovery: {
            mobility: isLowEnergy ? [
              'Gentle stretching (10 min)',
              'Deep breathing exercises (5 min)'
            ] : [
              'Post-workout stretching (10 min)',
              'Foam rolling if available (5-10 min)'
            ],
            sleep: [
              `Target: ${Math.max(7, 9 - (checkin.stress || 3))} hours tonight`,
              'Create a calming bedtime routine',
              checkin.stress && checkin.stress > 6 ? 'Consider meditation before bed' : 'Avoid screens 1 hour before bed'
            ]
          },
          motivation: isLowEnergy ? 
            "Rest is part of progress. Listen to your body and be gentle with yourself today. 🌱" :
        "Every rep counts toward your fitness journey. Stay consistent! 💪",
          adherence: 0,
      adjustments: [],
      isFromBasePlan: true,
    };
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const messageInterval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);

    generatePlan();

    return () => clearInterval(messageInterval);
  }, []);

  return (
    <LinearGradient
      colors={['#667eea', '#764ba2']}
      style={styles.container}
    >
      <Stack.Screen 
        options={{ 
          headerShown: false,
        }} 
      />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.loadingContainer}>
            <View style={styles.spinner}>
              <View style={styles.spinnerInner} />
            </View>
            
            <Text style={styles.title}>Creating Your Plan</Text>
            
            <Animated.View style={[styles.messageContainer, { opacity: fadeAnim }]}>
              <Text style={styles.message}>
                {LOADING_MESSAGES[messageIndex]}
              </Text>
            </Animated.View>

            <Text style={styles.hint}>This might take a moment — please don’t leave this screen.</Text>

            <View style={styles.dotsContainer}>
              <View style={[styles.dot, styles.dot1]} />
              <View style={[styles.dot, styles.dot2]} />
              <View style={[styles.dot, styles.dot3]} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  spinner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  spinnerInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  messageContainer: {
    minHeight: 24,
    justifyContent: 'center',
  },
  message: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center',
    marginBottom: 40,
  },
  hint: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.75,
    textAlign: 'center',
    marginTop: -28,
    marginBottom: 36,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  dot1: {
    opacity: 0.4,
  },
  dot2: {
    opacity: 0.7,
  },
  dot3: {
    opacity: 1,
  },
});