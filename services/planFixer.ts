/**
 * Plan Fixer Service
 * 
 * Fast, AI-only plan verification and fixing.
 * Single AI call that checks all user requirements and fixes any issues.
 * 
 * NO retries, NO delays, NO suggestions - just fix and return.
 */

import type { User, WeeklyBasePlan } from '@/types/user';
import { generateAICompletion, type Message } from '@/utils/ai-client';
import { getCalorieTarget, getProteinTarget } from '@/utils/basePlanPromptBuilder';

// ============================================================================
// TYPES
// ============================================================================

export class PlanFixError extends Error {
  constructor(
    message: string,
    public readonly details?: string[]
  ) {
    super(message);
    this.name = 'PlanFixError';
  }
}

// ============================================================================
// JSON PARSING (Minimal, fast)
// ============================================================================

function extractJSON(text: string): string {
  // Remove markdown code blocks
  let cleaned = text
    .replace(/^```json\s*\n?/gim, '')
    .replace(/^```\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();
  
  // Find JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  
  // Try partial recovery
  const partialMatch = cleaned.match(/\{[\s\S]*/);
  if (partialMatch) return partialMatch[0];
  
  return cleaned;
}

function parseJSON(text: string): any {
  const jsonStr = extractJSON(text);
  
  // First attempt: direct parse
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Quick fixes for common AI issues
    const fixed = jsonStr
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/,\s*,/g, ',')
      .replace(/:\s*,/g, ': null,')
      .replace(/:\s*}/g, ': null}');
    
    return JSON.parse(fixed);
  }
}

// ============================================================================
// PROMPT BUILDER
// ============================================================================

function buildFixPrompt(plan: any, user: User): { system: string; user: string } {
  const calorieTarget = getCalorieTarget(user);
  const proteinTarget = getProteinTarget(user);
  
  // Build complete user profile
  const userProfile = `
## COMPLETE USER DATA (verify plan against ALL of this)

### Identity & Body
- Name: ${user.name || 'User'}
- Age: ${user.age || 'Not specified'}
- Sex: ${user.sex || 'Not specified'}
- Height: ${user.height ? `${user.height} cm` : 'Not specified'}
- Weight: ${user.weight ? `${user.weight} kg` : 'Not specified'}
- Goal Weight: ${user.goalWeight ? `${user.goalWeight} kg` : 'Not specified'}
- Activity Level: ${user.activityLevel || 'Moderately Active'}

### Fitness Goal
- Primary Goal: ${user.goal.replace('_', ' ')}
- Training Days: ${user.trainingDays} days/week
- Training Level: ${user.trainingLevel || 'Intermediate'}
- Session Length: ${user.sessionLength || 45} minutes
${user.personalGoals?.length ? `- Personal Goals: ${user.personalGoals.join(', ')}` : ''}
${user.perceivedLacks?.length ? `- Areas to Improve: ${user.perceivedLacks.join(', ')}` : ''}

### Equipment Available
${user.equipment.join(', ') || 'Bodyweight only'}

### DIETARY REQUIREMENTS (STRICT)
- Diet Type: ${user.dietaryPrefs.join(', ') || 'No restrictions'}
${user.dietaryPrefs.includes('Vegetarian') ? `
⛔ VEGETARIAN RULES:
- ABSOLUTELY NO: meat, chicken, beef, pork, fish, salmon, tuna, seafood, shrimp, prawns, eggs
- ALLOWED ONLY: vegetables, legumes, tofu, paneer, tempeh, grains, dairy, nuts, seeds
` : user.dietaryPrefs.includes('Eggitarian') ? `
⛔ EGGITARIAN RULES:
- ABSOLUTELY NO: meat, chicken, beef, pork, fish, salmon, tuna, seafood, shrimp, prawns
- EGGS ARE ALLOWED
- ALLOWED: eggs, vegetables, legumes, tofu, paneer, grains, dairy, nuts, seeds
` : `
✓ NON-VEG: All protein sources allowed
`}
${user.dietaryNotes ? `- Dietary Notes: ${user.dietaryNotes}` : ''}

### NUTRITION TARGETS (MUST MATCH EXACTLY)
- Daily Calories: ${calorieTarget} kcal
- Daily Protein: ${proteinTarget}g
- Meals per Day: ${user.mealCount || 3}
${user.fastingWindow && user.fastingWindow !== 'No Fasting' ? `- Fasting: ${user.fastingWindow}` : ''}

### EXERCISES TO AVOID (NEVER INCLUDE)
${user.avoidExercises?.length ? user.avoidExercises.map(e => `- ${e}`).join('\n') : 'None specified'}

### INJURIES/LIMITATIONS
${user.injuries || 'None specified'}

### Supplements (for reference)
${user.supplements?.length ? user.supplements.join(', ') : 'None currently taking'}
${user.supplementNotes ? `Notes: ${user.supplementNotes}` : ''}

### Special Requests
${user.specialRequests || 'None'}
${user.planRegenerationRequest ? `\n### REQUESTED CHANGES (CRITICAL)\n${user.planRegenerationRequest}` : ''}
`;

  const system = `You are a fitness plan fixer AI. Your ONLY job is to check a plan and fix ANY issues.

${userProfile}

## YOUR TASK

1. CHECK the plan against ALL user requirements above
2. FIX any issues found - don't just report them, actually fix them:
   - Wrong foods for diet type → Replace with compliant alternatives
   - Wrong calorie/protein values → Set to exact targets
   - Avoided exercises → Replace with safe alternatives
   - Missing sections → Add them
   - Wrong meal count → Adjust to exactly ${user.mealCount || 3} meals
   - JSON format issues → Fix them

3. Return the FIXED plan immediately

## CRITICAL CHECKS

1. DIETARY COMPLIANCE: Every food item must comply with ${user.dietaryPrefs.join(', ') || 'no restrictions'}
2. NUTRITION: total_kcal = ${calorieTarget}, protein_g = ${proteinTarget} (EXACT values)
3. MEAL COUNT: EXACTLY ${user.mealCount || 3} meals per day
4. AVOIDED EXERCISES: ${user.avoidExercises?.length ? user.avoidExercises.join(', ') : 'none'} must NOT appear
5. EQUIPMENT: Only use exercises possible with: ${user.equipment.join(', ') || 'Bodyweight'}
6. ALL 7 DAYS: monday, tuesday, wednesday, thursday, friday, saturday, sunday
7. ALL SECTIONS: workout, nutrition, recovery, reason for each day

## OUTPUT FORMAT

Return ONLY this JSON structure:
{
  "fixed": true,
  "plan": {
    "days": {
      "monday": {
        "workout": { "focus": [...], "blocks": [...], "notes": "..." },
        "nutrition": { "total_kcal": ${calorieTarget}, "protein_g": ${proteinTarget}, "meals": [...] },
        "recovery": { "mobility": [...], "sleep": [...], "supplements": [...], "supplementCard": { "current": [...], "addOns": [...] } },
        "reason": "..."
      },
      // ... all 7 days
    }
  }
}

RULES:
- Return ONLY valid JSON, no explanations
- Fix ALL issues silently - don't list them, just fix
- Every day MUST have total_kcal: ${calorieTarget} and protein_g: ${proteinTarget}
- Every day MUST have exactly ${user.mealCount || 3} meals`;

  const userPrompt = `Fix this plan and return corrected JSON:

${JSON.stringify(plan, null, 2)}`;

  return { system, user: userPrompt };
}

// ============================================================================
// MAIN FIXER FUNCTION
// ============================================================================

/**
 * Fix a raw plan using AI
 * Single call, no retries - fast and simple
 */
export async function fixPlan(
  plan: any,
  user: User
): Promise<WeeklyBasePlan['days']> {
  console.log('🔧 [Fixer] Starting fast AI fix...');
  const startTime = Date.now();
  
  // Build the fix prompt
  const { system, user: userPrompt } = buildFixPrompt(plan, user);
  
  const messages: Message[] = [
    { role: 'system', content: system },
    { role: 'user', content: userPrompt }
  ];
  
  console.log(`📝 [Fixer] Prompt size: ${system.length + userPrompt.length} chars`);
  
  // Single AI call
  const response = await generateAICompletion(messages);
  
  const fixTime = Date.now() - startTime;
  console.log(`⏱️ [Fixer] AI response in ${fixTime}ms`);
  
  if (!response.completion) {
    throw new PlanFixError('No completion in AI response');
  }
  
  console.log(`✅ [Fixer] Response length: ${response.completion.length} chars`);
  
  // Parse the response
  let result: any;
  try {
    result = parseJSON(response.completion);
  } catch (e) {
    throw new PlanFixError(`Failed to parse AI response: ${(e as Error).message}`);
  }
  
  // Extract the plan
  let fixedPlan: any;
  if (result.plan?.days) {
    fixedPlan = result.plan.days;
  } else if (result.plan) {
    fixedPlan = result.plan;
  } else if (result.days) {
    fixedPlan = result.days;
  } else {
    fixedPlan = result;
  }
  
  // Quick structural validation
  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const day of dayNames) {
    if (!fixedPlan[day]) {
      throw new PlanFixError(`Fixed plan missing day: ${day}`);
    }
    if (!fixedPlan[day].workout) {
      throw new PlanFixError(`${day} missing workout section`);
    }
    if (!fixedPlan[day].nutrition) {
      throw new PlanFixError(`${day} missing nutrition section`);
    }
    if (!fixedPlan[day].recovery) {
      throw new PlanFixError(`${day} missing recovery section`);
    }
  }
  
  // Final enforcement (belt and suspenders)
  const calorieTarget = getCalorieTarget(user);
  const proteinTarget = getProteinTarget(user);
  
  for (const day of dayNames) {
    // Force exact nutrition values
    if (fixedPlan[day].nutrition) {
      fixedPlan[day].nutrition.total_kcal = calorieTarget;
      fixedPlan[day].nutrition.protein_g = proteinTarget;
    }
    
    // Ensure reason exists
    if (!fixedPlan[day].reason || fixedPlan[day].reason.length < 10) {
      fixedPlan[day].reason = `Today's plan is designed for your ${user.goal.replace('_', ' ').toLowerCase()} goal with ${user.equipment.join(', ') || 'bodyweight'} exercises.`;
    }
    
    // Ensure supplementCard exists
    if (fixedPlan[day].recovery && !fixedPlan[day].recovery.supplementCard) {
      fixedPlan[day].recovery.supplementCard = {
        current: user.supplements || [],
        addOns: []
      };
    }
  }
  
  console.log(`✅ [Fixer] Plan fixed successfully in ${Date.now() - startTime}ms`);
  return fixedPlan;
}

/**
 * Quick structural check (no AI)
 * Returns true if plan has basic structure, false otherwise
 */
export function hasValidStructure(plan: any): boolean {
  if (!plan || typeof plan !== 'object') return false;
  
  const days = plan.days || plan;
  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  for (const day of dayNames) {
    if (!days[day]) return false;
    if (!days[day].workout) return false;
    if (!days[day].nutrition) return false;
    if (!days[day].recovery) return false;
  }
  
  return true;
}





