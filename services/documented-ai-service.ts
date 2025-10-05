/**
 * Plan Generation System - Exact Implementation from Documentation
 * Two-Tier Architecture: Base Plan Generation + Daily Adjustment
 */

import type { User, WeeklyBasePlan, DailyPlan, CheckinData } from '@/types/user';

// API Configuration
const LLM_ENDPOINT = 'https://toolkit.rork.com/text/llm/';

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
    const basePlan: WeeklyBasePlan = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      days: parsedPlan.days,
      isLocked: false,
    };

    console.log('✅ Base plan generated successfully with', Object.keys(basePlan.days).length, 'days');
    return basePlan;

  } catch (error) {
    console.error('❌ Base plan generation failed:', error);
    
    // Fallback System: Generate adaptive plan based on user preferences
    console.log('🔄 Using adaptive fallback system...');
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
    const adjustedPlan = processAndValidateDailyPlan(response);

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
    
    // Fallback System: Apply rule-based adjustments
    console.log('🔄 Using rule-based adjustment fallback...');
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

  const systemPrompt = `You are a world-class Personal Trainer & Nutrition Specialist. 
Create a 7-Day Base Plan that EXACTLY matches the user's specific requirements. DO NOT use generic templates.

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
- Honor all special requests and limitations

Return ONLY valid JSON with this exact structure:`;

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
          {
            "name": "Cool-down",
            "items": [{"exercise": "Static stretching", "sets": 1, "reps": "5-10 min", "RIR": 0}]
          }
        ],
        "notes": "Specific training notes"
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
    "notes": "Adjustment notes"
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
  
  const requestBody = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userRequest }
    ]
  };

  const response = await fetch(LLM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();
  
  if (!data.completion) {
    throw new Error('No completion in LLM response');
  }

  console.log('✅ LLM response received:', data.completion.substring(0, 100) + '...');
  return data.completion;
}

/**
 * Step 4: JSON Processing & Validation for Base Plan
 */
function processAndValidateBasePlan(rawResponse: string): any {
  console.log('🔍 Processing base plan JSON...');
  
  // Multi-layer JSON cleaning and validation
  let cleanedResponse = rawResponse.trim();
  
  // Remove markdown code blocks
  cleanedResponse = cleanedResponse.replace(/```json\s*\n?|```\s*\n?/g, '');
  
  // Remove any text before first { and after last }
  cleanedResponse = cleanedResponse.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
  
  // Find matching braces for complete JSON extraction
  const jsonStart = cleanedResponse.indexOf('{');
  if (jsonStart === -1) {
    throw new Error('No JSON object found in response');
  }
  
  let braceCount = 0;
  let jsonEnd = -1;
  
  for (let i = jsonStart; i < cleanedResponse.length; i++) {
    if (cleanedResponse[i] === '{') braceCount++;
    if (cleanedResponse[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
  }
  
  if (jsonEnd === -1) {
    throw new Error('Incomplete JSON object in response');
  }
  
  const jsonString = cleanedResponse.substring(jsonStart, jsonEnd);
  console.log('📝 Extracted JSON length:', jsonString.length);
  
  try {
    const parsedPlan = JSON.parse(jsonString);
    
    // Validate structure
    if (!parsedPlan.days) {
      throw new Error('Missing "days" object in plan');
    }
    
    const requiredDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of requiredDays) {
      if (!parsedPlan.days[day]) {
        throw new Error(`Missing ${day} in plan`);
      }
      
      const dayPlan = parsedPlan.days[day];
      if (!dayPlan.workout || !dayPlan.nutrition || !dayPlan.recovery) {
        throw new Error(`Incomplete ${day} plan - missing workout, nutrition, or recovery`);
      }
      
      // Validate workout structure
      if (!dayPlan.workout.blocks || !Array.isArray(dayPlan.workout.blocks)) {
        throw new Error(`Invalid workout blocks for ${day}`);
      }
      
      // Validate nutrition structure
      if (!dayPlan.nutrition.meals || !Array.isArray(dayPlan.nutrition.meals)) {
        throw new Error(`Invalid nutrition meals for ${day}`);
      }
    }
    
    console.log('✅ Base plan validation passed');
    return parsedPlan;
    
  } catch (error) {
    console.error('❌ JSON parsing failed:', error);
    console.error('Problematic JSON:', jsonString.substring(0, 500));
    throw new Error(`JSON parsing failed: ${error}`);
  }
}

/**
 * Step 4: JSON Processing & Validation for Daily Plan
 */
function processAndValidateDailyPlan(rawResponse: string): any {
  console.log('🔍 Processing daily plan JSON...');
  
  // Same cleaning process as base plan
  let cleanedResponse = rawResponse.trim();
  cleanedResponse = cleanedResponse.replace(/```json\s*\n?|```\s*\n?/g, '');
  cleanedResponse = cleanedResponse.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
  
  const jsonStart = cleanedResponse.indexOf('{');
  if (jsonStart === -1) {
    throw new Error('No JSON object found in daily plan response');
  }
  
  let braceCount = 0;
  let jsonEnd = -1;
  
  for (let i = jsonStart; i < cleanedResponse.length; i++) {
    if (cleanedResponse[i] === '{') braceCount++;
    if (cleanedResponse[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
  }
  
  if (jsonEnd === -1) {
    throw new Error('Incomplete JSON object in daily plan response');
  }
  
  const jsonString = cleanedResponse.substring(jsonStart, jsonEnd);
  
  try {
    const adjustedPlan = JSON.parse(jsonString);
    
    // Validate daily plan structure
    if (!adjustedPlan.workout || !adjustedPlan.nutrition || !adjustedPlan.recovery) {
      throw new Error('Missing required sections in daily plan');
    }
    
    console.log('✅ Daily plan validation passed');
    return adjustedPlan;
    
  } catch (error) {
    console.error('❌ Daily plan JSON parsing failed:', error);
    throw new Error(`Daily plan parsing failed: ${error}`);
  }
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
  // Mifflin-St Jeor Equation
  let bmr: number;
  if (user.sex === 'Male') {
    bmr = 10 * user.weight + 6.25 * user.height - 5 * user.age + 5;
  } else {
    bmr = 10 * user.weight + 6.25 * user.height - 5 * user.age - 161;
  }
  
  // Activity multipliers
  const activityMultipliers: { [key: string]: number } = {
    'Sedentary': 1.2,
    'Lightly Active': 1.375,
    'Moderately Active': 1.55,
    'Very Active': 1.725,
    'Extremely Active': 1.9
  };
  
  const tdee = bmr * (activityMultipliers[user.activityLevel] || 1.55);
  
  // Goal-based adjustments
  if (user.goal === 'WEIGHT_LOSS') {
    return Math.round(tdee * 0.85); // -15%
  } else if (user.goal === 'MUSCLE_GAIN') {
    return Math.round(tdee * 1.15); // +15%
  }
  
  return Math.round(tdee);
}

function calculateProteinTarget(user: User): number {
  // 0.9g per lb of body weight (user.weight is in kg)
  const weightInLbs = user.weight * 2.20462;
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


