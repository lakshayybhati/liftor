import { extractAndParseJSON, validatePlanStructure, repairPlanStructure } from '@/utils/json-parser';
import type { User, CheckinData, WeeklyBasePlan, DailyPlan } from '@/types/user';

// AI Provider Configuration
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const FALLBACK_ENDPOINT = 'https://toolkit.rork.com/text/llm/';

/**
 * Makes an AI request with automatic fallback
 */
async function makeAIRequest(systemPrompt: string, userPrompt: string): Promise<string> {
  // Try Gemini first if API key is available
  if (GEMINI_API_KEY) {
    try {
      const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: systemPrompt + '\n\n' + userPrompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 32768, // Maximum allowed
            candidateCount: 1,
          },
          safetySettings: [
            {
              category: 'HARM_CATEGORY_HARASSMENT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_HATE_SPEECH',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
              threshold: 'BLOCK_NONE',
            },
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              threshold: 'BLOCK_NONE',
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Check for blocked content or errors
        if (data.promptFeedback?.blockReason) {
          console.warn('⚠️ Gemini blocked prompt:', data.promptFeedback.blockReason);
          throw new Error('Prompt was blocked');
        }
        
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          console.log('✅ Gemini API response received');
          console.log('Response length:', text.length);
          
          // Check if response seems complete
          const trimmed = text.trim();
          const looksComplete = trimmed.endsWith('}') || trimmed.endsWith(']') || 
                               trimmed.includes('"sunday"') || trimmed.includes('sunday');
          
          if (!looksComplete) {
            console.warn('⚠️ Response may be incomplete, will attempt to parse anyway');
          }
          
          return text;
        }
      } else {
        const errorText = await response.text();
        console.warn('⚠️ Gemini API error:', response.status, errorText);
        
        // Check for quota errors
        if (response.status === 429 || errorText.includes('quota')) {
          console.warn('⚠️ API quota exceeded, using fallback');
        }
      }
    } catch (error) {
      console.warn('⚠️ Gemini API request failed:', error);
    }
  }

  // Fallback to toolkit API
  try {
    console.log('🔄 Using fallback AI provider');
    const response = await fetch(FALLBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Fallback API returned status ${response.status}`);
    }

    const data = await response.json();
    const text = data?.completion;
    if (text) {
      console.log('✅ Fallback API response received');
      console.log('Response length:', text.length);
      return text;
    }

    throw new Error('No completion in fallback response');
  } catch (error) {
    console.error('❌ All AI providers failed:', error);
    throw new Error('Failed to get AI response from all providers');
  }
}

/**
 * Generates a weekly base plan for a user - with simplified approach
 */
export async function generateWeeklyBasePlan(user: User): Promise<WeeklyBasePlan> {
  if (!user) {
    throw new Error('Invalid user data');
  }

  // Calculate nutrition targets
  const targetCalories = user.dailyCalorieTarget || 2000;
  const targetProtein = user.weight 
    ? Math.round(user.weight * 2.2 * 0.9) 
    : Math.round(targetCalories * 0.3 / 4);

  // Create a simpler, more focused prompt
  const systemPrompt = `You are a fitness AI. Create a 7-day workout and nutrition plan as JSON.

Requirements:
- Goal: ${user.goal}
- Equipment: ${user.equipment.join(',') || 'Bodyweight'}
- Diet: ${user.dietaryPrefs.join(',')}
- Days/week: ${user.trainingDays}
- Calories: ${targetCalories}/day
- Protein: ${targetProtein}g/day
${user.preferredExercises?.length ? `- Include exercises: ${user.preferredExercises.join(',')}` : ''}
${user.avoidExercises?.length ? `- Avoid: ${user.avoidExercises.join(',')}` : ''}

Return a JSON object with this exact structure (keep it concise):
{
  "days": {
    "monday": {
      "workout": {
        "focus": ["Upper Body"],
        "blocks": [
          {"name": "Warm-up", "items": [{"exercise": "Dynamic stretching", "sets": 1, "reps": "5 min", "RIR": 0}]},
          {"name": "Main", "items": [
            {"exercise": "Exercise 1", "sets": 3, "reps": "8-12", "RIR": 2},
            {"exercise": "Exercise 2", "sets": 3, "reps": "10-15", "RIR": 2}
          ]}
        ],
        "notes": "Focus on form"
      },
      "nutrition": {
        "total_kcal": ${targetCalories},
        "protein_g": ${targetProtein},
        "meals": [
          {"name": "Breakfast", "items": [{"food": "Eggs", "qty": "3"}, {"food": "Oats", "qty": "50g"}]},
          {"name": "Lunch", "items": [{"food": "Chicken", "qty": "150g"}, {"food": "Rice", "qty": "100g"}]},
          {"name": "Dinner", "items": [{"food": "Fish", "qty": "150g"}, {"food": "Vegetables", "qty": "200g"}]}
        ],
        "hydration_l": 2.5
      },
      "recovery": {
        "mobility": ["Stretch 10min", "Foam roll"],
        "sleep": ["7-8 hours", "Dark room"]
      }
    },
    "tuesday": {similar structure},
    "wednesday": {similar structure},
    "thursday": {similar structure},
    "friday": {similar structure},
    "saturday": {similar structure},
    "sunday": {similar structure}
  }
}`;

  const userPrompt = `Create the 7-day plan now. Keep responses concise. Return ONLY valid JSON.`;

  try {
    console.log('🏗️ Generating 7-Day Base Plan...');
    console.log('Target calories:', targetCalories);
    console.log('Target protein:', targetProtein);
    console.log('Equipment:', user.equipment.join(', ') || 'Bodyweight');
    console.log('Goal:', user.goal);
    
    const aiResponse = await makeAIRequest(systemPrompt, userPrompt);
    
    // Parse the response
    let parsedPlan;
    try {
      parsedPlan = extractAndParseJSON(aiResponse);
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', parseError);
      
      // Try a simpler extraction
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsedPlan = JSON.parse(jsonMatch[0]);
        } catch (e) {
          throw new Error('Could not parse AI response as JSON');
        }
      } else {
        throw new Error('No JSON found in AI response');
      }
    }
    
    // Validate structure
    if (!validatePlanStructure(parsedPlan, 'weekly')) {
      console.warn('⚠️ Plan structure validation failed, repairing...');
      parsedPlan = repairPlanStructure(parsedPlan, 'weekly', targetCalories, targetProtein);
      
      if (!validatePlanStructure(parsedPlan, 'weekly')) {
        console.warn('⚠️ Repair failed, using fallback');
        throw new Error('Invalid plan structure after repair');
      }
    }

    // Ensure all days have correct calorie and protein values
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      if (parsedPlan.days[day]?.nutrition) {
        parsedPlan.days[day].nutrition.total_kcal = targetCalories;
        parsedPlan.days[day].nutrition.protein_g = targetProtein;
      }
    }

    const basePlan: WeeklyBasePlan = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      days: parsedPlan.days,
      isLocked: false,
    };

    console.log('✅ Base plan generated successfully');
    return basePlan;

  } catch (error) {
    console.error('❌ Error generating base plan:', error);
    
    // Return a comprehensive fallback plan
    console.log('🔧 Creating fallback base plan...');
    return createFallbackBasePlan(user, targetCalories, targetProtein);
  }
}

/**
 * Generates a daily adjusted plan based on check-in data
 */
export async function generateDailyPlan(
  user: User, 
  todayCheckin: CheckinData, 
  recentCheckins: CheckinData[], 
  basePlan: WeeklyBasePlan
): Promise<DailyPlan> {
  if (!user || !todayCheckin || !basePlan) {
    throw new Error('Missing required data for daily plan generation');
  }

  // Get today's base plan
  const today = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayKey = dayNames[today.getDay()];
  const todayBasePlan = basePlan.days[todayKey];

  if (!todayBasePlan) {
    throw new Error(`No base plan found for ${todayKey}`);
  }

  // Calculate nutrition targets
  const targetCalories = user.dailyCalorieTarget || 2000;
  const targetProtein = user.weight 
    ? Math.round(user.weight * 2.2 * 0.9) 
    : Math.round(targetCalories * 0.3 / 4);

  // For now, apply simple adjustments based on check-in without AI
  // This ensures reliability while we fix the AI integration
  const adjustedPlan = applyCheckInAdjustments(
    todayBasePlan,
    todayCheckin,
    targetCalories,
    targetProtein,
    user
  );

  const dailyPlan: DailyPlan = {
    id: Date.now().toString(),
    date: new Date().toISOString().split('T')[0],
    ...adjustedPlan,
    adherence: 0,
    isFromBasePlan: true,
  };

  console.log('✅ Daily plan generated successfully');
  return dailyPlan;
}

/**
 * Apply check-in based adjustments without AI
 */
function applyCheckInAdjustments(
  basePlan: any,
  checkin: CheckinData,
  targetCalories: number,
  targetProtein: number,
  user: User
): any {
  const energy = checkin.energy || 5;
  const stress = checkin.stress || 5;
  const soreness = checkin.soreness || [];
  const motivation = checkin.motivation || 5;
  
  let workout = JSON.parse(JSON.stringify(basePlan.workout));
  let adjustments: string[] = [];
  
  // Energy adjustments
  if (energy < 5) {
    // Reduce volume for low energy
    if (workout.blocks && workout.blocks.length > 1) {
      const mainBlock = workout.blocks.find((b: any) => b.name === 'Main' || b.name === 'Main Workout');
      if (mainBlock && mainBlock.items.length > 3) {
        mainBlock.items = mainBlock.items.slice(0, 3);
        adjustments.push('Reduced volume due to low energy');
      }
      // Increase RIR (reduce intensity)
      mainBlock?.items.forEach((item: any) => {
        if (item.RIR < 3) item.RIR = 3;
      });
    }
    workout.notes = 'Lower energy day - focus on movement quality over intensity';
  }
  
  // Stress adjustments
  if (stress > 7) {
    workout.focus = ['Recovery', 'Mobility'];
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
    adjustments.push('Modified for stress management');
  }
  
  // Soreness adjustments
  if (soreness.length > 0) {
    adjustments.push(`Adjusted for soreness in: ${soreness.join(', ')}`);
    workout.notes = `Be mindful of soreness in: ${soreness.join(', ')}. Modify exercises as needed.`;
  }
  
  // Motivation boost
  let motivationMessage = '';
  if (motivation >= 8) {
    motivationMessage = `High motivation detected! Channel this energy wisely - quality over quantity! 🚀`;
  } else if (motivation < 5) {
    motivationMessage = `Remember why you started. Small steps lead to big changes. You've got this! 💪`;
  } else {
    motivationMessage = `Consistency is key. Every workout counts toward your ${user.goal.replace('_', ' ').toLowerCase()} goals! 🎯`;
  }
  
  return {
    workout,
    nutrition: {
      ...basePlan.nutrition,
      total_kcal: targetCalories,
      protein_g: targetProtein
    },
    recovery: {
      ...basePlan.recovery,
      mobility: energy < 5 ? 
        ['Gentle stretching', 'Focus on breathing'] :
        basePlan.recovery.mobility,
      sleep: stress > 7 ?
        ['Prioritize sleep tonight', 'Try meditation before bed'] :
        basePlan.recovery.sleep
    },
    motivation: motivationMessage,
    adjustments
  };
}

/**
 * Creates a comprehensive fallback base plan when AI fails
 */
function createFallbackBasePlan(user: User, targetCalories: number, targetProtein: number): WeeklyBasePlan {
  const hasGym = user.equipment.includes('Gym') || user.equipment.includes('Dumbbells');
  const isVegetarian = user.dietaryPrefs.includes('Vegetarian');
  const isEggitarian = user.dietaryPrefs.includes('Eggitarian');
  
  // Define workout splits based on training days
  const getWorkoutFocus = (dayIndex: number, trainingDays: number): string => {
    const splits: { [key: number]: string[] } = {
      1: ['Full Body'],
      2: ['Upper Body', 'Lower Body'],
      3: ['Push', 'Pull', 'Legs'],
      4: ['Upper Push', 'Lower Body', 'Upper Pull', 'Lower Body'],
      5: ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body'],
      6: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'],
      7: ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body', 'Active Recovery']
    };
    
    const split = splits[Math.min(trainingDays, 7)] || splits[3];
    return dayIndex < split.length ? split[dayIndex] : 'Active Recovery';
  };
  
  // Create meals based on dietary preference
  const createMeals = () => {
    const baseBreakfast = isVegetarian ? [
      { food: 'Oatmeal with plant protein', qty: '1 bowl (300g)' },
      { food: 'Mixed berries', qty: '150g' },
      { food: 'Almond butter', qty: '2 tbsp' }
    ] : isEggitarian ? [
      { food: 'Scrambled eggs', qty: '3 large' },
      { food: 'Whole grain toast', qty: '2 slices' },
      { food: 'Avocado', qty: '1/2 medium' }
    ] : [
      { food: 'Greek yogurt', qty: '200g' },
      { food: 'Protein powder', qty: '1 scoop' },
      { food: 'Granola', qty: '50g' },
      { food: 'Banana', qty: '1 medium' }
    ];
    
    const baseLunch = isVegetarian ? [
      { food: 'Quinoa bowl', qty: '200g cooked' },
      { food: 'Chickpeas', qty: '150g' },
      { food: 'Mixed vegetables', qty: '200g' },
      { food: 'Tahini dressing', qty: '2 tbsp' }
    ] : isEggitarian ? [
      { food: 'Egg salad', qty: '3 eggs' },
      { food: 'Brown rice', qty: '150g cooked' },
      { food: 'Green salad', qty: '200g' },
      { food: 'Olive oil', qty: '1 tbsp' }
    ] : [
      { food: 'Grilled chicken breast', qty: '150g' },
      { food: 'Sweet potato', qty: '200g' },
      { food: 'Steamed broccoli', qty: '150g' },
      { food: 'Olive oil', qty: '1 tbsp' }
    ];
    
    const baseDinner = isVegetarian ? [
      { food: 'Tofu stir-fry', qty: '200g tofu' },
      { food: 'Brown rice', qty: '150g cooked' },
      { food: 'Stir-fry vegetables', qty: '250g' },
      { food: 'Soy sauce', qty: '1 tbsp' }
    ] : isEggitarian ? [
      { food: 'Vegetable frittata', qty: '3 eggs' },
      { food: 'Quinoa', qty: '150g cooked' },
      { food: 'Side salad', qty: '150g' },
      { food: 'Balsamic vinegar', qty: '1 tbsp' }
    ] : [
      { food: 'Salmon fillet', qty: '150g' },
      { food: 'Jasmine rice', qty: '150g cooked' },
      { food: 'Asparagus', qty: '150g' },
      { food: 'Lemon', qty: '1/2' }
    ];
    
    return [
      { name: 'Breakfast', items: baseBreakfast },
      { name: 'Lunch', items: baseLunch },
      { name: 'Snack', items: [
        { food: 'Protein shake or bar', qty: '1 serving' },
        { food: 'Apple', qty: '1 medium' }
      ]},
      { name: 'Dinner', items: baseDinner }
    ];
  };
  
  // Create exercises based on equipment
  const createExercises = (focus: string, hasEquipment: boolean) => {
    const exercises: { [key: string]: any[] } = {
      'Push': hasEquipment ? [
        { exercise: 'Barbell Bench Press', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Dumbbell Shoulder Press', sets: 3, reps: '10-12', RIR: 2 },
        { exercise: 'Dips', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Cable Flyes', sets: 3, reps: '12-15', RIR: 1 }
      ] : [
        { exercise: 'Push-ups', sets: 3, reps: '10-15', RIR: 2 },
        { exercise: 'Pike Push-ups', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Diamond Push-ups', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Dips (using chairs)', sets: 3, reps: '10-15', RIR: 1 }
      ],
      'Pull': hasEquipment ? [
        { exercise: 'Pull-ups', sets: 3, reps: '6-12', RIR: 2 },
        { exercise: 'Barbell Rows', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Face Pulls', sets: 3, reps: '12-15', RIR: 1 },
        { exercise: 'Bicep Curls', sets: 3, reps: '10-15', RIR: 1 }
      ] : [
        { exercise: 'Pull-ups (or door pulls)', sets: 3, reps: 'Max', RIR: 2 },
        { exercise: 'Inverted Rows', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Superman', sets: 3, reps: '12-15', RIR: 1 },
        { exercise: 'Reverse Flyes', sets: 3, reps: '12-15', RIR: 1 }
      ],
      'Legs': hasEquipment ? [
        { exercise: 'Barbell Squats', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Romanian Deadlifts', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Leg Press', sets: 3, reps: '10-15', RIR: 2 },
        { exercise: 'Calf Raises', sets: 3, reps: '15-20', RIR: 1 }
      ] : [
        { exercise: 'Bodyweight Squats', sets: 3, reps: '15-20', RIR: 2 },
        { exercise: 'Lunges', sets: 3, reps: '10-12 per leg', RIR: 2 },
        { exercise: 'Single-leg Deadlifts', sets: 3, reps: '10-12 per leg', RIR: 2 },
        { exercise: 'Calf Raises', sets: 3, reps: '20-25', RIR: 1 }
      ],
      'Upper Body': hasEquipment ? [
        { exercise: 'Bench Press', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Bent-over Rows', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Overhead Press', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Lat Pulldowns', sets: 3, reps: '10-15', RIR: 1 }
      ] : [
        { exercise: 'Push-ups', sets: 3, reps: '10-15', RIR: 2 },
        { exercise: 'Pull-ups', sets: 3, reps: 'Max', RIR: 2 },
        { exercise: 'Pike Push-ups', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Inverted Rows', sets: 3, reps: '10-15', RIR: 1 }
      ],
      'Lower Body': hasEquipment ? [
        { exercise: 'Squats', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Leg Curls', sets: 3, reps: '10-15', RIR: 2 },
        { exercise: 'Leg Extensions', sets: 3, reps: '10-15', RIR: 2 },
        { exercise: 'Walking Lunges', sets: 3, reps: '10-12 per leg', RIR: 1 }
      ] : [
        { exercise: 'Jump Squats', sets: 3, reps: '10-15', RIR: 2 },
        { exercise: 'Bulgarian Split Squats', sets: 3, reps: '10-12 per leg', RIR: 2 },
        { exercise: 'Glute Bridges', sets: 3, reps: '15-20', RIR: 2 },
        { exercise: 'Wall Sits', sets: 3, reps: '30-60s', RIR: 1 }
      ],
      'Full Body': hasEquipment ? [
        { exercise: 'Deadlifts', sets: 3, reps: '6-10', RIR: 2 },
        { exercise: 'Bench Press', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Squats', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Pull-ups', sets: 3, reps: '6-12', RIR: 1 }
      ] : [
        { exercise: 'Burpees', sets: 3, reps: '8-12', RIR: 2 },
        { exercise: 'Mountain Climbers', sets: 3, reps: '20-30', RIR: 2 },
        { exercise: 'Push-ups', sets: 3, reps: '10-15', RIR: 2 },
        { exercise: 'Jump Squats', sets: 3, reps: '10-15', RIR: 1 }
      ],
      'Active Recovery': [
        { exercise: 'Light Walking', sets: 1, reps: '20-30 min', RIR: 0 },
        { exercise: 'Yoga Flow', sets: 1, reps: '15-20 min', RIR: 0 },
        { exercise: 'Foam Rolling', sets: 1, reps: '10 min', RIR: 0 }
      ]
    };
    
    // Include preferred exercises if specified
    let selectedExercises = exercises[focus] || exercises['Full Body'];
    
    if (user.preferredExercises?.length) {
      // Add preferred exercises at the beginning if they match the focus
      const preferred = user.preferredExercises.map(ex => ({
        exercise: ex,
        sets: 3,
        reps: '8-12',
        RIR: 2
      }));
      selectedExercises = [...preferred.slice(0, 2), ...selectedExercises.slice(0, 2)];
    }
    
    // Remove avoided exercises
    if (user.avoidExercises?.length) {
      selectedExercises = selectedExercises.filter(ex => 
        !user.avoidExercises?.some(avoid => 
          ex.exercise.toLowerCase().includes(avoid.toLowerCase())
        )
      );
    }
    
    return selectedExercises.slice(0, 4); // Limit to 4 exercises
  };
  
  const days: WeeklyBasePlan['days'] = {};
  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  dayNames.forEach((day, index) => {
    const isTrainingDay = index < user.trainingDays;
    const workoutFocus = getWorkoutFocus(index, user.trainingDays);
    const isRestDay = !isTrainingDay || workoutFocus === 'Active Recovery';
    
    days[day] = {
      workout: {
        focus: [workoutFocus],
        blocks: [
          {
            name: 'Warm-up',
            items: [
              { exercise: isRestDay ? 'Light stretching' : 'Dynamic warm-up', sets: 1, reps: '5-10 min', RIR: 0 }
            ]
          },
          {
            name: isRestDay ? 'Recovery' : 'Main Workout',
            items: isRestDay ? 
              createExercises('Active Recovery', false) :
              createExercises(workoutFocus, hasGym)
          },
          ...(isRestDay ? [] : [{
            name: 'Cool-down',
            items: [
              { exercise: 'Static stretching', sets: 1, reps: '5-10 min', RIR: 0 }
            ]
          }])
        ],
        notes: isRestDay ? 
          'Focus on recovery and mobility' : 
          `${workoutFocus} day - Progressive overload is key`
      },
      nutrition: {
        total_kcal: targetCalories,
        protein_g: targetProtein,
        meals: createMeals(),
        hydration_l: 2.5
      },
      recovery: {
        mobility: isRestDay ? 
          ['Full body stretching routine', 'Focus on tight areas', 'Consider massage or foam rolling'] :
          ['Post-workout stretching', `Focus on ${workoutFocus.toLowerCase()} muscles`, 'Hydrate well'],
        sleep: [
          'Aim for 7-9 hours',
          isRestDay ? 'Use this day to catch up on sleep' : 'Prioritize sleep for recovery',
          'Keep bedroom cool and dark'
        ]
      }
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
 * Generates a personalized motivational message
 */
function generateMotivationalMessage(checkin: CheckinData, user: User): string {
  const energy = checkin.energy || 5;
  const motivation = checkin.motivation || 5;
  
  if (energy < 5 && motivation < 5) {
    return "Rest is part of progress. Listen to your body and be gentle with yourself today. Tomorrow is a new opportunity! 🌱";
  } else if (energy >= 7 && motivation >= 7) {
    return `You're feeling great! Channel this energy into crushing your ${user.goal.replace('_', ' ').toLowerCase()} goals! 🚀`;
  } else if (motivation < 5) {
    return "Motivation follows action. Start small, and momentum will build. You've got this! 💪";
  } else if (energy < 5) {
    return "Low energy days happen. Focus on movement that feels good. Progress, not perfection! 🎯";
  } else {
    const personalGoal = user.personalGoals?.[0];
    return personalGoal 
      ? `Every workout brings you closer to ${personalGoal}. Stay consistent! 💫`
      : "Consistency beats perfection. Keep showing up and results will follow! 🔥";
  }
}