/**
 * Test the new chunked AI system
 */
import { generateWeeklyBasePlan } from '@/services/plan-generation';
import { validateWeeklyPlan } from '@/utils/plan-schemas';
import type { User } from '@/types/user';

// Test user
const testUser: User = {
  id: 'test-user',
  name: 'Test User',
  goal: 'MUSCLE_GAIN',
  equipment: ['Gym'],
  dietaryPrefs: ['Non-veg'],
  trainingDays: 5,
  timezone: 'UTC',
  onboardingComplete: true,
  age: 25,
  sex: 'Male',
  height: 175,
  weight: 70,
  activityLevel: 'Very Active',
  dailyCalorieTarget: 2800,
  supplements: ['Creatine', 'Whey Protein'],
  sessionLength: 60,
  mealCount: 4,
};

export async function testChunkedSystem() {
  console.log('🧪 Testing Chunked AI System...');
  console.log('================================');
  
  try {
    // Test plan generation
    console.log('📅 Generating weekly plan...');
    const startTime = Date.now();
    
    const basePlan = await generateWeeklyBasePlan(testUser);
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`✅ Plan generated in ${duration}s`);
    
    // Validate the plan
    console.log('🔍 Validating plan structure...');
    const validation = validateWeeklyPlan(basePlan.days);
    
    if (validation.success) {
      console.log('✅ Plan validation passed');
      
      // Check specific requirements
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      let allDaysValid = true;
      
      for (const day of days) {
        const dayPlan = basePlan.days[day];
        
        // Check calories and protein
        const hasCorrectCalories = dayPlan.nutrition.total_kcal === testUser.dailyCalorieTarget;
        const hasCorrectProtein = dayPlan.nutrition.protein_g === Math.round(testUser.weight! * 2.2 * 0.9);
        
        if (!hasCorrectCalories || !hasCorrectProtein) {
          console.log(`❌ ${day}: Incorrect nutrition values`);
          console.log(`  Calories: ${dayPlan.nutrition.total_kcal} (expected ${testUser.dailyCalorieTarget})`);
          console.log(`  Protein: ${dayPlan.nutrition.protein_g} (expected ${Math.round(testUser.weight! * 2.2 * 0.9)})`);
          allDaysValid = false;
        } else {
          console.log(`✅ ${day}: Nutrition values correct`);
        }
        
        // Check workout structure
        if (!dayPlan.workout.blocks || dayPlan.workout.blocks.length === 0) {
          console.log(`❌ ${day}: No workout blocks`);
          allDaysValid = false;
        }
        
        // Check meals
        if (!dayPlan.nutrition.meals || dayPlan.nutrition.meals.length === 0) {
          console.log(`❌ ${day}: No meals`);
          allDaysValid = false;
        }
      }
      
      if (allDaysValid) {
        console.log('✅ All days have correct structure and values');
      } else {
        console.log('❌ Some days have issues');
      }
      
      // Display plan summary
      console.log('\n📋 Plan Summary:');
      console.log('================');
      
      days.forEach(day => {
        const dayPlan = basePlan.days[day];
        console.log(`${day.toUpperCase()}:`);
        console.log(`  Focus: ${dayPlan.workout.focus.join(', ')}`);
        console.log(`  Exercises: ${dayPlan.workout.blocks.flatMap(b => b.items).length}`);
        console.log(`  Meals: ${dayPlan.nutrition.meals.length}`);
        console.log(`  Calories: ${dayPlan.nutrition.total_kcal} kcal`);
        console.log(`  Protein: ${dayPlan.nutrition.protein_g}g`);
        console.log('');
      });
      
      return true;
      
    } else {
      console.log('❌ Plan validation failed:');
      validation.errors?.forEach(error => console.log(`  - ${error}`));
      return false;
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return false;
  }
}

// Export for use in components
export { testUser };

// Run test if called directly
if (require.main === module) {
  testChunkedSystem().then(success => {
    console.log('\n' + '='.repeat(50));
    console.log(success ? '✅ ALL TESTS PASSED!' : '❌ TESTS FAILED');
    process.exit(success ? 0 : 1);
  });
}



