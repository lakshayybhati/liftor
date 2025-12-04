/**
 * Plan Generation Facade
 * 
 * Single entry point for all plan generation.
 * Uses the new Base Plan Engine with two-stage AI pipeline.
 * 
 * NO FALLBACK PLANS - Errors are propagated to the caller.
 */

import type { User, WeeklyBasePlan, CheckinData, DailyPlan } from '@/types/user';
import { 
  generateBasePlan,
  generateDailyPlan as generateDaily,
  BasePlanGenerationError,
  isGenerationInProgress,
  getCurrentGenerationId,
  resetGenerationState
} from '@/services/basePlanEngine';

// Re-export the error class and utility functions for consumers
export { 
  BasePlanGenerationError,
  isGenerationInProgress,
  getCurrentGenerationId,
  resetGenerationState
};

/**
 * @deprecated Client-side weekly plan generation is deprecated. Use server-side generation.
 */
export async function generateWeeklyBasePlan(user: User): Promise<WeeklyBasePlan> {
  return await generateBasePlan(user);
}

/**
 * Generate a daily plan based on check-in data and base plan
 * 
 * Adjusts the base plan for today based on user's check-in data
 * (energy, stress, soreness, motivation, etc.)
 */
export async function generateDailyPlan(
  user: User,
  todayCheckin: CheckinData,
  recentCheckins: CheckinData[],
  basePlan: WeeklyBasePlan,
  yesterdayCompletedSupplements: string[] = []
): Promise<DailyPlan> {
  return await generateDaily(user, todayCheckin, recentCheckins, basePlan, yesterdayCompletedSupplements);
}
