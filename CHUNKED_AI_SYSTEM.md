# Chunked AI Plan Generation System

## Overview
The new chunked AI system addresses the core issues that were causing fallback plans by implementing research-backed solutions:

1. **Schema Validation with Zod** - Ensures AI responses match expected structure
2. **Response Chunking** - Generates plans day-by-day to avoid token limits
3. **Proper Token Management** - Uses appropriate token limits per request
4. **Robust Error Handling** - Graceful handling of AI provider failures

## Key Improvements

### 🔧 Schema Validation (`/utils/plan-schemas.ts`)
- **Zod schemas** for all plan components (exercises, meals, workouts, etc.)
- **Strict validation** ensures AI responses have correct structure
- **Detailed error reporting** shows exactly what's wrong with responses
- **Automatic repair** fixes common validation issues

### 🧩 Chunked Generation (`/services/chunked-ai-service.ts`)
- **Day-by-day generation** - Each day generated separately (2048 tokens max)
- **Individual validation** - Each day validated before adding to plan
- **Fallback per day** - If one day fails, only that day uses fallback
- **Rate limiting** - 500ms delay between requests to avoid API limits

### 📊 Token Management
- **Reduced token limits** - 2048 tokens per day vs 32k for full week
- **Focused prompts** - Concise, specific prompts for each day
- **Response size control** - Smaller responses are more reliable

### 🛡️ Error Handling
- **Provider fallback** - Gemini → Toolkit API → Fallback plan
- **Validation fallback** - Invalid AI response → Structured fallback
- **Graceful degradation** - System always produces a working plan

## Technical Implementation

### Day Generation Process
```typescript
1. Calculate nutrition targets (calories, protein)
2. Determine workout focus for each day based on training split
3. For each day:
   a. Generate focused prompt (equipment, diet, focus)
   b. Make AI request with 2048 token limit
   c. Parse and clean JSON response
   d. Validate against Zod schema
   e. Repair any validation issues
   f. Use fallback if validation fails
4. Combine all days into weekly plan
5. Final validation of complete plan
```

### Schema Validation
```typescript
// Example exercise validation
const ExerciseSchema = z.object({
  exercise: z.string().min(1),
  sets: z.number().int().min(1).max(10),
  reps: z.string().min(1),
  RIR: z.number().int().min(0).max(5),
});
```

### Error Recovery
- **JSON parsing errors** → Extract JSON from text, fix common issues
- **Schema validation errors** → Apply automatic repairs, use fallbacks
- **API failures** → Switch providers, use structured fallbacks
- **Network issues** → Retry with exponential backoff

## Performance Benefits

### Before (Monolithic)
- ❌ Single 32k token request
- ❌ High failure rate due to truncation
- ❌ All-or-nothing approach
- ❌ Fallback plan for entire week if any part fails

### After (Chunked)
- ✅ 7 × 2k token requests
- ✅ Higher success rate per request
- ✅ Granular error handling
- ✅ Only failed days use fallback

## Usage

### Generate Weekly Plan
```typescript
import { generateWeeklyBasePlan } from '@/services/chunked-ai-service';

const basePlan = await generateWeeklyBasePlan(user);
// Returns validated WeeklyBasePlan with all 7 days
```

### Generate Daily Plan
```typescript
import { generateDailyPlan } from '@/services/chunked-ai-service';

const dailyPlan = await generateDailyPlan(user, checkin, recentCheckins, basePlan);
// Returns adjusted daily plan based on check-in data
```

### Validate Plans
```typescript
import { validateWeeklyPlan, validateDailyPlan } from '@/utils/plan-schemas';

const validation = validateWeeklyPlan(planData);
if (!validation.success) {
  console.log('Validation errors:', validation.errors);
}
```

## Monitoring and Debugging

### Success Metrics
- **Generation time** - Should be 10-20 seconds for full week
- **Success rate** - Should be >90% for individual days
- **Validation rate** - Should be >95% after repairs
- **Token usage** - ~14k tokens total (7 × 2k per day)

### Debug Logging
```
🏗️ Starting chunked weekly plan generation...
📅 Generating monday (Push)...
🤖 Making AI request (max tokens: 2048)
✅ Gemini API success, response length: 1847
✅ monday generated successfully
📅 Generating tuesday (Pull)...
...
✅ Chunked weekly plan generation completed successfully!
```

### Common Issues
1. **"Day validation failed"** - AI response didn't match schema
   - **Solution**: Automatic repair applied, fallback used if needed
   
2. **"No JSON found in response"** - AI returned non-JSON text
   - **Solution**: JSON extraction from text, fallback if extraction fails
   
3. **"API quota exceeded"** - Hit rate limits
   - **Solution**: Automatic fallback to toolkit API

## Testing

### Run System Test
```typescript
import { testChunkedSystem } from '@/utils/test-chunked-system';

const success = await testChunkedSystem();
// Tests full generation pipeline with validation
```

### Test Results
- ✅ Plan generation within time limits
- ✅ Schema validation passes
- ✅ Correct calorie/protein values
- ✅ All 7 days have complete structure
- ✅ Workout blocks and meals present

## Migration Notes

### Files Updated
- `app/generating-base-plan.tsx` - Uses chunked service
- `app/generating-plan.tsx` - Uses chunked service

### New Files
- `utils/plan-schemas.ts` - Zod validation schemas
- `services/chunked-ai-service.ts` - New chunked AI service
- `utils/test-chunked-system.ts` - Comprehensive test suite

### Dependencies Added
- `zod` - Schema validation library

## Expected Results

With this new system, users should receive:
1. **AI-generated plans** (not fallbacks) >90% of the time
2. **Proper nutrition values** - Exact calories and protein as calculated
3. **Complete workout plans** - All exercises, sets, reps properly structured
4. **Dietary compliance** - Meals match user's dietary preferences
5. **Equipment adaptation** - Exercises match available equipment

The chunked approach ensures that even if 1-2 days fail AI generation, the remaining 5-6 days will still be AI-generated, providing a much better user experience than the previous all-or-nothing approach.



