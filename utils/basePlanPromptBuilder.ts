/**
 * Base Plan Prompt Builder
 * 
 * Builds prompts for the two-stage AI pipeline:
 * - Stage 1: Generation (fast, optimized)
 * - Stage 2: Verification + Fix (thorough review)
 */

import type { User, Goal, TrainingLevel } from '@/types/user';
import { COMMON_SUPPLEMENTS_GUIDE } from '@/utils/supplements';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format the supplement guide for AI prompt
 * Groups supplements by category for easier reference
 */
function formatSupplementGuide(): string {
  const categories: Record<string, string[]> = {
    'PROTEIN & AMINO ACIDS': ['Whey Protein', 'Casein Protein', 'Plant Protein', 'BCAAs', 'EAAs', 'L-Glutamine'],
    'PERFORMANCE & STRENGTH': ['Creatine', 'Beta-Alanine', 'Citrulline', 'Pre-workout', 'Caffeine'],
    'VITAMINS': ['Multivitamin', 'Vitamin D', 'Vitamin D3', 'Vitamin C', 'Vitamin B Complex', 'Vitamin B12', 'Vitamin K2'],
    'MINERALS': ['Magnesium', 'Magnesium Glycinate', 'Magnesium Citrate', 'Zinc', 'Iron', 'Calcium', 'Potassium'],
    'OMEGA FATTY ACIDS': ['Omega-3', 'Fish Oil', 'Krill Oil', 'Algae Oil'],
    'JOINT & RECOVERY': ['Glucosamine', 'Chondroitin', 'Collagen', 'MSM', 'Turmeric', 'Curcumin', 'Tart Cherry'],
    'SLEEP & RELAXATION': ['Melatonin', 'Ashwagandha', 'L-Theanine', 'Valerian Root', 'Glycine', 'GABA'],
    'GUT HEALTH': ['Probiotics', 'Digestive Enzymes', 'Psyllium Husk'],
    'IMMUNE SUPPORT': ['Elderberry', 'Echinacea', 'Quercetin'],
    'ENERGY & ADAPTOGENS': ['Rhodiola Rosea', 'Ginseng', 'Maca', 'CoQ10'],
    'ELECTROLYTES': ['Electrolytes', 'LMNT', 'Nuun'],
  };

  const lines: string[] = [];
  for (const [category, supplements] of Object.entries(categories)) {
    lines.push(`\n${category}:`);
    for (const name of supplements) {
      const info = COMMON_SUPPLEMENTS_GUIDE[name];
      if (info) {
        lines.push(`  - ${name}: ${info.dosage}, ${info.timing} (${info.purpose})`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Calculate BMR using Mifflin-St Jeor equation
 */
function calculateBMR(user: User): number {
  if (!user.weight || !user.height || !user.age || !user.sex) {
    return 2000; // Default
  }

  if (user.sex === 'Male') {
    return Math.round(10 * user.weight + 6.25 * user.height - 5 * user.age + 5);
  } else {
    return Math.round(10 * user.weight + 6.25 * user.height - 5 * user.age - 161);
  }
}

/**
 * Calculate TDEE from BMR and activity level
 */
function calculateTDEE(user: User): number {
  const bmr = calculateBMR(user);
  const multipliers: Record<string, number> = {
    'Sedentary': 1.2,
    'Lightly Active': 1.375,
    'Moderately Active': 1.55,
    'Very Active': 1.725,
    'Extra Active': 1.9,
  };
  const multiplier = multipliers[user.activityLevel || 'Moderately Active'] || 1.55;
  return Math.round(bmr * multiplier);
}

/**
 * Get calorie target based on goal
 */
function getCalorieTarget(user: User): number {
  if (user.dailyCalorieTarget) {
    return user.dailyCalorieTarget;
  }

  const tdee = calculateTDEE(user);

  switch (user.goal) {
    case 'WEIGHT_LOSS':
      return Math.round(tdee * 0.85); // 15% deficit
    case 'MUSCLE_GAIN':
      return Math.round(tdee * 1.1); // 10% surplus
    default:
      return tdee;
  }
}

/**
 * Get protein target based on weight and goal
 */
function getProteinTarget(user: User): number {
  if (!user.weight) {
    return Math.round(getCalorieTarget(user) * 0.3 / 4); // 30% of calories from protein
  }

  // Protein in grams per kg of body weight
  const multiplier = user.goal === 'MUSCLE_GAIN' ? 2.2 : 1.8;
  return Math.round(user.weight * multiplier);
}

/**
 * Get workout split based on training days
 */
function getWorkoutSplit(trainingDays: number, preferredSplit?: string): string[] {
  if (preferredSplit) {
    // Map common split names to day focuses
    const splitMaps: Record<string, string[]> = {
      'PPL': ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'],
      'Push Pull Legs': ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'],
      'Upper Lower': ['Upper Body', 'Lower Body', 'Rest', 'Upper Body', 'Lower Body', 'Rest', 'Rest'],
      'Full Body': ['Full Body', 'Rest', 'Full Body', 'Rest', 'Full Body', 'Rest', 'Rest'],
      'Bro Split': ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Rest', 'Rest'],
    };

    if (splitMaps[preferredSplit]) {
      return splitMaps[preferredSplit];
    }
  }

  // Default splits based on training days
  const defaultSplits: Record<number, string[]> = {
    1: ['Full Body', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest'],
    2: ['Upper Body', 'Rest', 'Rest', 'Lower Body', 'Rest', 'Rest', 'Rest'],
    3: ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest'],
    4: ['Upper Body', 'Lower Body', 'Rest', 'Upper Body', 'Lower Body', 'Rest', 'Rest'],
    5: ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body', 'Rest', 'Rest'],
    6: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'],
    7: ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body', 'Full Body', 'Active Recovery'],
  };

  return defaultSplits[Math.min(Math.max(trainingDays, 1), 7)] || defaultSplits[3];
}

/**
 * Get goal-specific workout instructions
 */
function getGoalWorkoutInstructions(goal: Goal): string {
  const instructions: Record<Goal, string> = {
    'WEIGHT_LOSS': `
- Include circuit-style training where appropriate
- Higher rep ranges (12-15 reps) for metabolic effect
- Include 2-3 cardio sessions (HIIT or LISS)
- Shorter rest periods (30-60 seconds)
- Emphasize compound movements for calorie burn`,
    'MUSCLE_GAIN': `
- Focus on progressive overload
- Lower rep ranges for main lifts (6-10 reps)
- Higher volume (4-5 sets for main exercises)
- Longer rest periods (2-3 minutes for compounds)
- Include isolation work for lagging body parts`,
    'ENDURANCE': `
- Include supersets and circuit training
- Moderate rep ranges (10-15 reps)
- Shorter rest periods (30-45 seconds)
- Include 3-4 cardio sessions
- Focus on muscular endurance`,
    'GENERAL_FITNESS': `
- Balanced approach with variety
- Moderate rep ranges (8-12 reps)
- Mix of compound and isolation exercises
- Include 2-3 cardio sessions
- Focus on functional movements`,
    'FLEXIBILITY_MOBILITY': `
- Include yoga and stretching sessions
- Focus on mobility work each day
- Light resistance training
- Active recovery emphasis
- Mind-body connection exercises`,
  };

  return instructions[goal] || instructions['GENERAL_FITNESS'];
}

/**
 * Get meal naming guide based on meal count
 */
function getMealNamingGuide(mealCount: number): string {
  const guides: Record<number, string> = {
    1: '  * 1 meal: "Main Meal" (OMAD - all daily nutrition in one meal)',
    2: '  * 2 meals: "First Meal", "Second Meal"',
    3: '  * 3 meals: "Breakfast", "Lunch", "Dinner"',
    4: '  * 4 meals: "Breakfast", "Lunch", "Afternoon Snack", "Dinner"',
    5: '  * 5 meals: "Breakfast", "Morning Snack", "Lunch", "Afternoon Snack", "Dinner"',
    6: '  * 6 meals: "Breakfast", "Morning Snack", "Lunch", "Afternoon Snack", "Dinner", "Evening Snack"',
    7: '  * 7 meals: "Breakfast", "Mid-Morning", "Lunch", "Afternoon Snack", "Post-Workout", "Dinner", "Before Bed"',
    8: '  * 8 meals: "Breakfast", "Snack 1", "Lunch", "Snack 2", "Pre-Workout", "Post-Workout", "Dinner", "Before Bed"',
  };
  return guides[mealCount] || guides[3];
}

/**
 * Generate meal examples for the JSON template based on meal count
 */
function generateMealExamples(mealCount: number): string {
  const mealNames: Record<number, string[]> = {
    1: ['Main Meal'],
    2: ['First Meal', 'Second Meal'],
    3: ['Breakfast', 'Lunch', 'Dinner'],
    4: ['Breakfast', 'Lunch', 'Afternoon Snack', 'Dinner'],
    5: ['Breakfast', 'Morning Snack', 'Lunch', 'Afternoon Snack', 'Dinner'],
    6: ['Breakfast', 'Morning Snack', 'Lunch', 'Afternoon Snack', 'Dinner', 'Evening Snack'],
    7: ['Breakfast', 'Mid-Morning', 'Lunch', 'Afternoon Snack', 'Post-Workout', 'Dinner', 'Before Bed'],
    8: ['Breakfast', 'Snack 1', 'Lunch', 'Snack 2', 'Pre-Workout', 'Post-Workout', 'Dinner', 'Before Bed'],
  };

  const names = mealNames[mealCount] || mealNames[3];
  return names.map((name, i) =>
    `          {"name": "${name}", "items": [{"food": "Food item", "qty": "amount with unit"}]}${i < names.length - 1 ? ',' : ''}`
  ).join('\n');
}

/**
 * Get experience level instructions
 */
function getLevelInstructions(level: TrainingLevel | undefined): string {
  const instructions: Record<string, string> = {
    'Beginner': `
- Focus on basic compound movements (squat, deadlift, bench, row, press)
- Use machines where appropriate for safety
- Lower volume: 2-3 sets per exercise
- Higher RIR (3-4) to learn proper form
- Simpler exercise selection
- Include form cues in notes`,
    'Intermediate': `
- Include both compound and isolation exercises
- Moderate volume: 3-4 sets per exercise
- RIR of 2-3 for most exercises
- Can include supersets and drop sets occasionally
- Progressive overload focus`,
    'Professional': `
- Advanced techniques (drop sets, rest-pause, supersets)
- Higher volume: 4-5 sets for main lifts
- Lower RIR (1-2) for intensity
- Periodization considerations
- Specialized exercise selection
- Include intensity techniques`,
  };

  return instructions[level || 'Intermediate'] || instructions['Intermediate'];
}

/**
 * Build the user profile section of the prompt
 */
function buildUserProfile(user: User): string {
  const calorieTarget = getCalorieTarget(user);
  const proteinTarget = getProteinTarget(user);
  const workoutSplit = getWorkoutSplit(user.trainingDays, user.preferredWorkoutSplit);

  const sections: string[] = [];

  // Core info
  sections.push(`## USER PROFILE

### Core Information
- Name: ${user.name || 'User'}
- Goal: ${user.goal.replace('_', ' ')}
- Training Days: ${user.trainingDays} days per week
- Equipment: ${user.equipment.join(', ') || 'Bodyweight only'}
- Dietary Preference: ${user.dietaryPrefs.join(', ') || 'No restrictions'}
${user.dietaryNotes ? `- Dietary Notes: ${user.dietaryNotes}` : ''}`);

  // Body stats
  if (user.age || user.weight || user.height) {
    sections.push(`
### Body Stats
${user.age ? `- Age: ${user.age} years` : ''}
${user.sex ? `- Sex: ${user.sex}` : ''}
${user.height ? `- Height: ${user.height} cm` : ''}
${user.weight ? `- Weight: ${user.weight} kg` : ''}
${user.goalWeight ? `- Goal Weight: ${user.goalWeight} kg` : ''}
${user.activityLevel ? `- Activity Level: ${user.activityLevel}` : ''}`);
  }

  // Nutrition targets
  sections.push(`
### Nutrition Targets
- Daily Calories: ${calorieTarget} kcal
- Daily Protein: ${proteinTarget}g
- Meals per Day: ${user.mealCount || 3}
${user.fastingWindow && user.fastingWindow !== 'No Fasting' ? `- Fasting Window: ${user.fastingWindow}` : ''}`);

  // Training preferences
  sections.push(`
### Training Preferences
- Experience Level: ${user.trainingLevel || 'Intermediate'}
- Workout Split: ${workoutSplit.join(' → ')}
${user.trainingStylePreferences?.length ? `- Training Style: ${user.trainingStylePreferences.join(', ')}` : ''}
${user.sessionLength ? `- Session Length: ${user.sessionLength} minutes` : ''}
${user.workoutIntensity ? `- Intensity Preference: ${user.workoutIntensity}` : ''}
${user.workoutIntensityLevel ? `- Intensity Level: ${user.workoutIntensityLevel}/10` : ''}
${user.preferredTrainingTime ? `- Preferred Time: ${user.preferredTrainingTime}` : ''}`);

  // Avoid exercises
  if (user.avoidExercises?.length) {
    sections.push(`
### Exercises to AVOID (CRITICAL)
${user.avoidExercises.map(e => `- ${e}`).join('\n')}`);
  }

  // Injuries
  if (user.injuries) {
    sections.push(`
### Injuries/Limitations (CRITICAL)
${user.injuries}`);
  }

  // Supplements
  if (user.supplements?.length) {
    sections.push(`
### Current Supplements
${user.supplements.map(s => `- ${s}`).join('\n')}
${user.supplementNotes ? `Notes: ${user.supplementNotes}` : ''}`);
  }

  // Personal goals
  if (user.personalGoals?.length || user.perceivedLacks?.length) {
    sections.push(`
### Personal Goals & Focus Areas
${user.personalGoals?.length ? `Goals: ${user.personalGoals.join(', ')}` : ''}
${user.perceivedLacks?.length ? `Areas to Improve: ${user.perceivedLacks.join(', ')}` : ''}`);
  }

  // Lifestyle
  if (user.stepTarget || user.travelDays || user.specialRequests) {
    sections.push(`
### Lifestyle
${user.stepTarget ? `- Daily Step Target: ${user.stepTarget} steps` : ''}
${user.travelDays ? `- Travel Days/Month: ${user.travelDays}` : ''}
${user.specialRequests ? `- Special Requests: ${user.specialRequests}` : ''}`);
  }

  if (user.planRegenerationRequest) {
    sections.push(`
### Requested Weekly Plan Changes (CRITICAL)
${user.planRegenerationRequest}`);
  }

  return sections.join('\n');
}

// ============================================================================
// STAGE 1: GENERATION PROMPT
// ============================================================================

export interface GenerationPrompt {
  system: string;
  user: string;
}

/**
 * Build the prompt for Stage 1: Plan Generation
 * Optimized for speed while including all necessary user data
 */
export function buildGenerationPrompt(user: User): GenerationPrompt {
  const calorieTarget = getCalorieTarget(user);
  const proteinTarget = getProteinTarget(user);
  const workoutSplit = getWorkoutSplit(user.trainingDays, user.preferredWorkoutSplit);
  const goalInstructions = getGoalWorkoutInstructions(user.goal);
  const levelInstructions = getLevelInstructions(user.trainingLevel);
  const userProfile = buildUserProfile(user);

  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayAssignments = dayNames.map((day, i) => `- ${day}: ${workoutSplit[i]}`).join('\n');

  // Build dietary rules
  let dietaryRules = '';
  if (user.dietaryPrefs.includes('Vegetarian')) {
    dietaryRules = `
DIETARY RULES (STRICT - VEGETARIAN):
- ABSOLUTELY NO: meat, chicken, fish, seafood, eggs
- USE ONLY: vegetables, legumes, tofu, paneer, tempeh, seitan, grains, dairy, nuts, seeds
- Protein sources: lentils, chickpeas, beans, paneer, tofu, greek yogurt, cottage cheese, quinoa`;
  } else if (user.dietaryPrefs.includes('Eggitarian')) {
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

  const system = `You are an elite fitness coach AI creating a personalized 7-day workout and nutrition plan.

${userProfile}

${user.planRegenerationRequest ? `## CURRENT USER REQUEST (CRITICAL)
- ${user.planRegenerationRequest}
- These changes override previous weekly preferences where applicable.
` : ''}

## ⚠️ NUTRITION TARGETS (CRITICAL - MUST MATCH EXACTLY)
**These values are NON-NEGOTIABLE and must appear in EVERY day's nutrition section:**
- Daily Calories: **EXACTLY ${calorieTarget} kcal** (total_kcal field)
- Daily Protein: **EXACTLY ${proteinTarget}g** (protein_g field)
- Meals per day: **EXACTLY ${user.mealCount || 3} meals**

The AI verification step will REJECT any plan where these values don't match exactly.

## WORKOUT STRUCTURE REQUIREMENTS

### Goal-Specific Instructions (${user.goal.replace('_', ' ')}):
${goalInstructions}

### Experience Level Instructions (${user.trainingLevel || 'Intermediate'}):
${levelInstructions}

### Weekly Split Assignment:
${dayAssignments}

## EQUIPMENT AVAILABLE
${user.equipment.join(', ') || 'Bodyweight only'}
- Only use exercises that can be performed with the available equipment
- If "Gym" is listed, full gym equipment is available
- If only "Bodyweight", use calisthenics and bodyweight exercises

${user.avoidExercises?.length ? `## EXERCISES TO AVOID (NEVER INCLUDE THESE)
${user.avoidExercises.join(', ')}` : ''}

${user.injuries ? `## INJURIES/LIMITATIONS (MODIFY EXERCISES ACCORDINGLY)
${user.injuries}` : ''}

${dietaryRules}

## NUTRITION STRUCTURE REQUIREMENTS
- Meals per day: EXACTLY ${user.mealCount || 3} meals (user preference - MUST generate this many)
- Include realistic portion sizes with quantities (e.g., "150g chicken breast", "1 cup rice")
- Meal naming guide for ${user.mealCount || 3} meals:
${getMealNamingGuide(user.mealCount || 3)}

**REMINDER: Every day's nutrition section MUST have:**
- "total_kcal": ${calorieTarget}
- "protein_g": ${proteinTarget}

## RECOVERY & SUPPLEMENT REQUIREMENTS

### Mobility & Sleep
- Include mobility work relevant to the day's workout
- Include sleep recommendations based on training intensity

### SUPPLEMENT RECOMMENDATIONS (AI-DRIVEN & AGE-OPTIMIZED)
You must analyze ALL user data to create a "Smart Supplement Stack" that combines their current supplements with high-impact add-ons.

**User's Current Supplement Stack:** ${user.supplements?.length ? user.supplements.join(', ') : 'None currently taking'}
${user.supplementNotes ? `**Supplement Notes:** ${user.supplementNotes}` : ''}

**CRITICAL: AGE & GOAL OPTIMIZATION LOGIC**
- **Under 30:** Focus on performance, recovery, and foundational health (Multivitamin, Vitamin D, Protein, Creatine).
- **30-45:** Add focus on stress management, energy, and early longevity (Magnesium, Omega-3s, CoQ10 if active).
- **45+:** PRIORITIZE joint health, hormonal support, and longevity (Collagen, Glucosamine, higher dose Vitamin D3+K2, Omega-3s).
- **Goal Synergy:**
  - Muscle Gain: Creatine + Protein is essential.
  - Weight Loss: Fiber (Psyllium) + Protein for satiety.
  - Sleep/Stress: Magnesium Glycinate + Ashwagandha.

**INSTRUCTIONS FOR "Smart Stack":**
1. **Analyze** the user's age (${user.age || 'Not specified'}) and goal (${user.goal.replace('_', ' ')}).
2. **Respect** their current supplements (don't duplicate, but optimize timing).
3. **Recommend** 2-4 high-impact "Add-ons" that fill gaps in their current stack.
4. **Create** a cohesive daily schedule that mixes BOTH current supplements and Add-ons.

**SUPPLEMENT REFERENCE GUIDE (use this for dosages and timing):**
${formatSupplementGuide()}

**Supplement Card Structure:**
- "current": List user's existing supplements exactly as they entered them.
- "addOns": List YOUR recommended new supplements with dosage.

**Daily Supplements List (The "supplements" array):**
- MUST contain a mix of BOTH "current" and "addOns".
- Format: "Name (Dosage) - Timing" (e.g., "Creatine Monohydrate (5g) - Post-workout", "Multivitamin - With breakfast").
- Ensure the timing makes sense (e.g., caffeine in AM, magnesium at night).

## OUTPUT FORMAT
Return ONLY valid JSON with this exact structure:
{
  "days": {
    "monday": {
      "workout": {
        "focus": ["Primary Focus"],
        "blocks": [
          {
            "name": "Warm-up",
            "items": [{"exercise": "Exercise Name", "sets": 1, "reps": "5-10 min", "RIR": 0}]
          },
          {
            "name": "Main",
            "items": [
              {"exercise": "Exercise Name", "sets": 3, "reps": "8-12", "RIR": 2}
            ]
          },
          {
            "name": "Cool-down",
            "items": [{"exercise": "Static Stretching", "sets": 1, "reps": "5 min", "RIR": 0}]
          }
        ],
        "notes": "Brief coaching notes for this workout"
      },
      "nutrition": {
        "total_kcal": ${calorieTarget},
        "protein_g": ${proteinTarget},
        "meals_per_day": ${user.mealCount || 3},
        "meals": [
          // MUST include EXACTLY ${user.mealCount || 3} meals
${generateMealExamples(user.mealCount || 3)}
        ],
        "hydration_l": 2.5
      },
      "recovery": {
        "mobility": ["Specific mobility exercise 1", "Specific mobility exercise 2"],
        "sleep": ["Sleep recommendation 1", "Sleep recommendation 2"],
        "supplements": ["Multivitamin - With breakfast", "Creatine (5g) - Post-workout"],
        "supplementCard": {
          "current": ["Multivitamin"],
          "addOns": ["Creatine (5g)"]
        }
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
5. Never include avoided exercises: ${user.avoidExercises?.join(', ') || 'none specified'}
6. Respect dietary restrictions strictly
7. RIR must be 0-5 (0 = failure, 5 = very easy)
8. Sets must be 1-10
9. Include specific exercise names, not placeholders`;

  const userPrompt = `Create my personalized 7-day fitness plan now. Return ONLY valid JSON.`;

  return { system, user: userPrompt };
}

// ============================================================================
// STAGE 2: VERIFICATION PROMPT
// ============================================================================

export interface VerificationPrompt {
  system: string;
  user: string;
}

/**
 * Build the prompt for Stage 2: Verification + Fix
 * Thorough review of the generated plan against user requirements
 */
export function buildVerificationPrompt(plan: any, user: User): VerificationPrompt {
  const calorieTarget = getCalorieTarget(user);
  const proteinTarget = getProteinTarget(user);

  // Build the checklist of requirements
  const dietaryCheck = user.dietaryPrefs.includes('Vegetarian')
    ? 'VEGETARIAN: No meat, chicken, fish, seafood, or eggs in any meal'
    : user.dietaryPrefs.includes('Eggitarian')
      ? 'EGGITARIAN: No meat, chicken, fish, or seafood (eggs are OK)'
      : 'NON-VEG: Any protein sources allowed';

  const system = `You are a fitness plan quality assurance AI. Your job is to verify a generated fitness plan and FIX any issues found.

## USER REQUIREMENTS TO VERIFY

### Dietary Requirements (CRITICAL)
- Diet Type: ${user.dietaryPrefs.join(', ') || 'No restrictions'}
- Rule: ${dietaryCheck}
${user.dietaryNotes ? `- Additional Notes: ${user.dietaryNotes}` : ''}

### Nutrition Targets (MUST MATCH)
- Daily Calories: ${calorieTarget} kcal (each day's total_kcal must be exactly this)
- Daily Protein: ${proteinTarget}g (each day's protein_g must be exactly this)
- Meals per Day: ${user.mealCount || 3}

### Equipment Available
- ${user.equipment.join(', ') || 'Bodyweight only'}
- All exercises must be performable with this equipment

### Exercises to AVOID (MUST NOT APPEAR)
${user.avoidExercises?.length ? user.avoidExercises.join(', ') : 'None specified'}

### Injuries/Limitations
${user.injuries || 'None specified'}

### Training Level
- Level: ${user.trainingLevel || 'Intermediate'}
- Beginner: simpler exercises, lower volume, higher RIR
- Intermediate: balanced approach
- Professional: advanced techniques, higher volume, lower RIR

### User's Current Supplements (for reference)
${user.supplements?.join(', ') || 'None specified'}

### Session Length
${user.sessionLength ? `Target: ${user.sessionLength} minutes per workout` : 'No specific limit'}

${user.planRegenerationRequest ? `### Requested Weekly Plan Changes (CRITICAL)
- ${user.planRegenerationRequest}` : ''}

## VERIFICATION CHECKLIST

For each day, verify:
1. ✓ COMPLETENESS: workout, nutrition, recovery, and reason fields all present
2. ✓ DIET COMPLIANCE: No forbidden foods based on dietary preference
3. ✓ EQUIPMENT MATCH: All exercises use available equipment only
4. ✓ AVOIDED EXERCISES: None of the avoided exercises appear
5. ✓ INJURY SAFETY: Exercises don't aggravate listed injuries
6. ✓ NUTRITION ACCURACY: total_kcal = ${calorieTarget}, protein_g = ${proteinTarget}
7. ✓ MEAL COUNT: EXACTLY ${user.mealCount || 3} meals in the meals array (user preference)
8. ✓ EXERCISE VALIDITY: Real exercises with proper form possible
9. ✓ TRAINING LEVEL: Appropriate complexity for ${user.trainingLevel || 'Intermediate'}
10. ✓ SUPPLEMENTS: supplementCard exists with current (user's existing) and addOns (AI recommendations)
11. ✓ STRUCTURE: Valid JSON with all required fields

## YOUR TASK

1. Review the provided plan against ALL requirements above
2. If ANY issues are found, FIX them in your response
3. Return the CORRECTED plan (or original if no issues)
4. Add a "verification" object with issues found and fixes applied

## OUTPUT FORMAT

Return ONLY valid JSON:
{
  "verified": true/false,
  "issues": ["List of issues found"],
  "fixes": ["List of fixes applied"],
  "plan": {
    "days": {
      "monday": { ... corrected day plan ... },
      ...all 7 days...
    }
  }
}

If no issues found, return:
{
  "verified": true,
  "issues": [],
  "fixes": [],
  "plan": { ...original plan unchanged... }
}`;

  const userPrompt = `Verify and fix this fitness plan:

${JSON.stringify(plan, null, 2)}

Check ALL requirements and return the corrected plan as JSON.`;

  return { system, user: userPrompt };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getCalorieTarget,
  getProteinTarget,
  getWorkoutSplit,
  calculateTDEE,
  calculateBMR,
};

