import { validateWeeklyPlan, validateDailyPlan, repairPlanData } from '@/utils/plan-schemas';
import type { User, CheckinData, WeeklyBasePlan, DailyPlan } from '@/types/user';

// AI Provider Configuration
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const FALLBACK_ENDPOINT = 'https://toolkit.rork.com/text/llm/';

/**
 * Makes a single AI request with proper token management
 */
async function makeAIRequest(prompt: string, maxTokens: number = 4096): Promise<string> {
  console.log(`🤖 Making AI request (max tokens: ${maxTokens})`);
  
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
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: maxTokens,
            candidateCount: 1,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Check for errors or blocks
        if (data.promptFeedback?.blockReason) {
          console.warn('⚠️ Gemini blocked prompt:', data.promptFeedback.blockReason);
          throw new Error('Prompt was blocked');
        }
        
        if (!data.candidates || data.candidates.length === 0) {
          console.warn('⚠️ No candidates in response');
          throw new Error('No candidates in response');
        }
        
        const text = data.candidates[0]?.content?.parts?.[0]?.text;
        if (!text) {
          console.warn('⚠️ No text in candidate response');
          throw new Error('No text in response');
        }
        
        console.log('✅ Gemini API success, response length:', text.length);
        return text;
      } else {
        const errorText = await response.text();
        console.warn('⚠️ Gemini API error:', response.status, errorText);
        throw new Error(`Gemini API error: ${response.status}`);
      }
    } catch (error) {
      console.warn('⚠️ Gemini API request failed:', error);
      // Continue to fallback
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
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Fallback API returned status ${response.status}`);
    }

    const data = await response.json();
    const text = data?.completion;
    if (!text) {
      throw new Error('No completion in fallback response');
    }

    console.log('✅ Fallback API success, response length:', text.length);
    return text;
  } catch (error) {
    console.error('❌ All AI providers failed:', error);
    throw new Error('Failed to get AI response from all providers');
  }
}

/**
 * Parses JSON from AI response with better error handling
 */
function parseAIResponse(text: string): any {
  // Remove markdown code fences
  let cleaned = text
    .replace(/^```[a-z]*\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();

  // Try direct parsing first
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('⚠️ Direct JSON parse failed, trying extraction');
  }

  // Extract JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in response');
  }

  let jsonStr = jsonMatch[0];
  
  // Fix common issues
  jsonStr = jsonStr
    .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // Quote keys
    .replace(/'/g, '"') // Single to double quotes
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control chars

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('❌ JSON parsing failed:', e);
    console.error('Problematic JSON (first 500 chars):', jsonStr.substring(0, 500));
    throw new Error('Failed to parse AI response as JSON');
  }
}

/**
 * Generates a single day's plan
 */
async function generateSingleDay(
  day: string,
  user: User,
  targetCalories: number,
  targetProtein: number,
  workoutFocus: string
): Promise<any> {
  const equipment = user.equipment.join(', ') || 'Bodyweight only';
  const diet = user.dietaryPrefs.join(', ');
  
  const prompt = `Create a ${day} fitness plan as JSON:

User: ${user.goal}, ${equipment}, ${diet}, ${user.age}yr ${user.sex}
Target: ${targetCalories} kcal, ${targetProtein}g protein
Focus: ${workoutFocus}
${user.preferredExercises?.length ? `Include: ${user.preferredExercises.join(', ')}` : ''}
${user.avoidExercises?.length ? `Avoid: ${user.avoidExercises.join(', ')}` : ''}

Return this exact JSON structure:
{
  "workout": {
    "focus": ["${workoutFocus}"],
    "blocks": [
      {
        "name": "Warm-up",
        "items": [
          {"exercise": "Dynamic stretching", "sets": 1, "reps": "5 min", "RIR": 0}
        ]
      },
      {
        "name": "Main",
        "items": [
          {"exercise": "Exercise 1", "sets": 3, "reps": "8-12", "RIR": 2},
          {"exercise": "Exercise 2", "sets": 3, "reps": "10-15", "RIR": 2},
          {"exercise": "Exercise 3", "sets": 3, "reps": "12-15", "RIR": 1}
        ]
      }
    ],
    "notes": "Workout notes"
  },
  "nutrition": {
    "total_kcal": ${targetCalories},
    "protein_g": ${targetProtein},
    "meals": [
      {"name": "Breakfast", "items": [{"food": "Food item", "qty": "Amount"}]},
      {"name": "Lunch", "items": [{"food": "Food item", "qty": "Amount"}]},
      {"name": "Dinner", "items": [{"food": "Food item", "qty": "Amount"}]}
    ],
    "hydration_l": 2.5
  },
  "recovery": {
    "mobility": ["Tip 1", "Tip 2"],
    "sleep": ["Tip 1", "Tip 2"]
  }
}

Generate for ${day}. Return ONLY the JSON object.`;

  const response = await makeAIRequest(prompt, 2048); // Smaller token limit per day
  return parseAIResponse(response);
}

/**
 * Generates a weekly base plan using chunked approach
 */
export async function generateWeeklyBasePlan(user: User): Promise<WeeklyBasePlan> {
  if (!user) {
    throw new Error('Invalid user data');
  }

  console.log('🏗️ Starting chunked weekly plan generation...');

  // Calculate nutrition targets
  const targetCalories = user.dailyCalorieTarget || 2000;
  const targetProtein = user.weight 
    ? Math.round(user.weight * 2.2 * 0.9) 
    : Math.round(targetCalories * 0.3 / 4);

  console.log(`Target: ${targetCalories} kcal, ${targetProtein}g protein`);

  // Define workout focuses based on training days
  const getWorkoutFocus = (dayIndex: number): string => {
    const splits: { [key: number]: string[] } = {
      1: ['Full Body', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest'],
      2: ['Upper Body', 'Lower Body', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest'],
      3: ['Push', 'Pull', 'Legs', 'Rest', 'Rest', 'Rest', 'Rest'],
      4: ['Upper Push', 'Lower Body', 'Upper Pull', 'Lower Body', 'Rest', 'Rest', 'Rest'],
      5: ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body', 'Rest', 'Rest'],
      6: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'],
      7: ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body', 'Active Recovery']
    };
    
    const split = splits[Math.min(user.trainingDays, 7)] || splits[3];
    return split[dayIndex] || 'Rest';
  };

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const generatedDays: { [key: string]: any } = {};

  try {
    // Generate each day individually to avoid token limits
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const workoutFocus = getWorkoutFocus(i);
      
      console.log(`📅 Generating ${day} (${workoutFocus})...`);
      
      try {
        const dayPlan = await generateSingleDay(day, user, targetCalories, targetProtein, workoutFocus);
        
        // Repair any issues
        const repairedPlan = repairPlanData(dayPlan, targetCalories, targetProtein);
        
        // Validate the day plan
        const validation = validateDailyPlan(repairedPlan);
        if (!validation.success) {
          console.warn(`⚠️ Day ${day} validation failed:`, validation.errors);
          // Use fallback for this day
          generatedDays[day] = createFallbackDay(workoutFocus, targetCalories, targetProtein, user);
        } else {
          generatedDays[day] = repairedPlan;
          console.log(`✅ ${day} generated successfully`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.warn(`⚠️ Failed to generate ${day}:`, error);
        generatedDays[day] = createFallbackDay(workoutFocus, targetCalories, targetProtein, user);
      }
    }

    // Validate the complete weekly plan
    const weeklyPlan = { days: generatedDays };
    const validation = validateWeeklyPlan(weeklyPlan);
    
    if (!validation.success) {
      console.warn('⚠️ Weekly plan validation failed:', validation.errors);
      throw new Error('Generated plan failed validation');
    }

    const basePlan: WeeklyBasePlan = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      days: generatedDays,
      isLocked: false,
    };

    console.log('✅ Chunked weekly plan generation completed successfully!');
    return basePlan;

  } catch (error) {
    console.error('❌ Chunked generation failed:', error);
    throw error; // Let the calling code handle the fallback
  }
}

/**
 * Creates a fallback day plan
 */
function createFallbackDay(focus: string, targetCalories: number, targetProtein: number, user: User): any {
  const hasGym = user.equipment.includes('Gym') || user.equipment.includes('Dumbbells');
  const isRest = focus === 'Rest' || focus === 'Active Recovery';
  
  const exercises = isRest ? [
    { exercise: 'Light walking', sets: 1, reps: '20-30 min', RIR: 0 },
    { exercise: 'Gentle stretching', sets: 1, reps: '10-15 min', RIR: 0 }
  ] : hasGym ? [
    { exercise: 'Compound movement 1', sets: 3, reps: '8-12', RIR: 2 },
    { exercise: 'Compound movement 2', sets: 3, reps: '8-12', RIR: 2 },
    { exercise: 'Accessory exercise', sets: 3, reps: '10-15', RIR: 2 }
  ] : [
    { exercise: 'Bodyweight exercise 1', sets: 3, reps: '10-15', RIR: 2 },
    { exercise: 'Bodyweight exercise 2', sets: 3, reps: '10-15', RIR: 2 },
    { exercise: 'Core exercise', sets: 3, reps: '30-60s', RIR: 1 }
  ];

  const meals = user.dietaryPrefs.includes('Vegetarian') ? [
    { name: 'Breakfast', items: [{ food: 'Oatmeal with plant protein', qty: '1 bowl' }, { food: 'Berries', qty: '1 cup' }] },
    { name: 'Lunch', items: [{ food: 'Quinoa bowl', qty: '200g' }, { food: 'Vegetables', qty: '200g' }] },
    { name: 'Dinner', items: [{ food: 'Tofu stir-fry', qty: '200g' }, { food: 'Brown rice', qty: '150g' }] }
  ] : user.dietaryPrefs.includes('Eggitarian') ? [
    { name: 'Breakfast', items: [{ food: 'Scrambled eggs', qty: '3 eggs' }, { food: 'Toast', qty: '2 slices' }] },
    { name: 'Lunch', items: [{ food: 'Egg salad', qty: '2 eggs' }, { food: 'Rice', qty: '150g' }] },
    { name: 'Dinner', items: [{ food: 'Frittata', qty: '3 eggs' }, { food: 'Salad', qty: '200g' }] }
  ] : [
    { name: 'Breakfast', items: [{ food: 'Greek yogurt with protein', qty: '200g' }, { food: 'Granola', qty: '50g' }] },
    { name: 'Lunch', items: [{ food: 'Grilled chicken', qty: '150g' }, { food: 'Sweet potato', qty: '200g' }] },
    { name: 'Dinner', items: [{ food: 'Salmon', qty: '150g' }, { food: 'Quinoa', qty: '150g' }] }
  ];

  return {
    workout: {
      focus: [focus],
      blocks: [
        {
          name: isRest ? 'Recovery' : 'Warm-up',
          items: isRest ? exercises.slice(0, 1) : [{ exercise: 'Dynamic warm-up', sets: 1, reps: '5-8 min', RIR: 0 }]
        },
        {
          name: isRest ? 'Light Movement' : 'Main Workout',
          items: isRest ? exercises.slice(1) : exercises
        }
      ],
      notes: isRest ? 'Focus on recovery and mobility' : `${focus} training day`
    },
    nutrition: {
      total_kcal: targetCalories,
      protein_g: targetProtein,
      meals,
      hydration_l: 2.5
    },
    recovery: {
      mobility: isRest ? ['Full body stretching', 'Relaxation'] : ['Post-workout stretch', 'Target worked muscles'],
      sleep: ['7-9 hours recommended', 'Consistent sleep schedule']
    }
  };
}

/**
 * Generates a daily adjusted plan (simplified for reliability)
 */
export async function generateDailyPlan(
  user: User, 
  todayCheckin: CheckinData, 
  recentCheckins: CheckinData[], 
  basePlan: WeeklyBasePlan
): Promise<DailyPlan> {
  
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

  // Apply simple adjustments based on check-in
  const energy = todayCheckin.energy || 5;
  const stress = todayCheckin.stress || 5;
  const motivation = todayCheckin.motivation || 5;
  
  let adjustments: string[] = [];
  let workout = JSON.parse(JSON.stringify(todayBasePlan.workout));
  
  // Energy-based adjustments
  if (energy < 5) {
    // Reduce volume
    if (workout.blocks && workout.blocks.length > 1) {
      const mainBlock = workout.blocks.find((b: any) => b.name.includes('Main'));
      if (mainBlock && mainBlock.items.length > 3) {
        mainBlock.items = mainBlock.items.slice(0, 3);
        adjustments.push('Reduced volume due to low energy');
      }
    }
  }
  
  // Stress-based adjustments
  if (stress > 7) {
    workout.focus = ['Recovery'];
    adjustments.push('Modified for stress management');
  }
  
  const motivationMessage = motivation >= 8 
    ? `High motivation! Channel this energy wisely 🚀`
    : motivation < 5 
    ? `Every small step counts. You've got this! 💪`
    : `Stay consistent with your ${user.goal.replace('_', ' ').toLowerCase()} goals! 🎯`;

  const dailyPlan: DailyPlan = {
    id: Date.now().toString(),
    date: new Date().toISOString().split('T')[0],
    workout,
    nutrition: {
      ...todayBasePlan.nutrition,
      total_kcal: targetCalories,
      protein_g: targetProtein
    },
    recovery: todayBasePlan.recovery,
    motivation: motivationMessage,
    adherence: 0,
    adjustments,
    isFromBasePlan: true,
  };

  console.log('✅ Daily plan generated with adjustments:', adjustments);
  return dailyPlan;
}



