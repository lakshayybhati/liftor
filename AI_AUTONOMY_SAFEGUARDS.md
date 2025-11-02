# AI Autonomy Safeguards - Implementation Summary

**Date**: November 1, 2025
**Purpose**: Ensure AI generates truly personalized plans instead of copying example structures

---

## Problem Statement

The base plan generation system provides a JSON structure example to the AI, which creates a risk of the AI simply copying the example instead of thinking independently and creating a truly personalized plan based on user data.

---

## Solution Implemented

### 1. **Placeholder-Based Example Structure**

All example content has been replaced with explicit AI instruction placeholders:

**Before**:
```json
{
  "exercise": "Barbell Squat",
  "sets": 4,
  "reps": "6-8"
}
```

**After**:
```json
{
  "exercise": "[AI: SELECT specific compound from user equipment - e.g., Barbell Squat if gym, DB Goblet Squat if dumbbells]",
  "sets": 4,
  "reps": "[AI: CHOOSE based on goal - strength: 5-8, hypertrophy: 8-12, endurance: 12-20]"
}
```

### 2. **Explicit Autonomy Instructions in System Prompt**

Added a prominent warning at the top of the system prompt:

```
⚠️  CRITICAL AUTONOMY REQUIREMENT ⚠️
You will receive a JSON structure showing REQUIRED FIELDS AND FORMAT ONLY.
The example exercises, foods, and reasoning text are PLACEHOLDERS prefixed with "[AI: ...]".
You MUST think independently and generate a completely original plan based on user data.
DO NOT copy any placeholder text. SELECT, CALCULATE, and JUSTIFY every choice.
```

### 3. **Detailed Autonomy Guidelines in User Request**

Added comprehensive instructions at the end of the user request covering:

#### What the AI Must Decide Autonomously:
- Specific exercises based on equipment + goal + experience
- Exact rep ranges based on goal
- RIR/RPE based on intensity preference
- Real food items matching dietary preferences
- Actual quantities that hit calorie/protein targets
- Equipment-filtered substitutions
- Unique reasoning for each day

#### Deep Thinking Prompts:
- What was trained yesterday? How does that affect today?
- Is this muscle group recovered for high volume?
- Does this exercise fit the time budget?
- Are these foods realistic and accessible?
- Does reasoning explain Yesterday→Today→Tomorrow logic?

#### Variation Requirements:
- Don't repeat the same exercises every day
- Rotate food items across meals and days
- Use different rep ranges across the week
- Adjust RIR based on accumulated fatigue

#### Calculation Requirements:
- `est_time_min` must be realistic
- Macro totals must be ±5% of targets
- Substitutions must be truly equivalent

#### Specificity Requirements:
- Name actual exercises (not "compound movement")
- State actual muscles worked (not "upper body")
- Reference user's actual data

### 4. **Example Reasoning Comparison**

**Good Reasoning Example Provided**:
```
"Day 3 follows Pull training yesterday where we hit back/biceps with 18 total sets (RIR 2). 
Today's Leg workout uses barbell squats, Romanian deadlifts, and Bulgarian split squats 
(your gym equipment) for 42 minutes (under 45min cap). These compound movements target 
your muscle gain goal at intermediate level. Volume is high (20 sets) since legs are fresh, 
but RIR is 2-3 per your 6/10 intensity preference. Three meals (breakfast 10am per 16:8 IF 
window, lunch 2pm, dinner 8pm) distribute 2050kcal and 152g protein via chicken, rice, 
vegetables (non-veg diet). Tomorrow is recovery, so tonight's protein and 8hrs sleep are 
critical for quad/hamstring/glute repair."
```

**Bad Reasoning Example (What NOT to Do)**:
```
"This is a training day focusing on the split. Exercises match your goals. Nutrition hits targets."
```

### 5. **Placeholder Format Convention**

All AI decision points follow this format:
```
[AI: ACTION INSTRUCTION - example guidance]
```

This makes it impossible for the AI to accidentally include placeholder text in the final output without being obvious that it failed to follow instructions.

---

## Implementation Locations

### `services/documented-ai-service.ts` - `constructBasePlanPrompts()`

1. **Lines 232-238**: Critical autonomy warning in system prompt
2. **Lines 380-426**: Workout exercise placeholders with explicit AI instructions
3. **Lines 470-511**: Nutrition meal/food placeholders with calculation instructions
4. **Line 543**: Reasoning placeholder requiring unique, specific content
5. **Lines 556-600**: Comprehensive autonomy guidelines in user request

---

## Expected AI Behavior

### The AI Should:
✅ Read all user data (goal, equipment, diet, training level, etc.)
✅ Select appropriate exercises from the available equipment
✅ Calculate proper rep ranges for the user's goal
✅ Choose real, accessible foods matching dietary preferences
✅ Calculate quantities that hit calorie/protein targets
✅ Write unique reasoning for each day citing specific choices
✅ Vary exercises, foods, and rep ranges across the week
✅ Apply reactive logic based on previous day's training

### The AI Should NOT:
❌ Copy placeholder text verbatim
❌ Use generic terms like "compound movement" instead of specific exercises
❌ Repeat the same exercises/foods every day
❌ Write vague reasoning like "matches your goals"
❌ Ignore user constraints (equipment, time, diet)
❌ Generate identical plans for different users

---

## Validation Points

The system still validates that the AI's output includes:
- 7 complete days with proper structure
- All required fields populated
- Food items with **both** `food` and `qty` fields
- Realistic time estimates within the session cap
- Nutrition totals within ±5% of targets
- Proper workout blocks (warmup, main, conditioning, cooldown)

---

## Testing Recommendations

To verify AI autonomy, test with:

1. **Equipment Variation**: Users with only dumbbells vs. full gym access
2. **Dietary Constraints**: Vegan, vegetarian, non-veg, keto users
3. **Training Level**: Beginner (should get full-body), Advanced (should get splits)
4. **Time Constraints**: 30min vs. 90min session caps
5. **Goal Variation**: Fat loss vs. muscle gain vs. endurance

**Expected**: Each should produce distinctly different plans with appropriate exercises, foods, splits, and reasoning.

---

## Fallback System

If the AI fails to generate a valid plan, the `generateAdaptiveBasePlan()` function provides a simplified, deterministic fallback that still respects user constraints and produces a usable plan.

---

## Success Metrics

✅ **No two users with different profiles should receive identical plans**
✅ **All placeholder text `[AI: ...]` should be replaced with actual content**
✅ **Reasoning should be specific, citing actual exercises and user data**
✅ **Exercise selection should match available equipment**
✅ **Food selection should match dietary preferences**
✅ **Time estimates should respect session caps**

---

## Maintenance Notes

When modifying the example structure:
1. Always use `[AI: ACTION - guidance]` format for any content that should be AI-generated
2. Never provide "ready to copy" example content (specific exercises, foods, generic reasoning)
3. Test with diverse user profiles to verify output variation
4. Update autonomy instructions if new fields are added to the plan structure

---

**Status**: ✅ Implemented and ready for testing
**Next Step**: Generate plans for diverse test users and verify autonomy compliance


