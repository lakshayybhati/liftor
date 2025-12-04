/**
 * Base Plan Engine
 * 
 * Main orchestrator for the two-stage AI pipeline:
 * - Stage 1: Generate plan (fast, optimized prompt)
 * - Stage 2: Verify and fix plan (thorough review)
 * 
 * NO FALLBACK PLANS - If generation fails, throw an error.
 * 
 * DAILY PLAN GENERATION:
 * - Uses a two-step process: Deterministic Baseline -> AI Titration
 * - Incorporates Memory Layer (Trends, Streaks)
 * - REQUIRED AI: If AI fails, throws "DAILY_PLAN_AI_FAILED_TRY_AGAIN"
 */

import type { User, WeeklyBasePlan, CheckinData, DailyPlan } from '@/types/user';
import { getCalorieTarget, getProteinTarget } from '@/utils/basePlanPromptBuilder';
import { buildMemoryLayer, buildLastDayContext } from '@/utils/memory-layer';
import { runDailyPlanAiTitration } from '@/services/dailyPlanAiTitration';

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Custom error for base plan generation failures
 * NO FALLBACK - This error should be shown to the user
 */
export class BasePlanGenerationError extends Error {
  constructor(
    message: string,
    public readonly stage: 'generation' | 'verification' | 'validation',
    public readonly details?: string[],
    public readonly attempt?: number
  ) {
    super(message);
    this.name = 'BasePlanGenerationError';
  }
}

/**
 * @deprecated Client-side plan generation is deprecated. Use server-side generation.
 */
export async function generateBasePlan(user: User): Promise<WeeklyBasePlan> {
  throw new Error('Client-side plan generation is deprecated. Use server-side generation.');
}

/**
 * @deprecated Client-side plan generation is deprecated.
 */
export function isGenerationInProgress(): boolean {
  return false;
}

/**
 * @deprecated Client-side plan generation is deprecated.
 */
export function getCurrentGenerationId(): string | null {
  return null;
}

/**
 * @deprecated Client-side plan generation is deprecated.
 */
export function resetGenerationState(): void {
  // No-op
}

// ============================================================================
// DAILY PLAN GENERATION (Simple check-in based adjustments)
// ============================================================================

/**
 * Generate a daily plan based on check-in data and the base plan
 * This is a simpler operation that adjusts the base plan for today
 */
export async function generateDailyPlan(
  user: User,
  todayCheckin: CheckinData,
  recentCheckins: CheckinData[],
  basePlan: WeeklyBasePlan,
  yesterdayCompletedSupplements: string[] = []
): Promise<DailyPlan> {
  console.log('📅 [Engine] Generating daily plan (AI + Memory)...');
  
  // 1. Get today's day name and base plan
  const today = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayKey = dayNames[today.getDay()];
  const todayBasePlan = basePlan.days[todayKey];
  
  if (!todayBasePlan) {
    throw new BasePlanGenerationError(
      `No base plan found for ${todayKey}`,
      'validation'
    );
  }
  
  // 2. Build Deterministic Baseline Plan
  const targetCalories = getCalorieTarget(user);
  const targetProtein = getProteinTarget(user);
  
  const energy = todayCheckin.energy || 5;
  const stress = todayCheckin.stress || 5;
  const motivation = todayCheckin.motivation || 5;
  const soreness = todayCheckin.soreness || [];
  
  let workout = JSON.parse(JSON.stringify(todayBasePlan.workout));
  let adjustments: string[] = [];
  
  // Energy-based adjustments (Deterministic)
  if (energy < 4) {
    if (workout.blocks?.[1]?.items) {
      workout.blocks[1].items = workout.blocks[1].items.slice(0, 2);
      workout.blocks[1].items.forEach((item: any) => {
        if (item.RIR !== undefined) item.RIR = Math.max(item.RIR, 3);
      });
      adjustments.push('Reduced volume and intensity for low energy');
    }
  } else if (energy < 6) {
    if (workout.blocks?.[1]?.items) {
      workout.blocks[1].items.forEach((item: any) => {
        if (item.RIR !== undefined) item.RIR = Math.max(item.RIR, 2);
      });
      adjustments.push('Reduced intensity for moderate energy');
    }
  }
  
  // Stress-based adjustments (Deterministic)
  if (stress > 7) {
    workout.focus = ['Recovery', 'Stress Relief'];
    workout.blocks = [
      {
        name: 'Stress Relief',
        items: [
          { exercise: 'Deep breathing', sets: 1, reps: '5 min', RIR: 0 },
          { exercise: 'Gentle yoga', sets: 1, reps: '15 min', RIR: 0 },
          { exercise: 'Walking', sets: 1, reps: '20 min', RIR: 0 }
        ]
      }
    ];
    adjustments.push('Switched to stress-relief protocol');
  }
  
  // Soreness adjustments (Deterministic)
  if (soreness.length > 0) {
    adjustments.push(`Modified for ${soreness.join(', ')} soreness`);
    workout.notes = `⚠️ Soreness in ${soreness.join(', ')} - modify or skip affected exercises`;
  }
  
  const motivationMessages = {
    high: "🚀 High motivation detected! Channel this energy into quality reps and perfect form!",
    medium: `💪 Steady progress towards your ${user.goal.replace('_', ' ').toLowerCase()} goals. Stay consistent!`,
    low: "🌱 Every small step counts. Focus on showing up - that's the hardest part. You've got this!"
  };
  const motivationLevel = motivation >= 8 ? 'high' : motivation >= 5 ? 'medium' : 'low';
  
  const deterministicPlan: DailyPlan = {
    id: Date.now().toString(),
    date: new Date().toISOString().split('T')[0],
    workout,
    nutrition: {
      ...todayBasePlan.nutrition,
      total_kcal: targetCalories,
      protein_g: targetProtein
    },
    recovery: {
      ...todayBasePlan.recovery,
      mobility: energy < 5 
        ? ['Gentle stretching', 'Breathing exercises', 'Light movement']
        : todayBasePlan.recovery.mobility,
      sleep: stress > 6
        ? ['Prioritize 8+ hours tonight', 'Consider meditation', 'Avoid screens 2hrs before bed']
        : todayBasePlan.recovery.sleep
    },
    motivation: motivationMessages[motivationLevel],
    adherence: 0,
    adjustments,
    isFromBasePlan: true,
  };

  // 3. Build Memory Layer
  const memoryLayer = buildMemoryLayer(user, recentCheckins);

  // 4. Build Yesterday Snapshot Context
  // Note: We need to get recent plans to check workout/nutrition adherence
  // For now, we pass empty array - this can be enhanced later to include actual plan data
  const lastDayContext = buildLastDayContext(recentCheckins, [], new Date().toISOString().split('T')[0], yesterdayCompletedSupplements);
  
  console.log('📋 [Engine] Yesterday context:', {
    daysSinceLastCheckin: lastDayContext.daysSinceLastCheckin,
    healthNote: lastDayContext.healthNote || 'none',
    yesterdayWorkoutStatus: lastDayContext.yesterdayWorkoutStatus || 'unknown',
    yesterdaySupplementsStatus: lastDayContext.yesterdaySupplementsStatus,
  });

  // 5. AI Titration
  try {
    const aiResult = await runDailyPlanAiTitration({
      todayKey,
      todayBasePlan,
      deterministicPlan,
      todayCheckin,
      memoryLayer,
      lastDayContext,
      user,
    });

    // 6. Construct Final Plan (AI Required)
    const finalPlan: DailyPlan = {
      ...deterministicPlan,
      workout: aiResult.workout,
      nutrition: aiResult.nutrition,
      recovery: aiResult.recovery,
      // Use AI-generated personalized motivation if available, otherwise keep deterministic
      motivation: aiResult.motivation || deterministicPlan.motivation,
      adjustments: [
        ...(deterministicPlan.adjustments || []),
        ...(aiResult.adjustments || []),
      ],
      nutritionAdjustments: aiResult.nutritionAdjustments || [],
      flags: aiResult.flags || [],
      dailyHighlights: aiResult.dailyHighlights, // Store daily summary for memory
      isFromBasePlan: false,
      isAiAdjusted: true,
      memorySnapshot: memoryLayer || undefined, // Persist memory snapshot
    };

    console.log('✅ [Engine] Daily plan generated successfully via AI');
    console.log('📋 [Engine] Daily highlights stored:', aiResult.dailyHighlights?.substring(0, 80) + '...');
    return finalPlan;

  } catch (error) {
    console.error('❌ [Engine] AI Titration failed:', error);
    // NO FALLBACK allowed
    throw new Error("DAILY_PLAN_AI_FAILED_TRY_AGAIN");
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { getCalorieTarget, getProteinTarget };
