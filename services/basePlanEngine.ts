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
import { generateAICompletion, type Message } from '@/utils/ai-client';
import { buildGenerationPrompt, getCalorieTarget, getProteinTarget } from '@/utils/basePlanPromptBuilder';
import { verifyAndFixPlan, PlanVerificationError } from '@/services/planVerifier';
import { WeeklyBasePlanSchema } from '@/utils/plan-schemas';
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

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MAX_ATTEMPTS: 2,
  RETRY_DELAY_MS: 2000,
};

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
  const partialMatch = cleaned.match(/\{[\s\S]*/);
  if (partialMatch) {
    console.warn('⚠️ [Engine] Detected possibly truncated JSON, attempting recovery...');
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
  
  console.log(`⚠️ [Engine] JSON Recovery: need to close ${openBrackets} brackets and ${openBraces} braces`);
  
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
 * Parse JSON with error handling, common fixes, and recovery for truncated responses
 */
function parseJSON(text: string): any {
  const jsonStr = extractJSON(text);
  
  // First attempt: direct parse
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.log('⚠️ [Engine] First parse attempt failed, trying fixes...');
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
    console.log('⚠️ [Engine] Second parse attempt failed, trying JSON recovery...');
  }
  
  // Third attempt: try to recover truncated JSON
  try {
    const recovered = attemptJSONRecovery(fixed);
    return JSON.parse(recovered);
  } catch (e3) {
    console.error('❌ [Engine] All parse attempts failed');
    console.error('   Original length:', text.length);
    console.error('   First 300 chars:', jsonStr.substring(0, 300));
    console.error('   Last 300 chars:', jsonStr.substring(Math.max(0, jsonStr.length - 300)));
    throw new BasePlanGenerationError(
      'Failed to parse AI response as JSON',
      'generation',
      [(e3 as Error).message]
    );
  }
}

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// STAGE 1: GENERATION
// ============================================================================

/**
 * Stage 1: Generate the raw plan
 * Fast, optimized AI call to create the complete plan
 */
async function generateRawPlan(user: User): Promise<any> {
  console.log('🚀 [Engine] Stage 1: Generating raw plan...');
  
  const { system, user: userPrompt } = buildGenerationPrompt(user);
  
  const messages: Message[] = [
    { role: 'system', content: system },
    { role: 'user', content: userPrompt }
  ];
  
  console.log('📝 [Engine] Prompt built:', system.length + userPrompt.length, 'chars');
  
  const startTime = Date.now();
  const response = await generateAICompletion(messages);
  const genTime = Date.now() - startTime;
  
  console.log(`⏱️ [Engine] AI response in ${genTime}ms`);
  
  if (!response.completion) {
    throw new BasePlanGenerationError(
      'No completion in AI response',
      'generation'
    );
  }
  
  console.log('✅ [Engine] AI response received, length:', response.completion.length);
  
  // Parse the response
  const parsed = parseJSON(response.completion);
  
  // Extract days from response
  const days = parsed.days || parsed;
  
  // Validate basic structure
  const requiredDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const missingDays = requiredDays.filter(day => !days[day]);
  
  if (missingDays.length > 0) {
    throw new BasePlanGenerationError(
      `Generated plan is missing days: ${missingDays.join(', ')}`,
      'generation',
      missingDays.map(d => `Missing: ${d}`)
    );
  }
  
  console.log('✅ [Engine] Stage 1 complete: all 7 days present');
  return { days };
}

// ============================================================================
// STAGE 2: VERIFICATION
// ============================================================================

/**
 * Stage 2: Verify and fix the plan
 * Thorough review against user requirements
 */
async function verifyPlan(rawPlan: any, user: User): Promise<WeeklyBasePlan['days']> {
  console.log('🔍 [Engine] Stage 2: Verifying and fixing plan...');
  
  try {
    const verifiedDays = await verifyAndFixPlan(rawPlan, user);
    console.log('✅ [Engine] Stage 2 complete: plan verified');
    return verifiedDays;
  } catch (error) {
    if (error instanceof PlanVerificationError) {
      throw new BasePlanGenerationError(
        error.message,
        'verification',
        error.issues
      );
    }
    throw error;
  }
}

// ============================================================================
// GLOBAL GENERATION STATE
// ============================================================================

/**
 * Global state to track ongoing generation and prevent duplicate API calls.
 * This persists across component mounts/unmounts.
 */
let globalGenerationState = {
  isGenerating: false,
  generationId: null as string | null,
  startTime: null as number | null,
  promise: null as Promise<WeeklyBasePlan> | null,
};

/**
 * Check if a generation is currently in progress
 */
export function isGenerationInProgress(): boolean {
  return globalGenerationState.isGenerating;
}

/**
 * Get the current generation ID (for tracking)
 */
export function getCurrentGenerationId(): string | null {
  return globalGenerationState.generationId;
}

/**
 * Reset the global generation state (for cleanup/testing)
 */
export function resetGenerationState(): void {
  console.log('🔄 [Engine] Resetting global generation state');
  globalGenerationState = {
    isGenerating: false,
    generationId: null,
    startTime: null,
    promise: null,
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Generate a weekly base plan for a user
 * 
 * Two-stage pipeline:
 * 1. Generate: Fast AI call to create the plan
 * 2. Verify: Thorough review and fix any issues
 * 
 * NO FALLBACK - If both attempts fail, throws BasePlanGenerationError
 * 
 * IMPORTANT: This function uses a global lock to prevent duplicate API calls.
 * If a generation is already in progress, it will return the existing promise.
 */
export async function generateBasePlan(user: User): Promise<WeeklyBasePlan> {
  // Check if generation is already in progress
  if (globalGenerationState.isGenerating && globalGenerationState.promise) {
    const elapsedSeconds = globalGenerationState.startTime 
      ? Math.floor((Date.now() - globalGenerationState.startTime) / 1000)
      : 0;
    console.log('═══════════════════════════════════════════════════════════');
    console.log('⚠️ [Engine] Generation already in progress!');
    console.log(`   Generation ID: ${globalGenerationState.generationId}`);
    console.log(`   Elapsed time: ${elapsedSeconds}s`);
    console.log('   Returning existing promise to avoid duplicate API calls');
    console.log('═══════════════════════════════════════════════════════════');
    return globalGenerationState.promise;
  }
  
  // Set up the global lock
  const generationId = `gen_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  globalGenerationState.isGenerating = true;
  globalGenerationState.generationId = generationId;
  globalGenerationState.startTime = Date.now();
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔒 [Engine] Global generation lock acquired');
  console.log(`   Generation ID: ${generationId}`);
  console.log('═══════════════════════════════════════════════════════════');
  
  // Create and store the generation promise
  globalGenerationState.promise = (async (): Promise<WeeklyBasePlan> => {
    try {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🏗️ [Engine] Starting Base Plan Generation');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('👤 User:', user.name || 'Unknown');
      console.log('🎯 Goal:', user.goal);
      console.log('🏋️ Equipment:', user.equipment.join(', ') || 'Bodyweight');
      console.log('🥗 Diet:', user.dietaryPrefs.join(', ') || 'No restrictions');
      console.log('📅 Training Days:', user.trainingDays);
      console.log('📊 Level:', user.trainingLevel || 'Intermediate');
      console.log('═══════════════════════════════════════════════════════════');
      
      // Validate user data
      if (!user) {
        throw new BasePlanGenerationError(
          'Invalid user data: user is null or undefined',
          'validation'
        );
      }
      
      if (!user.goal) {
        throw new BasePlanGenerationError(
          'Invalid user data: missing goal',
          'validation'
        );
      }
      
      const calorieTarget = getCalorieTarget(user);
      const proteinTarget = getProteinTarget(user);
      
      console.log('🍽️ Calorie Target:', calorieTarget, 'kcal');
      console.log('🥩 Protein Target:', proteinTarget, 'g');
      
      let lastError: BasePlanGenerationError | null = null;
      
      for (let attempt = 1; attempt <= CONFIG.MAX_ATTEMPTS; attempt++) {
        console.log(`\n🔄 [Engine] Attempt ${attempt}/${CONFIG.MAX_ATTEMPTS}`);
        
        try {
          // Stage 1: Generate
          const rawPlan = await generateRawPlan(user);
          
          // Stage 2: Verify and Fix
          const verifiedDays = await verifyPlan(rawPlan, user);
          
          // Ensure nutrition targets are correct (final enforcement)
          for (const day of Object.keys(verifiedDays)) {
            if (verifiedDays[day]?.nutrition) {
              verifiedDays[day].nutrition.total_kcal = calorieTarget;
              verifiedDays[day].nutrition.protein_g = proteinTarget;
            }
            
            // Ensure supplementCard structure exists (AI decides contents)
            if (verifiedDays[day]?.recovery && !verifiedDays[day].recovery.supplementCard) {
              verifiedDays[day].recovery.supplementCard = {
                current: [],
                addOns: []
              };
            }
          }
          
          // Build final plan object
          const basePlan: WeeklyBasePlan = {
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            days: verifiedDays,
            isLocked: false,
            isGenerating: false,
            generationProgress: 7,
          };
          
          console.log('\n═══════════════════════════════════════════════════════════');
          console.log('✅ [Engine] Base Plan Generation SUCCESSFUL');
          console.log('📋 Plan ID:', basePlan.id);
          console.log('📅 Days:', Object.keys(basePlan.days).length);
          console.log('═══════════════════════════════════════════════════════════\n');
          
          return basePlan;
          
        } catch (error) {
          console.error(`❌ [Engine] Attempt ${attempt} failed:`, error);
          
          if (error instanceof BasePlanGenerationError) {
            lastError = error;
            lastError.attempt = attempt;
          } else {
            lastError = new BasePlanGenerationError(
              (error as Error).message || 'Unknown error during plan generation',
              'generation',
              [(error as Error).stack?.substring(0, 200) || 'No stack trace'],
              attempt
            );
          }
          
          // Wait before retry (unless this is the last attempt)
          if (attempt < CONFIG.MAX_ATTEMPTS) {
            console.log(`⏳ [Engine] Waiting ${CONFIG.RETRY_DELAY_MS}ms before retry...`);
            await delay(CONFIG.RETRY_DELAY_MS);
          }
        }
      }
      
      // All attempts failed - NO FALLBACK
      console.error('\n═══════════════════════════════════════════════════════════');
      console.error('❌ [Engine] Base Plan Generation FAILED after all attempts');
      console.error('═══════════════════════════════════════════════════════════\n');
      
      throw lastError || new BasePlanGenerationError(
        'Failed to generate plan after all attempts',
        'generation',
        ['All retry attempts exhausted'],
        CONFIG.MAX_ATTEMPTS
      );
    } finally {
      // Always release the lock when done (success or failure)
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🔓 [Engine] Global generation lock released');
      console.log(`   Generation ID: ${generationId}`);
      console.log(`   Duration: ${Math.floor((Date.now() - (globalGenerationState.startTime || Date.now())) / 1000)}s`);
      console.log('═══════════════════════════════════════════════════════════');
      
      globalGenerationState.isGenerating = false;
      globalGenerationState.generationId = null;
      globalGenerationState.startTime = null;
      globalGenerationState.promise = null;
    }
  })();
  
  return globalGenerationState.promise;
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

