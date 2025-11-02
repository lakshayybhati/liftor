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
    // Respect manual calorie target from onboarding when provided
    const normalizedCalories = user.dailyCalorieTarget ?? calculateTDEE(user);
    const normalizedProtein = calculateProteinTarget(user);
    for (const day of requiredDays) {
      if (days[day]?.nutrition) {
        days[day].nutrition.total_kcal = normalizedCalories;
        days[day].nutrition.protein_g = normalizedProtein;
        // Dynamic hydration per day based on workout intensity and session/user factors
        days[day].nutrition.hydration_l = computeHydrationLiters(user, days[day]?.workout);
      }
    }

    // Enforce user constraints (diet/exercise) and weekly meal consistency
    const constrainedDays = applyUserConstraintsToWeeklyDays(user, days);

    const basePlan: WeeklyBasePlan = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      days: constrainedDays,
      isLocked: false,
      expectedWeeksToGoal: typeof parsedPlan.expectedWeeksToGoal === 'number'
        ? parsedPlan.expectedWeeksToGoal
        : estimateWeeksToGoal(user)
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
    
    // Intensity & Dietary Notes
    user.workoutIntensity ? `Workout Intensity Preference: ${user.workoutIntensity}` : null,
    typeof user.workoutIntensityLevel === 'number' ? `Workout Intensity Level: ${user.workoutIntensityLevel}/10 (${user.workoutIntensityLevel <= 3 ? 'Light effort per session' : user.workoutIntensityLevel <= 6 ? 'Moderate effort per session' : 'High intensity per session'})` : null,
    user.trainingLevel ? `Training Experience: ${user.trainingLevel} (${user.trainingLevel === 'Beginner' ? '<1 year' : user.trainingLevel === 'Intermediate' ? '1-3 years' : '>3 years'})` : null,
    user.dietaryNotes ? `Dietary Notes: ${user.dietaryNotes}` : null,
    
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
    // Schedule & routine
    user.preferredTrainingTime ? `Preferred Training Time: ${user.preferredTrainingTime}` : null,
    user.wakeTime ? `Wake Time: ${user.wakeTime}` : null,
    user.sleepTime ? `Sleep Time: ${user.sleepTime}` : null,
    user.stepTarget ? `Daily Step Target: ${user.stepTarget}` : null,
    user.checkInReminderTime ? `Check-in Reminder Time: ${user.checkInReminderTime}` : null,
    typeof user.stressBaseline === 'number' ? `Stress Baseline: ${user.stressBaseline}/10` : null,
    typeof user.sleepQualityBaseline === 'number' ? `Sleep Quality Baseline: ${user.sleepQualityBaseline}/10` : null,
    user.budgetConstraints ? `Budget Constraints: ${user.budgetConstraints}` : null,
    // Program preferences (workout split is auto-selected by AI based on training level, days, and intensity)
    user.preferredExercises?.length ? `Preferred Exercises: ${user.preferredExercises.join(', ')}` : null,
    user.avoidExercises?.length ? `Avoid Exercises: ${user.avoidExercises.join(', ')}` : null,
  ].filter(Boolean);

  return profile.join('\n');
}

/**
 * Step 2: HYPER-PERSONALIZED AI Prompt Construction for Base Plan
 * Reactive microcycle with Yesterday→Today→Tomorrow logic and deep justification
 */
function constructBasePlanPrompts(user: User, userProfile: string) {
  const targetCalories = user.dailyCalorieTarget || calculateTDEE(user);
  const proteinTarget = calculateProteinTarget(user);
  const split = getWorkoutSplit(user);
  const schedule = computeTrainingSchedule(user.trainingDays || 3);
  const dayNames = ['day1', 'day2', 'day3', 'day4', 'day5', 'day6', 'day7'];
  
  // Calculate session time budget
  const sessionCap = user.sessionLength || 45;
  const intensityLevel = user.workoutIntensityLevel || 6;
  const bodyweight = user.weight || 70;
  
  console.log('🎯 Hyper-Personalized Plan Generation:', { 
    split, 
    sessionCap, 
    intensityLevel,
    trainingDays: user.trainingDays 
  });

  const systemPrompt = `You are an elite strength coach and sports nutritionist. Create a REACTIVE, HYPER-PERSONALIZED 7-day microcycle that deeply analyzes and justifies EVERY decision using Yesterday→Today→Tomorrow logic.

⚠️  CRITICAL AUTONOMY REQUIREMENT ⚠️
You will receive a JSON structure showing REQUIRED FIELDS AND FORMAT ONLY.
The example exercises, foods, and reasoning text are PLACEHOLDERS prefixed with "[AI: ...]".
You MUST think independently and generate a completely original plan based on user data.
DO NOT copy any placeholder text. SELECT, CALCULATE, and JUSTIFY every choice.

=== CORE USER CONTEXT ===
Goal: ${user.goal} (optimize every choice toward this)
Experience: ${user.trainingLevel || 'Beginner'} (${user.trainingLevel === 'Beginner' ? '<1yr' : user.trainingLevel === 'Intermediate' ? '1-3yrs' : '>3yrs'})
Training Frequency: ${user.trainingDays} days/week
Session Cap: ${sessionCap} minutes HARD LIMIT (est_time_min must be ≤ ${sessionCap})
Intensity Preference: ${intensityLevel}/10 (${intensityLevel <= 3 ? 'light effort' : intensityLevel <= 6 ? 'moderate' : 'high intensity'})
Equipment: ${user.equipment.join(', ')} (ONLY use these)
Body Weight: ${bodyweight}kg
Injuries/Limitations: ${user.injuries || 'None'}
Diet: ${user.dietaryPrefs.join(', ')}
Meals/Day: ${user.mealCount || 3} (must match exactly)
Fasting Window: ${user.fastingWindow || 'None'}
Daily Calories: ${targetCalories} kcal (±5% tolerance: ${Math.round(targetCalories * 0.95)}-${Math.round(targetCalories * 1.05)})
Daily Protein: ${proteinTarget}g (±5% tolerance: ${Math.round(proteinTarget * 0.95)}-${Math.round(proteinTarget * 1.05)})
${user.allergies ? `Allergies/Avoid: ${user.allergies}` : ''}
${user.budgetConstraints ? `Budget: ${user.budgetConstraints}` : ''}
${user.preferredExercises?.length ? `Preferred Movements: ${user.preferredExercises.join(', ')}` : ''}
${user.avoidExercises?.length ? `Avoid Exercises: ${user.avoidExercises.join(', ')}` : ''}

=== REACTIVE MICROCYCLE PRINCIPLES ===

1. YESTERDAY→TODAY→TOMORROW LOGIC (CRITICAL):
   - Track per-muscle load across the cycle
   - Day 1 → baseline (fresh state)
   - Day 2+ → consider what was trained Day N-1
   - If muscle group hit hard yesterday (high volume/low RIR):
     → Reduce sets by 20-40% today
     → Increase RIR by 1-2 points
     → Prefer machine/isometric variations
     → Consider complete rest for that muscle
   - If muscle under-served and soreness low:
     → Increase volume/frequency
     → Add compound movements
     → Lower RIR for progressive overload
   - Each day sets up tomorrow's capabilities

2. OPTIMAL EXERCISE SELECTION (CRITICAL):
   - Choose THE MOST EFFECTIVE exercises for user's goal + equipment + experience
   - Vary rep zones across week: 5-8 (strength), 8-12 (hypertrophy), 12-20 (endurance/pump)
   - Explicit guidance: RIR (0-5), RPE (6-10), tempo (e.g., "3010"), rest periods (60-180s)
   - Progressive load recommendations (e.g., "+2.5kg from last week")
   - 2-3 SUBSTITUTIONS per exercise:
     a) Unilateral option (address imbalances)
     b) Grip/stance variation (change stimulus angle)
     c) Low-impact alternative (for high DOMS days)

3. TIME MANAGEMENT (HARD CONSTRAINT):
   - Estimate time per exercise: warmup sets + working sets + rest
   - Total workout est_time_min MUST BE ≤ ${sessionCap} min
   - Include time for warmup, cool-down, transitions
   - If over budget: reduce exercises, not quality

4. DAILY INTENSITY LABELING:
   - Assign intensity: "Deload" | "Light" | "Moderate" | "Hard" | "Peak"
   - Distribute across week to prevent overtraining
   - Match intensity to user's ${intensityLevel}/10 preference

5. CONDITIONING INTEGRATION:
   - Weave goal-appropriate cardio:
     - Fat loss: HIIT, circuits, finishers
     - Muscle gain: minimal, low-impact
     - Endurance: steady-state, tempo runs
   - Time-efficient placement (supersets, active rest)

6. NUTRITION HYPER-PERSONALIZATION:
   - Lock to ${user.mealCount || 3} meals (never deviate)
   - Hit ${targetCalories}±5% kcal and ${proteinTarget}±5%g
   - Use LOCAL, PRACTICAL foods (${user.dietaryPrefs.join(', ')})
   - Macro timing:
     → Pre-workout: carbs 1-2hrs before
     → Post-workout: protein + carbs within 2hrs
     → Fat lower around training, higher at night
   - Honor allergies, budget, cooking complexity
   - 2-3 swap options per meal (same macros)
   - Ensure fiber (25-35g) and micronutrients
   - Hydration: ${Math.round(bodyweight * 0.033)}L base + activity adjustments

7. RECOVERY SPECIFICITY:
   - Day-specific mobility matching worked tissues
   - Actionable sleep tactics (not generic)
   - Gentle cardio/step prescriptions
   - Stress control options
   - Empathetic careNotes referencing user's goals
   - Supplements: ONLY if not in user's list AND relevant to today

8. REASON STRING (MOST CRITICAL):
   For EACH day, write a comprehensive 3-5 sentence reasoning that EXPLICITLY states:
   a) What was trained YESTERDAY (specific muscles, sets, intensity)
   b) Why TODAY's exercise selection, RIR, time allocation fit the user
   c) How today sets up TOMORROW (muscle recovery, fatigue management)
   d) Which user data dictated decisions:
      - Equipment limitations
      - Meal count requirements
      - Intensity slider (${intensityLevel}/10)
      - Injuries/avoid exercises
      - Session time cap (${sessionCap}min)
      - IF window timing
      - Experience level
   e) Training split justification and weekly balance
   
   Make each day's reason UNIQUE and SPECIFIC - reference actual exercises, rep ranges, and user constraints.

=== OUTPUT REQUIREMENTS ===
- Pure JSON (no markdown, no backticks)
- Days labeled: day1, day2, day3, day4, day5, day6, day7
- Include expectedWeeksToGoal
- Autonomous split/rest placement (balance weekly volume)
- Same input → same output (deterministic)
- Progressive volume balance across microcycle
- Equipment filters enforced
- All constraints validated

Return ONLY valid JSON matching this structure:`;

  // Build enhanced example with reactive microcycle structure
  const exampleDays: any = {};
  dayNames.forEach((day, index) => {
    const isTraining = schedule[index];
    const focus = isTraining ? split[index % split.length] : 'Recovery';
    const prevDayIndex = index === 0 ? 6 : index - 1;
    const nextDayIndex = (index + 1) % 7;
    const wasPrevTraining = schedule[prevDayIndex];
    const isNextTraining = schedule[nextDayIndex];
    
    exampleDays[day] = {
      workout: {
        focus: [focus],
        intensity: isTraining ? "Moderate" : "Deload",
        est_time_min: isTraining ? sessionCap - 5 : 20,
        blocks: isTraining ? [
          { 
            name: "Warm-up", 
            items: [
              { 
                exercise: "Dynamic stretching + movement prep", 
                sets: 1, 
                reps: "5-8 min", 
                RIR: 0,
                tempo: "controlled",
                rest_sec: 0,
                notes: "Activate target muscles, increase core temp"
              }
            ] 
          },
          { 
            name: "Main Training", 
            items: [
              { 
                exercise: "[AI: SELECT specific compound from user equipment - e.g., Barbell Squat if gym, DB Goblet Squat if dumbbells]",
                sets: 4, 
                reps: "[AI: CHOOSE based on goal - strength: 5-8, hypertrophy: 8-12, endurance: 12-20]", 
                RIR: 2,
                RPE: 8,
                tempo: "[AI: SELECT - e.g., 3010, 2020, 3120]",
                rest_sec: 120,
                load_guidance: "[AI: SPECIFY - e.g., 80% 1RM, RPE 8, +2.5kg from last week]",
                substitutions: [
                  "[AI: Unilateral variation for THIS exercise - e.g., Single-leg squat, Split squat]",
                  "[AI: Grip/stance variation for THIS exercise - e.g., Wide stance, Front squat]",
                  "[AI: Low-impact alternative for THIS exercise - e.g., Leg press, Wall sit]"
                ],
                notes: "[AI: Add context - e.g., Progressive overload, Form focus, Volume reduced due to yesterday]"
              },
              { 
                exercise: "[AI: SELECT secondary compound matching focus]", 
                sets: 3, 
                reps: "[AI: CHOOSE rep range]", 
                RIR: 2,
                RPE: 7,
                tempo: "[AI: SELECT tempo]",
                rest_sec: 90,
                load_guidance: "[AI: SPECIFY load]",
                substitutions: [
                  "[AI: Unilateral option]",
                  "[AI: Alternative equipment]",
                  "[AI: Variation pattern]"
                ]
              },
              {
                exercise: "[AI: SELECT isolation matching focus]",
                sets: 3,
                reps: "[AI: Higher reps for isolation work]",
                RIR: 1,
                RPE: 8,
                tempo: "[AI: Slower tempo for isolation]",
                rest_sec: 60,
                substitutions: [
                  "[AI: Different angle]",
                  "[AI: Different tool]",
                  "[AI: Intensity technique]"
                ]
              }
            ]
          },
          { 
            name: "Conditioning", 
            items: [
              {
                exercise: "Goal-appropriate finisher",
                sets: 1,
                reps: "10-15 min",
                RIR: 3,
                notes: "Fat loss: HIIT | Muscle gain: light cardio | Endurance: steady state"
              }
            ]
          },
          { 
            name: "Cool-down", 
            items: [
              { 
                exercise: "Static stretching + breathing", 
                sets: 1, 
                reps: "5-10 min", 
                RIR: 0,
                notes: "Target worked muscles, parasympathetic activation"
              }
            ]
          }
        ] : [
          { 
            name: "Active Recovery", 
            items: [
              { exercise: "Light walking or cycling", sets: 1, reps: "20-30 min", RIR: 0, notes: "Zone 2 HR, conversational pace" },
              { exercise: "Gentle mobility flow", sets: 1, reps: "10-15 min", RIR: 0, notes: "Focus on yesterday's worked tissues" }
            ]
          }
        ],
        notes: isTraining ? 
          `Training ${focus}. Managed volume based on ${wasPrevTraining ? 'yesterday\'s training load' : 'fresh state'}. Sets up ${isNextTraining ? 'tomorrow\'s session' : 'recovery period'}.` : 
          "Active recovery - facilitate repair, manage fatigue"
      },
      nutrition: {
        total_kcal: targetCalories,
        protein_g: proteinTarget,
        meals_per_day: user.mealCount || 3,
        fiber_g: 30,
        meals: [
          { 
            name: "[AI: Name meal - e.g., Pre-Workout Meal, Breakfast, etc.]", 
            timing: "[AI: SPECIFY based on training time and IF window]",
            items: [
              { food: "[AI: SELECT real food matching diet - e.g., Chicken breast, Paneer, Tofu]", qty: "[AI: CALCULATE quantity - e.g., 150g, 1 cup]", macros: "[AI: ESTIMATE - e.g., 0c/30p/3f]" },
              { food: "[AI: SELECT complementary food]", qty: "[AI: CALCULATE quantity]", macros: "[AI: ESTIMATE macros]" }
            ],
            swaps: [
              "[AI: Provide swap with similar macros - name specific food + quantity]",
              "[AI: Budget-friendly alternative - specific food]",
              "[AI: Quick/meal prep option - specific food]"
            ]
          },
          { 
            name: "[AI: Name meal 2]", 
            timing: "[AI: SPECIFY timing]",
            items: [
              { food: "[AI: SELECT protein matching diet]", qty: "[AI: CALCULATE]", macros: "[AI: ESTIMATE]" },
              { food: "[AI: SELECT carb source]", qty: "[AI: CALCULATE]", macros: "[AI: ESTIMATE]" },
              { food: "[AI: SELECT vegetables]", qty: "[AI: CALCULATE]", macros: "[AI: ESTIMATE]" }
            ],
            swaps: [
              "[AI: Different protein within diet constraints]",
              "[AI: Carb swap - rice/quinoa/potato]",
              "[AI: Veggie alternative]"
            ]
          },
          { 
            name: "[AI: Name meal 3]", 
            timing: "[AI: SPECIFY timing]",
            items: [
              { food: "[AI: SELECT protein+fat source]", qty: "[AI: CALCULATE]", macros: "[AI: ESTIMATE]" },
              { food: "[AI: SELECT fiber-rich carb]", qty: "[AI: CALCULATE]", macros: "[AI: ESTIMATE]" }
            ],
            swaps: [
              "[AI: Fattier protein option]",
              "[AI: Different prep method]",
              "[AI: Batch cook friendly]"
            ]
          }
        ],
        hydration_l: Math.round(bodyweight * 0.033 * 10) / 10,
        hydration_notes: `Base ${Math.round(bodyweight * 0.033)}L + ${isTraining ? '0.5-1L during training' : '0L (rest day)'} + climate adjustments`
      },
      recovery: {
        mobility: [
          isTraining ? 
            `${focus}-specific stretches: target worked muscles (hip flexors, thoracic spine, etc.)` :
            "Full body flow: gentle yoga, joint circles, breath work"
        ],
        sleep: [
          `Target 7-9 hours (${isTraining ? 'prioritize tonight - muscle repair' : 'maintain consistency'})`,
          "Actionable: No screens 1hr before bed, cool room (65-68°F), consistent time",
          `${isNextTraining ? 'Tomorrow is training - ensure quality rest tonight' : 'Recovery continues - allow deep sleep cycles'}`
        ],
        steps: isTraining ? "8,000-10,000 (NEAT)" : "10,000-12,000 (active recovery)",
        stress_control: [
          "5-10min breathwork or meditation",
          "Nature exposure if possible",
          `${wasPrevTraining ? 'Celebrate progress from yesterday' : 'Prepare mentally for upcoming session'}`
        ],
        careNotes: isTraining ?
          `Excellent work on ${focus} today! You challenged yourself with ${focus === 'Push' ? 'chest, shoulders, triceps' : focus === 'Pull' ? 'back, biceps, rear delts' : focus === 'Legs' ? 'quads, hamstrings, glutes' : 'full body patterns'}. Your ${user.goal.toLowerCase().replace('_', ' ')} goal is well-served by this stimulus. ${wasPrevTraining ? 'Note that you trained yesterday, so we managed volume appropriately today.' : 'You came in fresh, allowing quality work.'} ${isNextTraining ? 'Tomorrow continues the split, so prioritize protein and sleep tonight.' : 'Tomorrow is recovery - your body will rebuild stronger.'}` :
          `Recovery day - your muscles are repairing from ${wasPrevTraining ? 'yesterday\'s ' + split[(prevDayIndex) % split.length] + ' session' : 'the training cycle'}. Light movement accelerates recovery without adding fatigue. ${isNextTraining ? 'Tomorrow you\'ll train ' + split[(nextDayIndex) % split.length] + ', so stay hydrated and mobile today.' : 'Another rest day tomorrow allows complete restoration.'} Remember: growth happens during recovery, not just training.`,
        supplements: [
          ...(isTraining ? ["Protein powder post-workout (if not hitting protein through food)"] : []),
          "Creatine 5g daily (timing flexible)",
          ...(isTraining ? ["Caffeine pre-workout (optional, 150-300mg if tolerance allows)"] : []),
          ...(!isTraining ? ["Magnesium glycinate 200-400mg (evening, aids sleep)"] : []),
          "Omega-3 1-2g daily (with meals, reduce inflammation)"
        ].filter(s => !user.supplements?.some(us => s.toLowerCase().includes(us.toLowerCase())))
      },
      reason: "[AI: WRITE UNIQUE 3-5 SENTENCE REASONING - See autonomy instructions below. Must include: yesterday context, today decisions, tomorrow setup, user data citations, split justification. Be specific with YOUR chosen exercises and foods, not generic terms.]"
    };
  });

  const userRequest = JSON.stringify({
    expectedWeeksToGoal: estimateWeeksToGoal(user),
    days: exampleDays
  }, null, 2);

  return { 
    systemPrompt, 
    userRequest: `${userRequest}

CRITICAL INSTRUCTIONS FOR AI AUTONOMY:

1. The above JSON is a STRUCTURAL REFERENCE ONLY - showing required fields and format
2. DO NOT copy the example exercises, foods, or reasoning text
3. YOU MUST autonomously decide:
   - Which specific exercises based on user's equipment + goal + experience
   - Exact rep ranges based on goal (strength: 5-8, hypertrophy: 8-12, endurance: 12-20)
   - RIR/RPE based on intensity preference (${intensityLevel}/10)
   - Real food items matching user's diet (${user.dietaryPrefs.join(', ')})
   - Actual quantities that hit ${targetCalories}kcal and ${proteinTarget}g protein
   - Equipment-filtered substitutions (only use ${user.equipment.join(', ')})
   - Unique reasoning for each day that references YOUR exercise choices

4. THINK DEEPLY about:
   - What did I program yesterday? How does that affect today's muscle selection?
   - Is this muscle group recovered enough for high volume?
   - Does this exercise fit the time budget (${sessionCap}min)?
   - Are these foods realistic and accessible?
   - Does my reasoning explain the Yesterday→Today→Tomorrow logic?

5. VARY your choices:
   - Don't repeat the same exercises every day
   - Rotate food items across meals and days
   - Use different rep ranges across the week
   - Adjust RIR based on accumulated fatigue

6. CALCULATE intelligently:
   - est_time_min must be realistic (warmup + sets × rest + cool-down)
   - Macro totals must be ±5% of targets
   - Substitutions must be truly equivalent alternatives

7. BE SPECIFIC in reasoning:
   - Name the actual exercises you chose (not "compound movement")
   - State the actual muscles worked (not "upper body")
   - Reference the user's actual data (equipment, meals/day, intensity)

Example of GOOD reasoning:
"Day 3 follows Pull training yesterday where we hit back/biceps with 18 total sets (RIR 2). Today's Leg workout uses barbell squats, Romanian deadlifts, and Bulgarian split squats (your gym equipment) for 42 minutes (under 45min cap). These compound movements target your muscle gain goal at intermediate level. Volume is high (20 sets) since legs are fresh, but RIR is 2-3 per your 6/10 intensity preference. Three meals (breakfast 10am per 16:8 IF window, lunch 2pm, dinner 8pm) distribute 2050kcal and 152g protein via chicken, rice, vegetables (non-veg diet). Tomorrow is recovery, so tonight's protein and 8hrs sleep are critical for quad/hamstring/glute repair."

Example of BAD reasoning (don't do this):
"This is a training day focusing on the split. Exercises match your goals. Nutrition hits targets."

CREATE A COMPLETELY NEW, THOUGHTFUL PLAN. USE THE STRUCTURE BUT THINK INDEPENDENTLY.` 
  };
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

RELEVANCE FILTER (CRITICAL):
- Ignore any unrelated content in specialRequest or check-in notes (e.g., app/account/support requests, jokes, money, code, random Q&A, URLs, personal identifiers). Do NOT answer it. Only adjust the plan using relevant fitness/nutrition/recovery data.

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
 * NEW SIMPLIFIED VALIDATION - Check for complete data including quantities
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

  const requiredDays = ['day1', 'day2', 'day3', 'day4', 'day5', 'day6', 'day7'];
  for (const day of requiredDays) {
    if (!plan.days[day]) {
      errors.push(`Missing ${day} in plan`);
      continue;
    }

    const dayPlan = plan.days[day];
    
    // Check workout structure
    if (!dayPlan.workout) {
      errors.push(`Missing workout for ${day}`);
    } else {
      if (!dayPlan.workout.focus || !Array.isArray(dayPlan.workout.focus)) {
        errors.push(`${day}: missing workout focus`);
      }
      if (!dayPlan.workout.blocks || !Array.isArray(dayPlan.workout.blocks)) {
        errors.push(`${day}: missing workout blocks`);
      }
    }
    
    // Check nutrition structure WITH quantity validation
    if (!dayPlan.nutrition) {
      errors.push(`Missing nutrition for ${day}`);
    } else {
      if (!dayPlan.nutrition.meals || !Array.isArray(dayPlan.nutrition.meals)) {
        errors.push(`${day}: missing meals array`);
      } else {
        // Validate each meal has items with BOTH food AND qty
        dayPlan.nutrition.meals.forEach((meal: any, idx: number) => {
          if (!meal.name) {
            errors.push(`${day}: meal ${idx} missing name`);
          }
          if (!meal.items || !Array.isArray(meal.items)) {
            errors.push(`${day}: meal "${meal.name || idx}" missing items`);
          } else {
            meal.items.forEach((item: any, itemIdx: number) => {
              if (!item.food) {
                errors.push(`${day} ${meal.name} item ${itemIdx}: missing food name`);
              }
              if (!item.qty) {
                errors.push(`${day} ${meal.name} item ${itemIdx}: missing quantity`);
              }
            });
          }
        });
      }
      
      if (typeof dayPlan.nutrition.total_kcal !== 'number') {
        errors.push(`${day}: missing or invalid total_kcal`);
      }
      if (typeof dayPlan.nutrition.protein_g !== 'number') {
        errors.push(`${day}: missing or invalid protein_g`);
      }
    }
    
    // Check recovery structure
    if (!dayPlan.recovery) {
      errors.push(`Missing recovery for ${day}`);
    } else {
      if (!dayPlan.recovery.mobility || !Array.isArray(dayPlan.recovery.mobility)) {
        errors.push(`${day}: missing mobility array`);
      }
      if (!dayPlan.recovery.sleep || !Array.isArray(dayPlan.recovery.sleep)) {
        errors.push(`${day}: missing sleep array`);
      }
    }
  }

  console.log(`✅ Validation complete: ${errors.length === 0 ? 'PASSED' : `FAILED with ${errors.length} errors`}`);
  if (errors.length > 0 && errors.length <= 10) {
    console.log('First errors:', errors.slice(0, 10));
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
  const requiredDays = ['day1', 'day2', 'day3', 'day4', 'day5', 'day6', 'day7'];

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
      dayPlan.workout = createMinimalWorkout(day, day === 'wednesday' || day === 'sunday');
    } else if (!dayPlan.workout.blocks || !Array.isArray(dayPlan.workout.blocks)) {
      dayPlan.workout.blocks = [createMinimalWorkoutBlock(dayPlan.workout?.focus?.[0] || 'Full Body')];
    }

    // Ensure nutrition structure
    if (!dayPlan.nutrition) {
      dayPlan.nutrition = createMinimalNutrition();
    } else if (!dayPlan.nutrition.meals || !Array.isArray(dayPlan.nutrition.meals)) {
      dayPlan.nutrition.meals = [createMinimalMeal()];
    }

    // Ensure recovery structure
    if (!dayPlan.recovery) {
      const focus = dayPlan.workout?.focus?.[0] || 'General';
      const isRestDay = day === 'wednesday' || day === 'sunday';
      dayPlan.recovery = createMinimalRecovery(isRestDay, focus, day);
    }
  }

  return repairedPlan;
}

function createMinimalDayPlan(day: string, existingDays?: any) {
  // Determine provisional rest based on existing distribution (no fixed weekdays)
  const isWeekend = day === 'saturday' || day === 'sunday';
  let isRestDay = false;
  try {
    // If existing days show most days as training, pick occasional recovery on weekends else none
    if (existingDays) {
      const values = Object.values(existingDays) as any[];
      const trainingCount = values.filter(v => v?.workout && (v.workout.focus || []).join('').toLowerCase() !== 'recovery').length;
      const recoveryCount = values.length - trainingCount;
      isRestDay = recoveryCount < 2 ? (day === 'sunday') : false; // keep minimal recovery without forcing Wed
    }
  } catch {}
  
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
  
  const workout = createMinimalWorkout(day, isRestDay);
  const focus = workout.focus?.[0] || 'General';
  
  const base = {
    workout,
    nutrition: createMinimalNutrition(targetCalories, targetProtein),
    recovery: createMinimalRecovery(isRestDay, focus, day)
  } as any;
  
  return base;
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
    wednesday: ['Full Body'],
    thursday: ['Upper Body', 'Pull'],
    friday: ['Full Body', 'Conditioning'],
    saturday: ['Core', 'Flexibility'],
    sunday: ['Recovery']
  };
  
  const focus = isRestDay ? ['Recovery'] : (workoutFocus[day] || ['General Fitness']);
  
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
          { food: 'Chicken breast / Paneer / Tofu', qty: '150-200g' },
          { food: 'Brown rice / Quinoa / Roti', qty: '1 cup / 2 rotis' },
          { food: 'Mixed vegetables (real items)', qty: '2 cups' }
        ]
      },
      {
        name: 'Dinner',
        items: [
          { food: 'Egg whites / Fish / Paneer / Tofu', qty: '150-200g' },
          { food: 'Sweet potato / Rice', qty: '1 medium / 1 cup' },
          { food: 'Salad (cucumber, tomato, greens)', qty: '2 cups' }
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

function createMinimalRecovery(isRestDay: boolean = false, focus: string = 'General', dayName: string = '') {
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
      ],
      careNotes: 'Easy day. Focus on deep breathing, slow walks, sunlight exposure, and unwind before bed.',
      supplements: ['Magnesium glycinate 200-400mg (evening)', 'Electrolytes if sweating']
    };
  }
  
  // Generate day-specific careNotes based on focus
  const careNotesByFocus: Record<string, string[]> = {
    'Push': [
      'Chest and shoulders crushed it today! Ice those shoulders if feeling tight.',
      'Push day done right! Your chest is going to thank you tomorrow—stay hydrated.',
      'Strong pressing today! Make sure to stretch your pecs and front delts tonight.'
    ],
    'Pull': [
      'Back day = best day! Your lats are getting wider with every rep.',
      'Pull day complete! Focus on back stretches to keep those gains.',
      'Great pulling work today! Your back is growing stronger—keep it up.'
    ],
    'Legs': [
      'Leg day conquered! Tomorrow you walk with pride (and maybe a limp).',
      'Quads and glutes got the work they needed today. Protein up and rest well!',
      'Beast mode on legs today! Stay mobile and stretch those hamstrings tonight.'
    ],
    'Full Body': [
      'Full body smashed! You hit everything today—time to refuel and recover.',
      'Total body trained! Great balance of upper and lower work today.',
      'Full body flow complete! Your entire system got the stimulus it needed.'
    ],
    'Upper Body': [
      'Upper body looking solid! Keep those shoulders healthy with good stretching.',
      'Arms, chest, and back worked! Nice balance today—recover smart.',
      'Top half trained well! Remember to roll out those tight spots.'
    ],
    'Lower Body': [
      'Lower body beast mode! Stairs are your enemy tomorrow, but gains are your friend.',
      'Legs and glutes activated! Stay mobile and keep protein high tonight.',
      'Lower half loaded up! Great work—now stretch and hydrate.'
    ],
    'Recovery': [
      'Active recovery day! Movement heals—keep it light and feel great.',
      'Recovery work done! Your body is thanking you for this easy day.',
      'Smart recovery! Light movement keeps the blood flowing and muscles happy.'
    ],
    'Pump': [
      'Pump work looking good! Those muscles are filled with blood and nutrients.',
      'Hypertrophy focus today! Volume work done right—let it grow.',
      'Pump session complete! High reps = high gains. Rest and repeat.'
    ]
  };

  // Generate day-specific supplements based on focus
  const supplementsByFocus: Record<string, string[]> = {
    'Push': [
      'Collagen 10g (post-workout) for joint health',
      'Whey protein 25-30g (within 1hr)',
      'Magnesium glycinate 200mg (evening)'
    ],
    'Pull': [
      'Omega-3 2-3g (with meals) for back inflammation',
      'Whey protein 25-30g (post-workout)',
      'Vitamin D3 2000-4000 IU (morning)'
    ],
    'Legs': [
      'BCAAs 5-10g (during/post workout)',
      'Magnesium 400mg (evening) for muscle soreness',
      'Creatine 5g (any time)'
    ],
    'Full Body': [
      'Whey protein 25-30g (post-workout)',
      'Omega-3 2g (with meals)',
      'Zinc 15-30mg (evening)'
    ],
    'Upper Body': [
      'Collagen 10g (post-workout)',
      'Whey protein 25g (within 1hr)',
      'Fish oil 2g (with meals)'
    ],
    'Lower Body': [
      'Magnesium glycinate 300mg (evening)',
      'BCAAs 5g (post-workout)',
      'Tart cherry juice (before bed) for soreness'
    ],
    'Recovery': [
      'Magnesium glycinate 200-400mg (evening)',
      'Electrolytes (morning)',
      'Turmeric 500mg (with meals) for inflammation'
    ],
    'Pump': [
      'L-Citrulline 6-8g (pre-workout)',
      'Whey protein 25-30g (post-workout)',
      'Creatine 5g (any time)'
    ]
  };

  const focusKey = Object.keys(careNotesByFocus).find(k => focus.includes(k)) || 'Full Body';
  const careOptions = careNotesByFocus[focusKey];
  const suppOptions = supplementsByFocus[focusKey];
  
  // Use hash of day name to consistently pick same option for same day (but different across days)
  const dayHash = dayName ? dayName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
  const careNote = careOptions[dayHash % careOptions.length];
  
  return {
    mobility: [
      'Post-workout stretching (10 min)',
      'Focus on worked muscle groups'
    ],
    sleep: [
      '7-8 hours minimum',
      'Consistent sleep schedule'
    ],
    careNotes: careNote,
    supplements: suppOptions
  };
}

// Ensure recovery extras present even if AI omits them
function ensureRecoveryExtras(recovery: any, isRest: boolean, focus: string = 'General', dayName: string = ''): any {
  const base = recovery || {};
  const hasNotes = typeof base.careNotes === 'string' && base.careNotes.trim().length > 0;
  const hasSupps = Array.isArray(base.supplements) && base.supplements.length > 0;
  if (hasNotes && hasSupps) return base;
  const fallback = createMinimalRecovery(isRest, focus, dayName);
  const merged = {
    ...base,
    careNotes: hasNotes ? base.careNotes : fallback.careNotes,
    supplements: hasSupps ? base.supplements : fallback.supplements,
  } as any;
  // Attach weekly-level supplements card metadata (current + add-ons) on first pass
  if (!merged.supplementCard) {
    merged.supplementCard = {
      current: [],
      addOns: [],
    };
  }
  return merged;
}

// Generates a concise human reason explaining why this day's plan fits the user
function buildDayReason(params: {
  day: string;
  focus: string;
  user: User;
  sessionLength: number;
  equipment: string[];
  primaryGoal: string;
  personalGoals: string[];
  specialRequests: string;
}): string {
  const { day, focus, user, sessionLength, equipment, primaryGoal, personalGoals, specialRequests } = params;
  const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
  const eq = equipment.join(', ') || 'Bodyweight';
  const goals = (personalGoals || []).join(', ');
  const sr = (specialRequests || '').trim();
  const extras = [] as string[];
  if (goals) extras.push(`keeps your goals (${goals}) front and center`);
  if (sr) extras.push(`respects your request: ${sr}`);
  const extraText = extras.length ? ` and ${extras.join(' and ')}` : '';
  return `${dayLabel} focuses on ${focus} to accelerate your ${primaryGoal.toLowerCase().replace('_',' ')} goal. It’s built for ${sessionLength} min with your equipment (${eq})${extraText}. Recovery tips and supplements are tuned to today’s workload so you bounce back stronger.`;
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
 * NEW SIMPLIFIED FALLBACK - Uses same logic as main generation
 */
function generateAdaptiveBasePlan(user: User): WeeklyBasePlan {
  console.log('🔄 Generating SIMPLIFIED fallback plan...');
  
  const targetCalories = user.dailyCalorieTarget || calculateTDEE(user);
  const proteinTarget = calculateProteinTarget(user);
  const split = getWorkoutSplit(user);
  const schedule = computeTrainingSchedule(user.trainingDays || 3);
  const dayNames = ['day1', 'day2', 'day3', 'day4', 'day5', 'day6', 'day7'];
  const dietary = user.dietaryPrefs.includes('Vegetarian') ? 'vegetarian' : 
                  user.dietaryPrefs.includes('Eggitarian') ? 'eggitarian' : 'nonveg';
  
  const days: any = {};
  
  dayNames.forEach((day, index) => {
    const isTraining = schedule[index];
    const focus = isTraining ? split[index % split.length] : 'Recovery';
    
    days[day] = {
      workout: {
        focus: [focus],
        intensity: isTraining ? "Moderate" : "Low",
        blocks: isTraining ? [
          { name: "Warm-up", items: [{ exercise: "Dynamic stretching", sets: 1, reps: "5-8 min", RIR: 0 }] },
          { name: "Main Training", items: [
            { exercise: "Push-ups", sets: 3, reps: "8-12", RIR: 2 },
            { exercise: "Bodyweight squats", sets: 3, reps: "12-15", RIR: 2 },
            { exercise: "Plank", sets: 3, reps: "30-45 sec", RIR: 1 }
          ]},
          { name: "Cool-down", items: [{ exercise: "Static stretching", sets: 1, reps: "5-10 min", RIR: 0 }] }
        ] : [
          { name: "Recovery", items: [
            { exercise: "Light walking", sets: 1, reps: "20-30 min", RIR: 0 },
            { exercise: "Gentle stretching", sets: 1, reps: "10-15 min", RIR: 0 }
          ]}
        ],
        notes: isTraining ? "Fallback training day - adjust exercises based on equipment" : "Recovery and light movement"
      },
      nutrition: {
        total_kcal: targetCalories,
        protein_g: proteinTarget,
        meals_per_day: user.mealCount || 3,
        meals: [
          { 
            name: "Breakfast", 
            items: dietary === 'vegetarian' 
              ? [{ food: "Oats", qty: "1/2 cup" }, { food: "Banana", qty: "1 medium" }, { food: "Almonds", qty: "10 pieces" }]
              : dietary === 'eggitarian'
              ? [{ food: "Eggs", qty: "2 whole" }, { food: "Whole wheat toast", qty: "2 slices" }, { food: "Orange juice", qty: "1 glass" }]
              : [{ food: "Eggs", qty: "3 whole" }, { food: "Whole wheat toast", qty: "2 slices" }, { food: "Banana", qty: "1 medium" }]
          },
          { 
            name: "Lunch", 
            items: dietary === 'vegetarian'
              ? [{ food: "Dal (lentils)", qty: "1 cup" }, { food: "Rice", qty: "1 cup" }, { food: "Mixed vegetables", qty: "2 cups" }]
              : dietary === 'eggitarian'
              ? [{ food: "Egg curry", qty: "2 eggs" }, { food: "Rice", qty: "1 cup" }, { food: "Salad", qty: "2 cups" }]
              : [{ food: "Chicken breast", qty: "150g" }, { food: "Rice", qty: "1 cup" }, { food: "Vegetables", qty: "2 cups" }]
          },
          { 
            name: "Dinner", 
            items: dietary === 'vegetarian'
              ? [{ food: "Paneer", qty: "100g" }, { food: "Roti", qty: "2 pieces" }, { food: "Salad", qty: "2 cups" }]
              : dietary === 'eggitarian'
              ? [{ food: "Egg whites", qty: "4 whites" }, { food: "Sweet potato", qty: "1 medium" }, { food: "Salad", qty: "2 cups" }]
              : [{ food: "Fish", qty: "150g" }, { food: "Quinoa", qty: "1 cup" }, { food: "Salad", qty: "2 cups" }]
          }
        ],
        hydration_l: 2.5
      },
      recovery: {
        mobility: [isTraining ? "Post-workout stretching (10 min)" : "Full body mobility (15 min)"],
        sleep: ["Aim for 7-9 hours", "Consistent bedtime"],
        careNotes: isTraining 
          ? `${focus} training completed today. Focus on recovery and nutrition to support muscle growth.`
          : "Recovery day - prioritize rest, hydration, and light movement to prepare for your next training session.",
        supplements: isTraining 
          ? ["Protein powder (post-workout)", "Creatine (5g daily)"]
          : ["Magnesium glycinate (evening)", "Omega-3 (with meals)"]
      },
      reason: `${day.charAt(0).toUpperCase() + day.slice(1)} is ${isTraining ? 'a training day' : 'a recovery day'} focusing on ${focus} to support your ${user.goal.toLowerCase().replace('_', ' ')} goal.`
    };
  });
  
  console.log('✅ Fallback plan generated with', Object.keys(days).length, 'days');
  
  return {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    days,
    isLocked: false,
    expectedWeeksToGoal: estimateWeeksToGoal(user)
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
  if (user.goal === 'WEIGHT_LOSS') return Math.round(tdee * 0.75);
  if (user.goal === 'MUSCLE_GAIN') return Math.round(tdee * 1.2);
  return Math.round(tdee);
}

function calculateProteinTarget(user: User): number {
  // 0.9g per lb of body weight; fall back to 150g if weight missing
  const weight = user.weight ?? 75; // kg
  const weightInLbs = weight * 2.20462;
  return Math.round(weightInLbs * 0.9);
}

/**
 * Compute daily hydration in liters based on baseline and workout intensity
 * Baseline: 2.3–2.7L; add 0.3–0.6L depending on intensity and session length
 */
function computeHydrationLiters(user: User, workout: any): number {
  // Baseline by sex (fallback 2.5L)
  let baseline = user.sex === 'Female' ? 2.3 : 2.7;
  if (!isFinite(baseline)) baseline = 2.5;

  // Intensity: try explicit field; else infer from workout.intensity or blocks
  const lvl = (user as any).workoutIntensityLevel as number | undefined;
  const explicitIntensity = (workout?.intensity || '').toString().toLowerCase();
  const blockCount = Array.isArray(workout?.blocks) ? workout.blocks.length : 0;

  let add = 0.0;
  if (typeof lvl === 'number') {
    // 1..10 scale → +0.0..+0.6L
    add = Math.min(0.6, Math.max(0, (lvl / 10) * 0.6));
  } else if (explicitIntensity.includes('high')) {
    add = 0.6;
  } else if (explicitIntensity.includes('moderate')) {
    add = 0.4;
  } else if (explicitIntensity.includes('low')) {
    add = 0.2;
  } else {
    // Heuristic by block count
    add = blockCount >= 3 ? 0.5 : blockCount === 2 ? 0.35 : 0.2;
  }

  // Session length bonus
  const sess = user.sessionLength ?? 45;
  if (sess >= 75) add += 0.2;
  else if (sess >= 60) add += 0.1;

  // Clamp between 1.8L and 4.0L
  const liters = Math.max(1.8, Math.min(4.0, Number((baseline + add).toFixed(1))));
  return liters;
}

/**
 * Estimate weeks to goal using simple heuristics
 */
function estimateWeeksToGoal(user: User): number {
  // Optimistic default if insufficient data
  const DEFAULT_WEEKS = 10;
  if (!user.goalWeight || !user.weight) return DEFAULT_WEEKS;

  const deltaKg = Math.abs(user.goalWeight - user.weight);

  // Baseline optimistic weekly rates by goal (kg/week)
  // "Too good to be true" but still within plausible bounds for short-term progress
  let rate = 0.55; // generic optimistic default
  if (user.goal === 'WEIGHT_LOSS') rate = 0.8;
  if (user.goal === 'MUSCLE_GAIN') rate = 0.4;

  // Build an optimism multiplier from user context
  let multiplier = 1;

  // Training frequency effect (more days → faster progress), bounded
  const trainingDays = typeof user.trainingDays === 'number' ? user.trainingDays : 3;
  multiplier *= 1 + Math.min(0.24, Math.max(-0.10, (trainingDays - 3) * 0.06));

  // Workout intensity slider (centered at ~6)
  const intensityLevel = typeof user.workoutIntensityLevel === 'number' ? user.workoutIntensityLevel : 6;
  multiplier *= 1 + Math.max(-0.08, Math.min(0.12, (intensityLevel - 6) * 0.02));

  // Age effects (younger trends slightly faster; older slightly slower)
  if (typeof user.age === 'number') {
    if (user.age >= 18 && user.age <= 35) multiplier *= 1.06;
    else if (user.age >= 50) multiplier *= 0.96;
  }

  // Activity level baseline
  switch (user.activityLevel) {
    case 'Very Active':
    case 'Extra Active':
      multiplier *= 1.05; break;
    case 'Sedentary':
      multiplier *= 0.97; break;
  }

  // Muscle gain nuance: beginner gains are faster; slight male advantage
  if (user.goal === 'MUSCLE_GAIN') {
    if (user.trainingLevel === 'Beginner') multiplier *= 1.15;
    else if (user.trainingLevel === 'Intermediate') multiplier *= 1.07;
    if (user.sex === 'Male') multiplier *= 1.03;
  }

  // Early-phase momentum for larger weight-loss deltas
  if (user.goal === 'WEIGHT_LOSS') {
    if (deltaKg > 20) multiplier *= 1.15;
    else if (deltaKg > 10) multiplier *= 1.08;
  }

  // Compose weekly rate and bound it to keep results somewhat realistic
  let weeklyRate = rate * multiplier;
  if (user.goal === 'WEIGHT_LOSS') {
    weeklyRate = Math.max(0.5, Math.min(1.1, weeklyRate));
  } else if (user.goal === 'MUSCLE_GAIN') {
    weeklyRate = Math.max(0.25, Math.min(0.6, weeklyRate));
  } else {
    weeklyRate = Math.max(0.4, Math.min(0.9, weeklyRate));
  }

  let weeks = Math.ceil(deltaKg / weeklyRate);

  // Extra optimism for tiny deltas
  if (deltaKg <= 2) weeks = Math.max(3, Math.ceil(weeks * 0.7));

  // Final clamp: optimistic lower bound but not absurd; shorter horizon than before
  return Math.min(Math.max(weeks, 4), 40);
}

function createWorkoutSplit(trainingDays: number): string[] {
  const splits: { [key: number]: string[] } = {
    1: ['Full Body (Heavy Compounds)'],
    2: ['Upper Strength', 'Lower Strength'],
    3: ['Push', 'Pull', 'Legs'],
    4: ['Upper Strength', 'Lower Strength', 'Push', 'Pull'],
    5: ['Push', 'Pull', 'Legs', 'Upper Body', 'Power'],
    6: ['Squat', 'Bench', 'Deadlift', 'Overhead Press', 'Accessory Upper', 'Accessory Lower'],
    7: ['Squat', 'Bench', 'Deadlift', 'Overhead Press', 'Upper Body', 'Lower Body', 'Recovery']
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
  
  // Use expanded exercise database
  const exercises = getExercisesForFocus(focus, equipment);
  
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
  
  // Adjust for meal count (support 1..8)
  const allSnacks = [
    { name: 'Snack 1', items: [{ food: 'Mixed nuts and fruit', qty: '30g nuts + 1 fruit' }] },
    { name: 'Snack 2', items: [{ food: 'Protein shake', qty: '1 scoop with water' }] },
    { name: 'Snack 3', items: [{ food: 'Greek yogurt', qty: '200g' }] },
    { name: 'Snack 4', items: [{ food: 'Cottage cheese + berries', qty: '150g + handful' }] },
    { name: 'Snack 5', items: [{ food: 'Peanut butter toast', qty: '1 slice + 1 tbsp' }] },
  ];
  if (mealCount <= 0) mealCount = 1;
  if (mealCount < 3) {
    meals = meals.slice(0, mealCount);
  } else if (mealCount > 3) {
    const need = Math.min(mealCount - 3, allSnacks.length);
    meals = [...meals, ...allSnacks.slice(0, need)];
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

  // Enforce user-selected split sequence for training days
  const splitSeq = deriveWorkoutSplit(user);
  let trainCursor = 0;
  const isTrainingWorkout = (wk: any) => {
    if (!wk) return false;
    const focusText = Array.isArray(wk.focus) ? wk.focus.join(' ').toLowerCase() : String(wk.focus || '').toLowerCase();
    if (focusText.includes('recovery') || focusText.includes('mobility')) return false;
    return true;
  };
  // Compute even training distribution for exact trainingDays
  const schedule = computeTrainingSchedule(user.trainingDays);

  for (const day of dayOrder) {
    const d = days[day] || {};
    // Select focus based on schedule and split
    const idx = dayOrder.indexOf(day);
    const isTraining = Boolean(schedule[idx]);
    const desiredFocus = isTraining ? splitSeq[trainCursor % Math.max(splitSeq.length, 1)] : 'Recovery';
    if (isTraining) trainCursor++;

    let workout = sanitizeWorkout(d.workout, avoid, prefer);
    workout = ensureWorkoutFocus(workout, desiredFocus);
    workout = ensureWorkoutVolumeAndStructure(workout, desiredFocus, user.equipment, user.sessionLength || 45);
    // Ensure intensity label and add goal-aligned conditioning when helpful
    workout.intensity = workout.intensity || ensureIntensityLabel(user, isTraining);
    workout = appendConditioningIfGoal(workout, user, isTraining, user.sessionLength || 45);

    let nutrition = sanitizeNutrition(d.nutrition, dietary, palette[paletteIndex % palette.length]);
    nutrition = ensureMealCount(nutrition, user.mealCount || 3);
    const isRestDay = day === 'wednesday' || day === 'sunday';
    const recoveryBase = d.recovery || createMinimalRecovery(isRestDay, desiredFocus, day);
    const enriched = ensureRecoveryExtras(recoveryBase, isRestDay, desiredFocus, day);

    // Build a friendly per-day reason if missing
    const hasReason = typeof d.reason === 'string' && d.reason.trim().length > 0;
    const reason = hasReason ? d.reason : buildDayReason({
      day,
      focus: desiredFocus,
      user,
      sessionLength: user.sessionLength || 45,
      equipment: user.equipment,
      primaryGoal: user.goal,
      personalGoals: user.personalGoals || [],
      specialRequests: user.specialRequests || ''
    });
    if (user.supplements && Array.isArray(user.supplements)) {
      enriched.supplementCard = enriched.supplementCard || { current: [], addOns: [] };
      enriched.supplementCard.current = user.supplements.slice(0, 8);
    }
    if (!enriched.supplementCard?.addOns || enriched.supplementCard.addOns.length === 0) {
      const addOns: string[] = [];
      addOns.push('Creatine monohydrate 5g daily (any time)');
      addOns.push('Magnesium glycinate 200–400mg (evening)');
      if (user.goal === 'WEIGHT_LOSS') addOns.push('Green tea extract (AM)');
      if (user.goal === 'ENDURANCE') addOns.push('Electrolytes (during training)');
      if (user.goal === 'MUSCLE_GAIN') addOns.push('Whey/Plant protein (post‑workout)');
      enriched.supplementCard = enriched.supplementCard || { current: [], addOns: [] };
      enriched.supplementCard.addOns = addOns.slice(0, 5);
    }
    result[day] = { workout, nutrition, recovery: enriched, reason };
    paletteIndex++;
  }

  // Reduce repetition across the week (swap duplicates with alternatives)
  return diversifyWorkoutsAcrossWeek(result, user.equipment);
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
      // Replace generic placeholders with specific foods
      const specific = replaceGenericFoodPlaceholders(it.food, diet);
      if (specific !== it.food) {
        return { ...it, food: specific };
      }
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
    { name: 'Lunch', items: [{ food: 'Chicken / Fish + rice + veg', qty: '150g + 1 cup + 200g' }] },
    { name: 'Dinner', items: [{ food: 'Fish + quinoa + salad', qty: '150g + 150g + 200g' }] },
  ];
}

function mergeMealTemplate(items: any[], templateItems: any[]): any[] {
  if (!items || items.length === 0) return templateItems.slice(0, 3);
  // Keep up to 3 items to reduce diversity and improve consistency
  return items.slice(0, Math.min(3, items.length));
}

// Map split id to label for profile/debug context
function splitIdToLabel(id?: string): string {
  const map: Record<string, string> = {
    '1': 'Full Body (1 day)',
    '2': 'Full Body + Pump (2 days)',
    '3': 'Full Body (3 days)',
    '4': 'Upper/Lower (4 days)',
    '5': 'Push/Pull/Legs + Upper/Lower (5 days)',
    '6': 'Push/Pull/Legs x2 (6 days)',
    '7': 'PPL + Upper + Lower + Full + Recovery (7 days)',
    // Common aliases/shorthand
    'UL': 'Upper/Lower (4 days)',
    'UL4': 'Upper/Lower (4 days)',
    'PPL': 'Push/Pull/Legs (3 days)',
    'PPL5': 'Push/Pull/Legs + Upper/Lower (5 days)',
    'PPLx2': 'Push/Pull/Legs x2 (6 days)',
    'FB': 'Full Body',
    'FB2': 'Full Body + Pump (2 days)',
    'FB3': 'Full Body (3 days)',
    'auto': 'Auto by training days',
    'Auto': 'Auto by training days',
  };
  return id && map[id] ? map[id] : 'Auto by training days';
}

// Advanced split catalogs (trimmed to 7-day schedule as needed)
const STRENGTH_SPLITS: Record<number, string[]> = {
  1: ['Full Body (Heavy Compounds)'],
  2: ['Upper Strength', 'Lower Strength'],
  3: ['Push (Power)', 'Pull (Power)', 'Legs (Power)'],
  4: ['Upper Strength', 'Lower Strength', 'Speed & Power', 'Recovery'],
  5: ['Power', 'Push', 'Pull', 'Legs', 'Recovery'],
  6: ['Squat', 'Bench', 'Deadlift', 'Overhead Press', 'Accessory Work', 'Recovery'],
  7: ['Squat', 'Bench', 'Deadlift', 'Overhead Press', 'Accessory Upper', 'Accessory Lower', 'Recovery'],
  8: ['Squat (Heavy)', 'Bench (Heavy)', 'Deadlift (Heavy)', 'Overhead (Heavy)', 'Accessory Hypertrophy', 'Core', 'Recovery', 'Mobility'],
  9: ['Upper Power', 'Lower Power', 'Explosive Training', 'Speed & Agility', 'Core Stability', 'Accessory Strength', 'Full Body', 'Technique', 'Recovery'],
  10: ['Push (Strength)', 'Pull (Strength)', 'Legs (Strength)', 'Power', 'Core', 'Mobility', 'Recovery', 'Upper Power', 'Lower Power', 'Accessory'],
  11: ['Squat Focus', 'Deadlift Focus', 'Bench Focus', 'Overhead Focus', 'Accessory 1', 'Accessory 2', 'Core', 'Mobility', 'Explosiveness', 'Recovery', 'Full Body'],
  12: ['Power Clean', 'Snatch', 'Squat', 'Bench', 'Deadlift', 'Overhead Press', 'Accessory Strength', 'Accessory Hypertrophy', 'Core Stability', 'Mobility', 'Conditioning', 'Recovery'],
  13: ['Push Power', 'Pull Power', 'Leg Power', 'Push Volume', 'Pull Volume', 'Leg Volume', 'Core', 'Grip & Stability', 'Accessory 1', 'Accessory 2', 'Speed', 'Mobility', 'Recovery'],
  14: ['Heavy Squat', 'Heavy Bench', 'Heavy Deadlift', 'Speed Work', 'Accessory Hypertrophy', 'Core', 'Mobility', 'Power & Explosiveness', 'Technique', 'Conditioning', 'Recovery', 'Full Body', 'Upper Power', 'Lower Power'],
  15: ['Squat', 'Bench', 'Deadlift', 'Overhead', 'Olympic Lift', 'Accessory Push', 'Accessory Pull', 'Grip Strength', 'Core', 'Explosive Work', 'Stability', 'Conditioning', 'Mobility', 'Speed', 'Recovery']
};

const ENDURANCE_SPLITS: Record<number, string[]> = {
  1: ['Full Body Circuit'],
  2: ['Upper Endurance', 'Lower Endurance'],
  3: ['Cardio', 'Strength Endurance', 'Mobility'],
  4: ['Run', 'Cross-Training', 'Full Body Circuit', 'Core & Mobility'],
  5: ['Cardio', 'Strength Endurance', 'Run', 'Swim/Bike', 'Recovery'],
  6: ['Run', 'Bike', 'Strength', 'Mobility', 'Plyometrics', 'Recovery'],
  7: ['Cardio', 'Run', 'Swim', 'Strength Endurance', 'Core Stability', 'Mobility', 'Recovery'],
  8: ['Run (Speed)', 'Run (Distance)', 'CrossFit WOD', 'Bike', 'Core Stability', 'Mobility', 'Strength Endurance', 'Recovery'],
  9: ['Run', 'Swim', 'Bike', 'Row', 'Core', 'Mobility', 'Strength', 'Full Body Circuit', 'Recovery'],
  10: ['Run', 'Swim', 'Bike', 'Strength', 'Mobility', 'Plyometrics', 'Core', 'Conditioning', 'Endurance Yoga', 'Recovery'],
  11: ['Run (Intervals)', 'Bike (Intervals)', 'Swim (Endurance)', 'Row (Power)', 'Strength Endurance', 'Core', 'Mobility', 'Balance & Stability', 'Recovery', 'Cardio Mix', 'Stretch'],
  12: ['Triathlon Prep', 'Run', 'Bike', 'Swim', 'Strength', 'Core', 'Mobility', 'Balance', 'Plyometrics', 'Cross-Training', 'Recovery', 'Stretch'],
  13: ['Run', 'Swim', 'Bike', 'Row', 'Strength', 'Core', 'Mobility', 'Balance', 'HIIT', 'Functional Circuit', 'Recovery', 'Cardio Mix', 'Yoga'],
  14: ['Run', 'Bike', 'Swim', 'Row', 'HIIT', 'Strength Endurance', 'Mobility', 'Core', 'Balance', 'Plyometrics', 'Full Body Circuit', 'Active Recovery', 'Stretch', 'Recovery'],
  15: ['Run (Tempo)', 'Run (Long)', 'Bike', 'Swim', 'Strength', 'Mobility', 'Core', 'Balance', 'Plyometrics', 'Functional Training', 'CrossFit', 'Recovery', 'Stretch', 'Breathwork', 'Endurance Flow']
};

const FAT_LOSS_SPLITS: Record<number, string[]> = {
  1: ['Full Body HIIT'],
  2: ['Strength + Cardio', 'Mobility & Core'],
  3: ['HIIT', 'Strength', 'Cardio'],
  4: ['Push + Cardio', 'Pull + Core', 'Legs + Cardio', 'Active Recovery'],
  5: ['HIIT', 'Strength', 'Cardio', 'Core', 'Mobility'],
  6: ['Push + Cardio', 'Pull + Cardio', 'Legs + HIIT', 'Core', 'Mobility', 'Recovery'],
  7: ['HIIT', 'Strength', 'Cardio', 'Core', 'Mobility', 'Full Body Burn', 'Recovery'],
  8: ['HIIT', 'Strength Endurance', 'Cardio Intervals', 'Core Stability', 'Active Recovery', 'Mobility', 'Full Body Circuit', 'Recovery'],
  9: ['HIIT', 'Cardio', 'Strength', 'Core', 'Mobility', 'Kickboxing', 'Tabata', 'Full Body Burn', 'Recovery'],
  10: ['HIIT', 'Strength', 'Functional Cardio', 'Core', 'Mobility', 'Full Body Burn', 'Yoga Flow', 'Pilates', 'Cardio', 'Recovery'],
  11: ['HIIT (AM)', 'Strength (PM)', 'Cardio', 'Core', 'Mobility', 'Plyometrics', 'Functional Burn', 'Tabata', 'Kickboxing', 'Yoga', 'Recovery'],
  12: ['HIIT', 'Strength', 'Cardio', 'Core', 'Functional Circuit', 'Mobility', 'Pilates', 'Boxing', 'Plyometrics', 'Yoga', 'Active Recovery', 'Stretch'],
  13: ['HIIT', 'Strength', 'Functional Burn', 'Cardio', 'Core', 'Plyometrics', 'Mobility', 'Kickboxing', 'Tabata', 'Balance Flow', 'Pilates', 'Yoga', 'Recovery'],
  14: ['HIIT', 'Strength', 'Cardio', 'Core', 'Mobility', 'Kickboxing', 'Pilates', 'Functional Burn', 'Plyometrics', 'Tabata', 'Balance & Stretch', 'Yoga', 'Recovery', 'Active Flow'],
  15: ['HIIT (Heavy)', 'HIIT (Light)', 'Strength', 'Functional Training', 'Cardio Mix', 'Core Stability', 'Mobility', 'Kickboxing', 'Pilates', 'Yoga Flow', 'Tabata', 'Plyometrics', 'Balance', 'Stretch', 'Recovery']
};

const FLEXIBILITY_SPLITS: Record<number, string[]> = {
  1: ['Full Body Stretch & Breathwork'],
  2: ['Upper Mobility', 'Lower Mobility'],
  3: ['Yoga Flow', 'Mobility + Strength', 'Breathwork & Recovery'],
  4: ['Upper Mobility', 'Lower Mobility', 'Balance Flow', 'Deep Stretch'],
  5: ['Yoga Flow', 'Mobility', 'Pilates', 'Stretch Therapy', 'Breathwork'],
  6: ['Upper Mobility', 'Lower Mobility', 'Yoga Flow', 'Core Stability', 'Stretch & Balance', 'Recovery'],
  7: ['Yoga', 'Pilates', 'Mobility Flow', 'Core & Balance', 'Stretch Therapy', 'Breathwork', 'Recovery'],
  8: ['Yoga Flow', 'Mobility', 'Pilates', 'Breathwork', 'Stretch Therapy', 'Balance Training', 'Recovery', 'Meditation'],
  9: ['Yoga', 'Mobility', 'Stretch', 'Core & Balance', 'Pilates', 'Breathwork', 'Active Flexibility', 'Foam Rolling', 'Recovery'],
  10: ['Yoga Flow', 'Pilates Core', 'Stretch Therapy', 'Mobility', 'Breathwork', 'Balance', 'Meditation', 'Core Stability', 'Restorative Yoga', 'Recovery'],
  11: ['Morning Flow', 'Evening Flow', 'Yoga', 'Pilates', 'Stretch', 'Breathwork', 'Mobility', 'Balance', 'Meditation', 'Core', 'Recovery'],
  12: ['Mobility', 'Yoga', 'Pilates', 'Stretch', 'Core', 'Balance', 'Breathwork', 'Meditation', 'Recovery', 'Restorative', 'Active Flow', 'Deep Stretch'],
  13: ['Yoga Flow', 'Stretch', 'Core & Balance', 'Mobility', 'Pilates', 'Breathwork', 'Meditation', 'Recovery', 'Active Flow', 'Deep Stretch', 'Mobility Strength', 'Mindfulness', 'Flexibility'],
  14: ['Yoga', 'Pilates', 'Stretch Therapy', 'Mobility', 'Core', 'Balance', 'Breathwork', 'Meditation', 'Foam Rolling', 'Restorative Flow', 'Active Recovery', 'Deep Stretch', 'Mobility Strength', 'Recovery'],
  15: ['Yoga Flow', 'Pilates', 'Stretch', 'Mobility', 'Core', 'Balance', 'Breathwork', 'Meditation', 'Flexibility', 'Foam Rolling', 'Mobility Strength', 'Restorative Yoga', 'Active Flow', 'Stretch Therapy', 'Recovery']
};

function selectPrimarySecondaryGoals(user: User): { primary: 'strength'|'endurance'|'fat_loss'|'flexibility'; secondary?: 'strength'|'endurance'|'fat_loss'|'flexibility' } {
  const goalMap: Record<string, 'strength'|'endurance'|'fat_loss'|'flexibility'> = {
    'MUSCLE_GAIN': 'strength',
    'WEIGHT_LOSS': 'fat_loss',
    'ENDURANCE': 'endurance',
    'FLEXIBILITY_MOBILITY': 'flexibility',
    'GENERAL_FITNESS': 'strength'
  };
  const primary = goalMap[user.goal] || 'strength';
  const pg = (user.personalGoals || []).join(' ').toLowerCase();
  let secondary: any;
  if (pg.includes('fat') || pg.includes('loss')) secondary = 'fat_loss';
  if (pg.includes('endurance') || pg.includes('run') || pg.includes('cardio')) secondary = secondary || 'endurance';
  if (pg.includes('flex') || pg.includes('mobility') || pg.includes('yoga')) secondary = secondary || 'flexibility';
  // Avoid same as primary
  if (secondary === primary) secondary = undefined;
  return { primary, secondary };
}

function getCatalog(kind: 'strength'|'endurance'|'fat_loss'|'flexibility'): Record<number, string[]> {
  if (kind === 'strength') return STRENGTH_SPLITS;
  if (kind === 'endurance') return ENDURANCE_SPLITS;
  if (kind === 'fat_loss') return FAT_LOSS_SPLITS;
  return FLEXIBILITY_SPLITS;
}

function clampAndTake(arr: string[], n: number): string[] {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  if (n <= arr.length) return arr.slice(0, n);
  const out: string[] = [];
  let i = 0;
  while (out.length < n) { out.push(arr[i % arr.length]); i++; }
  return out;
}

/**
 * NEW SIMPLIFIED WORKOUT SPLIT - Single Source of Truth
 * Deterministic split selection based on training level and frequency
 */
function getWorkoutSplit(user: User): string[] {
  const days = Math.max(1, Math.min(user.trainingDays || 3, 7));
  const level = user.trainingLevel || 'Beginner';
  
  console.log('🎯 Selecting workout split:', { level, days, userLevel: user.trainingLevel });
  
  // BEGINNER: Full body focus for movement pattern learning
  if (level === 'Beginner') {
    if (days === 1) return ['Full Body'];
    if (days === 2) return ['Full Body', 'Full Body'];
    if (days === 3) return ['Full Body', 'Full Body', 'Full Body'];
    if (days === 4) return ['Upper Body', 'Lower Body', 'Upper Body', 'Lower Body'];
    if (days === 5) return ['Full Body', 'Upper Body', 'Lower Body', 'Full Body', 'Core'];
    if (days === 6) return ['Upper Body', 'Lower Body', 'Full Body', 'Upper Body', 'Lower Body', 'Core'];
    return ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body', 'Full Body', 'Core'];
  }
  
  // INTERMEDIATE: Split routines for volume distribution
  if (level === 'Intermediate') {
    if (days === 1) return ['Full Body'];
    if (days === 2) return ['Upper Body', 'Lower Body'];
    if (days === 3) return ['Push', 'Pull', 'Legs'];
    if (days === 4) return ['Upper Body', 'Lower Body', 'Push', 'Pull'];
    if (days === 5) return ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body'];
    if (days === 6) return ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'];
    return ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body', 'Full Body', 'Core'];
  }
  
  // PROFESSIONAL: Advanced splits with specialization
  if (days === 1) return ['Full Body'];
  if (days === 2) return ['Upper Body', 'Lower Body'];
  if (days === 3) return ['Push', 'Pull', 'Legs'];
  if (days === 4) return ['Push', 'Pull', 'Legs', 'Upper Body'];
  if (days === 5) return ['Push', 'Pull', 'Legs', 'Upper Body', 'Lower Body'];
  if (days === 6) return ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'];
  return ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Core'];
}

// Keep old function for backward compatibility but redirect to new one
function deriveWorkoutSplit(user: User): string[] {
  return getWorkoutSplit(user);
}

// Ensure workout focus aligns with desired focus
function ensureWorkoutFocus(workout: any, desiredFocus: string): any {
  const clone = JSON.parse(JSON.stringify(workout || {}));
  const isRecovery = desiredFocus === 'Recovery';
  clone.focus = isRecovery ? ['Recovery'] : [desiredFocus];
  return clone;
}

// Expanded exercise database per focus and equipment
function getExercisesForFocus(focus: string, equipment: string[]): string[] {
  const hasGym = equipment.includes('Gym');
  const hasWeights = equipment.some(eq => ['Dumbbells', 'Barbell', 'Gym'].includes(eq));
  const bw = equipment.length === 1 && equipment[0] === 'Bodyweight';

  const byEquip = (gym: string[], weights: string[], body: string[]) =>
    (hasGym ? gym : hasWeights ? weights : body);

  const db: Record<string, string[]> = {
    'Push': byEquip(
      ['Barbell Bench Press','Incline DB Press','Overhead Press','Machine Chest Press','Dips','Cable Flyes','Triceps Pushdown','Lateral Raises','Skullcrushers','Smith Machine Bench Press','Decline Bench Press','Incline Machine Press','Machine Shoulder Press','Pec Deck','Cable Chest Press','Close-grip Bench Press','JM Press','Overhead Cable Triceps Extension','Rope Overhead Triceps Extension','Cable Lateral Raise','Machine Lateral Raise','Front Raise (Cable)','Reverse Pec Deck','Landmine Press','Chest Dip (weighted)','Seated Chest Press Machine','Arnold Press','Hex Press'],
      ['DB Bench Press','Incline DB Press','DB Shoulder Press','Push-ups','Dips','DB Flyes','Triceps Extensions','Lateral Raises','Close-grip Push-ups','Flat DB Press','Decline DB Press','DB Arnold Press','DB Lateral Raise','DB Front Raise','Incline DB Flyes','Low-to-High DB Flyes','DB Hex Press','DB Skullcrushers','Overhead Triceps Extension (DB)','Triceps Kickbacks','DB Floor Press','Single-arm DB Shoulder Press','Seated DB Shoulder Press','Landmine Press','Close-grip Barbell Bench Press','Z Press (Barbell)'],
      ['Push-ups','Pike Push-ups','Decline Push-ups','Dips (bench)','Diamond Push-ups','Pseudo Planche Push-ups','Triceps Dips','Shoulder Taps','Ring Push-ups','Ring Dips','Handstand Push-ups (wall)','Archer Push-ups','Clap Push-ups','Feet Elevated Push-ups','Wide-grip Push-ups','Hindu Push-ups','Dive Bomber Push-ups','Slow Eccentric Push-ups','One-arm Push-up (assisted)','Triceps Extensions (bench/bodyweight)','Decline Pike Push-ups']
    ),
    'Pull': byEquip(
      ['Weighted Pull-ups','Lat Pulldown','Barbell Row','Seated Cable Row','Face Pulls','Rear Delt Flyes','Biceps Curls','Hammer Curls','T-Bar Row','Pendlay Row','Chest Supported Row (machine)','Cable Row (wide)','Cable Row (neutral)','Machine Row','Seal Row','Meadows Row','Assisted Pull-up Machine','Weighted Chin-ups','Straight-arm Pulldown','Cable Pullover','Rear Delt Machine','Reverse Pec Deck','Shrugs','Trap Bar Shrugs','Smith Machine Row','Cable High Row','Machine High Row'],
      ['Pull-ups','1-Arm DB Row','Bent-over DB Row','Band Pulldown','Face Pulls','Rear Delt Flyes','DB Curls','Hammer Curls','Kroc Row','DB Pullover','DB Seal Row','DB Chest Supported Row','Barbell Row','Pendlay Row','EZ-Bar Curl','Barbell Curl','Zottman Curl','Reverse Curl','Spider Curl','Drag Curl','Band Pull-aparts','Band Row','Inverted Row (rings)'],
      ['Pull-ups','Inverted Rows','Superman','Prone Y-T-W','Doorway Rows','Towel Curls','Reverse Snow Angels','Chin-ups','Neutral-grip Pull-ups','Archer Pull-ups','Negative Pull-ups','Australian Pull-ups','Towel Rows','Table Rows','Scapular Pull-ups','Static Pull-up Hold (top)','Prone W','Prone T','Prone Y Hold']
    ),
    'Legs': byEquip(
      ['Back Squat','Romanian Deadlift','Leg Press','Walking Lunges','Leg Curl','Leg Extension','Calf Raise','Hip Thrust','Front Squat','Hack Squat','Pendulum Squat','Smith Machine Squat','Smith Machine Lunge','Machine Hip Thrust','Glute Ham Raise','Seated Leg Curl','Lying Leg Curl','Seated Calf Raise','Standing Calf Raise','Adductor Machine','Abductor Machine','Box Squat','Single-leg Leg Press','Sled Push/Drag','Belt Squat'],
      ['Goblet Squat','Romanian Deadlift','DB Walking Lunges','DB Bulgarian Split Squat','Hip Thrust','Calf Raise','Glute Bridge','Barbell Back Squat','Front Squat','Conventional Deadlift','Sumo Deadlift','Good Morning','Barbell Hip Thrust','DB Step-ups','DB Reverse Lunge','DB Split Squat','DB SLDL','DB Cossack Squat','DB Suitcase Squat','Barbell Calf Raise','DB Calf Raise','DB Thruster (legs focus)'],
      ['Bodyweight Squat','Walking Lunges','Jump Squats','Split Squats','Single-leg Hip Hinge','Glute Bridge','Calf Raise','Sissy Squats','Shrimp Squats','Pistol Squat (assisted)','Wall Sit','Cossack Squats','Reverse Lunges','Curtsy Lunges','Single-leg Glute Bridge','Lateral Lunges','Step-ups (bodyweight)','Hamstring Walkouts','Nordic Ham Curl (assisted)']
    ),
    'Upper Body': byEquip(
      ['Bench Press','Chest Supported Row','Shoulder Press','Lat Pulldown','Incline DB Press','Cable Row','Curls','Lateral Raises','Overhead Press','Pull-ups','Seated Cable Row','Face Pulls','Rear Delt Flyes','Incline Machine Press','Machine Shoulder Press','Pec Deck','Straight-arm Pulldown','Triceps Pushdown','Preacher Curl','Reverse Pec Deck'],
      ['DB Bench Press','DB Row','DB Shoulder Press','Band Pulldown','Incline DB Press','DB Row (seal)','Curls','Lateral Raises','Barbell Row','Pull-ups','EZ-Bar Curl','Hammer Curls','DB Arnold Press','DB Incline Flyes','DB Lateral Raise','DB Rear Delt Flyes','Overhead Triceps Extension (DB)','Close-grip Barbell Bench Press'],
      ['Push-ups','Inverted Rows','Pike Push-ups','Prone Y-T-W','Doorway Rows','Diamond Push-ups','Plank Shoulder Taps','Pull-ups','Chin-ups','Ring Rows','Ring Push-ups','Handstand Push-ups (wall)','Archer Push-ups','Australian Rows']
    ),
    'Lower Body': byEquip(
      ['Back Squat','Front Squat','Romanian Deadlift','Leg Press','Leg Curl','Leg Extension','Calf Raise','Hip Thrust','Hack Squat','Pendulum Squat','Smith Machine Lunge','Smith Machine RDL','GHR','Seated Calf Raise','Lying Leg Curl','Single-leg Leg Press','Adductor Machine','Abductor Machine','Box Squat','Hip Abduction (machine)'],
      ['Goblet Squat','DB RDL','Walking Lunges','Bulgarian Split Squat','Hip Thrust','Calf Raise','Step-ups','Barbell Back Squat','Front Squat','Conventional Deadlift','Sumo Deadlift','Good Morning','DB Reverse Lunge','DB Lateral Lunge','DB Step-ups','Barbell Hip Thrust','DB SLDL','DB Cossack Squat'],
      ['Bodyweight Squat','Split Squat','Step-ups','Walking Lunges','Single-leg Glute Bridge','Calf Raise','Jump Squats','Sissy Squats','Shrimp Squats','Pistol Squat (assisted)','Wall Sit','Reverse Lunges','Cossack Squats','Hamstring Walkouts']
    ),
    'Full Body': byEquip(
      ['Deadlift','Front Squat','Bench Press','Pull-ups','Overhead Press','Row','Hip Thrust','Lunge','Clean and Press','Power Clean','Push Press','T-Bar Row','Lat Pulldown','Thruster (barbell)','Farmer Carry (heavy)','Sled Push/Drag','Carry Medley','Rower Sprints','Assault Bike Intervals'],
      ['Thruster','DB Front Squat','DB Row','DB Press','Pull-ups','RDL','Lunge','Kettlebell Swing','DB Clean and Press','DB Snatch','DB Man Makers','KB Clean and Press','KB Swing','Suitcase Carry','Farmer Carry (DB)','KB Goblet Squat to Press','Renegade Row'],
      ['Burpees','Jump Squats','Inverted Rows','Push-ups','Mountain Climbers','Hip Bridge','Walking Lunges','Bear Crawl','Plank to Push-up','Squat Thrusts','Broad Jumps','High Knees','Reverse Lunges','Hollow Body Hold + Supermans (alternating)','Lateral Bounds','Skater Jumps']
    ),
    'Pump': byEquip(
      ['Incline DB Press','Cable Flyes','Lateral Raises','Triceps Pushdown','Preacher Curl','Face Pulls','Rear Delt Flyes','Cable Curl','Pec Deck','Cable Crossovers (high-to-low)','Cable Crossovers (low-to-high)','Cable Lateral Raise','Machine Lateral Raise','Machine Rear Delt','Rope Hammer Curl','EZ-Bar Preacher Curl','Overhead Cable Extension','Cable Concentration Curl'],
      ['Incline DB Press','DB Flyes','Lateral Raises','Triceps Extensions','Hammer Curls','Rear Delt Flyes','Face Pulls','DB Concentration Curl','DB Preacher Curl (bench)','Incline DB Curl','Zottman Curl','DB Rear Delt Raise (incline)','DB Skullcrushers','DB Kickbacks','DB Around the World','DB Chest Squeeze Press'],
      ['Push-ups (tempo)','Diamond Push-ups','Bodyweight Curls (towel)','Shoulder Taps','Rear Delt Raises (bodyweight)','Slow Eccentric Push-ups','Pike Push-ups (tempo)','Isometric Push-up Hold (mid)','Inverted Rows (tempo)','Doorway Rows (tempo)']
    ),
    'Power': byEquip(
      ['Power Clean','Push Press','Snatch Pull','Box Jump','Medicine Ball Slam','Speed Deadlift','Speed Squat','Kettlebell Swing'],
      ['DB Push Press','DB Power Clean','KB Swing','Box Jump','MB Slam','Jump Squat','Speed RDL','Broad Jump'],
      ['Box Jump','Squat Jump','Broad Jump','Burpee to Jump','Tuck Jump','Plyo Push-ups','Med Ball Toss (if available)']
    ),
    'Athletic': byEquip(
      ['Sled Push','Agility Ladder','Box Jump','Kettlebell Swing','Medicine Ball Toss','Lunge Variations','Row Sprints','Assault Bike'],
      ['Agility Drills','KB Swing','DB Snatch','DB Clean','Box Jump','Lunge Variations','Jump Rope'],
      ['Agility Steps','Jump Lunges','High Knees','Skater Jumps','Burpees','Bear Crawl','Mountain Climbers']
    ),
    'Core': byEquip(
      ['Cable Woodchop','Hanging Leg Raise','Ab Wheel Rollout','Pallof Press','Weighted Plank','Decline Sit-up'],
      ['Hanging Leg Raise','Ab Wheel Rollout','DB Side Bend','KB Windmill','Weighted Plank','Russian Twist'],
      ['Plank','Side Plank','Hollow Body Hold','Leg Raises','Dead Bug','Mountain Climbers']
    ),
    'Glutes & Hamstrings': byEquip(
      ['Hip Thrust','Romanian Deadlift','Good Morning','Glute Ham Raise','Cable Pull-through','Single-leg RDL','Seated Leg Curl'],
      ['Barbell Hip Thrust','RDL','DB Hip Thrust','DB Single-leg RDL','DB Step-ups','B-Stance RDL','Nordic Curl (assisted)'],
      ['Hip Bridge','Single-leg Hip Bridge','Hamstring Walkouts','Glute Kickbacks (band)','Step-ups','Reverse Lunge']
    ),
    'Shoulders & Arms': byEquip(
      ['Overhead Press','Lateral Raise (machine)','Rear Delt Machine','Cable Lateral Raise','Cable Curl','Rope Pushdown','Preacher Curl'],
      ['DB Shoulder Press','DB Lateral Raise','DB Rear Delt Raise','EZ-bar Curl','Skullcrushers','Hammer Curl','Cable Curl'],
      ['Pike Push-ups','Diamond Push-ups','Inverted Rows (supinated)','Bodyweight Curls (towel)','Bench Dips','Push-up Plus']
    ),
    'Chest & Back': byEquip(
      ['Bench Press','Incline Press','Lat Pulldown','Seated Cable Row','Chest Supported Row','Pullover','Face Pulls'],
      ['DB Bench','DB Incline','Pull-ups','DB Row','DB Pullover','Band Pulldown','Face Pulls'],
      ['Push-ups','Ring Rows','Inverted Rows','Prone Y-T-W','Doorway Rows','Superman']
    ),
    'Conditioning': byEquip(
      ['Assault Bike','Row Intervals','SkiErg','Sled Push','Kettlebell Swing','Burpee Sprint'],
      ['Jump Rope','KB Swing','DB Snatch','Burpee Intervals','Row (if available)','Shuttle Runs'],
      ['Burpees','High Knees','Jumping Jacks','Mountain Climbers','Skater Jumps','Bear Crawl']
    ),
    'Squat': byEquip(
      ['Back Squat','Front Squat','Safety Bar Squat','Box Squat','Hack Squat','Pendulum Squat','Leg Press'],
      ['Goblet Squat','Front Squat','Barbell Back Squat','DB Squat','DB Step-ups','DB Split Squat'],
      ['Bodyweight Squat','Jump Squat','Split Squat','Pistol Squat (assisted)','Wall Sit','Cossack Squat']
    ),
    'Bench': byEquip(
      ['Bench Press','Incline Bench','Close-grip Bench','Machine Chest Press','Dips','Pec Deck'],
      ['DB Bench','Incline DB Bench','Close-grip DB Press','DB Flyes','Dips'],
      ['Push-ups','Feet Elevated Push-ups','Diamond Push-ups','Wide-grip Push-ups']
    ),
    'Deadlift': byEquip(
      ['Conventional Deadlift','Sumo Deadlift','Romanian Deadlift','Trap Bar Deadlift','RDL (deficit)'],
      ['RDL','Trap Bar Deadlift (if available)','DB RDL','DB Single-leg RDL'],
      ['Hip Hinge Drill','Single-leg Hip Hinge','Glute Bridge','Hamstring Walkouts']
    ),
    'Overhead Press': byEquip(
      ['Overhead Press','Push Press','Seated Shoulder Press (machine)','Z Press','Landmine Press'],
      ['DB Shoulder Press','Arnold Press','Single-arm DB Press','Landmine Press (if available)'],
      ['Pike Push-ups','Handstand Push-ups (wall)','Decline Pike Push-ups']
    ),
    'Upper Strength': byEquip(
      ['Bench Press','Overhead Press','Weighted Pull-ups','Barbell Row','Chest Supported Row','Face Pulls'],
      ['DB Bench','DB Shoulder Press','Pull-ups','DB Row','Band Pulldown','Face Pulls'],
      ['Push-ups','Pike Push-ups','Ring Rows','Inverted Rows','Prone Y-T-W']
    ),
    'Lower Strength': byEquip(
      ['Back Squat','Front Squat','Romanian Deadlift','Leg Press','Calf Raise','Hip Thrust'],
      ['Barbell Back Squat','Front Squat','RDL','DB Lunge','DB Step-ups','DB Calf Raise'],
      ['Bodyweight Squat','Lunges','Step-ups','Hip Bridge','Calf Raise']
    ),
    'Speed & Power': byEquip(
      ['Power Clean','Snatch Pull','Push Press','Box Jump','Broad Jump','MB Slam','Sled Push'],
      ['DB Push Press','DB Power Clean','KB Swing','Box Jump','Broad Jump','MB Slam'],
      ['Box Jump','Broad Jump','Burpee to Jump','Tuck Jump','Plyo Push-ups']
    ),
    'Core Stability': byEquip(
      ['Pallof Press','Cable Woodchop','Dead Bug (cable/press)','Weighted Plank','Anti-rotation Hold'],
      ['DB Dead Bug (press)','KB Windmill','Weighted Plank','Side Plank with DB'],
      ['Plank','Side Plank','Dead Bug','Bird Dog','Hollow Hold']
    ),
    'HIIT': byEquip(
      ['Assault Bike Intervals','Row Sprints','SkiErg Sprints','KB Swing Sprints','Burpee Sprint EMOM'],
      ['Jump Rope Intervals','KB Swing EMOM','Burpee EMOM','DB Thruster Intervals'],
      ['Burpee Tabata','High Knees Tabata','Jumping Jacks EMOM','Mountain Climbers EMOM']
    ),
    'Full Body Circuit': byEquip(
      ['Kettlebell Circuit','Row + Thruster + Pull-up','Sled Push + Carry','DB Complex','Battle Rope Circuit'],
      ['DB Complex','KB Complex','Jump Rope + DB Snatch','DB Thruster + Row + Lunge'],
      ['Bodyweight Circuit','Burpees + Squats + Push-ups','Bear Crawl + Lunges','Inverted Rows + Push-ups']
    ),
    'Mobility': byEquip(
      ['Couch Stretch','Hip Flexor Stretch','Hamstring Stretch','Thoracic Rotation','Banded Dislocates','Ankle Dorsiflexion'],
      ['Couch Stretch','Hip Airplanes (DB assist)','Banded Dislocates','Ankle Mobility Drills'],
      ['Couch Stretch','Hip Flexor Stretch','90/90 Switches','World’s Greatest Stretch','Ankle Mobility']
    ),
    'Yoga': byEquip(
      ['Sun Salutation A','Sun Salutation B','Warrior Flow','Triangle Pose','Bridge Pose','Pigeon Pose'],
      ['Sun Salutation','Warrior Flow','Triangle Pose','Bridge','Pigeon'],
      ['Sun Salutation','Warrior Flow','Triangle','Bridge','Pigeon']
    ),
    'Pilates': byEquip(
      ['Hundred','Roll-Up','Single-Leg Stretch','Double-Leg Stretch','Shoulder Bridge','Side Kick Series'],
      ['Hundred','Roll-Up','Single-Leg Stretch','Double-Leg Stretch','Shoulder Bridge','Side Kick'],
      ['Hundred','Roll-Up','Single-Leg Stretch','Double-Leg Stretch','Shoulder Bridge','Side Kick']
    )
  };
  return db[focus] || db['Full Body'];
}

function ensureWorkoutVolumeAndStructure(workout: any, focus: string, equipment: string[], sessionLengthMin: number, minExercises: number = 6, maxExercises: number = 7): any {
  const clone = JSON.parse(JSON.stringify(workout || {}));
  if (!Array.isArray(clone.blocks)) clone.blocks = [];

  // Ensure Warm-up exists
  const hasWarmup = clone.blocks.some((b: any) => (b.name || '').toLowerCase().includes('warm'));
  if (!hasWarmup) {
    clone.blocks.unshift({
      name: 'Warm-up',
      items: [
        { exercise: 'Dynamic stretching', sets: 1, reps: '5-8 min', RIR: 0 },
      ]
    });
  }

  // Ensure Main block exists
  let main = clone.blocks.find((b: any) => (b.name || '').toLowerCase().includes('main'));
  if (!main) {
    main = { name: 'Main Training', items: [] };
    clone.blocks.push(main);
  }
  if (!Array.isArray(main.items)) main.items = [];

  // Adjust min/max by session length
  if (sessionLengthMin <= 35) {
    minExercises = Math.max(5, minExercises - 1);
    maxExercises = Math.max(minExercises, maxExercises - 1);
  }
  // Enforce strict maximum of 7 exercises regardless of session length
  maxExercises = Math.min(7, maxExercises);

  // Build unique list of exercises with sufficient volume
  const existingNames = new Set<string>(main.items.map((it: any) => String(it.exercise || '').toLowerCase()));
  const candidates = getExercisesForFocus(focus, equipment);
  for (const ex of candidates) {
    if (main.items.length >= maxExercises) break;
    const key = ex.toLowerCase();
    if (existingNames.has(key)) continue;
    main.items.push({ exercise: ex, sets: 3, reps: '8-12', RIR: 2 });
    existingNames.add(key);
  }

  // If still below minimum, add accessory/core-friendly that match focus
  while (main.items.length < minExercises) {
    const fallback = candidates[(main.items.length) % candidates.length] || 'Accessory movement';
    main.items.push({ exercise: fallback, sets: 3, reps: '10-15', RIR: 2 });
  }

  // Ensure Cool-down exists
  const hasCooldown = clone.blocks.some((b: any) => (b.name || '').toLowerCase().includes('cool'));
  if (!hasCooldown) {
    clone.blocks.push({
      name: 'Cool-down',
      items: [
        { exercise: 'Static stretching', sets: 1, reps: '5-10 min', RIR: 0 }
      ]
    });
  }

  // Guard against core-only content on Full Body
  const coreKeywords = ['plank','crunch','mountain climber','sit-up','leg raise'];
  if (focus === 'Full Body') {
    const mainBlock = clone.blocks.find((b: any) => (b.name || '').toLowerCase().includes('main'));
    if (mainBlock && Array.isArray(mainBlock.items)) {
      const coreCount = mainBlock.items.filter((it: any) => coreKeywords.some(k => String(it.exercise || '').toLowerCase().includes(k))).length;
      if (coreCount >= Math.max(2, Math.floor(mainBlock.items.length * 0.4))) {
        const alts = getExercisesForFocus('Full Body', equipment);
        for (const alt of alts) {
          if (mainBlock.items.length === 0) break;
          if (coreCount < Math.floor(mainBlock.items.length * 0.4)) break;
          const idx = mainBlock.items.findIndex((it: any) => coreKeywords.some(k => String(it.exercise || '').toLowerCase().includes(k)));
          if (idx !== -1) {
            mainBlock.items[idx] = { exercise: alt, sets: 3, reps: '8-12', RIR: 2 };
          }
        }
      }
    }
  }

  return clone;
}

function diversifyWorkoutsAcrossWeek(week: Record<string, any>, equipment: string[]): Record<string, any> {
  const usedByName = new Map<string, number>();
  const capPerWeek = 2; // do not repeat the exact same move more than twice
  const out: Record<string, any> = {};
  for (const day of ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) {
    const d = JSON.parse(JSON.stringify(week[day] || {}));
    const main = d?.workout?.blocks?.find((b: any) => (b.name || '').toLowerCase().includes('main'));
    if (main && Array.isArray(main.items)) {
      main.items = main.items.map((it: any) => {
        const name = String(it.exercise || '');
        const key = name.toLowerCase();
        const count = usedByName.get(key) || 0;
        if (count >= capPerWeek) {
          // swap to an alternative from the same focus
          const focus = Array.isArray(d.workout?.focus) ? d.workout.focus[0] : 'Full Body';
          const alts = getExercisesForFocus(focus, equipment);
          const alt = alts.find(a => (usedByName.get(a.toLowerCase()) || 0) < capPerWeek) || name;
          usedByName.set(alt.toLowerCase(), (usedByName.get(alt.toLowerCase()) || 0) + 1);
          return { ...it, exercise: alt };
        }
        usedByName.set(key, count + 1);
        return it;
      });
      // Reassign updated items back
      const idx = d.workout.blocks.findIndex((b: any) => (b.name || '').toLowerCase().includes('main'));
      if (idx !== -1) d.workout.blocks[idx].items = main.items;
    }
    out[day] = d;
  }
  return out;
}

function replaceGenericFoodPlaceholders(food: string, diet: 'vegetarian' | 'eggitarian' | 'nonveg'): string {
  const f = food.trim();
  const lower = f.toLowerCase();
  const proteinVeg = ['Paneer', 'Tofu', 'Greek yogurt'];
  const proteinEgg = ['Egg whites', 'Whole eggs', 'Greek yogurt'];
  const proteinNon = ['Chicken breast', 'Fish', 'Egg whites'];
  const carbOpts = ['Brown rice', 'Quinoa', 'Whole wheat roti', 'Oats'];
  const vegOpts = ['Mixed vegetables', 'Salad (cucumber, tomato, greens)', 'Stir-fry vegetables'];

  const pick = (arr: string[]) => arr[0];

  if (/(^|\b)(lean\s*protein|quality\s*protein)(\b|$)/i.test(lower)) {
    if (diet === 'vegetarian') return pick(proteinVeg);
    if (diet === 'eggitarian') return pick(proteinEgg);
    return pick(proteinNon);
  }
  if (/(^|\b)(complex\s*carb|complex\s*carbs)(\b|$)/i.test(lower)) {
    return pick(carbOpts);
  }
  if (/(^|\b)(vegetable|vegetables|veggies|salad)(\b|$)/i.test(lower)) {
    return pick(vegOpts);
  }
  return food;
}

// Compute a boolean array for a 7-day schedule with evenly spaced training flags
function computeTrainingSchedule(trainingDays: number): boolean[] {
  const days = 7;
  const result = Array(days).fill(false);
  const n = Math.max(0, Math.min(trainingDays, 7));
  if (n === 0) return result;
  const step = days / n;
  let pos = 0.0;
  for (let i = 0; i < n; i++) {
    const idx = Math.min(6, Math.round(pos));
    result[idx] = true;
    pos += step;
  }
  // Ensure exact count
  let count = result.filter(Boolean).length;
  let j = 0;
  while (count < n && j < days) {
    if (!result[j]) { result[j] = true; count++; }
    j++;
  }
  while (count > n && j >= 0) {
    if (result[j]) { result[j] = false; count--; }
    j--;
  }
  return result;
}

function ensureIntensityLabel(user: User, isTraining: boolean): string {
  if (!isTraining) return 'Low';
  if (user.workoutIntensity === 'Ego lifts') return 'High';
  if (user.workoutIntensity === 'Recovery focused') return 'Low';
  const lvl = (user as any).workoutIntensityLevel as number | undefined;
  if (typeof lvl === 'number') {
    if (lvl >= 8) return 'High';
    if (lvl >= 5) return 'Moderate';
    return 'Low';
  }
  return 'Moderate';
}

function appendConditioningIfGoal(workout: any, user: User, isTraining: boolean, sessionLengthMin: number): any {
  if (!isTraining) return workout;
  const goal = user.goal;
  const clone = JSON.parse(JSON.stringify(workout || {}));
  if (!Array.isArray(clone.blocks)) clone.blocks = [];
  const canAdd = sessionLengthMin >= 40; // don't overload very short sessions
  if (!canAdd) return clone;
  if (goal === 'WEIGHT_LOSS' || goal === 'ENDURANCE') {
    // Add brief conditioning/steps finisher
    clone.blocks.push({
      name: 'Conditioning/Steps',
      items: [
        { exercise: 'Incline walk / Bike / Row', sets: 1, reps: '10-15 min', RIR: 0 }
      ]
    });
  }
  return clone;
}

function ensureMealCount(nutrition: any, mealCount: number): any {
  const clone = JSON.parse(JSON.stringify(nutrition || {}));
  if (!Array.isArray(clone.meals)) clone.meals = [];
  const current = clone.meals.length;
  if (mealCount <= 0) mealCount = 1;
  if (current > mealCount) {
    clone.meals = clone.meals.slice(0, mealCount);
  } else if (current < mealCount) {
    const snack = { name: 'Snack', items: [{ food: 'Greek yogurt / Nuts / Protein shake', qty: '1 serving' }] };
    while (clone.meals.length < mealCount) clone.meals.push(snack);
  }
  return clone;
}

