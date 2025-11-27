# Yesterday Snapshot Layer (`lastDayContext`)

## Overview

The **Yesterday Snapshot** layer provides a crisp, one-day conclusion context that complements the EMA (Exponential Moving Average) trends. This layer captures what happened (or didn't happen) in the last 1-3 days to help the AI generate more contextually aware daily plans.

## 1️⃣ Type Definition

```typescript
type LastDayContext = {
  lastCheckinDate: string | null;
  daysSinceLastCheckin: number;        // e.g. 0 = today, 1 = yesterday, 3 = they vanished 3 days
  hadCheckinYesterday: boolean;

  // Behaviour
  yesterdayWorkoutStatus?: 'completed' | 'partial' | 'skipped';
  yesterdayNutritionStatus?: 'on_target' | 'under' | 'over' | 'unknown';

  // Notes / symptoms from free text
  healthNote?: string;                 // e.g. "sore throat", "mild cold", "headache"
  lifestyleNote?: string;             // e.g. "travel day", "very busy day"

  // Optional: copy yesterday's specialRequest if it matters
  yesterdaySpecialRequest?: string | null;
};
```

## 2️⃣ How to Build `lastDayContext`

The engine should construct this object **before** calling the AI, based only on the last 1-3 days of data.

### Data Sources

1. **Most Recent Plan + Check-in**
   - Look at the most recent plan and its associated check-in data
   - Extract completion/adherence information

2. **Workout Status** (`yesterdayWorkoutStatus`)
   - From workout completion / adherence flags
   - Determine if yesterday's workout was:
     - `'completed'` - Full workout completed
     - `'partial'` - Some exercises completed but not all
     - `'skipped'` - No workout completed

3. **Nutrition Status** (`yesterdayNutritionStatus`)
   - From food logging / adherence percentage
   - Determine if nutrition was:
     - `'on_target'` - Met nutritional goals
     - `'under'` - Under target calories/macros
     - `'over'` - Over target calories/macros
     - `'unknown'` - No data available

4. **Health Notes** (`healthNote`)
   - Parse yesterday's `specialRequest` / notes for simple health phrases
   - Look for keywords like: "sore throat", "cold", "fever", "sick", "headache", "nausea", etc.
   - Extract and clean into a short string (e.g., "sore throat", "mild cold")

5. **Lifestyle Notes** (`lifestyleNote`)
   - Parse for lifestyle context: "travel day", "very busy day", "rest day", etc.

6. **Time Calculations**
   - `daysSinceLastCheckin`: Compute from `todayDate - lastCheckinDate`
     - `0` = checked in today
     - `1` = checked in yesterday
     - `3` = last check-in was 3 days ago
   - `hadCheckinYesterday`: Boolean based on `daysSinceLastCheckin === 1`

7. **Special Request** (`yesterdaySpecialRequest`)
   - Copy yesterday's `specialRequest` if it's relevant to today's planning

### Implementation Notes

- This is **not an EMA** – it's a crisp snapshot of what happened yesterday
- Focus on the **most recent 1-3 days** only
- Keep health/lifestyle notes **short and clean**
- Don't over-parse – if context is unclear, leave fields undefined

## 3️⃣ Integration with AI Payload

When calling the LLM, include `lastDayContext` in the user payload:

```typescript
{
  // ... existing user data
  lastDayContext,        // Yesterday snapshot
  memoryLayer,           // EMA/trends (existing)
  todayCheckin,          // Today's check-in data
  // ... other context
}
```

## 4️⃣ AI System Prompt Integration

Add a section to the system prompt:

```
YESTERDAY SNAPSHOT (lastDayContext)

Use this as a one-day "conclusion" layer in addition to the EMA trends.

healthNote may contain issues like "sore throat" or "mild cold". If it's still relevant to today's plan, you can:

- Mention it briefly in the personal message ("Yesterday you reported a sore throat…") and
- Make gentle recovery suggestions (e.g. warm fluids, lower intensity, extra rest) and avoid very intense conditioning.

yesterdayWorkoutStatus and yesterdayNutritionStatus tell you whether they actually followed the previous plan.

- If workouts/nutrition were skipped, you may frame today as a low-friction restart and simplify the session.

daysSinceLastCheckin tells you how long they've been off the routine.

- If this is > 1, you can acknowledge it politely ("You've had a few days away from check-ins…") and design a re-entry style day.

Treat this snapshot as optional context: use it when it meaningfully improves coaching, otherwise ignore it.
```

## 5️⃣ Usage Examples

### Example 1: Health Issue Continuity

**Context:**
```typescript
{
  lastCheckinDate: "2024-01-15",
  daysSinceLastCheckin: 1,
  hadCheckinYesterday: true,
  yesterdayWorkoutStatus: "partial",
  yesterdayNutritionStatus: "under",
  healthNote: "sore throat",
  yesterdaySpecialRequest: "Feeling a bit under the weather"
}
```

**AI Response:**
> "Yesterday you mentioned a sore throat, so I've kept today's conditioning mild and added a warm-tea wind-down to your recovery block. We'll focus on gentle movement and recovery."

### Example 2: Re-entry After Absence

**Context:**
```typescript
{
  lastCheckinDate: "2024-01-12",
  daysSinceLastCheckin: 3,
  hadCheckinYesterday: false,
  yesterdayWorkoutStatus: undefined,
  yesterdayNutritionStatus: undefined
}
```

**AI Response:**
> "You've been away from check-ins for three days, so today's plan is a simple re-entry: complete the main block and don't worry about accessories. Let's ease back into the routine."

### Example 3: Skipped Workout Recovery

**Context:**
```typescript
{
  lastCheckinDate: "2024-01-15",
  daysSinceLastCheckin: 1,
  hadCheckinYesterday: true,
  yesterdayWorkoutStatus: "skipped",
  yesterdayNutritionStatus: "on_target",
  lifestyleNote: "very busy day"
}
```

**AI Response:**
> "I see yesterday was a busy day and the workout got skipped. No worries – today's plan is designed as a low-friction restart. We'll pick up where we left off with a focused session."

## 6️⃣ Design Principles

1. **Optional Context**: This layer is meant to enhance coaching when relevant, not to force specific behaviors
2. **Crisp Snapshot**: Focus on yesterday's conclusion, not deep historical analysis
3. **Natural Integration**: Weave context into personal messages naturally, not mechanically
4. **Graceful Degradation**: If context is missing or unclear, the AI should proceed normally
5. **User Empathy**: Use this layer to show understanding and adapt plans accordingly

## 7️⃣ Benefits

- **Continuity**: Maintains awareness of recent health issues or lifestyle changes
- **Re-entry Support**: Helps users get back on track after absences
- **Personalization**: Makes daily plans feel more connected to recent experiences
- **Recovery Awareness**: Allows AI to adjust intensity based on recent health notes
- **Adherence Context**: Understands why plans might have been skipped or modified

## 8️⃣ Implementation Checklist

- [ ] Define `LastDayContext` type in TypeScript
- [ ] Build context extraction logic in plan generation engine
- [ ] Parse health keywords from check-in notes
- [ ] Calculate workout/nutrition adherence status
- [ ] Compute time-based fields (`daysSinceLastCheckin`, `hadCheckinYesterday`)
- [ ] Add `lastDayContext` to AI payload
- [ ] Update system prompt with usage guidelines
- [ ] Test with various scenarios (health issues, absences, skipped workouts)
- [ ] Verify AI responses appropriately use context when relevant

