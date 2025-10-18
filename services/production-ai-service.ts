import { validateWeeklyPlan, validateDailyPlan, repairPlanData } from '@/utils/plan-schemas';
import { productionMonitor } from '@/utils/production-monitor';
import type { User, CheckinData, WeeklyBasePlan, DailyPlan } from '@/types/user';
import { generateAICompletion, type Message } from '@/utils/ai-client';

// Production-ready configuration
const PRODUCTION_CONFIG = {
  MAX_TOKENS_PER_REQUEST: 1024, // Smaller for reliability
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  REQUEST_TIMEOUT: 120000,
  RATE_LIMIT_DELAY: 800, // Prevent rate limiting
};

// Context cache for hierarchical memory
const contextCache = new Map<string, string>();

/**
 * Production-ready AI request with advanced error handling and optimization
 */
async function makeProductionAIRequest(
  prompt: string, 
  context: string = '',
  maxTokens: number = PRODUCTION_CONFIG.MAX_TOKENS_PER_REQUEST
): Promise<string> {
  
  // Optimize prompt using hierarchical context
  const optimizedPrompt = optimizePrompt(prompt, context).slice(-6000); // hard cap prompt length
  console.log(`🚀 Production AI request (${optimizedPrompt.length} chars, max tokens: ${maxTokens})`);
  
  let lastError: Error | null = null;
  
  // Retry mechanism with exponential backoff
  for (let attempt = 1; attempt <= PRODUCTION_CONFIG.MAX_RETRIES; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${PRODUCTION_CONFIG.MAX_RETRIES}`);
      
      const response = await makeAIRequestWithTimeout(optimizedPrompt, maxTokens);
      
      // Check for truncation using finish_reason equivalent
      const isComplete = checkResponseCompleteness(response);
      
      if (!isComplete) {
        console.log('⚠️ Response appears truncated, attempting continuation...');
        const continuedResponse = await handleTruncatedResponse(response, optimizedPrompt, maxTokens);
        return continuedResponse;
      }
      
      console.log(`✅ Complete response received (${response.length} chars)`);
      return response;
      
    } catch (error) {
      lastError = error as Error;
      console.warn(`⚠️ Attempt ${attempt} failed:`, error);
      
      if (attempt < PRODUCTION_CONFIG.MAX_RETRIES) {
        const delay = Math.min(1500, PRODUCTION_CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1));
        console.log(`⏱️ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`All ${PRODUCTION_CONFIG.MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`);
}

/**
 * Optimized prompt engineering with sparse attention
 */
function optimizePrompt(prompt: string, context: string): string {
  // Generate cache key for context
  const contextKey = generateContextKey(context);
  
  // Check if we have cached summary for this context
  const cachedContext = contextCache.get(contextKey);
  
  // Use summarized context if available
  const optimizedContext = cachedContext || summarizeContext(context);
  
  // Cache the summarized context
  if (!cachedContext && context) {
    contextCache.set(contextKey, optimizedContext);
  }
  
  // Apply adaptive token masking - remove redundant phrases
  let optimizedPrompt = prompt
    .replace(/please\s+/gi, '') // Remove politeness tokens
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\b(the|a|an)\s+/g, '') // Remove articles where not critical
    .replace(/\b(very|really|quite|rather)\s+/g, '') // Remove intensifiers
    .trim();
  
  // Combine with optimized context
  if (optimizedContext) {
    optimizedPrompt = `${optimizedContext}\n\n${optimizedPrompt}`;
  }
  
  return optimizedPrompt;
}

/**
 * Make AI request using the central AI client with DeepSeek → Gemini → Rork fallback
 */
async function makeAIRequestWithTimeout(prompt: string, maxTokens: number): Promise<string> {
  try {
    const messages: Message[] = [
      { role: 'user', content: prompt }
    ];
    
    // Use the central AI client which handles DeepSeek → Gemini → Rork fallback chain
    const response = await generateAICompletion(messages);
    
    if (!response.completion) {
      throw new Error('No completion in AI response');
    }
    
    console.log('✅ AI response received');
    return response.completion;
    
  } catch (error) {
    console.error('❌ AI request failed:', error);
    throw error;
  }
}

/**
 * Check if response is complete or truncated
 */
function checkResponseCompleteness(response: string): boolean {
  const trimmed = response.trim();
  
  // Check for proper JSON ending
  if (trimmed.includes('{')) {
    return trimmed.endsWith('}') || trimmed.endsWith(']}');
  }
  
  // Check for complete sentences
  const lastChar = trimmed[trimmed.length - 1];
  return ['.', '!', '?', '}', ']', '"'].includes(lastChar);
}

/**
 * Handle truncated responses with iterative continuation
 */
async function handleTruncatedResponse(
  truncatedResponse: string, 
  originalPrompt: string, 
  maxTokens: number
): Promise<string> {
  console.log('🔄 Handling truncated response...');
  
  // Find the last complete sentence or JSON structure
  const lastCompleteIndex = findLastCompleteStructure(truncatedResponse);
  const completePartial = truncatedResponse.substring(0, lastCompleteIndex);
  
  // Create continuation prompt
  const continuationPrompt = `Continue from where you left off. Here's what you provided so far:

${completePartial}

Continue and complete the response. Return ONLY the continuation part.`;

  try {
    const continuation = await makeAIRequestWithTimeout(continuationPrompt, maxTokens);
    const fullResponse = completePartial + continuation;
    
    console.log('✅ Successfully continued truncated response');
    return fullResponse;
  } catch (error) {
    console.warn('⚠️ Failed to continue truncated response:', error);
    return truncatedResponse; // Return partial response
  }
}

/**
 * Find the last complete structure in truncated text
 */
function findLastCompleteStructure(text: string): number {
  // For JSON, find last complete object/array
  if (text.includes('{')) {
    let depth = 0;
    let lastComplete = 0;
    let inString = false;
    let escape = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (inString) {
        if (escape) {
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          lastComplete = i + 1;
        }
      }
    }
    
    return lastComplete;
  }
  
  // For text, find last complete sentence
  const sentences = text.split(/[.!?]+/);
  return sentences.slice(0, -1).join('.').length + 1;
}

/**
 * Generate context key for caching
 */
function generateContextKey(context: string): string {
  // Simple hash function for context
  let hash = 0;
  for (let i = 0; i < context.length; i++) {
    const char = context.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Summarize context using hierarchical compression
 */
function summarizeContext(context: string): string {
  if (context.length < 200) return context;
  
  // Extract key information
  const keyPhrases = [
    'Goal:', 'Equipment:', 'Diet:', 'Age:', 'Weight:', 'Height:',
    'Training days:', 'Supplements:', 'Preferred:', 'Avoid:', 'Calories:', 'Protein:'
  ];
  
  const summary = keyPhrases
    .map(phrase => {
      const match = context.match(new RegExp(`${phrase}[^\\n]*`, 'i'));
      return match ? match[0] : null;
    })
    .filter(Boolean)
    .join(', ');
  
  return summary || context.substring(0, 300) + '...';
}

/**
 * Production-ready weekly plan generation with staged processing
 */
export async function generateWeeklyBasePlan(user: User): Promise<WeeklyBasePlan> {
  const startTime = Date.now();
  console.log('🏗️ Starting production plan generation...');
  
  let success = false;
  let aiUsed = false;
  let validationPassed = false;
  const errors: string[] = [];
  
  // Stage 1: Data Identification and Extraction
  const { targetCalories, targetProtein, userContext } = extractCoreData(user);
  console.log(`📊 Core data: ${targetCalories} kcal, ${targetProtein}g protein`);
  
  // Stage 2: Data Analysis and Context Building
  const workoutSplits = analyzeWorkoutRequirements(user);
  const nutritionProfile = analyzeNutritionRequirements(user);
  console.log(`🎯 Analysis complete: ${workoutSplits.length} workout variations`);
  
  // Stage 3: Automated Response Construction (Staged Generation)
  const generatedDays: { [key: string]: any } = {};
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const workoutFocus = workoutSplits[i % workoutSplits.length];
    
    console.log(`📅 Generating ${day} (${workoutFocus})...`);
    
    try {
      // Generate day with hierarchical context
      const dayPlan = await generateOptimizedDay(
        day,
        workoutFocus,
        targetCalories,
        targetProtein,
        userContext,
        nutritionProfile
      );
      
      // Validate and repair
      const repairedPlan = repairPlanData(dayPlan, targetCalories, targetProtein);
      const validation = validateDailyPlan(repairedPlan);
      
      if (validation.success) {
        generatedDays[day] = repairedPlan;
        console.log(`✅ ${day} validated successfully`);
      } else {
        console.warn(`⚠️ ${day} validation failed, using optimized fallback`);
        generatedDays[day] = createOptimizedFallback(day, workoutFocus, targetCalories, targetProtein, user);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, PRODUCTION_CONFIG.RATE_LIMIT_DELAY));
      
    } catch (error) {
      console.warn(`⚠️ ${day} generation failed:`, error);
      generatedDays[day] = createOptimizedFallback(day, workoutFocus, targetCalories, targetProtein, user);
    }
  }
  
  // Final validation
  const weeklyPlan = { days: generatedDays };
  const finalValidation = validateWeeklyPlan(weeklyPlan);
  
  if (!finalValidation.success) {
    console.error('❌ Final validation failed:', finalValidation.errors);
    throw new Error('Generated plan failed final validation');
  }
  
  console.log('✅ Production plan generation completed successfully!');
  
  return {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    days: generatedDays,
    isLocked: false,
  };
}

/**
 * Extract core data with optimization
 */
function extractCoreData(user: User) {
  const targetCalories = user.dailyCalorieTarget || 
    (user.goal === 'WEIGHT_LOSS' ? 1800 : user.goal === 'MUSCLE_GAIN' ? 2800 : 2200);
  
  const targetProtein = user.weight 
    ? Math.round(user.weight * 2.2 * (user.goal === 'MUSCLE_GAIN' ? 1.0 : 0.9))
    : Math.round(targetCalories * 0.3 / 4);
  
  // Compressed user context
  const userContext = [
    `${user.goal}`,
    `${user.equipment.join(',')}`,
    `${user.dietaryPrefs.join(',')}`,
    `${user.age}y ${user.sex}`,
    `${user.weight}kg ${user.height}cm`,
    user.preferredExercises?.join(','),
    user.avoidExercises?.join(','),
  ].filter(Boolean).join('|');
  
  return { targetCalories, targetProtein, userContext };
}

/**
 * Analyze workout requirements
 */
function analyzeWorkoutRequirements(user: User): string[] {
  const splitMap: { [key: number]: string[] } = {
    1: ['Full Body'],
    2: ['Upper', 'Lower'],
    3: ['Push', 'Pull', 'Legs'],
    4: ['Push', 'Pull', 'Legs', 'Upper'],
    5: ['Push', 'Pull', 'Legs', 'Push', 'Pull'],
    6: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'],
    7: ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full', 'Recovery']
  };
  
  return splitMap[Math.min(user.trainingDays, 7)] || splitMap[3];
}

/**
 * Analyze nutrition requirements
 */
function analyzeNutritionRequirements(user: User): string {
  const profile = [];
  
  if (user.dietaryPrefs.includes('Vegetarian')) {
    profile.push('plant-based proteins, legumes, nuts');
  } else if (user.dietaryPrefs.includes('Eggitarian')) {
    profile.push('eggs, dairy, plant proteins');
  } else {
    profile.push('lean meats, fish, eggs, dairy');
  }
  
  if (user.goal === 'MUSCLE_GAIN') {
    profile.push('high protein, complex carbs');
  } else if (user.goal === 'WEIGHT_LOSS') {
    profile.push('lean proteins, high fiber');
  }
  
  return profile.join(', ');
}

/**
 * Generate optimized day with minimal tokens
 */
async function generateOptimizedDay(
  day: string,
  focus: string,
  calories: number,
  protein: number,
  userContext: string,
  nutritionProfile: string
): Promise<any> {
  
  // Ultra-optimized prompt
  const prompt = `${day} plan:
User: ${userContext}
Focus: ${focus}
Nutrition: ${nutritionProfile}
Target: ${calories}kcal, ${protein}g protein

JSON:
{"workout":{"focus":["${focus}"],"blocks":[{"name":"Warmup","items":[{"exercise":"Dynamic stretch","sets":1,"reps":"5min","RIR":0}]},{"name":"Main","items":[{"exercise":"Ex1","sets":3,"reps":"8-12","RIR":2},{"exercise":"Ex2","sets":3,"reps":"10-15","RIR":2}]}],"notes":"${focus} day"},"nutrition":{"total_kcal":${calories},"protein_g":${protein},"meals":[{"name":"Breakfast","items":[{"food":"Food1","qty":"Amount"}]},{"name":"Lunch","items":[{"food":"Food2","qty":"Amount"}]},{"name":"Dinner","items":[{"food":"Food3","qty":"Amount"}]}],"hydration_l":2.5},"recovery":{"mobility":["Stretch"],"sleep":["7-8hrs"]}}`;

  const response = await makeProductionAIRequest(prompt, userContext, 1024);
  return parseOptimizedResponse(response);
}

/**
 * Parse response with advanced error handling
 */
function parseOptimizedResponse(text: string): any {
  // Clean response
  let cleaned = text
    .replace(/^```[a-z]*\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .replace(/^\s*JSON:\s*/i, '')
    .trim();
  
  // Extract JSON
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }
  
  let jsonStr = jsonMatch[0];
  
  // Fix common issues
  jsonStr = jsonStr
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/'/g, '"')
    .replace(/[\x00-\x1F\x7F]/g, '');
  
  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('JSON parse error:', error);
    console.error('Problematic JSON:', jsonStr.substring(0, 200));
    throw new Error('Failed to parse JSON response');
  }
}

/**
 * Create optimized fallback with user preferences
 */
function createOptimizedFallback(
  day: string,
  focus: string,
  calories: number,
  protein: number,
  user: User
): any {
  const hasGym = user.equipment.includes('Gym');
  const isRest = focus === 'Recovery';
  
  // Smart exercise selection
  const exerciseDb = {
    Push: hasGym ? ['Bench Press', 'Shoulder Press', 'Dips'] : ['Push-ups', 'Pike Push-ups', 'Tricep Dips'],
    Pull: hasGym ? ['Pull-ups', 'Rows', 'Face Pulls'] : ['Pull-ups', 'Inverted Rows', 'Superman'],
    Legs: hasGym ? ['Squats', 'Deadlifts', 'Lunges'] : ['Bodyweight Squats', 'Lunges', 'Single-leg Deadlifts'],
    Upper: hasGym ? ['Bench Press', 'Rows', 'Curls'] : ['Push-ups', 'Pull-ups', 'Tricep Dips'],
    Lower: hasGym ? ['Squats', 'Leg Curls', 'Calf Raises'] : ['Squats', 'Glute Bridges', 'Calf Raises'],
    Full: hasGym ? ['Deadlifts', 'Squats', 'Pull-ups'] : ['Burpees', 'Mountain Climbers', 'Jump Squats'],
    Recovery: ['Walking', 'Stretching', 'Yoga']
  };
  
  const exercises = (exerciseDb[focus as keyof typeof exerciseDb] || exerciseDb.Full).map(ex => ({
    exercise: ex,
    sets: isRest ? 1 : 3,
    reps: isRest ? '15-20min' : '8-12',
    RIR: isRest ? 0 : 2
  }));
  
  // Smart meal selection
  const mealDb = {
    Vegetarian: [
      { name: 'Breakfast', items: [{ food: 'Oats + plant protein', qty: '80g' }] },
      { name: 'Lunch', items: [{ food: 'Quinoa bowl + legumes', qty: '200g' }] },
      { name: 'Dinner', items: [{ food: 'Tofu stir-fry + rice', qty: '250g' }] }
    ],
    Eggitarian: [
      { name: 'Breakfast', items: [{ food: 'Eggs + toast', qty: '3 eggs + 2 slices' }] },
      { name: 'Lunch', items: [{ food: 'Egg salad + rice', qty: '2 eggs + 150g rice' }] },
      { name: 'Dinner', items: [{ food: 'Frittata + salad', qty: '3 eggs + 200g salad' }] }
    ],
    'Non-veg': [
      { name: 'Breakfast', items: [{ food: 'Greek yogurt + protein', qty: '200g + 1 scoop' }] },
      { name: 'Lunch', items: [{ food: 'Chicken + rice + veg', qty: '150g + 150g + 200g' }] },
      { name: 'Dinner', items: [{ food: 'Fish + quinoa + salad', qty: '150g + 150g + 200g' }] }
    ]
  };
  
  const dietType = user.dietaryPrefs.includes('Vegetarian') ? 'Vegetarian' :
                  user.dietaryPrefs.includes('Eggitarian') ? 'Eggitarian' : 'Non-veg';
  
  return {
    workout: {
      focus: [focus],
      blocks: [
        {
          name: isRest ? 'Recovery' : 'Warmup',
          items: isRest ? exercises.slice(0, 1) : [{ exercise: 'Dynamic warmup', sets: 1, reps: '5min', RIR: 0 }]
        },
        {
          name: isRest ? 'Light Activity' : 'Main',
          items: isRest ? exercises.slice(1) : exercises.slice(0, 3)
        }
      ],
      notes: `${focus} training - ${isRest ? 'recovery focus' : 'progressive overload'}`
    },
    nutrition: {
      total_kcal: calories,
      protein_g: protein,
      meals: mealDb[dietType],
      hydration_l: 2.5
    },
    recovery: {
      mobility: [isRest ? 'Full body stretch' : `${focus} stretch`, 'Foam roll if available'],
      sleep: ['7-9 hours', 'Cool dark room', isRest ? 'Extra rest today' : 'Post-workout nutrition']
    }
  };
}

/**
 * Production-ready daily plan generation
 */
export async function generateDailyPlan(
  user: User, 
  todayCheckin: CheckinData, 
  recentCheckins: CheckinData[], 
  basePlan: WeeklyBasePlan
): Promise<DailyPlan> {
  
  const today = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayKey = dayNames[today.getDay()];
  const todayBasePlan = basePlan.days[todayKey];

  if (!todayBasePlan) {
    throw new Error(`No base plan found for ${todayKey}`);
  }

  const targetCalories = user.dailyCalorieTarget || 2000;
  const targetProtein = user.weight ? Math.round(user.weight * 2.2 * 0.9) : Math.round(targetCalories * 0.3 / 4);

  // Apply smart adjustments based on check-in
  const adjustments = applySmartAdjustments(todayBasePlan, todayCheckin, user);

  return {
    id: Date.now().toString(),
    date: new Date().toISOString().split('T')[0],
    ...adjustments,
    nutrition: {
      ...adjustments.nutrition,
      total_kcal: targetCalories,
      protein_g: targetProtein
    },
    adherence: 0,
    isFromBasePlan: true,
  };
}

/**
 * Apply smart adjustments with continuous monitoring
 */
function applySmartAdjustments(basePlan: any, checkin: CheckinData, user: User): any {
  const energy = checkin.energy || 5;
  const stress = checkin.stress || 5;
  const motivation = checkin.motivation || 5;
  const soreness = checkin.soreness || [];
  
  let workout = JSON.parse(JSON.stringify(basePlan.workout));
  let adjustments: string[] = [];
  
  // Smart energy-based adjustments
  if (energy < 4) {
    // Significant reduction
    if (workout.blocks?.[1]?.items) {
      workout.blocks[1].items = workout.blocks[1].items.slice(0, 2);
      workout.blocks[1].items.forEach((item: any) => { item.RIR = Math.max(item.RIR, 3); });
      adjustments.push('Reduced volume and intensity for low energy');
    }
  } else if (energy < 6) {
    // Moderate reduction
    if (workout.blocks?.[1]?.items) {
      workout.blocks[1].items.forEach((item: any) => { item.RIR = Math.max(item.RIR, 2); });
      adjustments.push('Reduced intensity for moderate energy');
    }
  }
  
  // Stress management
  if (stress > 7) {
    workout.focus = ['Recovery', 'Stress Relief'];
    workout.blocks = [
      {
        name: 'Stress Relief',
        items: [
          { exercise: 'Deep breathing', sets: 1, reps: '5min', RIR: 0 },
          { exercise: 'Gentle yoga', sets: 1, reps: '15min', RIR: 0 },
          { exercise: 'Walking', sets: 1, reps: '20min', RIR: 0 }
        ]
      }
    ];
    adjustments.push('Switched to stress-relief protocol');
  }
  
  // Soreness management
  if (soreness.length > 0) {
    adjustments.push(`Modified for ${soreness.join(', ')} soreness`);
    workout.notes = `⚠️ Soreness in ${soreness.join(', ')} - modify or skip affected exercises`;
  }
  
  // Motivation-based messaging
  const motivationMessages = {
    high: "🚀 High motivation detected! Channel this energy into quality reps and perfect form!",
    medium: `💪 Steady progress towards your ${user.goal.replace('_', ' ').toLowerCase()} goals. Stay consistent!`,
    low: "🌱 Every small step counts. Focus on showing up - that's the hardest part. You've got this!"
  };
  
  const motivationLevel = motivation >= 8 ? 'high' : motivation >= 5 ? 'medium' : 'low';
  
  return {
    workout,
    recovery: {
      ...basePlan.recovery,
      mobility: energy < 5 ? 
        ['Gentle stretching', 'Breathing exercises', 'Light movement'] :
        basePlan.recovery.mobility,
      sleep: stress > 6 ?
        ['Prioritize 8+ hours tonight', 'Consider meditation', 'Avoid screens 2hrs before bed'] :
        basePlan.recovery.sleep
    },
    motivation: motivationMessages[motivationLevel],
    adjustments
  };
}
