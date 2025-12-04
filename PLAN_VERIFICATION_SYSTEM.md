# Plan Verification System (v3 - Split-First Architecture)

This document explains how **base plan generation and verification** works in the new split-first pipeline.

**v3 Changes:** Moved to a split-first architecture with parallel per-day builders and component-level verification.

---

## Overview

**Primary goal:**

- Generate a workout split first as the foundation
- Build base nutrition template with global macros
- Run per-day builders in parallel (workouts, nutrition adjustments, supplements)
- Verify each component as it completes
- Generate reasons that tie together split, nutrition changes, and recovery

**Key files:**

- `supabase/functions/process-plan-queue/index.ts`
  - Split-first generation pipeline with checkpoints
  - All prompt builders (split, nutrition, workouts, supplements, verifiers, reasoning)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SPLIT-FIRST PLAN GENERATION                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STAGE 0: Workout Split (Foundation)                                         │
│  ├── Build prompt with full user profile                                     │
│  ├── AI determines: which day trains what, rest days, intensity              │
│  └── Output: 7-day split structure (focus, muscles, intensity per day)       │
│                                                                              │
│           ↓ (split data feeds all downstream stages)                         │
│                                                                              │
│  STAGE 1: Base Nutrition                                                     │
│  ├── Calculate macros based on goal (calories, protein, carbs, fats)         │
│  ├── AI creates base meal templates                                          │
│  └── Output: Global nutrition plan + meal templates                          │
│                                                                              │
│           ↓ (split + base nutrition feed parallel builders)                  │
│                                                                              │
│  STAGE 2: PARALLEL Per-Day Builders                                          │
│  ├── 7x Daily Workout Builders (detailed exercises per day from split)       │
│  ├── 7x Nutrition Adjusters (tweak base plan for day's training intensity)   │
│  └── 1x Supplements Builder (recovery protocols based on split)              │
│                                                                              │
│           ↓ (each component verified as it completes)                        │
│                                                                              │
│  STAGE 3: PARALLEL Component Verification                                    │
│  ├── Verify each workout (equipment, avoided exercises, injuries)            │
│  ├── Verify each nutrition (dietary rules, macro targets)                    │
│  └── Verify supplements (safety, goal alignment)                             │
│                                                                              │
│           ↓ (all verified components + deltas feed reasoning)                │
│                                                                              │
│  STAGE 4: Split-Aware Reasoning                                              │
│  ├── Receives: split, nutrition deltas, supplement focus                     │
│  └── Generates motivating daily reasons that connect all components          │
│                                                                              │
│           ↓ (final plan)                                                     │
│                                                                              │
│  FINAL: Merge & Programmatic Fixes                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Stage Details

### STAGE 0: Workout Split

**Prompt:** `buildWorkoutSplitPrompt(user)`

Creates the foundation for the entire plan:
- Determines training vs rest days (matching user's `trainingDays` preference)
- Assigns focus areas per day (e.g., "Chest + Triceps", "Legs", "Rest")
- Sets intensity level (high/moderate/low/rest)
- Identifies primary and secondary muscles

**Output structure:**
```json
{
  "monday": {
    "isRestDay": false,
    "focus": ["Chest", "Triceps"],
    "intensity": "high",
    "primaryMuscles": ["Chest"],
    "secondaryMuscles": ["Triceps", "Front Delts"]
  },
  // ... all 7 days
}
```

### STAGE 1: Base Nutrition

**Prompt:** `buildBaseNutritionPrompt(user)`

Creates the nutrition template:
- Calculates macros based on user's goal, weight, and activity
- Creates base meals that can be adjusted per day
- Respects dietary restrictions (vegetarian, eggitarian, etc.)

**Output structure:**
```json
{
  "dailyCalories": 2500,
  "dailyProtein": 180,
  "dailyCarbs": 280,
  "dailyFats": 80,
  "mealsPerDay": 4,
  "baseMeals": [...],
  "hydrationLiters": 2.5
}
```

### STAGE 2: Parallel Builders

**Daily Workouts:** `buildDailyWorkoutPrompt(day, splitDay, user)`
- Creates detailed workout for a single day
- Uses split data to know focus and intensity
- Respects equipment, avoided exercises, injuries

**Nutrition Adjustments:** `buildNutritionAdjustmentPrompt(day, splitDay, baseNutrition, user)`
- Adjusts base nutrition for the day's training demands
- High intensity days: +10% carbs, +5% protein
- Rest days: -15% carbs
- Tracks deltas for reasoning

**Supplements:** `buildSupplementsFromSplitPrompt(workoutSplit, user)`
- Creates recovery protocols aligned with training split
- Daily mobility, sleep tips, supplement timing
- Recommends new supplements based on goal

### STAGE 3: Component Verification

**Verifiers run in parallel as components complete:**

- `buildWorkoutVerifierPrompt(day, workout, user)` - Checks equipment, banned exercises, injury safety
- `buildNutritionVerifierPrompt(day, nutrition, user, targets)` - Checks dietary compliance, macro accuracy
- `buildSupplementsVerifierPrompt(supplements, user)` - Checks safety, contraindications

### STAGE 4: Reasoning

**Prompt:** `buildSplitAwareReasonPrompt(split, nutritionDeltas, supplementsDaily, user)`

Generates motivating daily reasons that:
- Reference the workout split
- Explain nutrition adjustments
- Connect recovery focus to training

---

## Checkpoint System

Checkpoints allow resuming from any stage if the function times out:

```typescript
const CHECKPOINT = {
  NONE: 0,
  SPLIT_COMPLETE: 1,           // Workout split generated
  BASE_NUTRITION_COMPLETE: 2,  // Base nutrition plan generated
  WORKOUTS_COMPLETE: 3,        // All 7 daily workouts done
  NUTRITION_ADJUST_COMPLETE: 4,// All nutrition adjustments done
  SUPPLEMENTS_COMPLETE: 5,     // Supplements generated
  VERIFIERS_COMPLETE: 6,       // All verifications passed
  REASONS_COMPLETE: 7,         // Reasoning added
};
```

---

## Performance

The split-first architecture with parallelism is highly efficient:

| Stage | Approach | Typical Time |
|-------|----------|--------------|
| Split | Sequential | 3-5s |
| Base Nutrition | Sequential | 3-5s |
| Per-Day Builders | Parallel (15 calls) | 15-25s |
| Verification | Parallel (15 calls) | 8-15s |
| Reasoning | Sequential | 3-5s |
| **Total** | **Parallel where possible** | **35-55s** |

---

## What Gets Verified

Component-level verification catches:

1. **Workout Issues**
   - Banned exercises used
   - Equipment not available
   - Unsafe for user's injuries
   
2. **Nutrition Issues**
   - Dietary violations (meat for vegetarians, etc.)
   - Calorie/protein off-target
   - Wrong meal count
   
3. **Supplement Issues**
   - Dangerous interactions
   - Contraindicated for user
   - Not aligned with goal

---

## Usage

```typescript
// Server-side (Edge Function)
const result = await generatePlan(user, jobId, serviceClient, checkpoint, redoContext, timeChecker);

// Result contains the complete plan with all 7 days
// Each day has: workout, nutrition, recovery, reason
```

---

## Quick Reference

- **Split First** - Workout split is the foundation for everything
- **Base Then Adjust** - Nutrition starts as a template, adjusted per day
- **Parallel Everything** - Per-day builders and verifiers run concurrently
- **Component Verification** - Each piece verified independently
- **Connected Reasoning** - Daily reasons tie together all components
- **Checkpoint Resilience** - Can resume from any stage
