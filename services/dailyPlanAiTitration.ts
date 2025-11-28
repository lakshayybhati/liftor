import { User, CheckinData, DailyPlan, TrendMemory, LastDayContext, WorkoutPlan, NutritionPlan, RecoveryPlan } from '@/types/user';
import { generateAICompletion, Message } from '@/utils/ai-client';
import { COMMON_SUPPLEMENTS_GUIDE } from '@/utils/supplements';

/**
 * AI Titration Layer for Daily Plans
 * 
 * This service creates a HIGHLY PERSONALIZED daily plan by actively using
 * ALL check-in fields and memory layer trends to make visible, meaningful adjustments.
 * 
 * The AI should:
 * - Actively adjust sets, RIR, exercise choices, focus areas
 * - Modify calories based on weight trend recommendations
 * - Adjust meal timing/density based on digestion and schedule
 * - Personalize recovery tasks based on soreness and sleep
 * - Generate a personalized motivation message that explicitly references user data
 * - Explain every change in the adjustments array with specific data references
 * - Use yesterday snapshot context for continuity (health issues, missed workouts)
 * - Suggest supplements from the reference guide based on user profile
 * 
 * STRICT RULES:
 * - NO fallback to deterministic plan if AI fails.
 * - Must return valid JSON or throw.
 * - Must respect the schemas.
 * - Must use the COMMON_SUPPLEMENTS_GUIDE for recommendations.
 */

interface AiTitrationInput {
  todayKey: string;
  todayBasePlan: {
    workout: WorkoutPlan;
    nutrition: NutritionPlan;
    recovery: RecoveryPlan;
  };
  deterministicPlan: DailyPlan;
  todayCheckin: CheckinData;
  memoryLayer: TrendMemory | null;
  lastDayContext: LastDayContext | null;
  user: User;
}

interface AiTitrationResult {
  workout: WorkoutPlan;
  nutrition: NutritionPlan;
  recovery: RecoveryPlan;
  motivation: string;
  adjustments: string[];
  nutritionAdjustments: string[];
  flags: string[];
  dailyHighlights: string; // Short paragraph summarizing the day for memory
}

/**
 * Build a detailed check-in summary for the AI prompt
 */
function buildCheckinSummary(checkin: CheckinData): string {
  const parts: string[] = [];
  
  // Mood & Mental State
  if (checkin.moodCharacter) parts.push(`Mood: ${checkin.moodCharacter}`);
  if (checkin.energy !== undefined) parts.push(`Energy: ${checkin.energy}/10`);
  if (checkin.stress !== undefined) parts.push(`Stress: ${checkin.stress}/10`);
  if (checkin.motivation !== undefined) parts.push(`Motivation: ${checkin.motivation}/10`);
  
  // Sleep
  if (checkin.sleepHrs !== undefined) parts.push(`Sleep: ${checkin.sleepHrs} hours`);
  if (checkin.wokeFeeling) parts.push(`Woke feeling: ${checkin.wokeFeeling}`);
  
  // Physical State
  if (checkin.soreness && checkin.soreness.length > 0) {
    parts.push(`Sore areas: ${checkin.soreness.join(', ')}`);
  } else {
    parts.push('No soreness reported');
  }
  if (checkin.digestion) parts.push(`Digestion: ${checkin.digestion}`);
  if (checkin.currentWeight !== undefined) parts.push(`Today's weight: ${checkin.currentWeight} kg`);
  
  // Intake & Habits
  if (checkin.waterL !== undefined) parts.push(`Water yesterday: ${checkin.waterL}L`);
  if (checkin.alcoholYN !== undefined) parts.push(`Alcohol yesterday: ${checkin.alcoholYN ? 'Yes' : 'No'}`);
  if (checkin.suppsYN !== undefined) parts.push(`Took supplements: ${checkin.suppsYN ? 'Yes' : 'No'}`);
  
  // Workout Preferences
  if (checkin.workoutIntensity !== undefined) parts.push(`Desired workout intensity: ${checkin.workoutIntensity}/10`);
  if (checkin.yesterdayWorkoutQuality !== undefined) parts.push(`Yesterday's workout quality: ${checkin.yesterdayWorkoutQuality}/10`);
  
  // Special Request
  if (checkin.specialRequest && checkin.specialRequest.trim()) {
    parts.push(`Special request: "${checkin.specialRequest.trim()}"`);
  }
  
  return parts.join('\n');
}

/**
 * Build a memory layer summary for the AI prompt
 */
function buildMemorySummary(memory: TrendMemory | null): string {
  if (!memory) {
    return 'No memory layer available (fewer than 4 check-ins recorded).';
  }
  
  const parts: string[] = [];
  
  // EMA Trends (0-1 scale where 1 is good)
  parts.push('=== TREND ANALYSIS (EMA scores, 0-1 scale, 1=optimal) ===');
  parts.push(`Sleep trend: ${memory.ema.sleep.toFixed(2)} (current: ${memory.scores.sleep.toFixed(2)})`);
  parts.push(`Energy trend: ${memory.ema.energy.toFixed(2)} (current: ${memory.scores.energy.toFixed(2)})`);
  parts.push(`Hydration trend: ${memory.ema.water.toFixed(2)} (current: ${memory.scores.water.toFixed(2)})`);
  parts.push(`Stress trend: ${memory.ema.stress.toFixed(2)} (current: ${memory.scores.stress.toFixed(2)})`);
  
  // Soreness History
  parts.push(`\n=== SORENESS HISTORY ===`);
  parts.push(memory.sorenessHistory);
  if (memory.sorenessStreaks.length > 0) {
    parts.push('⚠️ CHRONIC SORENESS DETECTED:');
    memory.sorenessStreaks.forEach(streak => {
      parts.push(`  - ${streak.area}: ${streak.length} consecutive days (RED FLAG: ${streak.isRedFlag})`);
    });
  }
  
  // Digestion History
  parts.push(`\n=== DIGESTION HISTORY ===`);
  parts.push(memory.digestionHistory);
  if (memory.digestionStreaks.length > 0) {
    parts.push('⚠️ DIGESTION PATTERN DETECTED:');
    memory.digestionStreaks.forEach(streak => {
      parts.push(`  - ${streak.state}: ${streak.length} consecutive days`);
    });
  }
  
  // Weight Trend
  parts.push(`\n=== WEIGHT TREND (Last 7 Days) ===`);
  parts.push(`Direction: ${memory.weightTrend.direction}`);
  parts.push(`Change: ${memory.weightTrend.deltaKg > 0 ? '+' : ''}${memory.weightTrend.deltaKg} kg`);
  parts.push(`RECOMMENDED CALORIE ADJUSTMENT: ${memory.weightTrend.recommendedCalorieDelta > 0 ? '+' : ''}${memory.weightTrend.recommendedCalorieDelta} kcal`);
  
  return parts.join('\n');
}

/**
 * Build a yesterday snapshot summary for the AI prompt
 */
function buildYesterdaySummary(context: LastDayContext | null): string {
  if (!context) {
    return 'No yesterday context available.';
  }
  
  const parts: string[] = [];
  parts.push('=== YESTERDAY SNAPSHOT ===');
  
  // Check-in gap
  if (context.daysSinceLastCheckin === 0) {
    parts.push('Last check-in: Today (already checked in)');
  } else if (context.daysSinceLastCheckin === 1) {
    parts.push('Last check-in: Yesterday ✓');
  } else if (context.daysSinceLastCheckin <= 3) {
    parts.push(`Last check-in: ${context.daysSinceLastCheckin} days ago (short break)`);
  } else if (context.daysSinceLastCheckin < 999) {
    parts.push(`Last check-in: ${context.daysSinceLastCheckin} days ago (EXTENDED ABSENCE - consider gentle re-entry)`);
  } else {
    parts.push('Last check-in: No previous check-ins found (new user)');
  }
  
  // Workout status
  if (context.yesterdayWorkoutStatus) {
    const statusMap = {
      'completed': 'Yesterday workout: COMPLETED ✓',
      'partial': 'Yesterday workout: PARTIAL (some exercises done)',
      'skipped': 'Yesterday workout: SKIPPED (may need low-friction restart today)',
    };
    parts.push(statusMap[context.yesterdayWorkoutStatus]);
  }
  
  // Nutrition status
  if (context.yesterdayNutritionStatus && context.yesterdayNutritionStatus !== 'unknown') {
    const nutritionMap = {
      'on_target': 'Yesterday nutrition: ON TARGET ✓',
      'under': 'Yesterday nutrition: UNDER target (may need to catch up)',
      'over': 'Yesterday nutrition: OVER target (may need lighter day)',
      'unknown': '',
    };
    parts.push(nutritionMap[context.yesterdayNutritionStatus]);
  }
  
  // Health note (IMPORTANT for continuity)
  if (context.healthNote) {
    parts.push(`⚠️ HEALTH NOTE FROM YESTERDAY: "${context.healthNote}"`);
    parts.push('   → Consider if this is still relevant today. If so, mention it in the daily debrief and adjust plan accordingly.');
  }
  
  // Lifestyle note
  if (context.lifestyleNote) {
    parts.push(`📋 LIFESTYLE NOTE FROM YESTERDAY: "${context.lifestyleNote}"`);
  }
  
  // Yesterday's AI-generated highlights (the key memory piece)
  if (context.yesterdayHighlights) {
    parts.push(`\n📝 YESTERDAY'S SESSION SUMMARY:`);
    parts.push(`"${context.yesterdayHighlights}"`);
    parts.push('   → Use this context to inform today\'s plan and maintain continuity.');
  }
  
  // Yesterday's special request (for context)
  if (context.yesterdaySpecialRequest) {
    parts.push(`Yesterday's request: "${context.yesterdaySpecialRequest}"`);
  }
  
  return parts.join('\n');
}

/**
 * Format the supplement guide for AI prompt (condensed version for daily titration)
 */
function formatSupplementGuideForTitration(): string {
  const categories: Record<string, string[]> = {
    'PERFORMANCE': ['Creatine', 'Beta-Alanine', 'Citrulline', 'Caffeine'],
    'VITAMINS': ['Vitamin D3', 'Vitamin C', 'Vitamin B Complex', 'Vitamin B12'],
    'MINERALS': ['Magnesium', 'Zinc', 'Iron'],
    'OMEGA FATTY ACIDS': ['Omega-3', 'Fish Oil', 'Algae Oil'],
    'JOINT & RECOVERY': ['Glucosamine', 'Collagen', 'Turmeric', 'Tart Cherry'],
    'SLEEP & STRESS': ['Melatonin', 'Ashwagandha', 'L-Theanine', 'Glycine'],
    'GUT & IMMUNE': ['Probiotics', 'Vitamin C', 'Elderberry', 'Zinc'],
    'ENERGY': ['Rhodiola Rosea', 'CoQ10', 'Vitamin B Complex'],
  };

  const lines: string[] = [];
  for (const [category, supplements] of Object.entries(categories)) {
    const items = supplements.map(name => {
      const info = COMMON_SUPPLEMENTS_GUIDE[name];
      return info ? `${name} (${info.dosage}, ${info.timing})` : name;
    }).join('; ');
    lines.push(`${category}: ${items}`);
  }
  return lines.join('\n');
}

export async function runDailyPlanAiTitration({
  todayKey,
  todayBasePlan,
  deterministicPlan,
  todayCheckin,
  memoryLayer,
  lastDayContext,
  user,
}: AiTitrationInput): Promise<AiTitrationResult> {
  console.log('🤖 [AI Titration] Starting PERSONALIZED daily plan titration...');

  const checkinSummary = buildCheckinSummary(todayCheckin);
  const memorySummary = buildMemorySummary(memoryLayer);
  const yesterdaySummary = buildYesterdaySummary(lastDayContext);
  
  // Get supplements from base plan recovery section
  const basePlanSupplements = todayBasePlan.recovery?.supplements || [];
  const basePlanSupplementCard = todayBasePlan.recovery?.supplementCard;
  
  // Calculate target calories with weight trend adjustment
  const baseCalories = deterministicPlan.nutrition.total_kcal;
  const calorieAdjustment = memoryLayer?.weightTrend?.recommendedCalorieDelta || 0;
  const targetCalories = baseCalories + calorieAdjustment;

  const systemPrompt = `
You are the "Hyper-Personalized Daily Coach" for a fitness app. Your job is to take the user's check-in data and create a plan that VISIBLY responds to their current state. The user should feel like the app truly "heard" them.

=== YOUR CORE MISSION ===
Make ACTIVE, VISIBLE adjustments based on the user's data. Don't just keep things the same - personalize everything so the user sees their input reflected in the plan.

=== USER PROFILE ===
Name: ${user.name || 'User'}
Goal: ${user.goal?.replace('_', ' ').toLowerCase() || 'general fitness'}
Training Level: ${user.trainingLevel || 'Intermediate'}
Equipment: ${user.equipment?.join(', ') || 'Bodyweight'}
Injuries/Limitations: ${user.injuries || 'None reported'}
Dietary Preferences: ${user.dietaryPrefs?.join(', ') || 'No restrictions'}
Meals Per Day: ${user.mealCount || 3} (MUST generate exactly this many meals)
Current Supplements (from onboarding): ${user.supplements?.join(', ') || 'None specified'}

=== BASE PLAN SUPPLEMENTS (from weekly plan) ===
Today's planned supplements: ${basePlanSupplements.length > 0 ? basePlanSupplements.join(', ') : 'None specified'}
${basePlanSupplementCard ? `Supplement card - Current: ${basePlanSupplementCard.current?.join(', ') || 'None'}, Add-ons: ${basePlanSupplementCard.addOns?.join(', ') || 'None'}` : ''}

=== TODAY'S CHECK-IN DATA ===
${checkinSummary}

=== YESTERDAY SNAPSHOT (for continuity) ===
${yesterdaySummary}

=== MEMORY LAYER (Historical Trends) ===
${memorySummary}

=== YESTERDAY CONTEXT USAGE RULES ===

Use the yesterday snapshot as a one-day "conclusion" layer in addition to the EMA trends:

1. **Health Notes** (e.g., "sore throat", "headache", "cold"):
   - If still relevant today, briefly mention in the daily debrief: "Yesterday you reported a sore throat..."
   - Adjust the plan accordingly: lighter intensity, extra hydration, recovery focus
   - Suggest relevant supplements based on the situation

2. **Workout Status** (completed/partial/skipped):
   - If skipped: Frame today as a low-friction restart, simplify the session
   - If partial: Acknowledge and pick up where they left off
   - If completed: Build on momentum

3. **Days Since Last Check-in**:
   - If > 1 day: Acknowledge politely ("You've had a few days away...") and design a re-entry day
   - If > 3 days: Extra gentle approach, don't overwhelm

4. **Lifestyle Notes** (travel, busy day, etc.):
   - Acknowledge context and adjust expectations

Treat this snapshot as OPTIONAL context: use it when it meaningfully improves coaching, otherwise proceed normally.

=== SUPPLEMENT RECOMMENDATION RULES (AI-DRIVEN) ===

You have FULL AUTONOMY to recommend supplements based on the user's complete profile and today's check-in data.
SELECT from the SUPPLEMENT REFERENCE GUIDE below.

**User Profile for Supplement Decisions:**
- Goal: ${user.goal?.replace('_', ' ') || 'General fitness'}
- Age: ${user.age || 'Not specified'}
- Sex: ${user.sex || 'Not specified'}
- Training Level: ${user.trainingLevel || 'Intermediate'}
- Training Days: ${user.trainingDays || 3}/week
- Activity Level: ${user.activityLevel || 'Moderately Active'}
- Dietary Preferences: ${user.dietaryPrefs?.join(', ') || 'None'}
- Injuries: ${user.injuries || 'None'}
- Personal Goals: ${user.personalGoals?.join(', ') || 'None specified'}
- Perceived Lacks: ${user.perceivedLacks?.join(', ') || 'None specified'}

**Today's Check-in Factors to Consider:**
- Energy level, stress, sleep quality
- Soreness areas and duration (from memory layer)
- Digestion status
- Hydration levels
- Whether they took supplements yesterday
- Any health notes or special requests

**SUPPLEMENT REFERENCE GUIDE (use for dosages and timing):**
${formatSupplementGuideForTitration()}

**Supplement Card Structure:**
- "current": User's existing supplements from onboarding (copy from base plan)
- "addOns": YOUR personalized recommendations for TODAY. Use the reference guide above for proper dosages and timing.

**Guidelines:**
1. SELECT supplements from the reference guide above based on user's profile + today's check-in
2. Consider their goal, age, sex, diet, injuries, and today's state together
3. Use exact dosages and timing from the guide
4. Recommend 1-4 add-ons maximum, prioritized by relevance to TODAY
5. Consider what they're already taking to avoid redundancy
6. Never suggest anything illegal, prescription-only, or potentially harmful

=== ADJUSTMENT RULES - FOLLOW THESE ACTIVELY ===

**WORKOUT ADJUSTMENTS:**
1. Energy Level (1-10):
   - 1-3: Cut volume by 40%, increase RIR to 4+, focus on compound movements only
   - 4-5: Cut volume by 20%, increase RIR by 1-2
   - 6-7: Standard plan
   - 8-10: Can add 1-2 extra sets, decrease RIR by 1 for intensity

2. Desired Workout Intensity (1-10):
   - 1-3: Recovery day - light movement, stretching, walking
   - 4-5: Moderate - reduce weight/intensity, focus on form
   - 6-7: Standard training
   - 8-10: Push hard! Lower RIR, add intensity techniques

3. Soreness Areas:
   - AVOID or SUBSTITUTE exercises targeting sore muscle groups
   - If legs sore: swap squats for upper body, or do light leg mobility
   - If back sore: avoid deadlifts, rows - do supported exercises instead

4. Chronic Soreness (3+ days same area):
   - RED FLAG: Completely avoid that muscle group
   - Add specific mobility/recovery for that area

5. Yesterday's Workout Quality:
   - 1-4: Reduce today's volume, focus on recovery
   - 5-7: Standard progression
   - 8-10: Can push slightly harder today

6. Alcohol Yesterday:
   - If YES: Reduce intensity by 20%, increase hydration focus, prioritize recovery

7. Woke Feeling:
   - Tired: Reduce volume, add warm-up time
   - Wired: May need to burn energy, longer cardio okay
   - Refreshed: Standard or push harder

8. Special Request:
   - MUST honor any specific request (time limit, focus area, avoid certain exercises,ignore anything that is not related to fitness)
   - Mention you're honoring it in adjustments

**NUTRITION ADJUSTMENTS:**
1. Apply weightTrend.recommendedCalorieDelta: ${calorieAdjustment > 0 ? '+' : ''}${calorieAdjustment} kcal to base ${baseCalories} = ${targetCalories} kcal target

2. MEAL COUNT - CRITICAL: User wants exactly ${user.mealCount || 3} meals per day
   - Generate EXACTLY ${user.mealCount || 3} meal objects in the meals array
   - Distribute calories appropriately across all ${user.mealCount || 3} meals
   - Meal naming guide:
     * 1 meal: "Main Meal" (OMAD style)
     * 2 meals: "First Meal", "Second Meal"
     * 3 meals: "Breakfast", "Lunch", "Dinner"
     * 4 meals: "Breakfast", "Lunch", "Afternoon Snack", "Dinner"
     * 5 meals: "Breakfast", "Morning Snack", "Lunch", "Afternoon Snack", "Dinner"
     * 6 meals: "Breakfast", "Morning Snack", "Lunch", "Afternoon Snack", "Dinner", "Evening Snack"
     * 7 meals: "Breakfast", "Mid-Morning", "Lunch", "Afternoon Snack", "Post-Workout", "Dinner", "Before Bed"
     * 8 meals: "Breakfast", "Snack 1", "Lunch", "Snack 2", "Pre-Workout", "Post-Workout", "Dinner", "Before Bed"

3. Digestion:
   - Heavy: Lighter meals, more spacing, avoid heavy fats, smaller portions per meal
   - Normal: Standard plan
   - Light: Can have denser meals, good absorption day

4. Hydration (waterL):
   - <2.5L: Emphasize water intake in plan
   - 2.5-3.5L: Adequate, encourage pushing toward 3.5L baseline
   - >3.5L: Great hydration

5. Supplements:
   - If suppsYN=false: Remind to take supplements in recovery section
   - If suppsYN=true: Acknowledge consistency

**RECOVERY ADJUSTMENTS:**
1. Sleep Hours:
   - <6h: Add power nap suggestion, earlier bedtime, reduce training volume
   - 6-7h: Standard recovery
   - 7-9h: Optimal, can train harder
   - >9h: Check if overtraining, ensure quality over quantity

2. Stress Level (1-10):
   - 7+: Add stress-relief activities (breathing, meditation, walk)
   - 4-6: Standard recovery
   - 1-3: Low stress, can push training harder

3. Sleep Trend (EMA):
   - If trending down (<0.5): Prioritize sleep hygiene tips
   - If trending up (>0.7): Great progress, maintain

**MOTIVATION MESSAGE - CRITICAL:**
Generate a SHORT (2-3 sentences max) motivational message that:
- Connects to their goal and current state
- Provides encouragement without being over-the-top
- Keep it brief and genuine

**ADJUSTMENTS ARRAY (Workout-focused) - CRITICAL:**
Every adjustment MUST explain what changed AND which specific check-in value caused it:
✅ GOOD: "Reduced leg exercises from 4 to 2 due to reported leg soreness"
✅ GOOD: "Increased RIR to 3 because energy level is 4/10"
✅ GOOD: "Honoring special request: focusing on upper body only"
❌ BAD: "Adjusted workout for recovery" (too vague)
❌ BAD: "Modified plan" (no specific reason)

**NUTRITION ADJUSTMENTS ARRAY - CRITICAL:**
Separate array for nutrition-specific changes based on check-in:
✅ GOOD: "Added +100 kcal because weight trend is down and goal is muscle gain"
✅ GOOD: "Lighter meal portions recommended due to 'Heavy' digestion reported"
✅ GOOD: "Increased hydration to 3.5L due to low water intake (1.5L) yesterday"
✅ GOOD: "Added extra protein to dinner for overnight recovery after poor sleep (5hrs)"
✅ GOOD: "Reduced carbs in breakfast due to high stress (8/10) - easier digestion"
❌ BAD: "Adjusted nutrition" (too vague)
❌ BAD: "Modified calories" (no specific reason)

=== PERSONAL MESSAGE (careNotes) RULES - CRITICAL ===

**VOICE & TONE:**
Write as a PhD-level strength & conditioning coach and sports scientist speaking to an athlete.
- Calm, professional, precise
- NO hype words, NO emojis, NO exclamation marks
- Do NOT repeat raw numbers unless absolutely necessary
- Your job is to INTERPRET the data, not repeat it
- The message should read like a short daily debrief from a trusted expert

**STRUCTURE (1 paragraph, 3-5 sentences):**

1. OPENING ASSESSMENT: Start with a clear assessment of the day's readiness profile.
   ✅ GOOD: "Today's profile indicates you're in a strong position for productive training."
   ✅ GOOD: "Today's markers point toward accumulated fatigue requiring a measured approach."
   ✅ GOOD: "Current indicators suggest adequate recovery with room for moderate progression."
   ❌ BAD: "Your energy is 7/10 and stress is 3/10!" (just repeating numbers)

2. KEY INSIGHT (1-2 sentences): Identify something meaningful that isn't obvious from raw numbers.
   - Cross-reference multiple signals (e.g., sleep trend + soreness + stress pattern)
   - Note what the COMBINATION of factors suggests about their physiological state
   - Reference memory layer trends (chronic soreness, sleep debt, digestion patterns, weight trajectory)
   - Mention missed workouts or check-in gaps if relevant
   
   ✅ GOOD: "The combination of adequate sleep with persistent lower-body soreness entering day three suggests you're absorbing training load but approaching a point where deload considerations become relevant."
   ✅ GOOD: "While subjective energy appears normal, the downward sleep trend over the past four days combined with elevated stress indicates early-stage accumulated fatigue that warrants attention."
   ❌ BAD: "You slept 7 hours and have leg soreness." (just listing facts)

3. PLAN MODIFICATION RATIONALE: Explicitly state what you changed and why.
   ✅ GOOD: "Accordingly, I've reduced lower-body volume by one working set per movement and shifted emphasis toward upper-body accessories."
   ✅ GOOD: "Given these factors, today's session has been simplified to prioritize movement quality over load, with extended mobility work programmed post-training."
   ❌ BAD: "The plan has been adjusted." (too vague)

4. CLOSING RECOMMENDATION: End with a specific, actionable focus for the day.
   ✅ GOOD: "Focus on execution quality rather than load progression, and prioritize an earlier sleep window tonight."
   ✅ GOOD: "Maintain hydration above baseline and avoid the temptation to push beyond prescribed intensities."
   ✅ GOOD: "Pay attention to intra-set recovery; if bar speed deteriorates noticeably, terminate the set rather than grinding."
   ❌ BAD: "Have a great workout!" (generic, unhelpful)

**DATA TO INTERPRET (translate these into meaning, don't list them):**
- energy, stress, sleepHrs, wokeFeeling → overall readiness and CNS state
- soreness (areas + duration from memory) → tissue recovery and injury risk
- digestion → nutrient absorption capacity and meal timing considerations
- waterL, alcoholYN → hydration status and recovery quality
- motivation, workoutIntensity → psychological readiness and appropriate challenge level
- yesterdayWorkoutQuality → recent training response
- suppsYN → protocol adherence
- specialRequest → athlete-specific needs to address
- Memory layer trends (EMA scores, soreness streaks, weight trend) → longer-term patterns

**EXAMPLES OF EXCELLENT careNotes:**

Example 1 (Good recovery day):
"Today's profile indicates favorable conditions for productive training, with adequate rest and low systemic stress creating an environment conducive to quality work. The absence of residual soreness from recent sessions suggests tissue adaptation is proceeding well, though the slight downward trend in sleep duration over the past three days warrants monitoring. I've maintained the planned volume and intensity for today's session. Focus on maintaining consistent hydration throughout the day and consider an earlier bedtime to prevent cumulative sleep debt."

Example 2 (Fatigue indicators):
"Current markers suggest accumulated fatigue that merits a conservative approach today. The combination of below-baseline sleep, elevated stress, and persistent shoulder discomfort entering its second consecutive day points toward incomplete recovery between sessions. Accordingly, I've reduced pressing volume and substituted overhead work with horizontal variations that place less demand on the affected structures. Prioritize recovery modalities this evening and resist the urge to compensate with additional work."

Example 3 (Mixed signals):
"Today presents a nuanced readiness profile requiring careful calibration. While subjective energy and motivation are elevated, the underlying sleep trend and digestive heaviness reported suggest the body may be masking accumulated stress. I've preserved the session structure but added buffer sets at reduced RIR to allow autoregulation based on performance feedback. Pay close attention to bar speed and terminate sets if velocity drops noticeably rather than pushing through."

=== OUTPUT FORMAT ===
Return ONLY valid JSON with this exact structure:
{
  "workout": {
    "focus": ["string array of focus areas"],
    "blocks": [
      {
        "name": "Block Name",
        "items": [
          { "exercise": "name", "sets": number, "reps": "string", "RIR": number }
        ]
      }
    ],
    "intensity": "string description",
    "notes": "any important notes"
  },
  "nutrition": {
    "total_kcal": ${targetCalories},
    "protein_g": ${deterministicPlan.nutrition.protein_g},
    "meals_per_day": ${user.mealCount || 3},
    "meals": [
      // MUST have EXACTLY ${user.mealCount || 3} meal objects here
      {
        "name": "Meal Name",
        "items": [{ "food": "name", "qty": "amount" }]
      }
      // ... repeat for all ${user.mealCount || 3} meals
    ],
    "hydration_l": number
  },
  "recovery": {
    "mobility": ["string array of mobility tasks"],
    "sleep": ["string array of sleep recommendations"],
    "careNotes": "PhD-level daily debrief (see PERSONAL MESSAGE RULES above)",
    "supplementCard": {
      "current": ["Copy user's existing supplements from base plan supplementCard.current"],
      "addOns": ["Your personalized recommendations for TODAY with dosage and timing"]
    }
  },
  "motivation": "Your personalized motivation message here",
  "adjustments": [
    "Workout adjustment 1 with data reference",
    "Workout adjustment 2 with data reference"
  ],
  "nutritionAdjustments": [
    "Nutrition adjustment 1 with data reference (e.g., 'Added +100 kcal due to weight trend')",
    "Nutrition adjustment 2 with data reference (e.g., 'Lighter meals recommended due to heavy digestion')"
  ],
  "flags": [
    "FLAG_NAME_IF_APPLICABLE"
  ],
  "dailyHighlights": "A SHORT paragraph (2-3 sentences) summarizing the key highlights of today for memory storage",
  "fatalError": null
}

=== DAILY HIGHLIGHTS RULES (for memory) ===

Generate a SHORT paragraph (2-3 sentences max) that captures the essence of today's session for future reference.
This will be stored in memory to provide context for future days.

Include:
- The main focus/theme of today (e.g., "Upper body strength day with reduced volume")
- Any significant adjustments made (e.g., "Modified for shoulder soreness")
- Key state indicators (e.g., "Good energy, moderate stress")
- Any health/lifestyle factors (e.g., "Returning after 2-day break", "Recovering from cold symptoms")

Examples:
✅ "Upper body push session with standard volume. Energy and recovery markers favorable. No significant adjustments required."
✅ "Recovery-focused session due to accumulated fatigue from low sleep trend. Reduced intensity and added extra mobility work."
✅ "Re-entry day after 3-day break. Simplified full-body session to rebuild momentum. Moderate readiness indicators."
✅ "Leg day with reduced quad volume due to persistent soreness. Added extra hamstring and glute work to compensate."

Keep it factual and concise - this is for memory, not motivation.

IMPORTANT:
- The motivation field is REQUIRED and must be personalized and hype the user up to get them excited to train
- The "adjustments" array is for WORKOUT changes only
- The "nutritionAdjustments" array is for NUTRITION changes only (calories, macros, meal timing, hydration)
- Every adjustment (workout or nutrition) must reference specific check-in data
- Apply the calorie adjustment: target is ${targetCalories} kcal
- MUST generate EXACTLY ${user.mealCount || 3} meals in the meals array (user preference)
- Honor any special requests from the user
- The "dailyHighlights" field is REQUIRED - it will be stored for future context
- If you cannot safely generate a plan, set fatalError to explain why
`;

  const userPrompt = JSON.stringify({
    context: {
      todayKey,
      dayOfWeek: todayKey.charAt(0).toUpperCase() + todayKey.slice(1),
      userGoal: user.goal,
      userName: user.name,
      userInjuries: user.injuries,
      trainingLevel: user.trainingLevel,
      mealCount: user.mealCount || 3,
    },
    todayBasePlan: {
      workout: todayBasePlan.workout,
      nutrition: todayBasePlan.nutrition,
      recovery: todayBasePlan.recovery,
    },
    deterministicPlan: {
      workout: deterministicPlan.workout,
      nutrition: deterministicPlan.nutrition,
      recovery: deterministicPlan.recovery,
      currentMotivation: deterministicPlan.motivation,
      ruleBasedAdjustments: deterministicPlan.adjustments,
    },
    todayCheckin: {
      // Include ALL check-in fields explicitly
      moodCharacter: todayCheckin.moodCharacter,
      energy: todayCheckin.energy,
      stress: todayCheckin.stress,
      motivation: todayCheckin.motivation,
      sleepHrs: todayCheckin.sleepHrs,
      wokeFeeling: todayCheckin.wokeFeeling,
      soreness: todayCheckin.soreness || [],
      digestion: todayCheckin.digestion,
      waterL: todayCheckin.waterL,
      currentWeight: todayCheckin.currentWeight,
      workoutIntensity: todayCheckin.workoutIntensity,
      yesterdayWorkoutQuality: todayCheckin.yesterdayWorkoutQuality,
      alcoholYN: todayCheckin.alcoholYN,
      suppsYN: todayCheckin.suppsYN,
      specialRequest: todayCheckin.specialRequest,
    },
    memoryLayer: memoryLayer ? {
      ema: memoryLayer.ema,
      scores: memoryLayer.scores,
      sorenessStreaks: memoryLayer.sorenessStreaks,
      digestionStreaks: memoryLayer.digestionStreaks,
      weightTrend: memoryLayer.weightTrend,
    } : null,
    calculatedTargets: {
      baseCalories,
      calorieAdjustment,
      targetCalories,
      proteinTarget: deterministicPlan.nutrition.protein_g,
      mealsPerDay: user.mealCount || 3,
    },
  }, null, 2);

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Generate today's PERSONALIZED plan. Make visible adjustments based on my check-in data:\n\n${userPrompt}` }
  ];

  console.log('📝 [AI Titration] Prompt built with full check-in data');
  console.log('📊 [AI Titration] Check-in summary:', {
    energy: todayCheckin.energy,
    stress: todayCheckin.stress,
    workoutIntensity: todayCheckin.workoutIntensity,
    soreness: todayCheckin.soreness,
    specialRequest: todayCheckin.specialRequest ? 'Yes' : 'No',
  });

  try {
    const response = await generateAICompletion(messages);
    
    if (!response.completion) {
      throw new Error('Empty AI response');
    }

    const rawJson = extractJSON(response.completion);
    const parsed = JSON.parse(rawJson);

    if (parsed.fatalError) {
      throw new Error(`AI Fatal Error: ${parsed.fatalError}`);
    }

    // Basic validation
    if (!parsed.workout || !parsed.nutrition || !parsed.recovery) {
      throw new Error('Invalid AI response structure: missing core fields');
    }
    
    // Ensure workout has proper structure with blocks
    if (!parsed.workout.blocks || !Array.isArray(parsed.workout.blocks)) {
      console.warn('⚠️ [AI Titration] Workout missing blocks, using base plan blocks');
      parsed.workout.blocks = todayBasePlan.workout.blocks || [];
    }
    
    // Ensure workout has focus array
    if (!parsed.workout.focus || !Array.isArray(parsed.workout.focus)) {
      parsed.workout.focus = todayBasePlan.workout.focus || ['General'];
    }
    
    // Log workout structure
    console.log('📊 [AI Titration] Workout structure:', {
      blocksCount: parsed.workout.blocks.length,
      focus: parsed.workout.focus,
      hasItems: parsed.workout.blocks.every((b: any) => Array.isArray(b.items)),
    });

    // Validate and ensure motivation exists
    if (!parsed.motivation || typeof parsed.motivation !== 'string' || parsed.motivation.trim().length < 10) {
      // Generate a fallback motivation based on check-in data
      parsed.motivation = generateFallbackMotivation(todayCheckin, user);
      console.log('⚠️ [AI Titration] Generated fallback motivation');
    }

    // Validate and ensure careNotes (personal message) exists with proper quality
    if (!parsed.recovery.careNotes || typeof parsed.recovery.careNotes !== 'string' || parsed.recovery.careNotes.trim().length < 50) {
      // Generate a fallback careNotes in PhD-level coach style
      parsed.recovery.careNotes = generateFallbackCareNotes(todayCheckin, user, memoryLayer, lastDayContext);
      console.log('⚠️ [AI Titration] Generated fallback careNotes (personal message)');
    }

    // Validate flags is array
    if (!Array.isArray(parsed.flags)) {
      parsed.flags = [];
    }
    
    // Validate adjustments is array
    if (!Array.isArray(parsed.adjustments)) {
      parsed.adjustments = [];
    }
    
    // Validate nutritionAdjustments is array
    if (!Array.isArray(parsed.nutritionAdjustments)) {
      parsed.nutritionAdjustments = [];
    }
    
    // Validate and ensure dailyHighlights exists
    if (!parsed.dailyHighlights || typeof parsed.dailyHighlights !== 'string' || parsed.dailyHighlights.trim().length < 20) {
      // Generate a fallback daily highlights
      parsed.dailyHighlights = generateFallbackDailyHighlights(todayCheckin, parsed.workout, lastDayContext);
      console.log('⚠️ [AI Titration] Generated fallback dailyHighlights');
    }

    // Add automatic flags based on data
    const autoFlags = generateAutoFlags(todayCheckin, memoryLayer);
    parsed.flags = [...new Set([...parsed.flags, ...autoFlags])];

    console.log('✅ [AI Titration] Success - Personalized plan generated');
    console.log('📝 [AI Titration] Workout adjustments count:', parsed.adjustments.length);
    console.log('🍽️ [AI Titration] Nutrition adjustments count:', parsed.nutritionAdjustments.length);
    console.log('🚩 [AI Titration] Flags:', parsed.flags);
    console.log('📋 [AI Titration] Daily highlights:', parsed.dailyHighlights.substring(0, 100) + '...');
    
    return {
      workout: parsed.workout,
      nutrition: parsed.nutrition,
      recovery: parsed.recovery,
      motivation: parsed.motivation,
      adjustments: parsed.adjustments,
      nutritionAdjustments: parsed.nutritionAdjustments,
      flags: parsed.flags,
      dailyHighlights: parsed.dailyHighlights,
    };

  } catch (error) {
    console.error('❌ [AI Titration] Failed:', error);
    throw error; // Propagate to allow upper layer to handle specific error message
  }
}

/**
 * Generate automatic flags based on check-in data
 */
function generateAutoFlags(checkin: CheckinData, memory: TrendMemory | null): string[] {
  const flags: string[] = [];
  
  // Energy flags
  if (checkin.energy !== undefined && checkin.energy <= 3) {
    flags.push('LOW_ENERGY');
  } else if (checkin.energy !== undefined && checkin.energy >= 8) {
    flags.push('HIGH_ENERGY');
  }
  
  // Stress flags
  if (checkin.stress !== undefined && checkin.stress >= 7) {
    flags.push('HIGH_STRESS');
  }
  
  // Sleep flags
  if (checkin.sleepHrs !== undefined && checkin.sleepHrs < 6) {
    flags.push('LOW_SLEEP');
  }
  
  // Workout intensity flags
  if (checkin.workoutIntensity !== undefined && checkin.workoutIntensity >= 8) {
    flags.push('HIGH_INTENSITY_REQUESTED');
  } else if (checkin.workoutIntensity !== undefined && checkin.workoutIntensity <= 3) {
    flags.push('RECOVERY_DAY_REQUESTED');
  }
  
  // Alcohol flag
  if (checkin.alcoholYN) {
    flags.push('ALCOHOL_YESTERDAY');
  }
  
  // Supplements flag
  if (checkin.suppsYN === false) {
    flags.push('MISSED_SUPPLEMENTS');
  }
  
  // Soreness flags
  if (checkin.soreness && checkin.soreness.length > 0) {
    flags.push(`SORENESS_${checkin.soreness.join('_').toUpperCase()}`);
  }
  
  // Memory-based flags
  if (memory) {
    if (memory.ema.sleep < 0.5) {
      flags.push('LOW_SLEEP_TREND');
    }
    if (memory.ema.energy < 0.5) {
      flags.push('LOW_ENERGY_TREND');
    }
    if (memory.sorenessStreaks.length > 0) {
      memory.sorenessStreaks.forEach(streak => {
        flags.push(`CHRONIC_SORENESS_${streak.area.toUpperCase()}`);
      });
    }
    if (memory.weightTrend.recommendedCalorieDelta !== 0) {
      flags.push(`CALORIE_ADJUST_${memory.weightTrend.recommendedCalorieDelta > 0 ? '+' : ''}${memory.weightTrend.recommendedCalorieDelta}`);
    }
  }
  
  // Special request flag
  if (checkin.specialRequest && checkin.specialRequest.trim()) {
    flags.push('HAS_SPECIAL_REQUEST');
  }
  
  return flags;
}

/**
 * Generate a fallback motivation message if AI doesn't provide one
 */
function generateFallbackMotivation(checkin: CheckinData, user: User): string {
  const goalText = user.goal?.replace('_', ' ').toLowerCase() || 'your goals';
  const energy = checkin.energy || 5;
  const stress = checkin.stress || 5;
  
  if (energy >= 7 && stress <= 4) {
    return `Favorable conditions for quality work today. Stay focused on execution and trust the process toward ${goalText}.`;
  } else if (energy <= 4 || stress >= 7) {
    return `Today calls for a measured approach. Prioritize movement quality over intensity and remember that consistency matters more than any single session.`;
  } else {
    return `Adequate readiness for today's session. Focus on the fundamentals and let the work accumulate toward ${goalText}.`;
  }
}

/**
 * Generate a fallback careNotes (personal message) if AI doesn't provide one
 * Written in PhD-level coach style
 */
function generateFallbackCareNotes(
  checkin: CheckinData, 
  user: User, 
  memory: TrendMemory | null,
  lastDay: LastDayContext | null
): string {
  const parts: string[] = [];
  
  // Opening assessment based on combined signals
  const energy = checkin.energy || 5;
  const stress = checkin.stress || 5;
  const sleepHrs = checkin.sleepHrs || 7;
  const soreness = checkin.soreness || [];
  
  // Determine overall readiness
  const readinessScore = (energy / 10) * 0.3 + ((10 - stress) / 10) * 0.3 + (Math.min(sleepHrs, 8) / 8) * 0.4;
  
  // Check for re-entry scenario
  const isReEntry = lastDay && lastDay.daysSinceLastCheckin > 1 && lastDay.daysSinceLastCheckin < 999;
  const hadHealthIssue = lastDay?.healthNote;
  const skippedYesterday = lastDay?.yesterdayWorkoutStatus === 'skipped';
  
  // Opening assessment
  if (isReEntry) {
    parts.push(`After ${lastDay!.daysSinceLastCheckin} days away from check-ins, today's session is structured as a measured re-entry to training.`);
  } else if (hadHealthIssue) {
    parts.push(`Following yesterday's reported ${hadHealthIssue}, today's plan has been calibrated with recovery considerations in mind.`);
  } else if (skippedYesterday) {
    parts.push("Yesterday's session was missed, so today is framed as a low-friction restart rather than an aggressive catch-up.");
  } else if (readinessScore >= 0.7) {
    parts.push("Today's profile indicates favorable conditions for productive training, with adequate recovery markers suggesting readiness for quality work.");
  } else if (readinessScore >= 0.5) {
    parts.push("Current indicators suggest moderate readiness with some factors warranting attention during today's session.");
  } else {
    parts.push("Today's markers point toward accumulated fatigue or suboptimal recovery, suggesting a conservative approach would be prudent.");
  }
  
  // Key insight based on available data
  if (hadHealthIssue) {
    parts.push(`If the ${hadHealthIssue} symptoms persist, consider further reducing intensity and prioritizing hydration and rest over training volume.`);
  } else if (soreness.length > 0) {
    const sorenessAreas = soreness.join(' and ');
    if (memory?.sorenessStreaks?.some(s => s.length >= 3)) {
      parts.push(`Persistent ${sorenessAreas} discomfort entering multiple consecutive days suggests incomplete tissue recovery that merits reduced loading on affected structures.`);
    } else {
      parts.push(`Residual ${sorenessAreas} soreness indicates normal training adaptation, though exercise selection has been adjusted to manage local fatigue.`);
    }
  } else if (sleepHrs < 6) {
    parts.push("Suboptimal sleep duration may compromise motor learning and recovery capacity, making this an appropriate day to prioritize execution over intensity.");
  } else if (stress >= 7) {
    parts.push("Elevated systemic stress can impair recovery and performance; the session has been calibrated to avoid adding unnecessary physiological load.");
  } else if (memory?.ema?.sleep !== undefined && memory.ema.sleep < 0.5) {
    parts.push("The downward trend in sleep quality over recent days warrants monitoring, as cumulative sleep debt can subtly impair training adaptations.");
  } else {
    parts.push("The balance of recovery indicators supports the planned training stimulus without significant modification.");
  }
  
  // Closing recommendation
  const goalText = user.goal?.replace('_', ' ').toLowerCase() || 'your training goals';
  if (isReEntry || skippedYesterday) {
    parts.push("Focus on completing the session rather than maximizing output, and use today to rebuild momentum and routine consistency.");
  } else if (hadHealthIssue) {
    parts.push("Listen to your body throughout the session and do not hesitate to scale back further if symptoms resurface.");
  } else if (readinessScore < 0.5) {
    parts.push(`Focus on movement quality rather than load progression today, and prioritize recovery modalities this evening to support continued progress toward ${goalText}.`);
  } else if (checkin.workoutIntensity !== undefined && checkin.workoutIntensity >= 8) {
    parts.push("Channel today's elevated drive into precise execution rather than chasing numbers, and maintain awareness of technique under fatigue.");
  } else {
    parts.push(`Maintain consistent effort throughout the session and trust that systematic work accumulates toward ${goalText}.`);
  }
  
  return parts.join(' ');
}

/**
 * Generate a fallback daily highlights summary if AI doesn't provide one
 */
function generateFallbackDailyHighlights(
  checkin: CheckinData,
  workout: WorkoutPlan,
  lastDay: LastDayContext | null
): string {
  const parts: string[] = [];
  
  // Workout focus
  const focus = workout?.focus?.join(' and ') || 'General training';
  parts.push(`${focus} session.`);
  
  // Key state indicators
  const energy = checkin.energy || 5;
  const stress = checkin.stress || 5;
  const sleepHrs = checkin.sleepHrs;
  
  if (energy >= 7 && stress <= 4) {
    parts.push('Good energy, low stress.');
  } else if (energy <= 4 || stress >= 7) {
    parts.push('Reduced readiness indicators.');
  } else {
    parts.push('Moderate readiness.');
  }
  
  // Soreness
  if (checkin.soreness && checkin.soreness.length > 0) {
    parts.push(`${checkin.soreness.join(', ')} soreness noted.`);
  }
  
  // Re-entry or health context
  if (lastDay?.daysSinceLastCheckin && lastDay.daysSinceLastCheckin > 1 && lastDay.daysSinceLastCheckin < 999) {
    parts.push(`Returning after ${lastDay.daysSinceLastCheckin}-day break.`);
  } else if (lastDay?.healthNote) {
    parts.push(`Following ${lastDay.healthNote} from yesterday.`);
  } else if (lastDay?.yesterdayWorkoutStatus === 'skipped') {
    parts.push('Re-entry after missed session.');
  }
  
  return parts.join(' ');
}

function extractJSON(text: string): string {
  let cleaned = text
    .replace(/^```json\s*\n?/gim, '')
    .replace(/^```\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();
  
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return cleaned;
}
