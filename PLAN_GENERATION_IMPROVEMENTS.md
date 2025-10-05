# Plan Generation System - Complete Rebuild

## Overview
The entire plan generation system has been rebuilt to work flawlessly while maintaining existing UI/UX, routes, and component interfaces.

## Key Improvements

### 1. Robust JSON Parsing (`/utils/json-parser.ts`)
- **Multiple fallback strategies** for parsing AI responses
- Handles markdown code fences, malformed JSON, and common formatting issues
- JSON5 support for lenient parsing
- Automatic repair of incomplete structures
- Validation of required fields

### 2. Centralized AI Service (`/services/ai-service.ts`)
- **Dual provider support**: Gemini API with automatic fallback
- Consistent error handling across all AI calls
- Automatic plan structure validation and repair
- Enforces exact calorie and protein targets
- Comprehensive fallback plans when AI fails

### 3. Weekly Base Plan Generation
- **7-day comprehensive plans** with workout, nutrition, and recovery
- Respects all user preferences (equipment, diet, exercises to avoid)
- Automatic calorie/protein calculation based on user stats
- Smart workout split selection based on training days
- Equipment-adaptive exercise selection

### 4. Daily Plan Adjustment
- **Check-in based adjustments** for energy, stress, sleep, and soreness
- Maintains base plan structure while making smart modifications
- Volume reduction for low energy/high stress
- Exercise swaps for soreness areas
- Personalized motivational messages

### 5. Data Flow Consistency
- **Single source of truth**: Onboarding data → Base Plan → Daily Adjustments
- Latest check-in always used for daily plans
- Consistent calorie/protein targets throughout
- Proper TypeScript typing maintained

## Technical Details

### JSON Parsing Strategy
```typescript
1. Try direct JSON.parse()
2. Remove markdown fences and retry
3. Extract JSON object/array using brace matching
4. Clean common issues (trailing commas, unquoted keys, RIR ranges)
5. Try JSON5 for lenient parsing
6. Last resort: extract any valid JSON structure
```

### AI Request Flow
```typescript
1. Prepare structured prompts with user context
2. Try Gemini API (if key available)
3. Fallback to toolkit API
4. Parse and validate response
5. Repair structure if needed
6. Apply target calories/protein
7. Return validated plan
```

### Plan Structure Validation
- Validates all required fields exist
- Checks data types (numbers, arrays, objects)
- Ensures all 7 days present in weekly plans
- Verifies workout blocks structure
- Confirms nutrition meals array
- Validates recovery arrays

### Fallback Mechanisms
1. **AI Fallback**: If Gemini fails, use toolkit API
2. **Parse Fallback**: Multiple JSON parsing strategies
3. **Structure Fallback**: Automatic repair of missing fields
4. **Complete Fallback**: Pre-built adaptive plans if all else fails

## Environment Variables
```bash
# Optional - if not provided, will use fallback API
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
```

## Testing
Run tests to validate the system:
```typescript
import { testUtils } from '@/utils/test-plan-generation';

// Run all tests
testUtils.runAllTests();

// Or individual tests
testUtils.testJSONParsing();
testUtils.testPlanValidation();
testUtils.testPlanRepair();
```

## Error Handling
- All errors are caught and logged with context
- Users never see raw errors or broken states
- Fallback plans ensure app continues functioning
- Detailed console logs for debugging

## Performance Optimizations
- Parallel API calls where possible
- Memoized calculations
- Efficient JSON parsing with early exits
- Minimal re-renders through proper state management

## Maintenance Notes
1. **Adding new AI providers**: Extend `makeAIRequest` in `ai-service.ts`
2. **Modifying plan structure**: Update types in `user.ts` and validation in `json-parser.ts`
3. **Changing nutrition targets**: Modify calculations in `ai-service.ts`
4. **Adding new adjustments**: Extend `generateDailyPlan` logic

## Known Edge Cases Handled
- Missing API keys
- Malformed AI responses
- Incomplete JSON structures
- Network failures
- Missing user data
- Invalid check-in data
- Extreme calorie/protein values
- Empty equipment/dietary preferences

## Future Enhancements
- [ ] Add OpenAI GPT-4 as third provider option
- [ ] Cache base plans for offline access
- [ ] Add plan rating/feedback system
- [ ] Implement progressive overload tracking
- [ ] Add meal prep instructions
- [ ] Include supplement timing recommendations

## Files Modified
- `/app/generating-base-plan.tsx` - Simplified to use AI service
- `/app/generating-plan.tsx` - Simplified to use AI service
- `/utils/json-parser.ts` - New robust JSON parsing utility
- `/services/ai-service.ts` - New centralized AI service
- `/utils/test-plan-generation.ts` - New test suite

## Files Unchanged
- All UI components
- All routes and navigation
- User store and data persistence
- Type definitions (only implementation changed)
- Authentication flow
- Check-in process



