Plan Generation Process Overview  
1\. Data Collection Phase (Onboarding)  
The process starts in app/onboarding.tsx where comprehensive user data is collected:  
const userData \= {  
goal: 'WEIGHT\_LOSS' | 'MUSCLE\_GAIN' | 'GENERAL\_FITNESS',  
equipment: \['Gym', 'Dumbbells', 'Bodyweight'\],  
dietaryPrefs: \['Vegetarian', 'Non-veg', 'Eggitarian'\],  
trainingDays: 3-7,  
age, sex, weight, height, activityLevel,  
dailyCalorieTarget: calculated via BMR/TDEE,  
supplements, personalGoals, perceivedLacks,  
preferredExercises, avoidExercises,  
sessionLength, fastingWindow, mealCount,  
injuries, specialRequests, etc.  
}  
2\. Base Plan Generation (app/generating-base-plan.tsx)  
Step 1: User Profile Building  
const userProfile \= \[  
\`Goal: ${user.goal}\`,  
\`Equipment: ${user.equipment.join(', ')}\`,  
\`Diet: ${user.dietaryPrefs.join(', ')}\`,  
// ... all user preferences  
\].filter(Boolean).join('\\n');  
Step 2: AI Prompt ConstructionThe system sends a detailed prompt to the AI API:  
const systemPrompt \= \`You are a world-class Personal Trainer & Nutrition Specialist.   
Create a 7-Day Base Plan that EXACTLY matches the user's specific requirements.

\=== USER'S EXACT REQUIREMENTS \===  
${userProfile}

\=== MANDATORY CONSTRAINTS \===  
🏋️ EQUIPMENT AVAILABLE: ${user.equipment.join(', ')}  
🎯 FITNESS GOAL: ${user.goal}  
📅 TRAINING DAYS: ${user.trainingDays} days per week  
⏱️ SESSION LENGTH: ${user.sessionLength || 45} minutes MAX  
// ... more constraints

Return ONLY valid JSON with this exact structure:  
{  
"days": {  
  "monday": {  
    "workout": {  
      "focus": \["Primary muscle groups"\],  
      "blocks": \[  
        {  
          "name": "Warm-up",  
          "items": \[{"exercise": "Dynamic stretching", "sets": 1, "reps": "5-8 min", "RIR": 0}\]  
        }  
      \],  
      "notes": "Specific notes"  
    },  
    "nutrition": {  
      "total\_kcal": ${targetCalories},  
      "protein\_g": ${proteinTarget},  
      "meals": \[  
        {  
          "name": "Breakfast",  
          "items": \[{"food": "Specific food item", "qty": "Exact quantity"}\]  
        }  
      \],  
      "hydration\_l": 3.5  
    },  
    "recovery": {  
      "mobility": \["Specific mobility work"\],  
      "sleep": \["Sleep optimization tip"\]  
    }  
  }  
  // ... all 7 days  
}  
}\`;  
Step 3: JSON Processing & Validation  
// Clean AI response  
let cleanedResponse \= data.completion.trim();  
cleanedResponse \= cleanedResponse.replace(/  
json\\s\\n?|\`\`\`\\s\\n?/g, '');

// Parse and validate structure  
const parsedPlan \= JSON.parse(jsonString);  
if (\!parsedPlan.days || \!parsedPlan.days.monday.workout) {  
  throw new Error('Invalid plan structure');  
}

// Create WeeklyBasePlan object  
const basePlan: WeeklyBasePlan \= {  
  id: Date.now().toString(),  
  createdAt: new Date().toISOString(),  
  days: parsedPlan.days,  
  isLocked: false,  
};  
\#\#\# 3\. \*\*Daily Plan Adjustment (\`app/generating-plan.tsx\`)\*\*

\*\*Step 1: Check-in Data Analysis\*\*  
typescript  
const todayCheckin \= getTodayCheckin(); // Energy, stress, sleep, soreness, mood  
const recentCheckins \= getRecentCheckins(15); // Historical patterns  
const basePlan \= getCurrentBasePlan(); // Today's base template  
\*\*Step 2: Dynamic Adjustment Prompt\*\*  
typescript  
const systemPrompt \= \`You are a Daily Titration Specialist.   
Take a BASE PLAN and make small, data-driven adjustments based on today's check-in data.

BASE PLAN FOR TODAY (${todayKey.toUpperCase()}):  
Workout: ${JSON.stringify(todayBasePlan.workout)}  
Nutrition: ${JSON.stringify(todayBasePlan.nutrition)}

TODAY'S CHECK-IN STATE:  
\- Energy: ${todayCheckin.energy}/10  
\- Stress: ${todayCheckin.stress}/10  
\- Sleep: ${todayCheckin.sleepHrs}h (${todayCheckin.wokeFeeling})  
\- Soreness: ${todayCheckin.soreness?.join(', ') || 'None'}

ADJUSTMENT RULES:  
\- Low energy/poor sleep: \-20-30% volume, cap intensity at RIR≥2  
\- Soreness: auto-swap affected patterns, redistribute volume  
\- Great recovery: allow \+1 set on primaries

Return ONLY adjusted JSON with same structure.\`;  
\*\*Step 3: Fallback System\*\*  
If AI fails, an adaptive fallback generates plans based on user data:  
typescript  
const adaptiveFallbackPlan \= (user: User, checkin: CheckinData): DailyPlan \=\> {  
  const isLowEnergy \= (checkin.energy || 5\) \< 5;  
  const hasEquipment \= user.equipment.some(eq \=\> eq \!== 'Bodyweight');  
    
  return {  
    workout: {  
      focus: isLowEnergy ? \['Recovery'\] : hasEquipment ? \['Upper Body'\] : \['Full Body'\],  
      blocks: \[/ adaptive exercises based on equipment/energy /\]  
    },  
    nutrition: {  
      total\_kcal: user.dailyCalorieTarget || 2000,  
      meals: \[/ adaptive meals based on dietary preferences /\]  
    }  
  };  
};  
\#\#\# 4\. \*\*Plan Display (\`app/plan.tsx\`)\*\*

\*\*JSON Structure Rendering:\*\*  
typescript  
// Workout Tab  
{plan.workout.blocks.map((block, blockIndex) \=\> (  
  \<Card key={blockIndex}\>  
    \<Text\>{block.name}\</Text\>  
    {block.items.map((item, itemIndex) \=\> (  
      \<View key={itemIndex}\>  
        \<Text\>{item.exercise}\</Text\>  
        \<Text\>{item.sets} sets × {item.reps} (RIR {item.RIR})\</Text\>  
      \</View\>  
    ))}  
  \</Card\>  
))}

// Nutrition Tab  
\<Text\>{plan.nutrition.total\_kcal} of {totalCalorieTarget} Cal Eaten\</Text\>  
{plan.nutrition.meals.map((meal, index) \=\> (  
  \<Card key={index}\>  
    \<Text\>{meal.name}\</Text\>  
    {meal.items.map(item \=\> (  
      \<Text\>• {item.food} \- {item.qty}\</Text\>  
    ))}  
  \</Card\>  
))}  
\`  
5\. Key Features  
\- Real-time Adaptation: Daily plans adjust based on check-in data (energy, sleep, soreness)  
\- User Preference Compliance: AI strictly follows equipment, dietary restrictions, exercise preferences  
\- Fallback System: If AI fails, generates adaptive plans using user data  
\- Interactive Elements: Users can check off completed exercises/meals  
\- Plan Editing: Users can request changes via natural language that gets processed by AI  
\# Complete Plan Generation Process Breakdown

Based on my analysis of your fitness app, here's the complete breakdown of how the plan generation system works:  
🏗️ Two-Tier Plan Generation Architecture  
Tier 1: Base Plan Generation (generating-base-plan.tsx)  
This creates your foundational 7-day template that serves as the blueprint for all future daily plans.  
Input Collection Process:  
1\. Comprehensive User Profiling \- The system collects 40+ data points from onboarding:  
   \- Basic stats (age, weight, height, sex, activity level)  
   \- Goals and equipment available  
   \- Dietary preferences and restrictions  
   \- Training preferences (days/week, session length, preferred exercises)  
   \- Lifestyle factors (fasting window, meal count, travel days)  
   \- Limitations (injuries, exercises to avoid)  
   \- Personal goals and perceived weaknesses  
   \- Special requests and constraints  
Base Plan Generation Logic:  
const systemPrompt \= \`You are a world-class Personal Trainer & Nutrition Specialist.   
Create a 7-Day Base Plan that EXACTLY matches the user's specific requirements.

\=== USER'S EXACT REQUIREMENTS \===  
${userProfile} // All 40+ user data points

\=== MANDATORY CONSTRAINTS \===  
🏋️ EQUIPMENT AVAILABLE: ${user.equipment.join(', ')}  
🎯 FITNESS GOAL: ${user.goal}  
📅 TRAINING DAYS: ${user.trainingDays} days per week  
⏱️ SESSION LENGTH: ${user.sessionLength || 45} minutes MAX  
🍽️ DIETARY PREFERENCE: ${user.dietaryPrefs.join(', ')}  
🚫 AVOID EXERCISES: ${user.avoidExercises?.join(', ') || 'None'}  
✅ PREFERRED EXERCISES: ${user.preferredExercises?.join(', ') || 'None'}  
Quality Assurance & Safeguards:  
\- JSON Structure Validation: Ensures all 7 days have complete workout/nutrition/recovery data  
\- Equipment Compliance: Only uses equipment the user actually has  
\- Dietary Restriction Enforcement: Strictly follows user's dietary preferences  
\- Exercise Preference Matching: Includes preferred exercises, excludes avoided ones  
\- Fallback System: If AI generation fails, creates adaptive plan based on user preferences  
Tier 2: Daily Plan Adjustment (generating-plan.tsx)  
This takes your base plan and adjusts it daily based on your real-time check-in data.  
Daily Titration System:  
const systemPrompt \= \`You are a Daily Titration Specialist. Your job is to take a BASE PLAN   
and make small, data-driven adjustments based on today's check-in data.   
DO NOT rebuild the plan \- only adjust what's necessary.

BASE PLAN FOR TODAY (${todayKey.toUpperCase()}):  
Workout: ${JSON.stringify(todayBasePlan.workout)}  
Nutrition: ${JSON.stringify(todayBasePlan.nutrition)}  
Recovery: ${JSON.stringify(todayBasePlan.recovery)}

TODAY'S CHECK-IN STATE:  
\- Energy: ${todayCheckin.energy}/10  
\- Stress: ${todayCheckin.stress}/10  
\- Sleep: ${todayCheckin.sleepHrs}h (${todayCheckin.wokeFeeling})  
\- Soreness: ${todayCheckin.soreness?.join(', ') || 'None'}  
\- Mood: ${todayCheckin.moodCharacter}  
\- Motivation: ${todayCheckin.motivation}/10  
Adjustment Rules Engine:  
\- Low Energy/Poor Sleep: \-20-30% volume, cap intensity at RIR≥2, emphasize mobility  
\- Soreness/Injury: Auto-swap or skip affected patterns, redistribute volume  
\- Travel/Busy: Switch to 20-30min bodyweight/DB circuits  
\- Digestive Issues: Reduce dense carbs pre-workout, lighter morning meals  
\- Great Recovery: Allow \+1 set on primaries or slightly tighter RIR  
\- Diet Adherence Issues: Keep same meals but adjust portions  
🔍 Data Processing & Validation Pipeline  
Input Validation:  
1\. User Data Completeness Check: Ensures all required fields are present  
2\. Check-in Data Validation: Verifies today's check-in exists and is complete  
3\. Base Plan Availability: Confirms base plan exists for the current day  
AI Response Processing:  
// Multi-layer JSON cleaning and validation  
let cleanedResponse \= data.completion.trim();  
cleanedResponse \= cleanedResponse.replace(/  
json\\s\\n?|\`\`\`\\s\\n?/g, '');  
cleanedResponse \= cleanedResponse.replace(/^\[^{\]/, '').replace(/\[^}\]$/, '');

// Find matching braces for complete JSON extraction  
const jsonStart \= cleanedResponse.indexOf('{');  
let braceCount \= 0;  
for (let i \= jsonStart; i \< cleanedResponse.length; i++) {  
  if (cleanedResponse\[i\] \=== '{') braceCount++;  
  if (cleanedResponse\[i\] \=== '}') {  
    braceCount--;  
    if (braceCount \=== 0\) {  
      jsonEnd \= i \+ 1;  
      break;  
    }  
  }  
}  
\`  
Error Handling & Recovery:  
\- JSON Parsing Failures: Multiple cleanup attempts with detailed error logging  
\- Incomplete Responses: Detects truncated responses and retries  
\- Structure Validation: Ensures all required plan components exist  
\- Fallback Plans: Generates adaptive plans based on user preferences if AI fails  
🎯 Plan Accuracy & Personalization Guarantees  
User Preference Enforcement:  
1\. Equipment Constraints: Only uses equipment from user's available list  
2\. Dietary Compliance: Strictly follows dietary preferences (Vegetarian/Eggitarian/Non-veg)  
3\. Exercise Preferences: Includes preferred exercises, excludes avoided ones  
4\. Session Length Limits: Respects user's time constraints  
5\. Special Requests: Honors specific user requirements (injuries, Ramadan, etc.)  
Nutritional Accuracy:  
\- TDEE Calculation: Uses Mifflin-St Jeor equation for BMR, then applies activity multipliers  
\- Goal-Based Adjustments: Weight loss (-15%), muscle gain (+15%), maintenance (100%)  
\- Macro Distribution: Protein target based on body weight (0.9g per lb)  
\- Meal Planning: Distributes calories across user's preferred meal count (3-6 meals)  
Workout Precision:  
\- Progressive Overload: Tracks and adjusts volume/intensity over time  
\- Recovery Integration: Considers soreness patterns from recent check-ins  
\- Equipment Optimization: Maximizes effectiveness with available equipment  
\- Time Efficiency: Fits workouts within user's session length preference  
🔄 Continuous Improvement Loop  
Daily Feedback Integration:  
1\. Check-in Analysis: Processes energy, sleep, stress, soreness data  
2\. Pattern Recognition: Identifies trends in user's recovery and performance  
3\. Adaptive Adjustments: Modifies future plans based on response patterns  
4\. Adherence Tracking: Monitors completion rates and adjusts difficulty  
Plan Evolution:  
\- Base Plan Updates: Users can edit and refine their 7-day template  
\- AI-Powered Modifications: Real-time plan editing through natural language  
\- Progress Tracking: Weight, measurements, and performance metrics  
\- Long-term Optimization: Plans evolve based on user's changing needs and progress  
🛡️ Quality Control Measures  
Pre-Generation Validation:  
\- User profile completeness check  
\- Equipment availability verification  
\- Dietary restriction validation  
\- Goal alignment confirmation  
Post-Generation Verification:  
\- JSON structure integrity  
\- Nutritional target accuracy  
\- Exercise safety validation  
\- Time constraint compliance  
Fallback Systems:  
\- Adaptive plan generation if AI fails  
\- Equipment-specific exercise databases  
\- Dietary preference meal templates  
\- Progressive difficulty scaling

Complete LLM Plan Generation Process  
1\. Two-Stage Plan Generation Architecture  
Your app uses a sophisticated two-stage approach:  
Stage 1: Base Plan Generation (app/generating-base-plan.tsx)  
\- Creates a comprehensive 7-day foundation plan during onboarding  
\- Uses extensive user profiling with 40+ data points  
\- Generates a complete weekly template that serves as the foundation  
Stage 2: Daily Plan Adjustment (app/generating-plan.tsx)  
\- Takes the base plan and adjusts it daily based on real-time check-in data  
\- Uses a "Daily Titration Specialist" approach for micro-adjustments  
\- Considers energy levels, stress, sleep, soreness, and motivation  
2\. LLM Integration Details  
API Endpoint: https://toolkit.rork.com/text/llm/- Uses POST requests with structured message format  
\- Implements comprehensive error handling and JSON parsing  
\- Has fallback mechanisms for when AI fails  
Request Structure:  
{  
messages: \[  
  { role: 'system', content: systemPrompt },  
  { role: 'user', content: userRequest }  
\]  
}  
3\. User Data Collection & Processing  
Comprehensive User Profiling:  
\- Basic info: age, sex, weight, height, activity level  
\- Goals: fitness goal, personal goals, perceived lacks  
\- Equipment: available equipment list  
\- Preferences: dietary preferences, preferred exercises, exercises to avoid  
\- Constraints: session length, meal count, fasting window, injuries  
\- Special requests: custom user requirements  
Real-time Check-in Data:  
\- Energy level (1-10)  
\- Stress level (1-10)  
\- Sleep hours and quality  
\- Soreness areas  
\- Mood character  
\- Motivation level (1-10)  
\- Recent training patterns  
4\. AI Prompt Engineering  
Base Plan System Prompt (Comprehensive):  
You are a world-class Personal Trainer & Nutrition Specialist. Create a 7-Day Base Plan that EXACTLY matches the user's specific requirements. DO NOT use generic templates.

\=== MANDATORY CONSTRAINTS \===  
🏋️ EQUIPMENT AVAILABLE: \[user equipment\]  
🎯 FITNESS GOAL: \[user goal\]  
📅 TRAINING DAYS: \[X\] days per week  
⏱️ SESSION LENGTH: \[X\] minutes MAX  
🍽️ DIETARY PREFERENCE: \[user diet\]  
🚫 AVOID EXERCISES: \[user avoids\]  
✅ PREFERRED EXERCISES: \[user prefers\]  
Daily Adjustment System Prompt (Targeted):  
You are a Daily Titration Specialist. Your job is to take a BASE PLAN and make small, data-driven adjustments based on today's check-in data. DO NOT rebuild the plan \- only adjust what's necessary.

ADJUSTMENT RULES:  
\- Low HRV/poor sleep/high stress: \-20-30% volume, cap intensity at RIR≥2  
\- Soreness/injury: auto-swap or skip affected patterns  
\- Travel/busy: switch to 20-30min bodyweight circuits  
\- Energy low: reduce dense carbs pre-workout  
\- Great recovery: allow \+1 set on primaries  
5\. JSON Structure & Validation  
Expected Output Format:  
{  
"workout": {  
  "focus": \["Primary muscle groups"\],  
  "blocks": \[  
    {  
      "name": "Warm-up",  
      "items": \[{"exercise": "Name", "sets": 3, "reps": "8-12", "RIR": 2}\]  
    }  
  \],  
  "notes": "Specific notes"  
},  
"nutrition": {  
  "total\_kcal": 2000,  
  "protein\_g": 150,  
  "meals": \[{"name": "Breakfast", "items": \[{"food": "Item", "qty": "Amount"}\]}\],  
  "hydration\_l": 3.5
},  
"recovery": {  
  "mobility": \["Specific tips"\],  
  "sleep": \["Sleep tips"\]  
},  
"motivation": "Personalized message",  
"adjustments": \["List of changes made"\]  
}  
6\. Robust Error Handling & Fallbacks  
JSON Parsing Pipeline:  
1\. Remove markdown code blocks  
2\. Extract JSON boundaries using brace counting  
3\. Fix common JSON issues (trailing commas, unquoted keys)  
4\. Validate structure completeness  
5\. Character-level error reporting  
Adaptive Fallback System:  
\- If AI fails, generates intelligent fallback plans  
\- Uses user preferences to create equipment-appropriate workouts  
\- Adapts nutrition based on dietary preferences  
\- Maintains user-specific constraints  
7\. Quality Assurance & Safeguards  
Plan Validation:  
\- Ensures all required sections exist (workout, nutrition, recovery)  
\- Validates JSON structure integrity  
\- Checks for truncated responses  
\- Verifies user preferences are followed  
User Preference Enforcement:  
\- Equipment constraints strictly enforced  
\- Dietary preferences respected  
\- Exercise preferences/avoidances honored  
\- Session length limits maintained  
\- Special requests incorporated  
8\. Data Flow & Storage  
Plan Storage Pipeline:  
1\. Generate plan with AI  
2\. Validate and parse JSON  
3\. Create DailyPlan object with metadata  
4\. Store in AsyncStorage via useUserStore  
5\. Make available for UI consumption  
Plan Retrieval:  
\- getTodayPlan() \- Gets current day's plan  
\- getCurrentBasePlan() \- Gets active base plan  
\- Plans linked to specific dates for tracking  
9\. User Experience Features  
Loading States:  
\- Animated loading screens with rotating messages  
\- Progress indicators for plan generation  
\- Smooth transitions between states  
Plan Editing:  
\- AI-powered plan modifications in plan-preview.tsx- Users can request changes in natural language  
\- Real-time plan updates with progress bars  
10\. Key Strengths of Your Implementation  
1\. Personalization: 40+ user data points ensure highly tailored plans  
2\. Adaptability: Daily adjustments based on real-time biometric data  
3\. Reliability: Comprehensive fallback systems prevent failures  
4\. User Control: Natural language editing and preference enforcement  
5\. Data Integrity: Robust JSON parsing and validation  
6\. Performance: Efficient caching and local storage  
7\. User Experience: Smooth animations and clear feedback