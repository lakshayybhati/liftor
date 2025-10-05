/**
 * Test utilities for plan generation system
 * Run these tests to validate the plan generation pipeline
 */

import { extractAndParseJSON, validatePlanStructure, repairPlanStructure } from './json-parser';
import type { User, CheckinData, WeeklyBasePlan, DailyPlan } from '@/types/user';

// Test user data
export const testUser: User = {
  id: 'test-user-1',
  name: 'Test User',
  goal: 'MUSCLE_GAIN',
  equipment: ['Gym', 'Dumbbells'],
  dietaryPrefs: ['Non-veg'],
  dietaryNotes: 'High protein, no dairy',
  trainingDays: 5,
  timezone: 'America/New_York',
  onboardingComplete: true,
  age: 25,
  sex: 'Male',
  height: 175,
  weight: 70,
  activityLevel: 'Very Active',
  dailyCalorieTarget: 2800,
  supplements: ['Creatine', 'Whey Protein'],
  personalGoals: ['Bigger arms', 'Better endurance'],
  perceivedLacks: ['Protein intake', 'Recovery'],
  preferredExercises: ['Bench Press', 'Squats'],
  avoidExercises: ['Deadlifts'],
  sessionLength: 60,
  mealCount: 5,
  stepTarget: 10000,
  preferredWorkoutSplit: 'Push/Pull/Legs'
};

// Test checkin data
export const testCheckin: CheckinData = {
  id: 'checkin-1',
  mode: 'HIGH',
  date: new Date().toISOString().split('T')[0],
  energy: 7,
  sleepHrs: 7.5,
  wokeFeeling: 'Refreshed',
  soreness: ['Chest', 'Triceps'],
  stress: 4,
  motivation: 8,
  moodCharacter: 'excited'
};

// Test JSON parsing
export function testJSONParsing() {
  console.log('🧪 Testing JSON Parsing...');
  
  const testCases = [
    // Valid JSON
    '{"test": "value"}',
    // JSON with markdown fences
    '```json\n{"test": "value"}\n```',
    // JSON with issues
    '{"RIR": "2-3", "test": "value",}',
    // Nested JSON
    '{"days": {"monday": {"workout": {"focus": ["Upper Body"]}}}}',
    // Array JSON
    '[{"test": "value"}, {"test2": "value2"}]',
    // JSON with single quotes
    "{'test': 'value'}",
    // Malformed but fixable
    '{test: "value", number: 123}',
  ];

  let passed = 0;
  let failed = 0;

  testCases.forEach((testCase, index) => {
    try {
      const result = extractAndParseJSON(testCase);
      console.log(`✅ Test ${index + 1} passed:`, JSON.stringify(result).substring(0, 50));
      passed++;
    } catch (error) {
      console.log(`❌ Test ${index + 1} failed:`, testCase.substring(0, 50));
      failed++;
    }
  });

  console.log(`\n📊 JSON Parsing Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test plan structure validation
export function testPlanValidation() {
  console.log('🧪 Testing Plan Validation...');
  
  const validWeeklyPlan = {
    days: {
      monday: {
        workout: {
          focus: ['Upper Body'],
          blocks: [
            {
              name: 'Warm-up',
              items: [{ exercise: 'Stretching', sets: 1, reps: '5 min', RIR: 0 }]
            }
          ],
          notes: 'Test'
        },
        nutrition: {
          total_kcal: 2000,
          protein_g: 150,
          meals: [
            { name: 'Breakfast', items: [{ food: 'Eggs', qty: '3' }] }
          ],
          hydration_l: 2.5
        },
        recovery: {
          mobility: ['Stretching'],
          sleep: ['8 hours']
        }
      },
      tuesday: { /* same structure */ },
      wednesday: { /* same structure */ },
      thursday: { /* same structure */ },
      friday: { /* same structure */ },
      saturday: { /* same structure */ },
      sunday: { /* same structure */ }
    }
  };

  // Copy structure for all days
  const days = ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  days.forEach(day => {
    validWeeklyPlan.days[day] = JSON.parse(JSON.stringify(validWeeklyPlan.days.monday));
  });

  const validDailyPlan = {
    workout: {
      focus: ['Upper Body'],
      blocks: [
        {
          name: 'Warm-up',
          items: [{ exercise: 'Stretching', sets: 1, reps: '5 min', RIR: 0 }]
        }
      ],
      notes: 'Test'
    },
    nutrition: {
      total_kcal: 2000,
      protein_g: 150,
      meals: [
        { name: 'Breakfast', items: [{ food: 'Eggs', qty: '3' }] }
      ],
      hydration_l: 2.5
    },
    recovery: {
      mobility: ['Stretching'],
      sleep: ['8 hours']
    }
  };

  const invalidPlan = {
    days: {
      monday: { workout: 'invalid' }
    }
  };

  const tests = [
    { plan: validWeeklyPlan, type: 'weekly' as const, shouldPass: true },
    { plan: validDailyPlan, type: 'daily' as const, shouldPass: true },
    { plan: invalidPlan, type: 'weekly' as const, shouldPass: false },
    { plan: {}, type: 'daily' as const, shouldPass: false }
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach((test, index) => {
    const isValid = validatePlanStructure(test.plan, test.type);
    const testPassed = isValid === test.shouldPass;
    
    if (testPassed) {
      console.log(`✅ Validation test ${index + 1} passed`);
      passed++;
    } else {
      console.log(`❌ Validation test ${index + 1} failed`);
      failed++;
    }
  });

  console.log(`\n📊 Validation Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// Test plan repair
export function testPlanRepair() {
  console.log('🧪 Testing Plan Repair...');
  
  const brokenPlan = {
    days: {
      monday: {
        workout: { focus: 'invalid' }, // Invalid structure
        // Missing nutrition
        recovery: { mobility: 'invalid' } // Invalid structure
      }
      // Missing other days
    }
  };

  const targetCalories = 2500;
  const targetProtein = 180;

  try {
    const repaired = repairPlanStructure(brokenPlan, 'weekly', targetCalories, targetProtein);
    const isValid = validatePlanStructure(repaired, 'weekly');
    
    if (isValid) {
      console.log('✅ Plan repair successful');
      console.log('  - All days present:', Object.keys(repaired.days).length === 7);
      console.log('  - Calories correct:', repaired.days.monday.nutrition.total_kcal === targetCalories);
      console.log('  - Protein correct:', repaired.days.monday.nutrition.protein_g === targetProtein);
      return true;
    } else {
      console.log('❌ Plan repair failed - repaired plan is invalid');
      return false;
    }
  } catch (error) {
    console.log('❌ Plan repair threw error:', error);
    return false;
  }
}

// Run all tests
export function runAllTests() {
  console.log('🚀 Running Plan Generation System Tests\n');
  console.log('=' .repeat(50));
  
  const results = {
    jsonParsing: testJSONParsing(),
    planValidation: testPlanValidation(),
    planRepair: testPlanRepair()
  };
  
  console.log('=' .repeat(50));
  console.log('\n📋 Final Test Results:');
  console.log('  JSON Parsing:', results.jsonParsing ? '✅ PASSED' : '❌ FAILED');
  console.log('  Plan Validation:', results.planValidation ? '✅ PASSED' : '❌ FAILED');
  console.log('  Plan Repair:', results.planRepair ? '✅ PASSED' : '❌ FAILED');
  
  const allPassed = Object.values(results).every(r => r);
  console.log('\n' + (allPassed ? '✅ ALL TESTS PASSED!' : '❌ SOME TESTS FAILED'));
  
  return allPassed;
}

// Export test utilities for use in components
export const testUtils = {
  testUser,
  testCheckin,
  runAllTests,
  testJSONParsing,
  testPlanValidation,
  testPlanRepair
};



