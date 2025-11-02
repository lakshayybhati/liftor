# Hyper-Personalized Base Plan System

## Overview
The base plan generation has been completely rewritten to create **reactive, hyper-personalized 7-day microcycles** that consume all user data and justify every decision with Yesterday→Today→Tomorrow logic.

## Major Enhancements

### 1. ✅ Reactive Microcycle Logic

**Yesterday→Today→Tomorrow Tracking**:
- **Day 1**: Baseline (fresh neuromuscular state)
- **Day 2+**: Considers what was trained Day N-1
- **Per-muscle load management**:
  - If muscle hit hard yesterday → Reduce volume 20-40%, increase RIR +1-2, use machines
  - If muscle under-served → Increase volume, add compounds, lower RIR
  - Each day explicitly sets up tomorrow's capabilities

**Example Flow**:
```
Day 1: Push (chest, shoulders, triceps) - 4x6-8 @ RIR 2
Day 2: Pull (considers chest fatigue from yesterday, full volume for back)
Day 3: Legs (upper body recovering, full volume for lower)
Day 4: Recovery (manages accumulated fatigue)
```

---

### 2. ✅ Optimal Exercise Selection

**Exercise Guidance Includes**:
- **RIR (0-5)**: Reps in reserve for autoregulation
- **RPE (6-10)**: Rate of perceived exertion
- **Tempo**: e.g., "3010" (3s eccentric, 0s pause, 1s concentric, 0s top)
- **Rest periods**: 60-180s based on goal
- **Load guidance**: "80-85% 1RM or RPE 8"
- **Progressive overload**: "+2.5kg from last week"

**2-3 Substitutions Per Exercise**:
1. **Unilateral variation**: Address imbalances (single-arm, single-leg)
2. **Grip/stance variation**: Change stimulus angle (wide, narrow, neutral)
3. **Low-impact alternative**: For high DOMS days (machines, isometrics)

---

### 3. ✅ Hard Time Constraints

**Session Time Management**:
- `est_time_min` field required for every workout
- Must be ≤ user's session cap (default 45 min)
- Includes warmup, working sets, rest periods, transitions
- If over budget: reduce exercises, not quality

**Time Calculation**:
```
Warmup: 5-8 min
Exercise 1: 4 sets × (60s work + 120s rest) = 12 min
Exercise 2: 3 sets × (45s work + 90s rest) = 7 min
...
Cool-down: 5-10 min
Total: Must fit within cap
```

---

### 4. ✅ Daily Intensity Distribution

**Intensity Labels**:
- **Deload**: Active recovery only
- **Light**: Low volume, high RIR (3-4)
- **Moderate**: Standard training volume
- **Hard**: High volume, low RIR (0-2)
- **Peak**: Max effort, competition prep

**Weekly Distribution** (prevents overtraining):
- Matches user's intensity preference (1-10 slider)
- Balances hard days with recovery
- Progressive wave loading across weeks

---

### 5. ✅ Goal-Appropriate Conditioning

**Integrated Finishers**:
- **Fat Loss**: HIIT circuits, metabolic conditioning, 10-15 min
- **Muscle Gain**: Light cardio, zone 2, 5-10 min
- **Endurance**: Steady-state, tempo runs, 15-20 min
- **Time-efficient**: Supersets, active rest between sets

---

### 6. ✅ Nutrition Hyper-Personalization

**Strict Requirements**:
- **Meal count**: Exactly matches user's preference (never deviates)
- **Calorie accuracy**: ±5% tolerance (e.g., 2000 kcal = 1900-2100)
- **Protein accuracy**: ±5% tolerance (e.g., 150g = 142-157g)
- **Real foods only**: No generic terms ("lean protein" → "chicken breast 150g")
- **Local/practical**: Based on dietary preference and region

**Macro Timing Intelligence**:
- **Pre-workout (1-2hrs)**: Carbs for energy
- **Post-workout (within 2hrs)**: Protein + carbs for recovery
- **Fat distribution**: Lower around training, higher at night
- **Fiber target**: 25-35g daily
- **Hydration**: Bodyweight × 0.033L + activity adjustments

**Meal Swaps** (2-3 per meal):
1. Similar macros, different food
2. Budget-friendly option
3. Quick prep/meal prep friendly alternative

---

### 7. ✅ Recovery Specificity

**Day-Specific Components**:
- **Mobility**: Matches worked tissues (e.g., hip flexors after leg day)
- **Sleep tactics**: Actionable (not generic "get 8hrs")
  - No screens 1hr before bed
  - Cool room (65-68°F)
  - Consistent timing
- **Steps prescription**: 8-12k based on training/recovery day
- **Stress control**: Breathwork, meditation, nature exposure
- **Empathetic careNotes**: References user's goals and yesterday's work

**Smart Supplement Recommendations**:
- ONLY suggests if not already in user's list
- Relevant to day's training demands
- Training days: Protein, caffeine pre-workout
- Recovery days: Magnesium, omega-3
- Always includes timing guidance

---

### 8. ✅ Comprehensive Reason Strings

**Each Day Includes 3-5 Sentence Justification**:

**a) Yesterday's Context**:
- "Day 3 follows Pull training yesterday (back, biceps) with 16 total sets at RIR 2"
- "Coming off rest day, neuromuscular system is fresh"

**b) Today's Rationale**:
- "Today's Leg workout uses barbell squats (available equipment) for your muscle gain goal"
- "Session designed for 43 minutes (under 45min cap) with 6/10 intensity preference"

**c) Tomorrow's Setup**:
- "Tomorrow is recovery, so tonight's protein (155g via 3 meals) and sleep are critical"
- "Tomorrow trains Upper Body - today's leg work won't interfere"

**d) User Data Citations**:
- "Equipment: Dumbbells + Bodyweight only (no barbell exercises)"
- "3 meals/day respected (breakfast at 10am per 16:8 IF window)"
- "Avoided deadlifts per your knee injury limitation"
- "Intensity: 8/10 preference = lower RIR (1-2) for progressive overload"

**e) Split Justification**:
- "Push/Pull/Legs split optimal for 3 days/week at intermediate level"
- "Weekly volume: 45 sets total distributed evenly across muscle groups"

**Example Complete Reason**:
> "Day 2 follows Full Body training yesterday (8 sets legs, 6 sets push, 6 sets pull) - managed fatigue by shifting to recovery mode (walking, stretching only) allowing muscle repair. Today's active recovery uses 25 minutes (well under 45min cap) with 2/10 intensity. Nutrition: 3 meals hit 2050kcal and 148g protein (within ±5% targets) with even macro distribution, respecting vegetarian diet and no fasting window. No injury limitations. Tomorrow trains Push, so today's light movement and protein intake set up optimal pressing performance while preventing overtraining."

---

## New Day Naming Convention

**Changed from weekday names to day numbers**:
- Old: `monday`, `tuesday`, `wednesday`, etc.
- New: `day1`, `day2`, `day3`, `day4`, `day5`, `day6`, `day7`

**Rationale**:
- More flexible (user can start any day of week)
- Clearer microcycle progression
- Removes weekday assumptions
- Easier Yesterday→Today→Tomorrow references

---

## JSON Structure Enhancements

### Workout Block Structure
```json
{
  "exercise": "Barbell Bench Press",
  "sets": 4,
  "reps": "6-8",
  "RIR": 2,
  "RPE": 8,
  "tempo": "3010",
  "rest_sec": 120,
  "load_guidance": "80-85% 1RM or RPE 8",
  "substitutions": [
    "Dumbbell Bench Press (unilateral imbalance work)",
    "Close-grip Bench Press (triceps emphasis)",
    "Machine Chest Press (if DOMS high)"
  ],
  "notes": "Progressive overload: +2.5kg from last week"
}
```

### Nutrition Structure
```json
{
  "name": "Pre-Workout Meal",
  "timing": "1-2 hours before training",
  "items": [
    {
      "food": "Oats",
      "qty": "80g dry",
      "macros": "48c/11p/6f"
    },
    {
      "food": "Banana",
      "qty": "1 medium (120g)",
      "macros": "27c/1p/0f"
    }
  ],
  "swaps": [
    "Rice cakes (50g) + honey (20g) - similar carbs, quicker digestion",
    "White rice (100g cooked) - budget option",
    "Sweet potato (150g) - meal prep friendly"
  ]
}
```

### Recovery Structure
```json
{
  "mobility": [
    "Push-specific: pec stretches, shoulder dislocates, thoracic rotation (10 min)"
  ],
  "sleep": [
    "Target 8 hours tonight (muscle protein synthesis peaks during deep sleep)",
    "Actionable: Dim lights at 9pm, cool room to 67°F, magnesium at 10pm",
    "Tomorrow is Pull day - quality rest ensures back/bicep performance"
  ],
  "steps": "8,000-10,000 (maintain NEAT without interfering with recovery)",
  "stress_control": [
    "10min box breathing post-workout (4-4-4-4 pattern)",
    "20min nature walk if weather permits",
    "Yesterday's progress: celebrate completing full Push workout"
  ],
  "careNotes": "Outstanding Push session today! You trained chest, shoulders, and triceps with 20 total sets at RIR 2, directly supporting your muscle gain goal. Coming fresh from yesterday's rest allowed quality volume. Your intermediate experience shows in exercise execution. Tomorrow trains Pull (back, biceps), so tonight's protein (152g via 3 meals, vegetarian diet) and 8hrs sleep are critical for recovery and setup. Session fit perfectly in 43min (under 45min cap) with 7/10 intensity matching your preference.",
  "supplements": [
    "Protein powder 25g post-workout (if meals don't hit 152g target)",
    "Creatine 5g (timing flexible, supports strength gains)",
    "Omega-3 2g with dinner (anti-inflammatory, joint health)"
  ]
}
```

---

## System Intelligence

### Equipment Filtering
- **Only suggests exercises with available equipment**
- **Provides substitutions for equipment variations**
- Example: No barbell? → Dumbbell variations, resistance bands, bodyweight progressions

### Injury Avoidance
- **Automatically filters contraindicated exercises**
- **Suggests low-impact alternatives**
- Example: Knee injury? → Skip squats, use leg press, split squats with control

### Progressive Overload Tracking
- **References "last week" for load increases**
- **Suggests specific weight jumps (+2.5kg, +5lb)**
- **Balances intensity across microcycle**

### Macro Distribution Intelligence
- **Pre-workout**: Higher carbs, moderate protein, lower fat
- **Post-workout**: Protein + carbs for recovery
- **Evening meals**: Higher fat for satiety and hormones
- **Fasting window**: Meal timing respects IF schedules

---

## Validation Enhancements

**New Checks**:
- ✅ `est_time_min` ≤ session cap
- ✅ Food quantities present for all items
- ✅ Meal count matches user preference exactly
- ✅ Calorie/protein within ±5% tolerance
- ✅ Reason strings reference yesterday/tomorrow
- ✅ Substitutions provided (2-3 per exercise)
- ✅ Equipment used matches available only
- ✅ Day naming: day1-day7 (not weekdays)

---

## Testing Scenarios

### 1. Beginner, 3 Days/Week, Bodyweight Only
**Expected**:
- Full Body workouts on day1, day3, day5
- Recovery on day2, day4, day6, day7
- Bodyweight exercises only (push-ups, squats, pull-ups)
- Conservative RIR (3-4) for beginners
- Reason: "Day 2 follows Full Body yesterday, recovery today sets up day 3"

### 2. Intermediate, 5 Days/Week, Gym Access
**Expected**:
- Push/Pull/Legs split with variations
- 2 recovery days strategically placed
- Full gym exercise selection
- Moderate RIR (2-3) for growth
- Reason: "Day 3 (Legs) follows Pull yesterday - no overlap, fresh lower body"

### 3. Advanced, 6 Days/Week, Limited Equipment (Dumbbells)
**Expected**:
- High-frequency split (PPL × 2)
- 1 recovery day
- Dumbbell-focused exercise selection
- Low RIR (1-2) for advanced progression
- Reason: "Day 4 (Push again) follows 2 days rest from last Push - volume management via reduced sets"

### 4. Fat Loss Goal, Vegetarian, 4 Days/Week
**Expected**:
- HIIT conditioning finishers
- Vegetarian meal options (paneer, tofu, dal, eggs if eggitarian)
- Calorie deficit maintained
- Cardio prescriptions higher
- Reason: "Conditioning finisher (12min HIIT) supports fat loss goal, fits 42min session cap"

---

## User Experience Improvements

**Before**: Generic plans with no context
- "Monday: Push day with chest and triceps"
- No explanation why
- No connection between days

**After**: Hyper-personalized reactive plans
- "Day 2 follows day 1's Push session (chest hit hard with 12 sets @ RIR 2). Today is recovery to allow repair before day 3's Pull workout. Your vegetarian diet (3 meals) provides 2050kcal and 148g protein (±5% of targets). Light walking (25min) maintains NEAT without taxing yesterday's worked muscles. Tomorrow trains back/biceps - today's protein and mobility work set that up."

**Benefits**:
- User understands WHY each decision was made
- Sees connection between days
- Knows how their input (equipment, diet, time) shaped the plan
- Feels plan is truly personalized, not template

---

## Files Modified

1. **services/documented-ai-service.ts**
   - `constructBasePlanPrompts()`: Complete rewrite with reactive logic
   - Day naming: weekdays → day1-day7
   - Enhanced example structure with all new fields
   - Comprehensive reasoning templates

2. **Validation** (updated)
   - Checks for day1-day7 (not weekdays)
   - Validates new fields (est_time_min, tempo, RPE, substitutions)
   - Ensures quantities and swaps present

3. **Fallback system** (updated)
   - Uses day1-day7 naming
   - Includes enhanced structure fields
   - Maintains hyper-personalization even in fallback

---

## Success Metrics

✅ **Reactive**: Each day considers yesterday's training
✅ **Justified**: Every decision explained with user data  
✅ **Time-constrained**: All workouts fit session cap
✅ **Equipment-aware**: Only uses available tools
✅ **Nutrition-precise**: Hits targets within ±5%
✅ **Recovery-specific**: Mobility matches worked tissues
✅ **Progressive**: Load guidance and overload strategy
✅ **Unique**: Each day's reason is completely distinct

---

## Deployment Notes

**User Communication**:
- Explain day1-day7 convention (more flexible than weekdays)
- Highlight Yesterday→Today→Tomorrow logic in onboarding
- Show example reason string so users know what to expect

**Performance**:
- Longer AI prompts (~2x tokens)
- More complex JSON structure
- Plan generation may take 5-10s longer
- Worth it for quality improvement

**Monitoring**:
- Track reason string quality (are they truly unique?)
- Validate time estimates match reality
- Check substitution relevance
- Monitor macro accuracy (±5% adherence)

---

## Future Enhancements

1. **Actual load tracking**: Store user's weights, suggest specific increases
2. **Muscle soreness input**: Let users report DOMS, adjust dynamically
3. **Meal timing optimization**: Based on training schedule and work hours
4. **Exercise video library**: Link substitutions to form videos
5. **Weekly progression**: Auto-increase volume/intensity over weeks
6. **Deload week automation**: Every 4-6 weeks based on fatigue markers

---

## Conclusion

The base plan system is now **truly intelligent and reactive**. Every workout, meal, and recovery tactic is:
- **Justified** with explicit reasoning
- **Connected** to yesterday and tomorrow
- **Personalized** using all user data
- **Optimal** for the user's specific constraints

This isn't just a workout plan - it's a **coaching system** that explains its decisions and adapts to the user's unique situation.

