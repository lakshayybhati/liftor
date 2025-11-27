/**
 * Plan Verifier Service
 * 
 * Stage 2 of the two-stage AI pipeline.
 * Verifies the generated plan against user requirements and fixes any issues.
 */

import type { User, WeeklyBasePlan } from '@/types/user';
import { generateAICompletion, type Message } from '@/utils/ai-client';
import { buildVerificationPrompt, getCalorieTarget, getProteinTarget } from '@/utils/basePlanPromptBuilder';
import { WeeklyBasePlanSchema } from '@/utils/plan-schemas';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

export interface VerificationResult {
  verified: boolean;
  issues: string[];
  fixes: string[];
  plan: WeeklyBasePlan['days'];
}

export class PlanVerificationError extends Error {
  constructor(
    message: string,
    public readonly issues: string[],
    public readonly rawResponse?: string
  ) {
    super(message);
    this.name = 'PlanVerificationError';
  }
}

// ============================================================================
// JSON PARSING HELPERS
// ============================================================================

/**
 * Extract JSON from AI response (handles markdown code blocks)
 */
function extractJSON(text: string): string {
  // Remove markdown code blocks
  let cleaned = text
    .replace(/^```json\s*\n?/gim, '')
    .replace(/^```\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();
  
  // Try to find JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  return cleaned;
}

/**
 * Parse JSON with error handling
 */
function parseJSON(text: string): any {
  const jsonStr = extractJSON(text);
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Try to fix common JSON issues
    let fixed = jsonStr
      .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
      .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // Quote unquoted keys
      .replace(/'/g, '"') // Single to double quotes
      .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters
    
    try {
      return JSON.parse(fixed);
    } catch (e2) {
      throw new Error(`Failed to parse JSON: ${(e as Error).message}`);
    }
  }
}

// ============================================================================
// LOCAL VERIFICATION (PRE-AI CHECK)
// ============================================================================

/**
 * Perform local validation before AI verification
 * This catches obvious issues without needing an AI call
 */
function performLocalValidation(
  plan: any,
  user: User
): { issues: string[]; canProceed: boolean } {
  const issues: string[] = [];
  const calorieTarget = getCalorieTarget(user);
  const proteinTarget = getProteinTarget(user);
  
  // Check structure
  if (!plan || typeof plan !== 'object') {
    issues.push('Plan is not a valid object');
    return { issues, canProceed: false };
  }
  
  const days = plan.days || plan;
  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  // Check all days exist
  for (const day of dayNames) {
    if (!days[day]) {
      issues.push(`Missing day: ${day}`);
    }
  }
  
  if (issues.length > 0) {
    return { issues, canProceed: false };
  }
  
  // Check each day's structure
  for (const day of dayNames) {
    const dayPlan = days[day];
    
    // Check workout
    if (!dayPlan.workout) {
      issues.push(`${day}: Missing workout section`);
    } else {
      if (!dayPlan.workout.focus || !Array.isArray(dayPlan.workout.focus)) {
        issues.push(`${day}: Missing or invalid workout.focus`);
      }
      if (!dayPlan.workout.blocks || !Array.isArray(dayPlan.workout.blocks)) {
        issues.push(`${day}: Missing or invalid workout.blocks`);
      }
    }
    
    // Check nutrition
    if (!dayPlan.nutrition) {
      issues.push(`${day}: Missing nutrition section`);
    } else {
      if (dayPlan.nutrition.total_kcal !== calorieTarget) {
        issues.push(`${day}: Calories mismatch (${dayPlan.nutrition.total_kcal} vs ${calorieTarget})`);
      }
      if (dayPlan.nutrition.protein_g !== proteinTarget) {
        issues.push(`${day}: Protein mismatch (${dayPlan.nutrition.protein_g} vs ${proteinTarget})`);
      }
      if (!dayPlan.nutrition.meals || !Array.isArray(dayPlan.nutrition.meals)) {
        issues.push(`${day}: Missing or invalid nutrition.meals`);
      }
    }
    
    // Check recovery
    if (!dayPlan.recovery) {
      issues.push(`${day}: Missing recovery section`);
    } else {
      if (!dayPlan.recovery.mobility || !Array.isArray(dayPlan.recovery.mobility)) {
        issues.push(`${day}: Missing or invalid recovery.mobility`);
      }
      if (!dayPlan.recovery.sleep || !Array.isArray(dayPlan.recovery.sleep)) {
        issues.push(`${day}: Missing or invalid recovery.sleep`);
      }
    }
    
    // Check reason
    if (!dayPlan.reason || typeof dayPlan.reason !== 'string') {
      issues.push(`${day}: Missing reason`);
    }
  }
  
  // Check dietary compliance
  if (user.dietaryPrefs.includes('Vegetarian') || user.dietaryPrefs.includes('Eggitarian')) {
    const forbiddenFoods = ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'meat', 'steak', 'bacon', 'ham', 'turkey', 'shrimp', 'prawns'];
    if (user.dietaryPrefs.includes('Vegetarian')) {
      forbiddenFoods.push('egg', 'eggs');
    }
    
    for (const day of dayNames) {
      const dayPlan = days[day];
      if (dayPlan?.nutrition?.meals) {
        for (const meal of dayPlan.nutrition.meals) {
          for (const item of meal.items || []) {
            const foodLower = (item.food || '').toLowerCase();
            for (const forbidden of forbiddenFoods) {
              if (foodLower.includes(forbidden)) {
                issues.push(`${day}: Dietary violation - ${item.food} contains ${forbidden}`);
              }
            }
          }
        }
      }
    }
  }
  
  // Check avoided exercises
  if (user.avoidExercises?.length) {
    for (const day of dayNames) {
      const dayPlan = days[day];
      if (dayPlan?.workout?.blocks) {
        for (const block of dayPlan.workout.blocks) {
          for (const item of block.items || []) {
            const exerciseLower = (item.exercise || '').toLowerCase();
            for (const avoided of user.avoidExercises) {
              if (exerciseLower.includes(avoided.toLowerCase())) {
                issues.push(`${day}: Avoided exercise found - ${item.exercise}`);
              }
            }
          }
        }
      }
    }
  }
  
  return { issues, canProceed: issues.length < 10 }; // Allow AI to fix minor issues
}

// ============================================================================
// AI VERIFICATION
// ============================================================================

/**
 * Verify and fix the plan using AI
 */
export async function verifyAndFixPlan(
  plan: any,
  user: User
): Promise<WeeklyBasePlan['days']> {
  console.log('🔍 [Verifier] Starting plan verification...');
  
  // First, do local validation
  const localValidation = performLocalValidation(plan, user);
  
  if (localValidation.issues.length > 0) {
    console.log('⚠️ [Verifier] Local validation found issues:', localValidation.issues);
  }
  
  if (!localValidation.canProceed) {
    throw new PlanVerificationError(
      'Plan has critical structural issues that cannot be fixed',
      localValidation.issues
    );
  }
  
  // Build verification prompt
  const { system, user: userPrompt } = buildVerificationPrompt(plan, user);
  
  const messages: Message[] = [
    { role: 'system', content: system },
    { role: 'user', content: userPrompt }
  ];
  
  console.log('🤖 [Verifier] Calling AI for verification...');
  
  try {
    const response = await generateAICompletion(messages);
    
    if (!response.completion) {
      throw new Error('No completion in verification response');
    }
    
    console.log('✅ [Verifier] AI response received, length:', response.completion.length);
    
    // Parse the verification response
    const result = parseJSON(response.completion);
    
    // Extract the plan from the result
    let verifiedPlan: any;
    
    if (result.plan?.days) {
      verifiedPlan = result.plan.days;
    } else if (result.plan) {
      verifiedPlan = result.plan;
    } else if (result.days) {
      verifiedPlan = result.days;
    } else {
      // The result might be the plan itself
      verifiedPlan = result;
    }
    
    // Log verification results
    if (result.issues?.length > 0) {
      console.log('🔧 [Verifier] Issues found:', result.issues);
    }
    if (result.fixes?.length > 0) {
      console.log('✅ [Verifier] Fixes applied:', result.fixes);
    }
    
    // Validate the verified plan structure
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of dayNames) {
      if (!verifiedPlan[day]) {
        throw new PlanVerificationError(
          `Verification failed: missing day ${day}`,
          [`Missing day: ${day}`],
          response.completion
        );
      }
    }
    
    // Ensure nutrition targets are correct
    const calorieTarget = getCalorieTarget(user);
    const proteinTarget = getProteinTarget(user);
    
    for (const day of dayNames) {
      if (verifiedPlan[day]?.nutrition) {
        verifiedPlan[day].nutrition.total_kcal = calorieTarget;
        verifiedPlan[day].nutrition.protein_g = proteinTarget;
      }
      
      // Ensure supplementCard structure exists (AI decides contents)
      if (verifiedPlan[day]?.recovery && !verifiedPlan[day].recovery.supplementCard) {
        verifiedPlan[day].recovery.supplementCard = {
          current: [],
          addOns: []
        };
      }
    }
    
    console.log('✅ [Verifier] Plan verification completed successfully');
    return verifiedPlan;
    
  } catch (error) {
    console.error('❌ [Verifier] Verification failed:', error);
    
    if (error instanceof PlanVerificationError) {
      throw error;
    }
    
    throw new PlanVerificationError(
      `Verification failed: ${(error as Error).message}`,
      [(error as Error).message]
    );
  }
}

/**
 * Quick validation without AI (for cases where AI verification is skipped)
 */
export function quickValidate(plan: any, user: User): { valid: boolean; errors: string[] } {
  const { issues, canProceed } = performLocalValidation(plan, user);
  return { valid: canProceed && issues.length === 0, errors: issues };
}


