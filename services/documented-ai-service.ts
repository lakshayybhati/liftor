/**
 * Plan Generation System - Exact Implementation from Documentation
 * Two-Tier Architecture: Base Plan Generation + Daily Adjustment
 */

import type { User, WeeklyBasePlan, DailyPlan, CheckinData } from '@/types/user';
import { generateAICompletion, type Message } from '@/utils/ai-client';

// API Configuration (migrated to ai-client; endpoint now configured per provider)

/**
 * TIER 1: BASE PLAN GENERATION
 * Creates foundational 7-day template during onboarding
 */
export async function generateWeeklyBasePlan(user: User): Promise<WeeklyBasePlan> {
  console.log('🏗️ Starting Base Plan Generation (Tier 1)...');
  
  try {
    // Step 1: User Profile Building (40+ data points)
    const userProfile = buildComprehensiveUserProfile(user);
    console.log('📊 User profile built with', userProfile.split('\n').length, 'data points');

    // Step 2: AI Prompt Construction
    const { systemPrompt, userRequest } = constructBasePlanPrompts(user, userProfile);
    
    // Step 3: LLM API Call
    const response = await makeLLMRequest(systemPrompt, userRequest);
    
    // Step 4: JSON Processing & Validation
    const parsedPlan = processAndValidateBasePlan(response);
    
    // Step 5: Create WeeklyBasePlan Object
    // Normalize nutrition metrics across all days to ensure targets are enforced
    const days = parsedPlan.days;
    const requiredDays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    for (const day of requiredDays) {
      if (days[day]?.nutrition) {
        days[day].nutrition.total_kcal = calculateTDEE(user);
        days[day].nutrition.protein_g = calculateProteinTarget(user);
      }
    }

    // Enforce user constraints (diet/exercise) and weekly meal consistency
    const constrainedDays = applyUserConstraintsToWeeklyDays(user, days);

    const basePlan: WeeklyBasePlan = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      days: constrainedDays,
      isLocked: false,
    };

    console.log('✅ Base plan generated successfully with', Object.keys(basePlan.days).length, 'days');
    return basePlan;

  } catch (error) {
    console.error('❌ Base plan generation failed:', error);

    // Enhanced error handling - if JSON parsing fails, still try adaptive fallback
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('JSON') || errorMessage.includes('parsing') || errorMessage.includes('validation')) {
      console.log('🔄 AI response parsing failed, using adaptive fallback system...');
      return generateAdaptiveBasePlan(user);
    }

    // For other errors, also use adaptive fallback
    console.log('🔄 Using adaptive fallback system for other errors...');
    return generateAdaptiveBasePlan(user);
  }
}

/**
 * TIER 2: DAILY PLAN ADJUSTMENT
 * Takes base plan and adjusts daily based on check-in data
 */
export async function generateDailyPlan(
  user: User,
  todayCheckin: CheckinData,
  recentCheckins: CheckinData[],
  basePlan: WeeklyBasePlan
): Promise<DailyPlan> {
  console.log('🎯 Starting Daily Plan Adjustment (Tier 2)...');
  
  try {
    // Step 1: Check-in Data Analysis
    const today = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayKey = dayNames[today.getDay()];
    const todayBasePlan = basePlan.days[todayKey];

    if (!todayBasePlan) {
      throw new Error(`No base plan found for ${todayKey}`);
    }

    console.log(`📅 Processing ${todayKey} with energy:${todayCheckin.energy}, stress:${todayCheckin.stress}`);

    // Step 2: Dynamic Adjustment Prompt
    const { systemPrompt, userRequest } = constructDailyAdjustmentPrompts(
      todayKey, 
      todayBasePlan, 
      todayCheckin, 
      recentCheckins
    );

    // Step 3: LLM API Call for Titration
    const response = await makeLLMRequest(systemPrompt, userRequest);

    // Step 4: JSON Processing & Validation
    let adjustedPlan = processAndValidateDailyPlan(response);

    // Enforce user constraints and maintain consistency with base plan
    adjustedPlan = applyUserConstraintsToDailyPlan(user, adjustedPlan, todayBasePlan);

    // Step 5: Create DailyPlan Object
    const dailyPlan: DailyPlan = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      ...adjustedPlan,
      adherence: 0,
      isFromBasePlan: true,
    };

    console.log('✅ Daily plan adjusted with', adjustedPlan.adjustments?.length || 0, 'modifications');
    return dailyPlan;

  } catch (error) {
    console.error('❌ Daily adjustment failed:', error);

    // Enhanced error handling - if JSON parsing fails, still try rule-based fallback
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('JSON') || errorMessage.includes('parsing')) {
      console.log('🔄 AI response parsing failed, using rule-based adjustment fallback...');
      return applyRuleBasedAdjustments(user, todayCheckin, basePlan);
    }

    // For other errors, also use fallback
    console.log('🔄 Using rule-based adjustment fallback for other errors...');
    return applyRuleBasedAdjustments(user, todayCheckin, basePlan);
  }
}

/**
 * Step 1: User Profile Building (40+ data points)
 */
function buildComprehensiveUserProfile(user: User): string {
  const profile = [
    // Basic Stats
    `Goal: ${user.goal}`,
    `Age: ${user.age} years`,
    `Sex: ${user.sex}`,
    `Weight: ${user.weight}kg`,
    `Height: ${user.height}cm`,
    `Activity Level: ${user.activityLevel}`,
    
    // Equipment & Training
    `Equipment Available: ${user.equipment.join(', ')}`,
    `Training Days: ${user.trainingDays} days per week`,
    `Session Length: ${user.sessionLength || 45} minutes`,
    
    // Dietary Preferences
    `Dietary Preference: ${user.dietaryPrefs.join(', ')}`,
    `Daily Calorie Target: ${user.dailyCalorieTarget || 'Auto-calculated'}`,
    `Meal Count: ${user.mealCount || 3} meals per day`,
    `Fasting Window: ${user.fastingWindow || 'None'}`,
    
    // Exercise Preferences
    user.preferredExercises?.length ? `Preferred Exercises: ${user.preferredExercises.join(', ')}` : null,
    user.avoidExercises?.length ? `Avoid Exercises: ${user.avoidExercises.join(', ')}` : null,
    
    // Supplements & Goals
    user.supplements?.length ? `Supplements: ${user.supplements.join(', ')}` : null,
    user.personalGoals ? `Personal Goals: ${user.personalGoals}` : null,
    user.perceivedLacks ? `Perceived Weaknesses: ${user.perceivedLacks}` : null,
    
    // Limitations & Special Requests
    user.injuries ? `Injuries/Limitations: ${user.injuries}` : null,
    user.specialRequests ? `Special Requests: ${user.specialRequests}` : null,
    
    // Lifestyle Factors
    user.timezone ? `Timezone: ${user.timezone}` : null,
    user.travelDays ? `Travel Days: ${user.travelDays}` : null,
  ].filter(Boolean);

  return profile.join('\n');
}

/**
 * Step 2: AI Prompt Construction for Base Plan
 */
function constructBasePlanPrompts(user: User, userProfile: string) {
  const targetCalories = user.dailyCalorieTarget || calculateTDEE(user);
  const proteinTarget = calculateProteinTarget(user);

  const systemPrompt = `You are a precise Personal Trainer & Nutrition Specialist.
Create a COMPLETE 7-Day Base Plan that EXACTLY matches the user's requirements. Keep language concise.

CRITICAL INSTRUCTIONS:
1. You MUST provide ALL 7 days (monday through sunday)
2. Each day MUST have workout, nutrition, and recovery sections
3. Return ONLY pure JSON - no markdown, no backticks, no explanations
4. Complete the ENTIRE response - do not truncate

=== USER'S EXACT REQUIREMENTS ===
${userProfile}

=== MANDATORY CONSTRAINTS ===
🏋️ EQUIPMENT AVAILABLE: ${user.equipment.join(', ')}
🎯 FITNESS GOAL: ${user.goal}
📅 TRAINING DAYS: ${user.trainingDays} days per week
⏱️ SESSION LENGTH: ${user.sessionLength || 45} minutes MAX
🍽️ DIETARY PREFERENCE: ${user.dietaryPrefs.join(', ')}
🚫 AVOID EXERCISES: ${user.avoidExercises?.join(', ') || 'None'}
✅ PREFERRED EXERCISES: ${user.preferredExercises?.join(', ') || 'None'}
🎯 DAILY CALORIES: ${targetCalories} kcal
💪 DAILY PROTEIN: ${proteinTarget}g

=== QUALITY REQUIREMENTS ===
- Use ONLY equipment from the available list
- Respect dietary restrictions completely
- Include preferred exercises when possible
- Avoid excluded exercises entirely
- Keep sessions within time limit
- Make Wednesday and Sunday rest/recovery days
- Vary workouts throughout the week

Return ONLY valid JSON with ALL 7 days using this exact structure:`;

  const userRequest = `{
  "days": {
    "monday": {
      "workout": {
        "focus": ["Primary muscle groups"],
        "blocks": [
          {
            "name": "Warm-up",
            "items": [{"exercise": "Dynamic stretching", "sets": 1, "reps": "5-8 min", "RIR": 0}]
          },
          {
            "name": "Main Training",
            "items": [
              {"exercise": "Exercise name", "sets": 3, "reps": "8-12", "RIR": 2},
              {"exercise": "Exercise name", "sets": 3, "reps": "10-15", "RIR": 2}
            ]
          },
          {"name": "Cool-down","items": [{"exercise": "Static stretching", "sets": 1, "reps": "5-10 min", "RIR": 0}]}
        ],
        "notes": "Specific training notes (short)"
      },
      "nutrition": {
        "total_kcal": ${targetCalories},
        "protein_g": ${proteinTarget},
        "meals": [
          {
            "name": "Breakfast",
            "items": [{"food": "Specific food item", "qty": "Exact quantity"}]
          },
          {
            "name": "Lunch", 
            "items": [{"food": "Specific food item", "qty": "Exact quantity"}]
          },
          {
            "name": "Dinner",
            "items": [{"food": "Specific food item", "qty": "Exact quantity"}]
          }
        ],
        "hydration_l": 2.5
      },
      "recovery": {
        "mobility": ["Specific mobility work"],
        "sleep": ["Sleep optimization tip"]
      }
    },
    "tuesday": { /* Same structure */ },
    "wednesday": { /* Same structure */ },
    "thursday": { /* Same structure */ },
    "friday": { /* Same structure */ },
    "saturday": { /* Same structure */ },
    "sunday": { /* Same structure */ }
  }
}

Create the complete 7-day plan following this exact JSON structure.`;

  return { systemPrompt, userRequest };
}

/**
 * Step 2: AI Prompt Construction for Daily Adjustment
 */
function constructDailyAdjustmentPrompts(
  todayKey: string,
  todayBasePlan: any,
  todayCheckin: CheckinData,
  recentCheckins: CheckinData[]
) {
  const systemPrompt = `You are a Daily Titration Specialist. Your job is to take a BASE PLAN 
and make small, data-driven adjustments based on today's check-in data. 
DO NOT rebuild the plan - only adjust what's necessary.

BASE PLAN FOR TODAY (${todayKey.toUpperCase()}):
Workout: ${JSON.stringify(todayBasePlan.workout)}
Nutrition: ${JSON.stringify(todayBasePlan.nutrition)}
Recovery: ${JSON.stringify(todayBasePlan.recovery)}

TODAY'S CHECK-IN STATE:
- Energy: ${todayCheckin.energy}/10
- Stress: ${todayCheckin.stress}/10
- Sleep: ${todayCheckin.sleepHrs}h (${todayCheckin.wokeFeeling})
- Soreness: ${todayCheckin.soreness?.join(', ') || 'None'}
- Mood: ${todayCheckin.moodCharacter}
- Motivation: ${todayCheckin.motivation}/10
${todayCheckin.currentWeight ? `- Today's Weight: ${todayCheckin.currentWeight}kg` : ''}
${todayCheckin.digestion ? `- Digestion: ${todayCheckin.digestion}` : ''}
${todayCheckin.specialRequest ? `- Special Request: ${todayCheckin.specialRequest}` : ''}

ADJUSTMENT RULES:
- Low Energy/Poor Sleep: -20-30% volume, cap intensity at RIR≥2, emphasize mobility
- Soreness/Injury: Auto-swap or skip affected patterns, redistribute volume
- Travel/Busy: Switch to 20-30min bodyweight/DB circuits
- Digestive Issues: Reduce dense carbs pre-workout, lighter morning meals
- Great Recovery: Allow +1 set on primaries or slightly tighter RIR
- Diet Adherence Issues: Keep same meals but adjust portions
 - If Special Request is present, explicitly incorporate it (e.g., focus area, time cap, joint-friendly swaps) without violating safety/time constraints

Return ONLY the adjusted plan in this exact JSON structure:`;

  const userRequest = `{
  "workout": {
    "focus": ["Adjusted focus areas"],
    "blocks": [
      {
        "name": "Block name",
        "items": [{"exercise": "Exercise", "sets": 3, "reps": "8-12", "RIR": 2}]
      }
    ],
    "notes": "Adjustment notes (single sentence)"
  },
  "nutrition": {
    "total_kcal": ${todayBasePlan.nutrition.total_kcal},
    "protein_g": ${todayBasePlan.nutrition.protein_g},
    "meals": [
      {"name": "Meal", "items": [{"food": "Food", "qty": "Quantity"}]}
    ],
    "hydration_l": 2.5
  },
  "recovery": {
    "mobility": ["Adjusted mobility work"],
    "sleep": ["Adjusted sleep tips"]
  },
  "motivation": "Personalized motivational message based on today's state",
  "adjustments": ["List of specific changes made to the base plan"]
}`;

  return { systemPrompt, userRequest };
}

/**
 * Step 3: LLM API Call
 */
async function makeLLMRequest(systemPrompt: string, userRequest: string): Promise<string> {
  console.log('🤖 Making LLM request...');
  
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userRequest }
  ];

  // Use provider-aware AI client (Gemini primary, Rork fallback)
  const { completion } = await generateAICompletion(messages);

  if (!completion) {
    throw new Error('No completion in AI response');
  }

  console.log('✅ LLM response received:', completion.substring(0, 100) + '...');
  return completion;
}

/**
 * Step 4: JSON Processing & Validation for Base Plan
 * Improved to handle incomplete AI responses gracefully
 */
function processAndValidateBasePlan(rawResponse: string): any {
  console.log('🔍 Processing base plan JSON...');
  console.log('📝 Raw response length:', rawResponse.length);

  // Multi-layer JSON cleaning and validation
  let cleanedResponse = rawResponse.trim();

  // Enhanced markdown code block removal - handle all backtick variations
  // First pass: remove markdown code fences
  cleanedResponse = cleanedResponse
    .replace(/^```json\s*\n?/gmi, '')   // Remove ```json at start (case insensitive, multiline)
    .replace(/^```\s*json\s*\n?/gmi, '') // Remove ``` json at start
    .replace(/^```+\s*\n?/gm, '')        // Remove ``` at start of any line
    .replace(/\n?```+\s*$/gm, '')        // Remove ``` at end
    .replace(/^`+json\s*/gmi, '')        // Remove `json prefix
    .replace(/^`+/gm, '')                // Remove leading backticks from any line
    .replace(/`+$/gm, '')                // Remove trailing backticks from any line
    .trim();

  // Second pass: look for JSON content after any remaining text
  const jsonMatch = cleanedResponse.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    cleanedResponse = jsonMatch[1];
  }

  // Try to extract JSON using multiple strategies
  let jsonString = extractBestJSON(cleanedResponse);

  if (!jsonString) {
    console.error('❌ No valid JSON found in response');
    console.error('Raw response preview:', rawResponse.substring(0, 300));
    console.error('Cleaned response preview:', cleanedResponse.substring(0, 300));
    
    // Last resort: try to find and repair JSON in the raw response
    const rawJsonMatch = rawResponse.match(/\{[\s\S]*$/);  // Get everything from first { to end
    if (rawJsonMatch) {
      console.log('🔧 Found partial JSON in raw response, attempting to repair it');
      const partialJson = rawJsonMatch[0];
      
      // Count UNCLOSED braces and brackets (net count)
      let braceCount = 0;
      let bracketCount = 0;
      let inString = false;
      let escapeNext = false;
      
      for (let i = 0; i < partialJson.length; i++) {
        const char = partialJson[i];
        
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
          if (char === '{') braceCount++;
          else if (char === '}') braceCount--;
          else if (char === '[') bracketCount++;
          else if (char === ']') bracketCount--;
        }
      }
      
      console.log(`📊 JSON structure: ${braceCount} unclosed braces, ${bracketCount} unclosed brackets`);
      
      // Only repair if there are actually unclosed structures
      if (braceCount > 0 || bracketCount > 0) {
        console.log('🔧 Attempting to close unclosed structures...');
        jsonString = attemptJsonRepair(partialJson, braceCount, bracketCount);
      } else if (braceCount < 0 || bracketCount < 0) {
        // More closing than opening - truncate extras
        console.log('⚠️ Extra closing brackets/braces detected, cleaning...');
        jsonString = cleanExtraClosing(partialJson);
      } else {
        // Already balanced
        console.log('✅ JSON appears balanced, using as-is');
        jsonString = partialJson;
      }
      
      if (!jsonString) {
        throw new Error('No valid JSON found in AI response and repair failed');
      }
    } else {
      throw new Error('No valid JSON found in AI response');
    }
  }

  console.log('✅ Extracted JSON length:', jsonString.length);
  console.log('📝 JSON preview:', jsonString.substring(0, 150) + '...');

  try {
    const parsedPlan = JSON.parse(jsonString);

    // Validate structure with more lenient checking
    if (!parsedPlan || typeof parsedPlan !== 'object') {
      throw new Error('Parsed response is not a valid object');
    }

    // Try to validate structure, but don't fail completely if some parts are missing
    const validation = validatePlanStructure(parsedPlan);

      if (!validation.isValid) {
        // Only show detailed warnings in development
        if (validation.errors.length > 3) {
          console.log(`📋 Completing partial plan (${validation.errors.length} items to fix)`);
        }

        // Try to repair the plan if possible
        const repairedPlan = repairPlanStructure(parsedPlan);
        if (repairedPlan) {
          console.log('✅ Weekly plan completed successfully');
          return repairedPlan;
        }

      // If repair fails, throw error to use fallback
      throw new Error(`Plan structure validation failed: ${validation.errors.join(', ')}`);
    }

    console.log('✅ Base plan validation passed');
    return parsedPlan;

  } catch (error) {
    console.error('❌ JSON parsing failed:', error);
    console.error('Problematic JSON preview:', jsonString.substring(0, 500));
    throw new Error(`JSON parsing failed: ${error}`);
  }
}

/**
 * Extract the best possible JSON from an AI response
 */
function extractBestJSON(response: string): string | null {
  // Additional cleaning: remove backticks and common AI response prefixes
  let cleaned = response
    .replace(/^`+/g, '')  // Remove leading backticks
    .replace(/`+$/g, '')  // Remove trailing backticks
    .replace(/^json\s*/i, '')  // Remove 'json' prefix
    .replace(/^```json\s*/gi, '')  // Remove ```json prefix
    .replace(/^```\s*/g, '')  // Remove ``` prefix
    .replace(/```\s*$/g, '')  // Remove ``` suffix
    .trim();

  // If the response starts with text before JSON, try to extract just the JSON
  const firstBraceIndex = cleaned.indexOf('{');
  if (firstBraceIndex > 0) {
    // Check if there's text before the first brace
    const textBefore = cleaned.substring(0, firstBraceIndex).trim();
    if (textBefore.length < 100) {  // If it's a short prefix, skip it
      cleaned = cleaned.substring(firstBraceIndex);
    }
  }

  // Strategy 1: Look for complete JSON object with balanced braces
  const completeJSON = findCompleteJSON(cleaned);
  if (completeJSON) return completeJSON;

  // Strategy 2: Look for partial JSON that at least has the structure we need
  const partialJSON = findPartialJSON(cleaned);
  if (partialJSON) return partialJSON;

  // Strategy 3: If all else fails, return null
  return null;
}

/**
 * Clean JSON with extra closing brackets/braces
 */
// Utility: strip dangling commas before a closing token and at end of string
function stripDanglingCommas(input: string): string {
  let prev: string;
  let next = input;
  do {
    prev = next;
    // Remove commas immediately followed by a closing bracket/brace
    next = next.replace(/,\s*([\]\}])/g, '$1');
    // Remove trailing comma at end of string
    next = next.replace(/,\s*$/g, '');
  } while (next !== prev);
  return next;
}

// Utility: compute stack of unclosed opening tokens ([ or {) in correct order
function getUnclosedStack(jsonLike: string): string[] {
  const stack: string[] = [];
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < jsonLike.length; i++) {
    const ch = jsonLike[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\') { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      // Pop only if matching opener exists; otherwise ignore extra closer
      const last = stack[stack.length - 1];
      if ((ch === '}' && last === '{') || (ch === ']' && last === '[')) {
        stack.pop();
      }
    }
  }
  return stack;
}

function cleanExtraClosing(jsonString: string): string | null {
  try {
    // Remove extra closing brackets/braces from the end
    let cleaned = stripDanglingCommas(jsonString.trim());
    
    while (cleaned.length > 0) {
      // Try to parse
      try {
        JSON.parse(cleaned);
        console.log('✅ Successfully cleaned extra closing characters');
        return cleaned;
      } catch {
        // Remove last character and try again
        const lastChar = cleaned[cleaned.length - 1];
        if (lastChar === ']' || lastChar === '}') {
          cleaned = stripDanglingCommas(cleaned.slice(0, -1).trim());
        } else {
          // Not a closing bracket, can't help
          return null;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.log('❌ Could not clean extra closing:', error);
    return null;
  }
}

/**
 * Attempt to repair incomplete JSON by closing open braces/brackets
 */
function attemptJsonRepair(incompleteJson: string, openBraces: number, openBrackets: number): string | null {
  try {
    let repaired = incompleteJson.trim();
    
    // Check the last few characters to determine what's needed
    const lastChars = repaired.slice(-50); // Get last 50 chars for context
    
    // Check if we're in the middle of a string value
    let inString = false;
    let lastPropertyStart = -1;
    let escapeNext = false;
    
    for (let i = 0; i < repaired.length; i++) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (repaired[i] === '\\') {
        escapeNext = true;
        continue;
      }
      if (repaired[i] === '"' && !escapeNext) {
        if (!inString) {
          lastPropertyStart = i;
        }
        inString = !inString;
      }
    }
    
    // If we're in a string, close it
    if (inString) {
      repaired += '"';
      
      // Check if this was a property value that needs completion
      // Look back to see if there's a colon before the string
      let needsComma = false;
      for (let i = lastPropertyStart - 1; i >= 0; i--) {
        if (repaired[i] === ':') {
          needsComma = true;
          break;
        }
        if (repaired[i] === ',' || repaired[i] === '{' || repaired[i] === '[') {
          break;
        }
      }
      
      // If the string was a value after a colon, we might need a comma
      // But only if we're not closing the object/array immediately
      if (needsComma && (openBraces > 1 || openBrackets > 0)) {
        // Don't add comma, let the structure close naturally
      }
    } else {
      // Check if we ended mid-property
      const lastChar = repaired[repaired.length - 1];
      const secondLastChar = repaired.length > 1 ? repaired[repaired.length - 2] : '';
      
      // If we ended after a colon, add a default value
      if (lastChar === ':' || (lastChar === ' ' && secondLastChar === ':')) {
        repaired += 'null';
      }
      // If we ended after a comma, remove it (trailing comma)
      else if (lastChar === ',') {
        repaired = repaired.slice(0, -1);
      }
    }
    
    repaired = stripDanglingCommas(repaired);

    // Close tokens in correct stack order (LIFO)
    const stack = getUnclosedStack(repaired);
    if (stack.length > 0) {
      console.log(`🔧 Closing stack: ${stack.join('')}`);
    }
    for (let i = stack.length - 1; i >= 0; i--) {
      const opener = stack[i];
      repaired = stripDanglingCommas(repaired);
      repaired += (opener === '{') ? '}' : ']';
    }
    
    repaired = stripDanglingCommas(repaired);

    // Verify it's valid before returning
    try {
      JSON.parse(repaired);
      console.log('✅ Successfully repaired incomplete JSON');
      return repaired;
    } catch (parseError) {
      console.log('⚠️ Initial repair failed, trying to clean:', parseError);
      // Try removing characters from the end until it's valid
      return cleanExtraClosing(repaired);
    }
  } catch (error) {
    console.log('❌ Could not repair JSON:', error);
    
    // Try a more aggressive repair - just close everything
    try {
      let fallback = incompleteJson.trim();
      
      // If it ends with an incomplete string, close it
      if (fallback.match(/"[^"]*$/)) {
        fallback += '"';
      }
      
      // If it ends with : or , remove it
      if (fallback.endsWith(':') || fallback.endsWith(',')) {
        fallback = fallback.slice(0, -1);
      }
      
      // Close all open structures
      fallback += ']'.repeat(openBrackets) + '}'.repeat(openBraces);
      
      JSON.parse(fallback);
      console.log('✅ Fallback repair successful');
      return fallback;
    } catch {
      return null;
    }
  }
}

/**
 * Find a complete JSON object with balanced braces
 */
function findCompleteJSON(response: string): string | null {
  // Find the first opening brace
  const firstBrace = response.indexOf('{');
  if (firstBrace === -1) return null;

  // Track braces and brackets to find the matching closing brace
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;
  let endIndex = -1;

  for (let i = firstBrace; i < response.length; i++) {
    const char = response[i];
    
    // Handle escape sequences
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\' && i + 1 < response.length) {
      escapeNext = true;
      continue;
    }
    
    // Handle string boundaries
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    // Skip characters inside strings
    if (inString) continue;
    
    // Track braces and brackets
    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0 && bracketCount === 0) {
        endIndex = i;
        break;
      }
    } else if (char === '[') {
      bracketCount++;
    } else if (char === ']') {
      bracketCount--;
    }
  }

  // If we found a complete JSON object
  if (endIndex !== -1) {
    const jsonString = response.substring(firstBrace, endIndex + 1);
    
    // Validate that it's parseable
    try {
      JSON.parse(jsonString);
      return jsonString;
    } catch {
      return null;
    }
  }

  // If the JSON is incomplete, try to repair it
  if (braceCount > 0 || bracketCount > 0) {
    console.log('🔧 Attempting to repair incomplete JSON...');
    const repairedJson = attemptJsonRepair(response.substring(firstBrace), braceCount, bracketCount);
    if (repairedJson) {
      try {
        JSON.parse(repairedJson);
        return repairedJson;
      } catch {
        return null;
      }
    }
  }

  return null;
}

/**
 * Find partial JSON that contains at least the basic structure
 */
function findPartialJSON(response: string): string | null {
  // Look for the "days" object which is the core of our plan
  const daysMatch = response.match(/"days"\s*:\s*{[\s\S]*?}(?=\s*}?\s*$)/);
  if (daysMatch) {
    // Try to construct a minimal valid JSON around it
    const minimalJSON = `{"days": {${daysMatch[0].substring(daysMatch[0].indexOf('{') + 1)}}}`;
    try {
      JSON.parse(minimalJSON);
      return minimalJSON;
    } catch {
      // Not valid, continue searching
    }
  }

  // Look for any JSON-like structure
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const candidate = jsonMatch[0];
    // Check if it at least has balanced braces
    let braceCount = 0;
    let isBalanced = true;

    for (let i = 0; i < candidate.length; i++) {
      if (candidate[i] === '{') braceCount++;
      if (candidate[i] === '}') {
        braceCount--;
        if (braceCount < 0) {
          isBalanced = false;
          break;
        }
      }
    }

    if (isBalanced && braceCount === 0) {
      return candidate;
    }
  }

  return null;
}

/**
 * Validate plan structure with detailed error reporting
 */
function validatePlanStructure(plan: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!plan || typeof plan !== 'object') {
    errors.push('Plan is not an object');
    return { isValid: false, errors };
  }

  if (!plan.days) {
    errors.push('Missing "days" object in plan');
    return { isValid: false, errors };
  }

  const requiredDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const day of requiredDays) {
    if (!plan.days[day]) {
      errors.push(`Missing ${day} in plan`);
      continue;
    }

    const dayPlan = plan.days[day];
    if (!dayPlan.workout) {
      errors.push(`Missing workout for ${day}`);
    }
    if (!dayPlan.nutrition) {
      errors.push(`Missing nutrition for ${day}`);
    }
    if (!dayPlan.recovery) {
      errors.push(`Missing recovery for ${day}`);
    }

    // Check workout structure
    if (dayPlan.workout && (!dayPlan.workout.blocks || !Array.isArray(dayPlan.workout.blocks))) {
      errors.push(`Invalid workout blocks for ${day}`);
    }

    // Check nutrition structure
    if (dayPlan.nutrition && (!dayPlan.nutrition.meals || !Array.isArray(dayPlan.nutrition.meals))) {
      errors.push(`Invalid nutrition meals for ${day}`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Repair plan structure by filling in missing parts with defaults
 */
function repairPlanStructure(plan: any): any {
  if (!plan || !plan.days) {
    return null;
  }

  const repairedPlan = { ...plan };
  const requiredDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  // Count how many days are missing
  const missingDays = requiredDays.filter(day => !repairedPlan.days[day]);
  
  if (missingDays.length > 0) {
    console.log(`📝 Auto-generating ${missingDays.length} missing day${missingDays.length > 1 ? 's' : ''} to complete weekly plan`);
  }
  
  for (const day of requiredDays) {
    if (!repairedPlan.days[day]) {
      repairedPlan.days[day] = createMinimalDayPlan(day, repairedPlan.days);
      continue;
    }

    const dayPlan = repairedPlan.days[day];

    // Ensure workout structure
    if (!dayPlan.workout) {
      dayPlan.workout = createMinimalWorkout();
    } else if (!dayPlan.workout.blocks || !Array.isArray(dayPlan.workout.blocks)) {
      dayPlan.workout.blocks = [createMinimalWorkoutBlock()];
    }

    // Ensure nutrition structure
    if (!dayPlan.nutrition) {
      dayPlan.nutrition = createMinimalNutrition();
    } else if (!dayPlan.nutrition.meals || !Array.isArray(dayPlan.nutrition.meals)) {
      dayPlan.nutrition.meals = [createMinimalMeal()];
    }

    // Ensure recovery structure
    if (!dayPlan.recovery) {
      dayPlan.recovery = createMinimalRecovery();
    }
  }

  return repairedPlan;
}

function createMinimalDayPlan(day: string, existingDays?: any) {
  // Determine if this should be a rest day or active day
  const isWeekend = day === 'saturday' || day === 'sunday';
  const isRestDay = day === 'wednesday' || day === 'sunday';
  
  // Try to extract patterns from existing days if available
  let targetCalories = 2000;
  let targetProtein = 150;
  
  if (existingDays) {
    const existingCalories = Object.values(existingDays)
      .filter((d: any) => d?.nutrition?.total_kcal)
      .map((d: any) => d.nutrition.total_kcal);
    
    if (existingCalories.length > 0) {
      targetCalories = Math.round(existingCalories.reduce((a: number, b: number) => a + b, 0) / existingCalories.length);
    }
    
    const existingProtein = Object.values(existingDays)
      .filter((d: any) => d?.nutrition?.protein_g)
      .map((d: any) => d.nutrition.protein_g);
    
    if (existingProtein.length > 0) {
      targetProtein = Math.round(existingProtein.reduce((a: number, b: number) => a + b, 0) / existingProtein.length);
    }
  }
  
  return {
    workout: createMinimalWorkout(day, isRestDay),
    nutrition: createMinimalNutrition(targetCalories, targetProtein),
    recovery: createMinimalRecovery(isRestDay)
  };
}

function createMinimalWorkout(day: string, isRestDay: boolean) {
  if (isRestDay) {
    return {
      focus: ['Recovery', 'Mobility'],
      blocks: [{
        name: 'Active Recovery',
        items: [
          {
            exercise: 'Light Walking',
            sets: 1,
            reps: '20-30 min',
            RIR: 0
          },
          {
            exercise: 'Gentle Stretching',
            sets: 1,
            reps: '10-15 min',
            RIR: 0
          }
        ]
      }],
      notes: 'Rest and recovery day - light movement only'
    };
  }
  
  // Create varied workouts for different days
  const workoutFocus: Record<string, string[]> = {
    monday: ['Upper Body', 'Push'],
    tuesday: ['Lower Body', 'Legs'],
    thursday: ['Upper Body', 'Pull'],
    friday: ['Full Body', 'Conditioning'],
    saturday: ['Core', 'Flexibility']
  };
  
  const focus = workoutFocus[day] || ['General Fitness'];
  
  return {
    focus,
    blocks: [
      {
        name: 'Warm-up',
        items: [{
          exercise: 'Dynamic Stretching',
          sets: 1,
          reps: '5-10 min',
          RIR: 0
        }]
      },
      createMinimalWorkoutBlock(focus[0])
    ],
    notes: `Focus on ${focus.join(' and ')}`
  };
}

function createMinimalWorkoutBlock(focus: string) {
  const exercises: Record<string, any[]> = {
    'Upper Body': [
      { exercise: 'Push-ups', sets: 3, reps: '8-12', RIR: 2 },
      { exercise: 'Dumbbell Rows', sets: 3, reps: '10-12', RIR: 2 },
      { exercise: 'Shoulder Press', sets: 3, reps: '10-12', RIR: 2 }
    ],
    'Lower Body': [
      { exercise: 'Squats', sets: 3, reps: '10-12', RIR: 2 },
      { exercise: 'Lunges', sets: 3, reps: '10 each leg', RIR: 2 },
      { exercise: 'Calf Raises', sets: 3, reps: '15-20', RIR: 1 }
    ],
    'Full Body': [
      { exercise: 'Burpees', sets: 3, reps: '8-10', RIR: 2 },
      { exercise: 'Mountain Climbers', sets: 3, reps: '20', RIR: 2 },
      { exercise: 'Plank', sets: 3, reps: '30-60 sec', RIR: 1 }
    ],
    'Core': [
      { exercise: 'Plank', sets: 3, reps: '30-60 sec', RIR: 1 },
      { exercise: 'Bicycle Crunches', sets: 3, reps: '20', RIR: 1 },
      { exercise: 'Leg Raises', sets: 3, reps: '10-15', RIR: 2 }
    ]
  };
  
  return {
    name: 'Main Workout',
    items: exercises[focus] || exercises['Full Body']
  };
}

function createMinimalNutrition(calories: number = 2000, protein: number = 150) {
  return {
    total_kcal: calories,
    protein_g: protein,
    meals: [
      {
        name: 'Breakfast',
        items: [
          { food: 'Oatmeal with berries', qty: '1 cup' },
          { food: 'Protein shake', qty: '1 scoop' }
        ]
      },
      {
        name: 'Lunch',
        items: [
          { food: 'Grilled chicken breast', qty: '150g' },
          { food: 'Brown rice', qty: '1 cup' },
          { food: 'Mixed vegetables', qty: '2 cups' }
        ]
      },
      {
        name: 'Dinner',
        items: [
          { food: 'Lean protein', qty: '150g' },
          { food: 'Sweet potato', qty: '1 medium' },
          { food: 'Salad', qty: '2 cups' }
        ]
      }
    ],
    hydration_l: 2.5
  };
}

function createMinimalMeal() {
  return {
    name: 'Balanced Meal',
    items: [{
      food: 'Protein, carbs, and vegetables',
      qty: '1 serving'
    }]
  };
}

function createMinimalRecovery(isRestDay: boolean = false) {
  if (isRestDay) {
    return {
      mobility: [
        'Full body stretching routine (15 min)',
        'Foam rolling if available',
        'Light yoga or meditation'
      ],
      sleep: [
        '8-9 hours recommended',
        'Focus on recovery and relaxation',
        'Avoid intense activities'
      ]
    };
  }
  
  return {
    mobility: [
      'Post-workout stretching (10 min)',
      'Focus on worked muscle groups'
    ],
    sleep: [
      '7-8 hours minimum',
      'Consistent sleep schedule'
    ]
  };
}

/**
 * Step 4: JSON Processing & Validation for Daily Plan
 */
function processAndValidateDailyPlan(rawResponse: string): any {
  console.log('🔍 Processing daily plan JSON...');
  console.log('📝 Raw daily response length:', rawResponse.length);

  // Multi-layer JSON cleaning and validation
  let cleanedResponse = rawResponse.trim();

  // Enhanced markdown code block removal - handle all backtick variations
  cleanedResponse = cleanedResponse
    .replace(/^```+json\s*\n?/gi, '')  // Remove ```json at start
    .replace(/^```+\s*\n?/g, '')       // Remove ``` at start
    .replace(/\n?```+\s*$/g, '')       // Remove ``` at end
    .replace(/^`+json\s*/gi, '')       // Remove `json prefix
    .replace(/^`+/g, '')               // Remove leading backticks
    .replace(/`+$/g, '');              // Remove trailing backticks

  // Use the same robust JSON extraction as base plan
  const jsonString = extractBestJSON(cleanedResponse);

  if (!jsonString) {
    console.error('❌ No valid JSON found in daily plan response');
    console.error('Raw daily response preview:', rawResponse.substring(0, 300));
    throw new Error('No valid JSON found in daily plan AI response');
  }

  console.log('📝 Extracted daily JSON length:', jsonString.length);

  try {
    const adjustedPlan = JSON.parse(jsonString);

    // Validate structure with more lenient checking
    if (!adjustedPlan || typeof adjustedPlan !== 'object') {
      throw new Error('Parsed daily plan response is not a valid object');
    }

    // Basic validation - don't fail completely if some parts are missing
    const validation = validateDailyPlanStructure(adjustedPlan);

    if (!validation.isValid) {
      console.warn('⚠️ Daily plan structure validation issues:', validation.errors);

      // Try to repair the daily plan if possible
      const repairedPlan = repairDailyPlanStructure(adjustedPlan);
      if (repairedPlan) {
        console.log('✅ Daily plan structure repaired');
        return repairedPlan;
      }

      throw new Error(`Daily plan structure validation failed: ${validation.errors.join(', ')}`);
    }

    console.log('✅ Daily plan validation passed');
    return adjustedPlan;

  } catch (error) {
    console.error('❌ Daily plan JSON parsing failed:', error);
    console.error('Problematic daily JSON preview:', jsonString.substring(0, 500));
    throw new Error(`Daily plan JSON parsing failed: ${error}`);
  }
}

/**
 * Validate daily plan structure with detailed error reporting
 */
function validateDailyPlanStructure(plan: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!plan || typeof plan !== 'object') {
    errors.push('Daily plan is not an object');
    return { isValid: false, errors };
  }

  if (!plan.workout) {
    errors.push('Missing workout in daily plan');
  }
  if (!plan.nutrition) {
    errors.push('Missing nutrition in daily plan');
  }
  if (!plan.recovery) {
    errors.push('Missing recovery in daily plan');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Repair daily plan structure by filling in missing parts with defaults
 */
function repairDailyPlanStructure(plan: any): any {
  if (!plan || typeof plan !== 'object') {
    return null;
  }

  const repairedPlan = { ...plan };

  // Ensure workout structure
  if (!repairedPlan.workout) {
    repairedPlan.workout = {
      focus: ['General Fitness'],
      blocks: [{
        name: 'Main',
        items: [{
          exercise: 'Bodyweight Squats',
          sets: 3,
          reps: '10-12',
          RIR: 2
        }]
      }],
      notes: 'Repaired workout plan'
    };
  }

  // Ensure nutrition structure
  if (!repairedPlan.nutrition) {
    repairedPlan.nutrition = {
      total_kcal: 2000,
      protein_g: 150,
      meals: [{
        name: 'Main Meal',
        items: [{
          food: 'Balanced meal',
          qty: '1 serving'
        }]
      }],
      hydration_l: 2.5
    };
  }

  // Ensure recovery structure
  if (!repairedPlan.recovery) {
    repairedPlan.recovery = {
      mobility: ['Stretching'],
      sleep: ['7-8 hours']
    };
  }

  return repairedPlan;
}

/**
 * Adaptive Fallback System for Base Plan
 */
function generateAdaptiveBasePlan(user: User): WeeklyBasePlan {
  console.log('🔄 Generating adaptive base plan fallback...');
  
  const targetCalories = user.dailyCalorieTarget || calculateTDEE(user);
  const proteinTarget = calculateProteinTarget(user);
  const hasGym = user.equipment.includes('Gym');
  const hasWeights = user.equipment.some(eq => ['Dumbbells', 'Barbell', 'Gym'].includes(eq));
  
  // Create adaptive workout split based on training days
  const workoutSplit = createWorkoutSplit(user.trainingDays);
  
  const days: any = {};
  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  dayNames.forEach((day, index) => {
    const isTrainingDay = index < user.trainingDays;
    const focus = isTrainingDay ? workoutSplit[index % workoutSplit.length] : 'Recovery';
    
    days[day] = {
      workout: createAdaptiveWorkout(focus, user.equipment, user.sessionLength || 45, isTrainingDay),
      nutrition: createAdaptiveNutrition(targetCalories, proteinTarget, user.dietaryPrefs, user.mealCount || 3),
      recovery: createAdaptiveRecovery(isTrainingDay)
    };
  });
  
  return {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    days,
    isLocked: false,
  };
}

/**
 * Rule-based Adjustments for Daily Plans
 */
function applyRuleBasedAdjustments(
  user: User, 
  checkin: CheckinData, 
  basePlan: WeeklyBasePlan
): DailyPlan {
  console.log('🔄 Applying rule-based adjustments...');
  
  const today = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayKey = dayNames[today.getDay()];
  const todayBasePlan = basePlan.days[todayKey];
  
  // Clone the base plan
  let adjustedPlan = JSON.parse(JSON.stringify(todayBasePlan));
  const adjustments: string[] = [];
  
  const energy = checkin.energy || 5;
  const stress = checkin.stress || 5;
  const sleepHrs = checkin.sleepHrs || 7;
  const soreness = checkin.soreness || [];
  
  // Low Energy/Poor Sleep Adjustments
  if (energy < 5 || sleepHrs < 6) {
    // Reduce volume by 20-30%
    adjustedPlan.workout.blocks.forEach((block: any) => {
      if (block.name !== 'Warm-up' && block.name !== 'Cool-down') {
        block.items.forEach((item: any) => {
          if (item.sets > 1) {
            item.sets = Math.max(1, Math.floor(item.sets * 0.7));
            item.RIR = Math.max(item.RIR, 2);
          }
        });
      }
    });
    adjustments.push('Reduced volume and intensity due to low energy/poor sleep');
  }
  
  // High Stress Adjustments
  if (stress > 7) {
    adjustedPlan.workout.focus = ['Recovery', 'Stress Relief'];
    adjustedPlan.workout.blocks = [
      {
        name: 'Stress Relief',
        items: [
          { exercise: 'Deep breathing', sets: 1, reps: '5 min', RIR: 0 },
          { exercise: 'Gentle yoga/stretching', sets: 1, reps: '15 min', RIR: 0 },
          { exercise: 'Light walking', sets: 1, reps: '20 min', RIR: 0 }
        ]
      }
    ];
    adjustments.push('Switched to stress-relief protocol due to high stress');
  }
  
  // Soreness Adjustments
  if (soreness.length > 0) {
    adjustments.push(`Modified exercises to avoid ${soreness.join(', ')} soreness`);
    adjustedPlan.workout.notes = `⚠️ Avoid or modify exercises affecting: ${soreness.join(', ')}`;
  }
  
  // Motivation-based messaging
  const motivationMessages = {
    high: "🚀 High energy today! Channel this into quality reps with perfect form!",
    medium: "💪 Steady progress towards your goals. Consistency is key!",
    low: "🌱 Every small step counts. Just showing up is the hardest part - you've got this!"
  };
  
  const motivationLevel = energy >= 8 ? 'high' : energy >= 5 ? 'medium' : 'low';
  
  return {
    id: Date.now().toString(),
    date: new Date().toISOString().split('T')[0],
    workout: adjustedPlan.workout,
    nutrition: adjustedPlan.nutrition,
    recovery: adjustedPlan.recovery,
    motivation: motivationMessages[motivationLevel],
    adjustments,
    adherence: 0,
    isFromBasePlan: true,
  };
}

/**
 * Helper Functions
 */
function calculateTDEE(user: User): number {
  // Provide safe defaults when optional fields are missing
  const weight = user.weight ?? 70; // kg
  const height = user.height ?? 175; // cm
  const age = user.age ?? 28; // years
  const sex = user.sex ?? 'Male';

  // Mifflin-St Jeor Equation
  const bmr = sex === 'Male'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;

  // Activity multipliers
  const activityMultipliers: Record<string, number> = {
    'Sedentary': 1.2,
    'Lightly Active': 1.375,
    'Moderately Active': 1.55,
    'Very Active': 1.725,
    'Extra Active': 1.9
  };

  const activityLevelKey = user.activityLevel ?? 'Moderately Active';
  const activityMultiplier = activityMultipliers[activityLevelKey] ?? 1.55;
  const tdee = bmr * activityMultiplier;

  // Goal-based adjustments
  if (user.goal === 'WEIGHT_LOSS') return Math.round(tdee * 0.85);
  if (user.goal === 'MUSCLE_GAIN') return Math.round(tdee * 1.15);
  return Math.round(tdee);
}

function calculateProteinTarget(user: User): number {
  // 0.9g per lb of body weight; fall back to 150g if weight missing
  const weight = user.weight ?? 75; // kg
  const weightInLbs = weight * 2.20462;
  return Math.round(weightInLbs * 0.9);
}

function createWorkoutSplit(trainingDays: number): string[] {
  const splits: { [key: number]: string[] } = {
    1: ['Full Body'],
    2: ['Upper Body', 'Lower Body'],
    3: ['Push', 'Pull', 'Legs'],
    4: ['Push', 'Pull', 'Legs', 'Upper Body'],
    5: ['Push', 'Pull', 'Legs', 'Push', 'Pull'],
    6: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'],
    7: ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body', 'Full Body', 'Recovery']
  };
  
  return splits[Math.min(trainingDays, 7)] || splits[3];
}

function createAdaptiveWorkout(focus: string, equipment: string[], sessionLength: number, isTrainingDay: boolean): any {
  if (!isTrainingDay || focus === 'Recovery') {
    return {
      focus: ['Recovery'],
      blocks: [
        {
          name: 'Recovery Activities',
          items: [
            { exercise: 'Light walking', sets: 1, reps: '20-30 min', RIR: 0 },
            { exercise: 'Gentle stretching', sets: 1, reps: '10-15 min', RIR: 0 },
            { exercise: 'Foam rolling (if available)', sets: 1, reps: '5-10 min', RIR: 0 }
          ]
        }
      ],
      notes: 'Focus on recovery and light movement'
    };
  }
  
  const hasGym = equipment.includes('Gym');
  const hasWeights = equipment.some(eq => ['Dumbbells', 'Barbell'].includes(eq));
  const bodyweightOnly = equipment.length === 1 && equipment[0] === 'Bodyweight';
  
  // Exercise database based on equipment
  const exerciseDb: { [key: string]: string[] } = {
    'Push': hasGym ? ['Bench Press', 'Shoulder Press', 'Dips'] : 
            hasWeights ? ['Dumbbell Press', 'Shoulder Press', 'Push-ups'] :
            ['Push-ups', 'Pike Push-ups', 'Tricep Dips'],
    'Pull': hasGym ? ['Pull-ups', 'Rows', 'Lat Pulldown'] :
            hasWeights ? ['Dumbbell Rows', 'Pull-ups', 'Reverse Flyes'] :
            ['Pull-ups', 'Inverted Rows', 'Superman'],
    'Legs': hasGym ? ['Squats', 'Deadlifts', 'Leg Press'] :
            hasWeights ? ['Goblet Squats', 'Lunges', 'Romanian Deadlifts'] :
            ['Bodyweight Squats', 'Lunges', 'Single-leg Deadlifts'],
    'Upper Body': hasGym ? ['Bench Press', 'Rows', 'Curls'] :
                  hasWeights ? ['Dumbbell Press', 'Rows', 'Curls'] :
                  ['Push-ups', 'Pull-ups', 'Pike Push-ups'],
    'Lower Body': hasGym ? ['Squats', 'Leg Curls', 'Calf Raises'] :
                  hasWeights ? ['Squats', 'Lunges', 'Calf Raises'] :
                  ['Squats', 'Lunges', 'Glute Bridges'],
    'Full Body': hasGym ? ['Deadlifts', 'Squats', 'Pull-ups'] :
                 hasWeights ? ['Thrusters', 'Rows', 'Squats'] :
                 ['Burpees', 'Mountain Climbers', 'Jump Squats']
  };
  
  const exercises = exerciseDb[focus] || exerciseDb['Full Body'];
  
  return {
    focus: [focus],
    blocks: [
      {
        name: 'Warm-up',
        items: [
          { exercise: 'Dynamic stretching', sets: 1, reps: '5-8 min', RIR: 0 },
          { exercise: 'Joint mobility', sets: 1, reps: '3-5 min', RIR: 0 }
        ]
      },
      {
        name: 'Main Training',
        items: exercises.slice(0, 3).map(exercise => ({
          exercise,
          sets: 3,
          reps: '8-12',
          RIR: 2
        }))
      },
      {
        name: 'Cool-down',
        items: [
          { exercise: 'Static stretching', sets: 1, reps: '5-10 min', RIR: 0 }
        ]
      }
    ],
    notes: `${focus} focused training - adjust intensity based on energy levels`
  };
}

function createAdaptiveNutrition(calories: number, protein: number, dietaryPrefs: string[], mealCount: number): any {
  const isVegetarian = dietaryPrefs.includes('Vegetarian');
  const isEggitarian = dietaryPrefs.includes('Eggitarian');
  
  const mealTemplates = {
    vegetarian: [
      { name: 'Breakfast', items: [{ food: 'Oatmeal with plant protein powder', qty: '1 cup + 1 scoop' }] },
      { name: 'Lunch', items: [{ food: 'Quinoa bowl with legumes and vegetables', qty: '1.5 cups' }] },
      { name: 'Dinner', items: [{ food: 'Tofu stir-fry with brown rice', qty: '200g tofu + 1 cup rice' }] }
    ],
    eggitarian: [
      { name: 'Breakfast', items: [{ food: 'Scrambled eggs with whole grain toast', qty: '3 eggs + 2 slices' }] },
      { name: 'Lunch', items: [{ food: 'Egg salad with quinoa', qty: '2 eggs + 1 cup quinoa' }] },
      { name: 'Dinner', items: [{ food: 'Vegetable omelet with sweet potato', qty: '3 eggs + 1 medium potato' }] }
    ],
    nonveg: [
      { name: 'Breakfast', items: [{ food: 'Greek yogurt with protein powder', qty: '200g + 1 scoop' }] },
      { name: 'Lunch', items: [{ food: 'Grilled chicken with rice and vegetables', qty: '150g + 1 cup + 200g' }] },
      { name: 'Dinner', items: [{ food: 'Fish with quinoa and salad', qty: '150g + 150g + large salad' }] }
    ]
  };
  
  let meals = mealTemplates.nonveg;
  if (isVegetarian) meals = mealTemplates.vegetarian;
  else if (isEggitarian) meals = mealTemplates.eggitarian;
  
  // Adjust for meal count
  if (mealCount > 3) {
    meals.push({ name: 'Snack 1', items: [{ food: 'Mixed nuts and fruit', qty: '30g nuts + 1 medium fruit' }] });
  }
  if (mealCount > 4) {
    meals.push({ name: 'Snack 2', items: [{ food: 'Protein shake', qty: '1 scoop with water' }] });
  }
  
  return {
    total_kcal: calories,
    protein_g: protein,
    meals: meals.slice(0, mealCount),
    hydration_l: 2.5
  };
}

function createAdaptiveRecovery(isTrainingDay: boolean): any {
  return {
    mobility: isTrainingDay ? 
      ['Post-workout stretching', 'Foam rolling targeted areas', 'Joint mobility work'] :
      ['Gentle full-body stretching', 'Light walking', 'Deep breathing exercises'],
    sleep: [
      '7-9 hours of quality sleep',
      'Cool, dark room environment',
      isTrainingDay ? 'Post-workout nutrition within 2 hours' : 'Consistent sleep schedule'
    ]
  };
}


/**
 * Constraint Enforcement & Smart Post-processing
 * - Enforce dietary preferences strictly (e.g., Vegetarian never gets chicken/fish)
 * - Replace avoided exercises instead of deleting whole blocks
 * - Keep nutrition fairly consistent across the week (limited variety)
 */
function applyUserConstraintsToWeeklyDays(user: User, days: Record<string, any>): Record<string, any> {
  const dietary = normalizeDietary(user.dietaryPrefs || []);
  const avoid = new Set((user.avoidExercises || []).map(safeLower));
  const prefer = new Set((user.preferredExercises || []).map(safeLower));

  const result: Record<string, any> = {};
  const dayOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

  // Build a small rotating palette to keep week consistent but not identical
  const palette = buildWeeklyMealPalette(dietary);
  let paletteIndex = 0;

  for (const day of dayOrder) {
    const d = days[day] || {};
    const workout = sanitizeWorkout(d.workout, avoid, prefer);
    const nutrition = sanitizeNutrition(d.nutrition, dietary, palette[paletteIndex % palette.length]);
    const recovery = d.recovery || createMinimalRecovery(day === 'wednesday' || day === 'sunday');
    result[day] = { workout, nutrition, recovery };
    paletteIndex++;
  }

  return result;
}

function applyUserConstraintsToDailyPlan(user: User, plan: any, baseDay: any): any {
  const dietary = normalizeDietary(user.dietaryPrefs || []);
  const avoid = new Set((user.avoidExercises || []).map(safeLower));
  const prefer = new Set((user.preferredExercises || []).map(safeLower));

  const sanitizedWorkout = sanitizeWorkout(plan?.workout || baseDay?.workout, avoid, prefer, baseDay?.workout);
  const sanitizedNutrition = sanitizeNutrition(plan?.nutrition || baseDay?.nutrition, dietary);

  return { ...plan, workout: sanitizedWorkout, nutrition: sanitizedNutrition };
}

function normalizeDietary(prefs: string[]): 'vegetarian' | 'eggitarian' | 'nonveg' {
  if (prefs.includes('Vegetarian')) return 'vegetarian';
  if (prefs.includes('Eggitarian')) return 'eggitarian';
  return 'nonveg';
}

function safeLower(s: string): string { return (s || '').toLowerCase().trim(); }
function capitalize(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function sanitizeWorkout(workout: any, avoid: Set<string>, prefer: Set<string>, baseWorkout?: any): any {
  if (!workout && baseWorkout) return JSON.parse(JSON.stringify(baseWorkout));
  if (!workout) return createMinimalWorkout('', false);

  const clone = JSON.parse(JSON.stringify(workout));
  const blocks = Array.isArray(clone.blocks) ? clone.blocks : [];

  const replacementsMap: Record<string, string> = {
    'deadlift': 'Hip thrusts',
    'deadlifts': 'Hip thrusts',
    'barbell deadlift': 'Back extensions',
    'squat': 'Leg press',
    'squats': 'Leg press',
  };

  blocks.forEach((block: any) => {
    if (!Array.isArray(block.items)) return;
    block.items = block.items.map((item: any) => {
      const exerciseName = String(item?.exercise || '');
      const nameLower = safeLower(exerciseName);

      // If this exercise matches any avoided term, swap it (do not delete)
      let shouldSwap = false;
      avoid.forEach(term => { if (nameLower.includes(term)) shouldSwap = true; });
      if (shouldSwap) {
        // Prefer user's preferred exercise if provided and not also avoided
        const preferred = Array.from(prefer).find(p => !Array.from(avoid).some(a => p.includes(a)));
        const explicitReplacement = Object.keys(replacementsMap).find(k => nameLower.includes(k));
        const replacement = preferred ? preferred : (explicitReplacement ? replacementsMap[explicitReplacement] : 'Cable row');
        return { ...item, exercise: capitalize(replacement) };
      }
      return item;
    });
  });

  clone.blocks = blocks.length ? blocks : [createMinimalWorkoutBlock(clone.focus?.[0] || 'Full Body')];
  return clone;
}

function sanitizeNutrition(nutrition: any, diet: 'vegetarian' | 'eggitarian' | 'nonveg', palette?: { name: string; items: any[] }): any {
  const base = createMinimalNutrition();
  const clone = JSON.parse(JSON.stringify(nutrition || base));
  clone.meals = Array.isArray(clone.meals) ? clone.meals : base.meals;

  const forbidden = new Set<string>();
  if (diet === 'vegetarian') {
    ['chicken','fish','meat','pork','beef','mutton','tuna','egg','eggs'].forEach(f => forbidden.add(f));
  } else if (diet === 'eggitarian') {
    ['chicken','fish','meat','pork','beef','mutton','tuna'].forEach(f => forbidden.add(f));
  }

  const vegSwaps = [
    { match: ['chicken','meat','beef','pork','mutton'], repl: 'Tofu/Paneer' },
    { match: ['fish','tuna','salmon'], repl: 'Chickpeas/Lentils' },
    { match: ['egg','eggs'], repl: diet === 'vegetarian' ? 'Paneer/Tofu' : 'Eggs' },
  ];

  clone.meals = clone.meals.map((meal: any, idx: number) => {
    const items = Array.isArray(meal.items) ? meal.items : [];
    const sanitized = items.map((it: any) => {
      const nameLower = safeLower(it?.food || '');
      if (!nameLower) return it;
      const badToken = Array.from(forbidden).find(tok => nameLower.includes(tok));
      if (badToken) {
        const swap = vegSwaps.find(s => s.match.some(m => badToken.includes(m) || m.includes(badToken)));
        const replacement = swap ? swap.repl : (diet === 'eggitarian' ? 'Eggs' : 'Paneer/Tofu');
        return { ...it, food: replacement };
      }
      return it;
    });

    // Apply palette for consistency (keep 2-3 items max per meal)
    if (palette && idx % 3 === 0) {
      const merged = mergeMealTemplate(sanitized, palette.items);
      return { name: meal.name || palette.name, items: merged };
    }

    return { ...meal, items: sanitized.slice(0, Math.min(3, sanitized.length)) };
  });

  return clone;
}

function buildWeeklyMealPalette(diet: 'vegetarian' | 'eggitarian' | 'nonveg'): { name: string; items: any[] }[] {
  if (diet === 'vegetarian') {
    return [
      { name: 'Breakfast', items: [{ food: 'Oats + plant protein', qty: '80g + 1 scoop' }] },
      { name: 'Lunch', items: [{ food: 'Rajma/Chana + rice', qty: '1 cup + 1 cup' }] },
      { name: 'Dinner', items: [{ food: 'Tofu/Paneer stir-fry + roti', qty: '200g + 2' }] },
    ];
  }
  if (diet === 'eggitarian') {
    return [
      { name: 'Breakfast', items: [{ food: 'Eggs + toast', qty: '3 + 2 slices' }] },
      { name: 'Lunch', items: [{ food: 'Egg rice bowl', qty: '2 eggs + 1 cup rice' }] },
      { name: 'Dinner', items: [{ food: 'Veg omelet + salad', qty: '3 eggs + 200g' }] },
    ];
  }
  return [
    { name: 'Breakfast', items: [{ food: 'Greek yogurt + protein', qty: '200g + 1 scoop' }] },
    { name: 'Lunch', items: [{ food: 'Chicken + rice + veg', qty: '150g + 1 cup + 200g' }] },
    { name: 'Dinner', items: [{ food: 'Fish + quinoa + salad', qty: '150g + 150g + 200g' }] },
  ];
}

function mergeMealTemplate(items: any[], templateItems: any[]): any[] {
  if (!items || items.length === 0) return templateItems.slice(0, 3);
  // Keep up to 3 items to reduce diversity and improve consistency
  return items.slice(0, Math.min(3, items.length));
}

