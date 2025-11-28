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
 * Extract JSON from AI response (handles markdown code blocks and truncated responses)
 */
function extractJSON(text: string): string {
  // Remove markdown code blocks
  let cleaned = text
    .replace(/^```json\s*\n?/gim, '')
    .replace(/^```\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();
  
  // Try to find JSON object - use greedy match for nested objects
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  // If no complete JSON found, check if response was truncated
  // Try to find partial JSON and attempt to complete it
  const partialMatch = cleaned.match(/\{[\s\S]*/);
  if (partialMatch) {
    console.warn('⚠️ [Parser] Detected possibly truncated JSON, attempting recovery...');
    return partialMatch[0];
  }
  
  return cleaned;
}

/**
 * Attempt to fix truncated JSON by closing open brackets
 * Enhanced to handle deeply nested truncation
 */
function attemptJSONRecovery(jsonStr: string): string {
  let fixed = jsonStr;
  
  // First, clean up any trailing incomplete values
  // Remove incomplete strings at the end (e.g., "key": "incomplete value without closing quote)
  fixed = fixed.replace(/:\s*"[^"]*$/g, ': null');
  
  // Remove incomplete numbers at the end
  fixed = fixed.replace(/:\s*[\d.]+$/g, ': 0');
  
  // Remove trailing incomplete key-value pairs
  fixed = fixed.replace(/,\s*"[^"]*"?\s*$/g, '');
  fixed = fixed.replace(/,\s*[a-zA-Z_][a-zA-Z0-9_]*\s*$/g, '');
  
  // Count open/close brackets
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < fixed.length; i++) {
    const char = fixed[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }
  }
  
  // Close unclosed strings if in string
  if (inString) {
    fixed += '"';
    // Re-count after closing string
    openBraces = 0;
    openBrackets = 0;
    inString = false;
    escapeNext = false;
    
    for (let i = 0; i < fixed.length; i++) {
      const char = fixed[i];
      if (escapeNext) { escapeNext = false; continue; }
      if (char === '\\') { escapeNext = true; continue; }
      if (char === '"' && !escapeNext) { inString = !inString; continue; }
      if (!inString) {
        if (char === '{') openBraces++;
        else if (char === '}') openBraces--;
        else if (char === '[') openBrackets++;
        else if (char === ']') openBrackets--;
      }
    }
  }
  
  // Remove trailing commas before closing brackets
  fixed = fixed.replace(/,(\s*)$/g, '$1');
  
  // Also remove trailing commas followed by whitespace only
  fixed = fixed.trimEnd();
  if (fixed.endsWith(',')) {
    fixed = fixed.slice(0, -1);
  }
  
  console.log(`⚠️ [Parser] JSON Recovery: need to close ${openBrackets} brackets and ${openBraces} braces`);
  
  // Close open brackets in the right order (arrays before objects typically)
  while (openBrackets > 0) {
    fixed += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    fixed += '}';
    openBraces--;
  }
  
  return fixed;
}

/**
 * Parse JSON with error handling and recovery for truncated responses
 */
function parseJSON(text: string): any {
  const jsonStr = extractJSON(text);
  
  // First attempt: direct parse
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.log('⚠️ [Parser] First parse attempt failed, trying fixes...');
  }
  
  // Second attempt: fix common issues
  let fixed = jsonStr
    .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // Quote unquoted keys
    .replace(/'/g, '"') // Single to double quotes
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\.\.\./g, '') // Remove ellipsis that AI sometimes adds
    .replace(/,\s*,/g, ',') // Remove double commas
    .replace(/:\s*,/g, ': null,') // Fix empty values
    .replace(/:\s*}/g, ': null}'); // Fix empty values at end
  
  try {
    return JSON.parse(fixed);
  } catch (e2) {
    console.log('⚠️ [Parser] Second parse attempt failed, trying JSON recovery...');
  }
  
  // Third attempt: try to recover truncated JSON
  try {
    const recovered = attemptJSONRecovery(fixed);
    return JSON.parse(recovered);
  } catch (e3) {
    console.error('❌ [Parser] All parse attempts failed');
    console.error('   Original length:', text.length);
    console.error('   First 200 chars:', jsonStr.substring(0, 200));
    console.error('   Last 200 chars:', jsonStr.substring(Math.max(0, jsonStr.length - 200)));
    throw new Error(`Failed to parse JSON: ${(e3 as Error).message}`);
  }
}

// ============================================================================
// LOCAL VERIFICATION (PRE-AI CHECK)
// ============================================================================

/**
 * Perform local validation before AI verification
 * Catches obvious issues before spending tokens on AI verification
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
  
  // If missing any days, can't proceed
  const existingDays = dayNames.filter(day => days[day]);
  if (existingDays.length < 7) {
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
  
  // Can proceed if issues are minor (AI can fix them)
  // Only block if structure is fundamentally broken
  const canProceed = issues.length < 20;
  
  return { issues, canProceed };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const VERIFIER_CONFIG = {
  MAX_ATTEMPTS: 2,
  RETRY_DELAY_MS: 1500,
  MIN_RESPONSE_LENGTH: 5000, // Responses shorter than this are likely truncated
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Delay helper for retry logic
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Pre-fix nutrition targets before sending to AI verifier
 * This ensures the AI doesn't need to fix obvious calorie/protein mismatches
 */
function preFixNutritionTargets(plan: any, user: User): any {
  const calorieTarget = getCalorieTarget(user);
  const proteinTarget = getProteinTarget(user);
  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  // Deep clone to avoid mutating original
  const fixedPlan = JSON.parse(JSON.stringify(plan));
  const days = fixedPlan.days || fixedPlan;
  
  for (const day of dayNames) {
    if (days[day]?.nutrition) {
      days[day].nutrition.total_kcal = calorieTarget;
      days[day].nutrition.protein_g = proteinTarget;
    }
  }
  
  console.log(`📊 [Verifier] Pre-fixed nutrition targets: ${calorieTarget} kcal, ${proteinTarget}g protein`);
  return fixedPlan;
}

// ============================================================================
// AI VERIFICATION
// ============================================================================

/**
 * Verify and fix the plan using AI
 * Includes retry logic for transient failures
 */
export async function verifyAndFixPlan(
  plan: any,
  user: User
): Promise<WeeklyBasePlan['days']> {
  console.log('🔍 [Verifier] Starting plan verification...');
  
  // First, do local validation
  const localValidation = performLocalValidation(plan, user);
  
  if (localValidation.issues.length > 0) {
    console.log('⚠️ [Verifier] Local validation found issues:');
    localValidation.issues.slice(0, 10).forEach(issue => console.log(`   - ${issue}`));
    if (localValidation.issues.length > 10) {
      console.log(`   ... and ${localValidation.issues.length - 10} more`);
    }
  }
  
  if (!localValidation.canProceed) {
    throw new PlanVerificationError(
      'Plan has critical structural issues that cannot be fixed',
      localValidation.issues
    );
  }
  
  // Pre-fix nutrition targets before sending to AI
  const prefixedPlan = preFixNutritionTargets(plan, user);
  
  // Build verification prompt with pre-fixed plan
  const { system, user: userPrompt } = buildVerificationPrompt(prefixedPlan, user);
  
  const messages: Message[] = [
    { role: 'system', content: system },
    { role: 'user', content: userPrompt }
  ];
  
  console.log('🤖 [Verifier] Calling AI for verification...');
  console.log(`   Prompt size: ${system.length + userPrompt.length} chars`);
  
  // Retry loop for transient failures
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= VERIFIER_CONFIG.MAX_ATTEMPTS; attempt++) {
    const startTime = Date.now();
    
    try {
      if (attempt > 1) {
        console.log(`🔄 [Verifier] Retry attempt ${attempt}/${VERIFIER_CONFIG.MAX_ATTEMPTS}...`);
        await delay(VERIFIER_CONFIG.RETRY_DELAY_MS);
      }
      
      const response = await generateAICompletion(messages);
      
      const verifyTime = Date.now() - startTime;
      console.log(`⏱️ [Verifier] AI response in ${verifyTime}ms (attempt ${attempt})`);
      
      if (!response.completion) {
        throw new Error('No completion in verification response');
      }
      
      // Check for truncated response
      if (response.completion.length < VERIFIER_CONFIG.MIN_RESPONSE_LENGTH) {
        console.warn(`⚠️ [Verifier] Response may be truncated (${response.completion.length} chars < ${VERIFIER_CONFIG.MIN_RESPONSE_LENGTH})`);
        if (attempt < VERIFIER_CONFIG.MAX_ATTEMPTS) {
          lastError = new Error('Response appears truncated');
          continue; // Retry
        }
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
        console.log('🔧 [Verifier] Issues found:', result.issues.slice(0, 5));
      }
      if (result.fixes?.length > 0) {
        console.log('✅ [Verifier] Fixes applied:', result.fixes.slice(0, 5));
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
        
        // Verify all sections are present
        if (!verifiedPlan[day].workout) {
          throw new PlanVerificationError(
            `Verification failed: ${day} missing workout`,
            [`${day}: Missing workout`],
            response.completion
          );
        }
        if (!verifiedPlan[day].nutrition) {
          throw new PlanVerificationError(
            `Verification failed: ${day} missing nutrition`,
            [`${day}: Missing nutrition`],
            response.completion
          );
        }
        if (!verifiedPlan[day].recovery) {
          throw new PlanVerificationError(
            `Verification failed: ${day} missing recovery`,
            [`${day}: Missing recovery`],
            response.completion
          );
        }
        
        // Ensure reason exists
        if (!verifiedPlan[day].reason || verifiedPlan[day].reason.length < 10) {
          verifiedPlan[day].reason = `Today's plan is designed for your ${user.goal.replace('_', ' ').toLowerCase()} goal with ${user.equipment.join(', ') || 'bodyweight'} exercises.`;
        }
      }
      
      // Final enforcement of nutrition targets (belt and suspenders)
      const calorieTarget = getCalorieTarget(user);
      const proteinTarget = getProteinTarget(user);
      
      for (const day of dayNames) {
        if (verifiedPlan[day]?.nutrition) {
          verifiedPlan[day].nutrition.total_kcal = calorieTarget;
          verifiedPlan[day].nutrition.protein_g = proteinTarget;
        }
        
        // Ensure supplementCard structure exists
        if (verifiedPlan[day]?.recovery && !verifiedPlan[day].recovery.supplementCard) {
          verifiedPlan[day].recovery.supplementCard = {
            current: user.supplements || [],
            addOns: []
          };
        }
      }
      
      console.log('✅ [Verifier] Plan verification completed successfully');
      return verifiedPlan;
      
    } catch (error) {
      console.error(`❌ [Verifier] Attempt ${attempt} failed:`, error);
      lastError = error as Error;
      
      // Don't retry for structural PlanVerificationErrors (they won't fix with retry)
      // But DO retry for parse errors or truncation
      if (error instanceof PlanVerificationError) {
        const isParseError = error.message.includes('parse') || error.message.includes('JSON');
        if (!isParseError && attempt < VERIFIER_CONFIG.MAX_ATTEMPTS) {
          // Structural error - might be worth retrying once
          continue;
        }
        if (!isParseError) {
          throw error; // Don't retry structural errors on last attempt
        }
      }
      
      // If this was the last attempt, throw
      if (attempt >= VERIFIER_CONFIG.MAX_ATTEMPTS) {
        if (lastError instanceof PlanVerificationError) {
          throw lastError;
        }
        throw new PlanVerificationError(
          `Verification failed after ${VERIFIER_CONFIG.MAX_ATTEMPTS} attempts: ${lastError.message}`,
          [lastError.message]
        );
      }
      
      // Otherwise continue to next attempt
      console.log(`⚠️ [Verifier] Will retry (${attempt}/${VERIFIER_CONFIG.MAX_ATTEMPTS})...`);
    }
  }
  
  // Should never reach here, but TypeScript needs it
  throw new PlanVerificationError(
    'Verification failed: unexpected end of retry loop',
    ['All retry attempts exhausted']
  );
}

/**
 * Quick validation without AI (for cases where AI verification is skipped)
 */
export function quickValidate(plan: any, user: User): { valid: boolean; errors: string[] } {
  const { issues, canProceed } = performLocalValidation(plan, user);
  return { valid: canProceed && issues.length === 0, errors: issues };
}


