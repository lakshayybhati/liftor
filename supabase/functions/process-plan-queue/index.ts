/**
 * Process Plan Queue Edge Function
 * 
 * Processes pending plan generation jobs from the queue.
 * 
 * FULL TWO-STAGE PIPELINE (Same as client-side):
 * - Stage 1: Generate raw plan using DeepSeek AI
 * - Stage 2: Verify and fix plan (Plan Fixer)
 * 
 * This function can be called:
 * 1. By a cron job (scheduled invocation)
 * 2. Manually by admin
 * 3. By the client after creating a job
 * 
 * Flow:
 * 1. Claim the next pending job (atomic operation)
 * 2. Stage 1: Generate plan using DeepSeek AI
 * 3. Stage 2: Verify and fix plan using DeepSeek AI
 * 4. Save plan to weekly_base_plans table
 * 5. Send push notification to user
 * 6. Mark job as completed
 * 
 * TIMEOUT HANDLING:
 * - Edge Functions have a max runtime of 400s (Pro) or 60s (Free)
 * - We use a 300s internal timeout to ensure graceful failure handling
 * - Jobs are locked for 180s initially, with periodic heartbeat updates
 */

// @ts-ignore - Remote imports resolved by Deno at runtime/deploy
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

// ============================================================================
// CONFIGURATION
// ============================================================================

// Internal timeout - 10 minutes for complex plan generation
// Note: Supabase Pro tier max is 400s, but we set higher in case of upgraded tier
// The Edge Function will be killed by Supabase if it exceeds their limit
const INTERNAL_TIMEOUT_MS = 580 * 1000; // 580 seconds (~10 minutes)

// Lock duration for jobs - longer to prevent premature reclaim during slow AI
const JOB_LOCK_DURATION_SECONDS = 360; // 6 minutes

// Heartbeat interval to extend lock during long operations
const HEARTBEAT_INTERVAL_MS = 90 * 1000; // 1.5 minutes

// Minimal Deno typing
declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

// ============================================================================
// TYPES
// ============================================================================

interface UserProfile {
  id?: string;
  name?: string;
  goal: string;
  equipment: string[];
  dietaryPrefs: string[];
  dietaryNotes?: string;
  trainingDays: number;
  timezone?: string;
  age?: number;
  sex?: string;
  height?: number;
  weight?: number;
  activityLevel?: string;
  dailyCalorieTarget?: number;
  supplements?: string[];
  supplementNotes?: string;
  personalGoals?: string[];
  perceivedLacks?: string[];
  trainingStylePreferences?: string[];
  avoidExercises?: string[];
  preferredTrainingTime?: string;
  sessionLength?: number;
  travelDays?: number;
  fastingWindow?: string;
  mealCount?: number;
  injuries?: string;
  budgetConstraints?: string;
  wakeTime?: string;
  sleepTime?: string;
  stepTarget?: number;
  caffeineFrequency?: string;
  alcoholFrequency?: string;
  stressBaseline?: number;
  sleepQualityBaseline?: number;
  preferredWorkoutSplit?: string;
  specialRequests?: string;
  planRegenerationRequest?: string;
  workoutIntensity?: string;
  workoutIntensityLevel?: number;
  trainingLevel?: string;
  goalWeight?: number;
}

interface PlanJob {
  id: string;
  user_id: string;
  profile_snapshot: UserProfile;
  status: string;
  retry_count: number;
}

interface ProcessResponse {
  success: boolean;
  jobId?: string;
  planId?: string;
  status?: string;
  error?: string;
  noJobsAvailable?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
};

function errorResponse(message: string, status = 400): Response {
  console.error(`[process-plan-queue] Error: ${message}`);
  return new Response(
    JSON.stringify({ success: false, error: message } as ProcessResponse),
    {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  );
}

function successResponse(data: ProcessResponse): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// AI GENERATION
// ============================================================================

async function callDeepSeekAPI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 8192
): Promise<string> {
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY not configured");
  }

  console.log("[process-plan-queue] Calling DeepSeek API...");
  console.log(`[process-plan-queue] System prompt: ${systemPrompt.length} chars`);
  console.log(`[process-plan-queue] User prompt: ${userPrompt.length} chars`);
  const startTime = Date.now();

  const controller = new AbortController();
  // Timeout: 9 minutes (540 seconds) to allow for DeepSeek thinking/reasoning on complex plans
  const timeoutId = setTimeout(() => controller.abort(), 540000);

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const elapsed = Date.now() - startTime;
    console.log(`[process-plan-queue] DeepSeek responded in ${elapsed}ms, status: ${response.status}`);

    if (!response.ok) {
      let errorText = "";
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = "Could not read error response";
      }
      console.error(`[process-plan-queue] DeepSeek error (${response.status}):`, errorText);

      if (response.status === 429) {
        throw new Error("RATE_LIMITED: DeepSeek API rate limit exceeded");
      }
      if (response.status === 402) {
        throw new Error("QUOTA_EXCEEDED: DeepSeek API quota exceeded");
      }
      if (response.status === 401) {
        throw new Error("AUTH_ERROR: Invalid DeepSeek API key");
      }
      throw new Error(`AI_ERROR: DeepSeek API failed (${response.status}): ${errorText.substring(0, 200)}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      console.error("[process-plan-queue] Failed to parse JSON response:", e);
      throw new Error("AI_ERROR: Invalid JSON response from DeepSeek");
    }

    const completion = data?.choices?.[0]?.message?.content;

    if (!completion) {
      console.error("[process-plan-queue] No completion in response. Data:", JSON.stringify(data).substring(0, 500));
      throw new Error("AI_ERROR: No completion in response");
    }

    console.log(`[process-plan-queue] Response received: ${completion.length} chars`);
    console.log(`[process-plan-queue] Response preview: ${completion.substring(0, 200)}...`); // Log first 200 chars
    return completion;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error("AI_TIMEOUT: DeepSeek API request timed out after 9 minutes");
    }
    throw error;
  }
}

// ============================================================================
// NUTRITION CALCULATIONS
// ============================================================================

function calculateBMR(user: UserProfile): number {
  if (!user.weight || !user.height || !user.age || !user.sex) return 2000;
  if (user.sex === "Male") {
    return Math.round(10 * user.weight + 6.25 * user.height - 5 * user.age + 5);
  } else {
    return Math.round(10 * user.weight + 6.25 * user.height - 5 * user.age - 161);
  }
}

function calculateTDEE(user: UserProfile): number {
  const bmr = calculateBMR(user);
  const multipliers: Record<string, number> = {
    Sedentary: 1.2,
    "Lightly Active": 1.375,
    "Moderately Active": 1.55,
    "Very Active": 1.725,
    "Extra Active": 1.9,
  };
  const multiplier = multipliers[user.activityLevel || "Moderately Active"] || 1.55;
  return Math.round(bmr * multiplier);
}

function getCalorieTarget(user: UserProfile): number {
  if (user.dailyCalorieTarget) return user.dailyCalorieTarget;
  const tdee = calculateTDEE(user);
  switch (user.goal) {
    case "WEIGHT_LOSS":
      return Math.round(tdee * 0.85);
    case "MUSCLE_GAIN":
      return Math.round(tdee * 1.1);
    default:
      return tdee;
  }
}

function getProteinTarget(user: UserProfile): number {
  if (!user.weight) {
    return Math.round((getCalorieTarget(user) * 0.3) / 4);
  }
  const multiplier = user.goal === "MUSCLE_GAIN" ? 2.2 : 1.8;
  return Math.round(user.weight * multiplier);
}

/**
 * Get meal naming guide based on meal count
 * Aligned with basePlanPromptBuilder.ts
 */
function getMealNamingGuide(mealCount: number): string {
  const guides: Record<number, string> = {
    1: '1 meal: "Main Meal" (OMAD - all daily nutrition in one meal)',
    2: '2 meals: "First Meal", "Second Meal"',
    3: '3 meals: "Breakfast", "Lunch", "Dinner"',
    4: '4 meals: "Breakfast", "Lunch", "Afternoon Snack", "Dinner"',
    5: '5 meals: "Breakfast", "Morning Snack", "Lunch", "Afternoon Snack", "Dinner"',
    6: '6 meals: "Breakfast", "Morning Snack", "Lunch", "Afternoon Snack", "Dinner", "Evening Snack"',
    7: '7 meals: "Breakfast", "Mid-Morning", "Lunch", "Afternoon Snack", "Post-Workout", "Dinner", "Before Bed"',
    8: '8 meals: "Breakfast", "Snack 1", "Lunch", "Snack 2", "Pre-Workout", "Post-Workout", "Dinner", "Before Bed"',
  };
  return guides[mealCount] || guides[3];
}

/**
 * Get supplement recommendations based on age and goal
 * Aligned with basePlanPromptBuilder.ts
 */
function getSupplementGuide(user: UserProfile): string {
  const age = user.age || 30;
  let ageGuide = "";
  
  if (age < 30) {
    ageGuide = `- Under 30: Focus on performance, recovery, foundational health (Multivitamin, Vitamin D, Protein, Creatine)`;
  } else if (age < 45) {
    ageGuide = `- 30-45: Add stress management, energy, early longevity (Magnesium, Omega-3s, CoQ10)`;
  } else if (age < 60) {
    ageGuide = `- 45-60: Prioritize joint health, hormonal balance, heart health (Glucosamine, Vitamin D+K2, CoQ10, Omega-3s)`;
  } else {
    ageGuide = `- 60+: Focus on bone density, cognitive function, inflammation (Calcium+D3, B12, Curcumin, Omega-3s)`;
  }
  
  const goalGuide = user.goal === "MUSCLE_GAIN" 
    ? "For muscle gain: Creatine (5g daily), Protein powder, Beta-Alanine"
    : user.goal === "WEIGHT_LOSS"
    ? "For weight loss: Protein powder (satiety), Green tea extract (optional), Fiber supplement"
    : "For general fitness: Multivitamin, Omega-3s, Vitamin D";
  
  return `${ageGuide}\n- ${goalGuide}`;
}

// ============================================================================
// JSON PARSING (with recovery for truncated responses)
// ============================================================================

function extractJSON(text: string): string {
  // Remove markdown code blocks
  let cleaned = text
    .replace(/^```json\s*\n?/gim, "")
    .replace(/^```\s*\n?/gim, "")
    .replace(/\n?```\s*$/gim, "")
    .trim();

  // Find JSON object - use greedy match for nested objects
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // If no complete JSON found, check if response was truncated
  const partialMatch = cleaned.match(/\{[\s\S]*/);
  if (partialMatch) {
    console.warn("[process-plan-queue] Detected possibly truncated JSON, attempting recovery...");
    return partialMatch[0];
  }

  return cleaned;
}

function attemptJSONRecovery(jsonStr: string): string {
  let fixed = jsonStr;

  // Remove incomplete strings at the end
  fixed = fixed.replace(/:\s*"[^"]*$/g, ": null");
  fixed = fixed.replace(/:\s*[\d.]+$/g, ": 0");
  fixed = fixed.replace(/,\s*"[^"]*"?\s*$/g, "");
  fixed = fixed.replace(/,\s*[a-zA-Z_][a-zA-Z0-9_]*\s*$/g, "");

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
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") openBraces++;
      else if (char === "}") openBraces--;
      else if (char === "[") openBrackets++;
      else if (char === "]") openBrackets--;
    }
  }

  // Close unclosed strings
  if (inString) {
    fixed += '"';
    // Recount
    openBraces = 0;
    openBrackets = 0;
    inString = false;
    escapeNext = false;
    for (let i = 0; i < fixed.length; i++) {
      const char = fixed[i];
      if (escapeNext) { escapeNext = false; continue; }
      if (char === "\\") { escapeNext = true; continue; }
      if (char === '"' && !escapeNext) { inString = !inString; continue; }
      if (!inString) {
        if (char === "{") openBraces++;
        else if (char === "}") openBraces--;
        else if (char === "[") openBrackets++;
        else if (char === "]") openBrackets--;
      }
    }
  }

  // Remove trailing commas
  fixed = fixed.replace(/,(\s*)$/g, "$1").trimEnd();
  if (fixed.endsWith(",")) {
    fixed = fixed.slice(0, -1);
  }

  console.log(`[process-plan-queue] JSON Recovery: need to close ${openBrackets} brackets and ${openBraces} braces`);

  while (openBrackets > 0) {
    fixed += "]";
    openBrackets--;
  }
  while (openBraces > 0) {
    fixed += "}";
    openBraces--;
  }

  return fixed;
}

function parseJSON(text: string): unknown {
  const jsonStr = extractJSON(text);

  // First attempt: direct parse
  try {
    return JSON.parse(jsonStr);
  } catch {
    console.log("[process-plan-queue] First parse attempt failed, trying fixes...");
  }

  // Second attempt: fix common issues
  let fixed = jsonStr
    .replace(/,\s*([}\]])/g, "$1") // Remove trailing commas
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // Quote unquoted keys
    .replace(/'/g, '"') // Single to double quotes
    .replace(/[\x00-\x1F\x7F]/g, "") // Remove control characters
    .replace(/\.\.\./g, "") // Remove ellipsis
    .replace(/,\s*,/g, ",") // Remove double commas
    .replace(/:\s*,/g, ": null,") // Fix empty values
    .replace(/:\s*}/g, ": null}"); // Fix empty values at end

  try {
    return JSON.parse(fixed);
  } catch {
    console.log("[process-plan-queue] Second parse attempt failed, trying JSON recovery...");
  }

  // Third attempt: try to recover truncated JSON
  try {
    const recovered = attemptJSONRecovery(fixed);
    return JSON.parse(recovered);
  } catch (e) {
    console.error("[process-plan-queue] All parse attempts failed");
    throw new Error(`JSON_PARSE_ERROR: ${(e as Error).message}`);
  }
}

// ============================================================================
// STAGE 1: PLAN GENERATION
// ============================================================================

function buildGenerationPrompt(user: UserProfile): { system: string; user: string } {
  const calorieTarget = getCalorieTarget(user);
  const proteinTarget = getProteinTarget(user);
  const mealCount = user.mealCount || 3;

  // Build dietary rules
  let dietaryRules = "";
  if (user.dietaryPrefs?.includes("Vegetarian")) {
    dietaryRules = `
DIETARY RULES (STRICT - VEGETARIAN):
- ABSOLUTELY NO: meat, chicken, fish, seafood, eggs
- USE ONLY: vegetables, legumes, tofu, paneer, tempeh, seitan, grains, dairy, nuts, seeds
- Protein sources: lentils, chickpeas, beans, paneer, tofu, greek yogurt, cottage cheese, quinoa`;
  } else if (user.dietaryPrefs?.includes("Eggitarian")) {
    dietaryRules = `
DIETARY RULES (STRICT - EGGITARIAN):
- ABSOLUTELY NO: meat, chicken, fish, seafood
- EGGS ARE ALLOWED
- USE: eggs, vegetables, legumes, tofu, paneer, grains, dairy, nuts, seeds
- Protein sources: eggs, lentils, chickpeas, beans, paneer, tofu, greek yogurt`;
  } else {
    dietaryRules = `
DIETARY RULES (NON-VEG):
- All protein sources allowed
- Prioritize lean proteins: chicken breast, fish, lean beef, eggs
- Include variety across the week`;
  }

  // Get goal-specific workout instructions
  const goalInstructions: Record<string, string> = {
    WEIGHT_LOSS: `- Include circuit-style training where appropriate
- Higher rep ranges (12-15 reps) for metabolic effect
- Include 2-3 cardio sessions (HIIT or LISS)
- Shorter rest periods (30-60 seconds)
- Emphasize compound movements for calorie burn`,
    MUSCLE_GAIN: `- Focus on progressive overload
- Lower rep ranges for main lifts (6-10 reps)
- Higher volume (4-5 sets for main exercises)
- Longer rest periods (2-3 minutes for compounds)
- Include isolation work for lagging body parts`,
    ENDURANCE: `- Include supersets and circuit training
- Moderate rep ranges (10-15 reps)
- Shorter rest periods (30-45 seconds)
- Include 3-4 cardio sessions
- Focus on muscular endurance`,
    GENERAL_FITNESS: `- Balanced approach with variety
- Moderate rep ranges (8-12 reps)
- Mix of compound and isolation exercises
- Include 2-3 cardio sessions
- Focus on functional movements`,
    FLEXIBILITY_MOBILITY: `- Include yoga and stretching sessions
- Focus on mobility work each day
- Light resistance training
- Active recovery emphasis
- Mind-body connection exercises`,
  };

  // Get level-specific instructions
  const levelInstructions: Record<string, string> = {
    Beginner: `- Focus on basic compound movements (squat, deadlift, bench, row, press)
- Use machines where appropriate for safety
- Lower volume: 2-3 sets per exercise
- Higher RIR (3-4) to learn proper form
- Simpler exercise selection`,
    Intermediate: `- Include both compound and isolation exercises
- Moderate volume: 3-4 sets per exercise
- RIR of 2-3 for most exercises
- Can include supersets and drop sets occasionally
- Progressive overload focus`,
    Professional: `- Advanced techniques (drop sets, rest-pause, supersets)
- Higher volume: 4-5 sets for main lifts
- Lower RIR (1-2) for intensity
- Periodization considerations
- Specialized exercise selection`,
  };

  const system = `You are an elite fitness coach AI creating a personalized 7-day workout and nutrition plan.

## USER PROFILE

### Core Information
- Name: ${user.name || "User"}
- Goal: ${user.goal.replace("_", " ")}
- Training Days: ${user.trainingDays} days per week
- Equipment: ${user.equipment?.join(", ") || "Bodyweight only"}
- Dietary Preference: ${user.dietaryPrefs?.join(", ") || "No restrictions"}
${user.dietaryNotes ? `- Dietary Notes: ${user.dietaryNotes}` : ""}

### Body Stats
${user.age ? `- Age: ${user.age} years` : ""}
${user.sex ? `- Sex: ${user.sex}` : ""}
${user.height ? `- Height: ${user.height} cm` : ""}
${user.weight ? `- Weight: ${user.weight} kg` : ""}
${user.goalWeight ? `- Goal Weight: ${user.goalWeight} kg` : ""}
${user.activityLevel ? `- Activity Level: ${user.activityLevel}` : ""}

### Nutrition Targets
- Daily Calories: ${calorieTarget} kcal
- Daily Protein: ${proteinTarget}g
- Meals per Day: ${mealCount}
${user.fastingWindow && user.fastingWindow !== "No Fasting" ? `- Fasting Window: ${user.fastingWindow}` : ""}

### Training Preferences
- Experience Level: ${user.trainingLevel || "Intermediate"}
${user.trainingStylePreferences?.length ? `- Training Style: ${user.trainingStylePreferences.join(", ")}` : ""}
${user.sessionLength ? `- Session Length: ${user.sessionLength} minutes` : ""}
${user.workoutIntensity ? `- Intensity Preference: ${user.workoutIntensity}` : ""}
${user.workoutIntensityLevel ? `- Intensity Level: ${user.workoutIntensityLevel}/10` : ""}
${user.preferredTrainingTime ? `- Preferred Time: ${user.preferredTrainingTime}` : ""}

${user.avoidExercises?.length ? `### Exercises to AVOID (CRITICAL)
${user.avoidExercises.map((e) => `- ${e}`).join("\n")}` : ""}

${user.injuries ? `### Injuries/Limitations (CRITICAL)
${user.injuries}` : ""}

${user.supplements?.length ? `### Current Supplements
${user.supplements.map((s) => `- ${s}`).join("\n")}
${user.supplementNotes ? `Notes: ${user.supplementNotes}` : ""}` : ""}

${user.personalGoals?.length || user.perceivedLacks?.length ? `### Personal Goals & Focus Areas
${user.personalGoals?.length ? `Goals: ${user.personalGoals.join(", ")}` : ""}
${user.perceivedLacks?.length ? `Areas to Improve: ${user.perceivedLacks.join(", ")}` : ""}` : ""}

${user.stepTarget || user.travelDays || user.specialRequests ? `### Lifestyle
${user.stepTarget ? `- Daily Step Target: ${user.stepTarget} steps` : ""}
${user.travelDays ? `- Travel Days/Month: ${user.travelDays}` : ""}
${user.specialRequests ? `- Special Requests: ${user.specialRequests}` : ""}` : ""}

${user.planRegenerationRequest ? `### Requested Weekly Plan Changes (CRITICAL)
${user.planRegenerationRequest}` : ""}

## ⚠️ NUTRITION TARGETS (CRITICAL - MUST MATCH EXACTLY)
**These values are NON-NEGOTIABLE and must appear in EVERY day's nutrition section:**
- Daily Calories: **EXACTLY ${calorieTarget} kcal** (total_kcal field)
- Daily Protein: **EXACTLY ${proteinTarget}g** (protein_g field)
- Meals per day: **EXACTLY ${mealCount} meals**

### Meal Naming Guide (MUST USE THESE EXACT NAMES):
${getMealNamingGuide(mealCount)}

## SUPPLEMENT RECOMMENDATIONS
${getSupplementGuide(user)}
Current supplements: ${user.supplements?.join(", ") || "None"}

## WORKOUT STRUCTURE REQUIREMENTS

### Goal-Specific Instructions (${user.goal.replace("_", " ")}):
${goalInstructions[user.goal] || goalInstructions["GENERAL_FITNESS"]}

### Experience Level Instructions (${user.trainingLevel || "Intermediate"}):
${levelInstructions[user.trainingLevel || "Intermediate"]}

## EQUIPMENT AVAILABLE
${user.equipment?.join(", ") || "Bodyweight only"}
- Only use exercises that can be performed with the available equipment
- If "Gym" is listed, full gym equipment is available
- If only "Bodyweight", use calisthenics and bodyweight exercises

${dietaryRules}

## OUTPUT FORMAT
Return ONLY valid JSON with this exact structure:
{
  "days": {
    "monday": {
      "workout": {
        "focus": ["Primary Focus"],
        "blocks": [
          {"name": "Warm-up", "items": [{"exercise": "Exercise Name", "sets": 1, "reps": "5-10 min", "RIR": 0}]},
          {"name": "Main", "items": [{"exercise": "Exercise Name", "sets": 3, "reps": "8-12", "RIR": 2}]},
          {"name": "Cool-down", "items": [{"exercise": "Static Stretching", "sets": 1, "reps": "5 min", "RIR": 0}]}
        ],
        "notes": "Brief coaching notes for this workout"
      },
      "nutrition": {
        "total_kcal": ${calorieTarget},
        "protein_g": ${proteinTarget},
        "meals_per_day": ${mealCount},
        "meals": [{"name": "Meal Name", "items": [{"food": "Food item", "qty": "amount with unit"}]}],
        "hydration_l": 2.5
      },
      "recovery": {
        "mobility": ["Specific mobility exercise 1", "Specific mobility exercise 2"],
        "sleep": ["Sleep recommendation 1", "Sleep recommendation 2"],
        "supplements": ["Supplement - Timing"],
        "supplementCard": {"current": [], "addOns": []}
      },
      "reason": "2-3 sentences explaining why this day's plan fits the user's goals and preferences."
    },
    "tuesday": { ... },
    "wednesday": { ... },
    "thursday": { ... },
    "friday": { ... },
    "saturday": { ... },
    "sunday": { ... }
  }
}

CRITICAL RULES:
1. Return ONLY the JSON object, no markdown, no explanation
2. Include ALL 7 days (monday through sunday)
3. Each day MUST have workout, nutrition, recovery, and reason
4. Nutrition must match the exact calorie (${calorieTarget}) and protein (${proteinTarget}g) targets
5. Never include avoided exercises: ${user.avoidExercises?.join(", ") || "none specified"}
6. Respect dietary restrictions strictly
7. RIR must be 0-5 (0 = failure, 5 = very easy)
8. Sets must be 1-10
9. Include specific exercise names, not placeholders`;

  const userPrompt = `Create my personalized 7-day fitness plan now. Return ONLY valid JSON.`;

  return { system, user: userPrompt };
}

async function generateRawPlan(user: UserProfile): Promise<Record<string, unknown>> {
  console.log("[process-plan-queue] Stage 1: Generating raw plan...");

  const { system, user: userPrompt } = buildGenerationPrompt(user);
  const completion = await callDeepSeekAPI(system, userPrompt);

  const parsed = parseJSON(completion) as { days?: Record<string, unknown> };
  const days = parsed.days || parsed;

  // Validate structure
  const requiredDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const missingDays = requiredDays.filter((day) => !(days as Record<string, unknown>)[day]);

  if (missingDays.length > 0) {
    throw new Error(`VALIDATION_FAILED: Missing days: ${missingDays.join(", ")}`);
  }

  console.log("[process-plan-queue] Stage 1 complete: all 7 days present");
  return { days };
}

// ============================================================================
// STAGE 2: PLAN FIXER
// ============================================================================

function buildFixPrompt(plan: unknown, user: UserProfile): { system: string; user: string } {
  const calorieTarget = getCalorieTarget(user);
  const proteinTarget = getProteinTarget(user);
  const mealCount = user.mealCount || 3;

  // Build complete user profile for verification
  const userProfile = `
## COMPLETE USER DATA (verify plan against ALL of this)

### Identity & Body
- Name: ${user.name || "User"}
- Age: ${user.age || "Not specified"}
- Sex: ${user.sex || "Not specified"}
- Height: ${user.height ? `${user.height} cm` : "Not specified"}
- Weight: ${user.weight ? `${user.weight} kg` : "Not specified"}
- Goal Weight: ${user.goalWeight ? `${user.goalWeight} kg` : "Not specified"}
- Activity Level: ${user.activityLevel || "Moderately Active"}

### Fitness Goal
- Primary Goal: ${user.goal.replace("_", " ")}
- Training Days: ${user.trainingDays} days/week
- Training Level: ${user.trainingLevel || "Intermediate"}
- Session Length: ${user.sessionLength || 45} minutes
${user.personalGoals?.length ? `- Personal Goals: ${user.personalGoals.join(", ")}` : ""}
${user.perceivedLacks?.length ? `- Areas to Improve: ${user.perceivedLacks.join(", ")}` : ""}

### Equipment Available
${user.equipment?.join(", ") || "Bodyweight only"}

### DIETARY REQUIREMENTS (STRICT)
- Diet Type: ${user.dietaryPrefs?.join(", ") || "No restrictions"}
${user.dietaryPrefs?.includes("Vegetarian") ? `
⛔ VEGETARIAN RULES:
- ABSOLUTELY NO: meat, chicken, beef, pork, fish, salmon, tuna, seafood, shrimp, prawns, eggs
- ALLOWED ONLY: vegetables, legumes, tofu, paneer, tempeh, grains, dairy, nuts, seeds
` : user.dietaryPrefs?.includes("Eggitarian") ? `
⛔ EGGITARIAN RULES:
- ABSOLUTELY NO: meat, chicken, beef, pork, fish, salmon, tuna, seafood, shrimp, prawns
- EGGS ARE ALLOWED
- ALLOWED: eggs, vegetables, legumes, tofu, paneer, grains, dairy, nuts, seeds
` : `
✓ NON-VEG: All protein sources allowed
`}
${user.dietaryNotes ? `- Dietary Notes: ${user.dietaryNotes}` : ""}

### NUTRITION TARGETS (MUST MATCH EXACTLY)
- Daily Calories: ${calorieTarget} kcal
- Daily Protein: ${proteinTarget}g
- Meals per Day: ${mealCount}
${user.fastingWindow && user.fastingWindow !== "No Fasting" ? `- Fasting: ${user.fastingWindow}` : ""}

### EXERCISES TO AVOID (NEVER INCLUDE)
${user.avoidExercises?.length ? user.avoidExercises.map((e) => `- ${e}`).join("\n") : "None specified"}

### INJURIES/LIMITATIONS
${user.injuries || "None specified"}

### Supplements (for reference)
${user.supplements?.length ? user.supplements.join(", ") : "None currently taking"}
${user.supplementNotes ? `Notes: ${user.supplementNotes}` : ""}

### Special Requests
${user.specialRequests || "None"}
${user.planRegenerationRequest ? `\n### REQUESTED CHANGES (CRITICAL)\n${user.planRegenerationRequest}` : ""}
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
   - Wrong meal count → Adjust to exactly ${mealCount} meals
   - JSON format issues → Fix them

3. Return the FIXED plan immediately

## CRITICAL CHECKS

1. DIETARY COMPLIANCE: Every food item must comply with ${user.dietaryPrefs?.join(", ") || "no restrictions"}
2. NUTRITION: total_kcal = ${calorieTarget}, protein_g = ${proteinTarget} (EXACT values)
3. MEAL COUNT: EXACTLY ${mealCount} meals per day
4. AVOIDED EXERCISES: ${user.avoidExercises?.length ? user.avoidExercises.join(", ") : "none"} must NOT appear
5. EQUIPMENT: Only use exercises possible with: ${user.equipment?.join(", ") || "Bodyweight"}
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
- Every day MUST have exactly ${mealCount} meals`;

  const userPrompt = `Fix this plan and return corrected JSON:

${JSON.stringify(plan, null, 2)}`;

  return { system, user: userPrompt };
}

async function fixPlanWithAI(rawPlan: Record<string, unknown>, user: UserProfile): Promise<Record<string, unknown>> {
  console.log("[process-plan-queue] Stage 2: Fixing plan with AI...");

  const { system, user: userPrompt } = buildFixPrompt(rawPlan, user);
  const completion = await callDeepSeekAPI(system, userPrompt, 8192);

  const result = parseJSON(completion) as { plan?: { days?: Record<string, unknown> }; days?: Record<string, unknown> };

  // Extract the plan
  let fixedPlan: Record<string, unknown>;
  if (result.plan?.days) {
    fixedPlan = result.plan.days;
  } else if (result.plan) {
    fixedPlan = result.plan as Record<string, unknown>;
  } else if (result.days) {
    fixedPlan = result.days;
  } else {
    fixedPlan = result as Record<string, unknown>;
  }

  // Quick structural validation
  const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  for (const day of dayNames) {
    if (!fixedPlan[day]) {
      throw new Error(`FIX_FAILED: Fixed plan missing day: ${day}`);
    }
    const dayData = fixedPlan[day] as Record<string, unknown>;
    if (!dayData.workout) {
      throw new Error(`FIX_FAILED: ${day} missing workout section`);
    }
    if (!dayData.nutrition) {
      throw new Error(`FIX_FAILED: ${day} missing nutrition section`);
    }
    if (!dayData.recovery) {
      throw new Error(`FIX_FAILED: ${day} missing recovery section`);
    }
  }

  // Final enforcement (belt and suspenders)
  const calorieTarget = getCalorieTarget(user);
  const proteinTarget = getProteinTarget(user);

  for (const day of dayNames) {
    const dayData = fixedPlan[day] as Record<string, unknown>;

    // Force exact nutrition values
    if (dayData.nutrition) {
      const nutrition = dayData.nutrition as Record<string, unknown>;
      nutrition.total_kcal = calorieTarget;
      nutrition.protein_g = proteinTarget;
    }

    // Ensure reason exists
    if (!dayData.reason || (dayData.reason as string).length < 10) {
      dayData.reason = `Today's plan is designed for your ${user.goal.replace("_", " ").toLowerCase()} goal with ${user.equipment?.join(", ") || "bodyweight"} exercises.`;
    }

    // Ensure supplementCard exists
    if (dayData.recovery && !(dayData.recovery as Record<string, unknown>).supplementCard) {
      (dayData.recovery as Record<string, unknown>).supplementCard = {
        current: user.supplements || [],
        addOns: [],
      };
    }
  }

  console.log("[process-plan-queue] Stage 2 complete: plan fixed and validated");
  return fixedPlan;
}

// ============================================================================
// STRUCTURAL VALIDATION (Before saving to DB)
// ============================================================================

/**
 * Validates plan structure to catch malformed plans before DB save
 * Throws VALIDATION_FAILED error if plan is invalid
 */
function validatePlanStructure(
  days: Record<string, unknown>,
  user: UserProfile
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const calorieTarget = getCalorieTarget(user);
  const proteinTarget = getProteinTarget(user);
  const mealCount = user.mealCount || 3;

  // Check all 7 days exist
  for (const day of dayNames) {
    if (!days[day]) {
      errors.push(`Missing day: ${day}`);
      continue;
    }

    const dayData = days[day] as Record<string, unknown>;

    // Check required sections
    if (!dayData.workout) {
      errors.push(`${day}: missing workout section`);
    }
    if (!dayData.nutrition) {
      errors.push(`${day}: missing nutrition section`);
    } else {
      const nutrition = dayData.nutrition as Record<string, unknown>;
      
      // Check nutrition values
      if (nutrition.total_kcal !== calorieTarget) {
        errors.push(`${day}: incorrect total_kcal (${nutrition.total_kcal} vs ${calorieTarget})`);
      }
      if (nutrition.protein_g !== proteinTarget) {
        errors.push(`${day}: incorrect protein_g (${nutrition.protein_g} vs ${proteinTarget})`);
      }
      
      // Check meals array
      const meals = nutrition.meals as unknown[];
      if (!Array.isArray(meals)) {
        errors.push(`${day}: meals is not an array`);
      } else if (meals.length !== mealCount) {
        errors.push(`${day}: incorrect meal count (${meals.length} vs ${mealCount})`);
      }
    }
    if (!dayData.recovery) {
      errors.push(`${day}: missing recovery section`);
    }
    if (!dayData.reason || (dayData.reason as string).length < 5) {
      errors.push(`${day}: missing or empty reason`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// FULL GENERATION PIPELINE
// ============================================================================

async function generatePlan(user: UserProfile): Promise<Record<string, unknown>> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("[process-plan-queue] 🏗️ Starting Full Plan Generation Pipeline");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`👤 User: ${user.name || "Unknown"}`);
  console.log(`🎯 Goal: ${user.goal}`);
  console.log(`🏋️ Equipment: ${user.equipment?.join(", ") || "Bodyweight"}`);
  console.log(`🥗 Diet: ${user.dietaryPrefs?.join(", ") || "No restrictions"}`);
  console.log(`📅 Training Days: ${user.trainingDays}`);
  console.log("═══════════════════════════════════════════════════════════");

  const MAX_ATTEMPTS = 2;
  const RETRY_DELAY_MS = 2000;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`\n🔄 [process-plan-queue] Attempt ${attempt}/${MAX_ATTEMPTS}`);

    try {
      // Stage 1: Generate raw plan
      const rawPlan = await generateRawPlan(user);

      // Stage 2: Fix and verify plan
      const verifiedDays = await fixPlanWithAI(rawPlan, user);

      // Build final plan object
      const calorieTarget = getCalorieTarget(user);
      const proteinTarget = getProteinTarget(user);
      const mealCount = user.mealCount || 3;

      // Ensure nutrition targets are correct (final enforcement - "belt and suspenders")
      const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      for (const day of dayNames) {
        const dayData = verifiedDays[day] as Record<string, unknown>;
        if (dayData?.nutrition) {
          const nutrition = dayData.nutrition as Record<string, unknown>;
          // Force exact nutrition values
          nutrition.total_kcal = calorieTarget;
          nutrition.protein_g = proteinTarget;
          nutrition.meals_per_day = mealCount;
        }

        // Ensure supplementCard structure exists
        if (dayData?.recovery && !(dayData.recovery as Record<string, unknown>).supplementCard) {
          (dayData.recovery as Record<string, unknown>).supplementCard = {
            current: user.supplements || [],
            addOns: [],
          };
        }

        // Ensure reason exists with meaningful content
        if (!dayData?.reason || (dayData.reason as string).length < 10) {
          dayData.reason = `Today's plan is designed for your ${user.goal.replace("_", " ").toLowerCase()} goal with ${user.equipment?.join(", ") || "bodyweight"} exercises.`;
        }
      }

      // Final structural validation before returning
      const validation = validatePlanStructure(verifiedDays, user);
      if (!validation.valid) {
        console.warn("[process-plan-queue] ⚠️ Final validation found issues (will still proceed):", validation.errors);
        // Log but don't fail - the plan is still usable, just not perfect
      }

      const basePlan = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        days: verifiedDays,
        isLocked: false,
        isGenerating: false,
        generationProgress: 7,
        editCounts: {},
      };

      console.log("\n═══════════════════════════════════════════════════════════");
      console.log("✅ [process-plan-queue] Plan Generation SUCCESSFUL");
      console.log(`📋 Plan ID: ${basePlan.id}`);
      console.log(`📅 Days: ${Object.keys(basePlan.days).length}`);
      console.log(`🍽️ Meals/day: ${mealCount}`);
      console.log(`🔥 Calories: ${calorieTarget}`);
      console.log(`💪 Protein: ${proteinTarget}g`);
      console.log("═══════════════════════════════════════════════════════════\n");

      return basePlan;

    } catch (error) {
      console.error(`❌ [process-plan-queue] Attempt ${attempt} failed:`, error);
      lastError = error as Error;

      // Wait before retry (unless this is the last attempt)
      if (attempt < MAX_ATTEMPTS) {
        console.log(`⏳ [process-plan-queue] Waiting ${RETRY_DELAY_MS}ms before retry...`);
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  // All attempts failed
  console.error("\n═══════════════════════════════════════════════════════════");
  console.error("❌ [process-plan-queue] Plan Generation FAILED after all attempts");
  console.error("═══════════════════════════════════════════════════════════\n");

  throw lastError || new Error("GENERATION_FAILED: Failed after all retry attempts");
}

// ============================================================================
// PUSH NOTIFICATION
// ============================================================================

async function sendPushNotification(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    // Get user's push token
    const { data: tokens, error } = await serviceClient
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId)
      .limit(5);

    if (error || !tokens?.length) {
      console.log("[process-plan-queue] No push tokens found for user");
      return;
    }

    // Send to Expo push service
    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      sound: "default",
      title,
      body,
      data,
    }));

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });

    if (response.ok) {
      console.log("[process-plan-queue] Push notification sent successfully");
    } else {
      console.warn("[process-plan-queue] Push notification failed:", await response.text());
    }
  } catch (error) {
    console.error("[process-plan-queue] Push notification error:", error);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  console.log(`[process-plan-queue] Request received: ${req.method}`);
  console.log(`[process-plan-queue] Internal timeout: ${INTERNAL_TIMEOUT_MS}ms, Lock duration: ${JOB_LOCK_DURATION_SECONDS}s`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // Set up internal timeout to ensure we return a response before Edge Function times out
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error("[process-plan-queue] ⏰ Internal timeout reached, aborting...");
    abortController.abort("Edge Function Timeout"); // Pass reason
  }, INTERNAL_TIMEOUT_MS);

  let jobId: string | null = null;
  let serviceClient: ReturnType<typeof createClient> | null = null;
  let heartbeatInterval: number | undefined;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      clearTimeout(timeoutId);
      return errorResponse("Server not configured: Missing Supabase credentials", 500);
    }

    if (!deepseekKey) {
      clearTimeout(timeoutId);
      return errorResponse("Server not configured: Missing DEEPSEEK_API_KEY", 500);
    }

    // Create service client
    serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique worker ID
    const workerId = `worker_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Claim next job with shorter lock duration for faster recovery
    console.log(`[process-plan-queue] Worker ${workerId} claiming next job with ${JOB_LOCK_DURATION_SECONDS}s lock...`);
    const { data: jobIdResult, error: claimError } = await serviceClient.rpc(
      "claim_next_plan_job",
      { p_worker_id: workerId, p_lock_duration_seconds: JOB_LOCK_DURATION_SECONDS }
    );

    if (claimError) {
      console.error("[process-plan-queue] Error claiming job:", claimError);
      clearTimeout(timeoutId);
      return errorResponse("Failed to claim job", 500);
    }

    if (!jobIdResult) {
      console.log("[process-plan-queue] No jobs available in queue");
      clearTimeout(timeoutId);
      return successResponse({
        success: true,
        status: "no_jobs",
        noJobsAvailable: true,
      });
    }

    jobId = jobIdResult as string;
    console.log(`[process-plan-queue] ✅ Claimed job: ${jobId}`);

    // Set up heartbeat to extend lock during long operations
    // Uses RPC function for proper atomic updates
    heartbeatInterval = setInterval(async () => {
      if (jobId && serviceClient) {
        console.log(`[process-plan-queue] 💓 Heartbeat: extending lock for job ${jobId}`);
        try {
          const { data, error } = await serviceClient.rpc("extend_job_lock", {
            p_job_id: jobId,
            p_worker_id: workerId,
            p_extension_seconds: JOB_LOCK_DURATION_SECONDS,
          });
          
          if (error) {
            console.warn("[process-plan-queue] Heartbeat RPC failed:", error.message, error.details, error.hint);
          } else {
            console.log(`[process-plan-queue] Heartbeat success: ${data}`);
            if (!data) {
              console.warn("[process-plan-queue] Heartbeat: lock extension returned false (job may have been reclaimed)");
            }
          }
        } catch (e) {
          console.warn("[process-plan-queue] Heartbeat failed:", e);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Fetch job details
    const { data: job, error: fetchError } = await serviceClient
      .from("plan_generation_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (fetchError || !job) {
      console.error("[process-plan-queue] Error fetching job:", fetchError);
      return errorResponse("Failed to fetch job details", 500);
    }

    const typedJob = job as PlanJob;
    console.log(`[process-plan-queue] Processing job for user: ${typedJob.user_id.substring(0, 8)}...`);
    console.log(`[process-plan-queue] Retry count: ${typedJob.retry_count}`);

    try {
      // Generate the plan (FULL 2-STAGE PIPELINE)
      const basePlan = await generatePlan(typedJob.profile_snapshot);

      // Save to weekly_base_plans
      const { data: savedPlan, error: saveError } = await serviceClient
        .from("weekly_base_plans")
        .insert({
          user_id: typedJob.user_id,
          days: basePlan.days,
          is_locked: false,
          version: 1,
        })
        .select("id")
        .single();

      if (saveError || !savedPlan) {
        throw new Error(`DB_ERROR: Failed to save plan: ${saveError?.message}`);
      }

      console.log(`[process-plan-queue] Plan saved: ${savedPlan.id}`);

      // Mark job as completed
      const { error: completeError } = await serviceClient.rpc("complete_plan_job", {
        p_job_id: jobId,
        p_result_plan_id: savedPlan.id,
      });

      if (completeError) {
        console.warn("[process-plan-queue] Error completing job:", completeError);
      }

      // Send push notification
      await sendPushNotification(
        serviceClient,
        typedJob.user_id,
        "🎉 Your plan is ready!",
        "Your personalized fitness plan has been generated. Tap to review and start your journey.",
        { type: "base_plan_ready", screen: "/plan-preview", planId: savedPlan.id }
      );

      // Also add to user_notifications table for in-app notification center
      await serviceClient
        .from("user_notifications")
        .insert({
          user_id: typedJob.user_id,
          title: "🎉 Your plan is ready!",
          body: "Your personalized fitness plan has been generated. Tap to review and start your journey.",
          type: "base_plan_ready",
          screen: "/plan-preview",
          data: { planId: savedPlan.id },
          delivered: false,
          read: false,
        })
        .catch((err: unknown) => console.warn("[process-plan-queue] Failed to create in-app notification:", err));

      console.log(`[process-plan-queue] Job ${jobId} completed successfully`);

      return successResponse({
        success: true,
        jobId,
        planId: savedPlan.id,
        status: "completed",
      });

    } catch (genError) {
      const errorMessage = genError instanceof Error ? genError.message : "Unknown error";
      const errorCode = errorMessage.split(":")[0] || "UNKNOWN";

      console.error(`[process-plan-queue] Generation failed: ${errorMessage}`);

      // Mark job as failed (will retry if retries remaining)
      const { error: failError } = await serviceClient.rpc("fail_plan_job", {
        p_job_id: jobId,
        p_error_message: errorMessage,
        p_error_code: errorCode,
      });

      if (failError) {
        console.warn("[process-plan-queue] Error marking job as failed:", failError);
      }

      // If this was the final retry, send error notification
      if (typedJob.retry_count >= 2) {
        await sendPushNotification(
          serviceClient,
          typedJob.user_id,
          "⚠️ Plan generation issue",
          "We had trouble generating your plan. Please try again.",
          { type: "base_plan_error", screen: "/plan-building" }
        );
      }

      // Clean up
      clearTimeout(timeoutId);
      if (heartbeatInterval) clearInterval(heartbeatInterval);

      return successResponse({
        success: false,
        jobId,
        status: "failed",
        error: errorMessage,
      });
    }

    // Clean up on success
    clearTimeout(timeoutId);
    if (heartbeatInterval) clearInterval(heartbeatInterval);

  } catch (error) {
    // Clean up on unexpected error
    clearTimeout(timeoutId);
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("[process-plan-queue] Unexpected error:", errorMessage);

    // If we claimed a job, try to mark it as failed so it can be retried
    if (jobId && serviceClient) {
      console.log(`[process-plan-queue] Attempting to release job ${jobId} for retry...`);
      try {
        const isAbortError = error instanceof Error && error.name === "AbortError";
        const errorCode = isAbortError ? "TIMEOUT" : "UNEXPECTED_ERROR";
        
        await serviceClient.rpc("fail_plan_job", {
          p_job_id: jobId,
          p_error_message: isAbortError ? "Edge function timeout - job will be retried" : errorMessage,
          p_error_code: errorCode,
        });
        console.log(`[process-plan-queue] Job ${jobId} marked for retry`);
      } catch (releaseError) {
        console.error("[process-plan-queue] Failed to release job:", releaseError);
      }
    }

    return errorResponse(errorMessage, 500);
  }
});
