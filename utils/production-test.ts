/**
 * Comprehensive Production Test Suite
 * Tests all production-ready features
 */
import { generateWeeklyBasePlan, generateDailyPlan } from '@/services/production-ai-service';
import { validateWeeklyPlan, validateDailyPlan } from '@/utils/plan-schemas';
import { productionMonitor, startSystemMonitoring } from '@/utils/production-monitor';
import type { User, CheckinData } from '@/types/user';

// Test users with different profiles
const testUsers: User[] = [
  {
    id: 'test-muscle-gain',
    name: 'Muscle Gain User',
    goal: 'MUSCLE_GAIN',
    equipment: ['Gym', 'Dumbbells'],
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
    preferredExercises: ['Bench Press', 'Squats'],
    avoidExercises: ['Deadlifts'],
  },
  {
    id: 'test-weight-loss',
    name: 'Weight Loss User',
    goal: 'WEIGHT_LOSS',
    equipment: ['Bodyweight'],
    dietaryPrefs: ['Vegetarian'],
    trainingDays: 4,
    timezone: 'UTC',
    onboardingComplete: true,
    age: 30,
    sex: 'Female',
    height: 165,
    weight: 65,
    activityLevel: 'Moderately Active',
    dailyCalorieTarget: 1800,
    sessionLength: 45,
    mealCount: 3,
    specialRequests: 'No jumping exercises due to apartment living',
  },
  {
    id: 'test-general-fitness',
    name: 'General Fitness User',
    goal: 'GENERAL_FITNESS',
    equipment: ['Dumbbells', 'Bands'],
    dietaryPrefs: ['Eggitarian'],
    trainingDays: 3,
    timezone: 'UTC',
    onboardingComplete: true,
    age: 35,
    sex: 'Male',
    height: 180,
    weight: 80,
    activityLevel: 'Lightly Active',
    dailyCalorieTarget: 2200,
    sessionLength: 30,
    mealCount: 5,
    injuries: 'Lower back issues',
  }
];

// Test check-ins with different scenarios
const testCheckins: CheckinData[] = [
  {
    id: 'high-energy',
    mode: 'HIGH',
    date: new Date().toISOString().split('T')[0],
    energy: 9,
    stress: 2,
    sleepHrs: 8,
    wokeFeeling: 'Refreshed',
    soreness: [],
    motivation: 9,
    moodCharacter: 'excited'
  },
  {
    id: 'low-energy',
    mode: 'HIGH',
    date: new Date().toISOString().split('T')[0],
    energy: 3,
    stress: 7,
    sleepHrs: 5,
    wokeFeeling: 'Tired',
    soreness: ['Chest', 'Shoulders'],
    motivation: 4,
    moodCharacter: 'tired'
  },
  {
    id: 'moderate',
    mode: 'HIGH',
    date: new Date().toISOString().split('T')[0],
    energy: 6,
    stress: 4,
    sleepHrs: 7,
    wokeFeeling: 'Refreshed',
    soreness: ['Legs'],
    motivation: 7,
    moodCharacter: 'focused'
  }
];

interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  aiUsed: boolean;
  validationPassed: boolean;
  details: string;
  errors: string[];
}

class ProductionTestSuite {
  private results: TestResult[] = [];

  /**
   * Run complete production test suite
   */
  async runAllTests(): Promise<boolean> {
    console.log('🚀 STARTING PRODUCTION TEST SUITE');
    console.log('=====================================\n');

    // Start system monitoring
    startSystemMonitoring();

    try {
      // Test 1: Weekly plan generation for all user types
      await this.testWeeklyPlanGeneration();

      // Test 2: Daily plan generation with different check-ins
      await this.testDailyPlanGeneration();

      // Test 3: Error handling and recovery
      await this.testErrorHandling();

      // Test 4: Performance and scalability
      await this.testPerformance();

      // Test 5: Validation and schema compliance
      await this.testValidation();

      // Test 6: User preferences and customization
      await this.testCustomization();

      // Generate final report
      this.generateTestReport();

      const successRate = this.results.filter(r => r.success).length / this.results.length;
      const overallSuccess = successRate >= 0.9; // 90% success rate required

      console.log('\n=====================================');
      console.log(overallSuccess ? '✅ PRODUCTION TESTS PASSED!' : '❌ PRODUCTION TESTS FAILED!');
      console.log(`Success Rate: ${(successRate * 100).toFixed(1)}%`);
      console.log('=====================================\n');

      return overallSuccess;

    } catch (error) {
      console.error('❌ Test suite failed with error:', error);
      return false;
    }
  }

  /**
   * Test weekly plan generation for all user types
   */
  private async testWeeklyPlanGeneration(): Promise<void> {
    console.log('📅 Testing Weekly Plan Generation...\n');

    for (const user of testUsers) {
      const testName = `Weekly Plan - ${user.goal} (${user.equipment.join(',')})`;
      const startTime = Date.now();

      try {
        console.log(`  Testing: ${user.name}...`);
        
        const basePlan = await generateWeeklyBasePlan(user);
        const duration = Date.now() - startTime;

        // Validate the plan
        const validation = validateWeeklyPlan(basePlan.days);
        
        if (!validation.success) {
          throw new Error(`Validation failed: ${validation.errors?.join(', ')}`);
        }

        // Check specific requirements
        const issues = this.validatePlanRequirements(basePlan, user);
        
        if (issues.length > 0) {
          throw new Error(`Requirements not met: ${issues.join(', ')}`);
        }

        this.results.push({
          testName,
          success: true,
          duration,
          aiUsed: true,
          validationPassed: true,
          details: `Generated ${Object.keys(basePlan.days).length} days successfully`,
          errors: []
        });

        console.log(`    ✅ Success (${duration}ms)`);

      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        this.results.push({
          testName,
          success: false,
          duration,
          aiUsed: false,
          validationPassed: false,
          details: 'Plan generation failed',
          errors: [errorMessage]
        });

        console.log(`    ❌ Failed: ${errorMessage}`);
      }
    }

    console.log('');
  }

  /**
   * Test daily plan generation with different check-ins
   */
  private async testDailyPlanGeneration(): Promise<void> {
    console.log('📊 Testing Daily Plan Generation...\n');

    // First, generate a base plan for testing
    const testUser = testUsers[0];
    const basePlan = await generateWeeklyBasePlan(testUser);

    for (const checkin of testCheckins) {
      const testName = `Daily Plan - ${checkin.id} (E:${checkin.energy}, S:${checkin.stress})`;
      const startTime = Date.now();

      try {
        console.log(`  Testing: ${checkin.id} scenario...`);
        
        const dailyPlan = await generateDailyPlan(testUser, checkin, [checkin], basePlan);
        const duration = Date.now() - startTime;

        // Validate the plan
        const validation = validateDailyPlan(dailyPlan);
        
        if (!validation.success) {
          throw new Error(`Validation failed: ${validation.errors?.join(', ')}`);
        }

        // Check adjustments were applied
        const hasAdjustments = dailyPlan.adjustments && dailyPlan.adjustments.length > 0;
        const hasMotivation = dailyPlan.motivation && dailyPlan.motivation.length > 0;

        this.results.push({
          testName,
          success: true,
          duration,
          aiUsed: true,
          validationPassed: true,
          details: `Adjustments: ${hasAdjustments ? dailyPlan.adjustments?.length : 0}, Motivation: ${hasMotivation}`,
          errors: []
        });

        console.log(`    ✅ Success (${duration}ms) - ${dailyPlan.adjustments?.length || 0} adjustments`);

      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        this.results.push({
          testName,
          success: false,
          duration,
          aiUsed: false,
          validationPassed: false,
          details: 'Daily plan generation failed',
          errors: [errorMessage]
        });

        console.log(`    ❌ Failed: ${errorMessage}`);
      }
    }

    console.log('');
  }

  /**
   * Test error handling and recovery
   */
  private async testErrorHandling(): Promise<void> {
    console.log('🛡️ Testing Error Handling...\n');

    // Test with invalid user data
    const invalidUser = { ...testUsers[0], dailyCalorieTarget: -1000 };
    
    const testName = 'Error Handling - Invalid User Data';
    const startTime = Date.now();

    try {
      console.log('  Testing with invalid user data...');
      
      const basePlan = await generateWeeklyBasePlan(invalidUser as User);
      const duration = Date.now() - startTime;

      // Should still succeed due to fallback mechanisms
      this.results.push({
        testName,
        success: true,
        duration,
        aiUsed: false, // Likely used fallback
        validationPassed: true,
        details: 'Successfully handled invalid data with fallback',
        errors: []
      });

      console.log(`    ✅ Graceful fallback (${duration}ms)`);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.results.push({
        testName,
        success: false,
        duration,
        aiUsed: false,
        validationPassed: false,
        details: 'Failed to handle invalid data',
        errors: [errorMessage]
      });

      console.log(`    ❌ Failed: ${errorMessage}`);
    }

    console.log('');
  }

  /**
   * Test performance and scalability
   */
  private async testPerformance(): Promise<void> {
    console.log('⚡ Testing Performance...\n');

    const testName = 'Performance - Concurrent Generation';
    const startTime = Date.now();

    try {
      console.log('  Testing concurrent plan generation...');
      
      // Generate multiple plans concurrently
      const promises = testUsers.slice(0, 2).map(user => 
        generateWeeklyBasePlan(user)
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Check all results are valid
      const allValid = results.every(plan => 
        validateWeeklyPlan(plan.days).success
      );

      if (!allValid) {
        throw new Error('Some concurrent generations failed validation');
      }

      this.results.push({
        testName,
        success: true,
        duration,
        aiUsed: true,
        validationPassed: true,
        details: `Generated ${results.length} plans concurrently`,
        errors: []
      });

      console.log(`    ✅ Success (${duration}ms for ${results.length} plans)`);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.results.push({
        testName,
        success: false,
        duration,
        aiUsed: false,
        validationPassed: false,
        details: 'Concurrent generation failed',
        errors: [errorMessage]
      });

      console.log(`    ❌ Failed: ${errorMessage}`);
    }

    console.log('');
  }

  /**
   * Test validation and schema compliance
   */
  private async testValidation(): Promise<void> {
    console.log('✅ Testing Validation...\n');

    const testName = 'Validation - Schema Compliance';
    const startTime = Date.now();

    try {
      console.log('  Testing schema validation...');
      
      const basePlan = await generateWeeklyBasePlan(testUsers[0]);
      const duration = Date.now() - startTime;

      // Detailed validation
      const validation = validateWeeklyPlan(basePlan.days);
      
      if (!validation.success) {
        throw new Error(`Schema validation failed: ${validation.errors?.join(', ')}`);
      }

      // Check all required fields are present
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      for (const day of days) {
        const dayPlan = basePlan.days[day];
        
        if (!dayPlan.workout || !dayPlan.nutrition || !dayPlan.recovery) {
          throw new Error(`Missing required sections in ${day}`);
        }
        
        if (!dayPlan.workout.blocks || dayPlan.workout.blocks.length === 0) {
          throw new Error(`No workout blocks in ${day}`);
        }
        
        if (!dayPlan.nutrition.meals || dayPlan.nutrition.meals.length === 0) {
          throw new Error(`No meals in ${day}`);
        }
      }

      this.results.push({
        testName,
        success: true,
        duration,
        aiUsed: true,
        validationPassed: true,
        details: 'All schema validations passed',
        errors: []
      });

      console.log(`    ✅ All validations passed (${duration}ms)`);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.results.push({
        testName,
        success: false,
        duration,
        aiUsed: true,
        validationPassed: false,
        details: 'Schema validation failed',
        errors: [errorMessage]
      });

      console.log(`    ❌ Failed: ${errorMessage}`);
    }

    console.log('');
  }

  /**
   * Test customization and user preferences
   */
  private async testCustomization(): Promise<void> {
    console.log('🎯 Testing Customization...\n');

    const testName = 'Customization - User Preferences';
    const startTime = Date.now();

    try {
      console.log('  Testing user preference adherence...');
      
      const customUser = {
        ...testUsers[0],
        preferredExercises: ['Bench Press', 'Squats'],
        avoidExercises: ['Deadlifts'],
        dietaryPrefs: ['Vegetarian' as const],
        specialRequests: 'No jumping exercises'
      };

      const basePlan = await generateWeeklyBasePlan(customUser);
      const duration = Date.now() - startTime;

      // Check preferences are respected
      const issues: string[] = [];
      
      // Check dietary preferences (should have vegetarian meals)
      const mondayMeals = basePlan.days.monday.nutrition.meals;
      const hasVegetarianMeals = mondayMeals.some(meal => 
        meal.items.some(item => 
          item.food.toLowerCase().includes('tofu') ||
          item.food.toLowerCase().includes('plant') ||
          item.food.toLowerCase().includes('legume') ||
          item.food.toLowerCase().includes('quinoa')
        )
      );

      if (!hasVegetarianMeals) {
        issues.push('Dietary preferences not respected');
      }

      // Check calorie targets
      const targetCalories = customUser.dailyCalorieTarget;
      Object.values(basePlan.days).forEach((day, index) => {
        if (day.nutrition.total_kcal !== targetCalories) {
          issues.push(`Day ${index + 1} has incorrect calories: ${day.nutrition.total_kcal} vs ${targetCalories}`);
        }
      });

      if (issues.length > 0) {
        throw new Error(issues.join(', '));
      }

      this.results.push({
        testName,
        success: true,
        duration,
        aiUsed: true,
        validationPassed: true,
        details: 'User preferences properly respected',
        errors: []
      });

      console.log(`    ✅ Preferences respected (${duration}ms)`);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.results.push({
        testName,
        success: false,
        duration,
        aiUsed: true,
        validationPassed: false,
        details: 'User preferences not respected',
        errors: [errorMessage]
      });

      console.log(`    ❌ Failed: ${errorMessage}`);
    }

    console.log('');
  }

  /**
   * Validate plan meets user requirements
   */
  private validatePlanRequirements(basePlan: any, user: User): string[] {
    const issues: string[] = [];

    // Check all days are present
    const requiredDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of requiredDays) {
      if (!basePlan.days[day]) {
        issues.push(`Missing ${day}`);
      }
    }

    // Check calorie targets
    const targetCalories = user.dailyCalorieTarget;
    if (targetCalories) {
      Object.entries(basePlan.days).forEach(([day, dayPlan]: [string, any]) => {
        if (dayPlan.nutrition.total_kcal !== targetCalories) {
          issues.push(`${day} has incorrect calories: ${dayPlan.nutrition.total_kcal} vs ${targetCalories}`);
        }
      });
    }

    // Check protein targets
    const targetProtein = user.weight ? Math.round(user.weight * 2.2 * 0.9) : 150;
    Object.entries(basePlan.days).forEach(([day, dayPlan]: [string, any]) => {
      if (Math.abs(dayPlan.nutrition.protein_g - targetProtein) > 10) {
        issues.push(`${day} protein target off: ${dayPlan.nutrition.protein_g} vs ${targetProtein}`);
      }
    });

    return issues;
  }

  /**
   * Generate comprehensive test report
   */
  private generateTestReport(): void {
    console.log('📊 TEST REPORT');
    console.log('==============\n');

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / totalTests;
    const aiUsageRate = this.results.filter(r => r.aiUsed).length / totalTests;
    const validationRate = this.results.filter(r => r.validationPassed).length / totalTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
    console.log(`Failed: ${failedTests} (${(failedTests/totalTests*100).toFixed(1)}%)`);
    console.log(`Average Duration: ${avgDuration.toFixed(0)}ms`);
    console.log(`AI Usage Rate: ${(aiUsageRate*100).toFixed(1)}%`);
    console.log(`Validation Rate: ${(validationRate*100).toFixed(1)}%`);

    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.filter(r => !r.success).forEach(result => {
        console.log(`  - ${result.testName}: ${result.errors.join(', ')}`);
      });
    }

    // Get system health from monitor
    const systemHealth = productionMonitor.getSystemHealth();
    const analytics = productionMonitor.getAnalytics();

    console.log('\n📈 System Analytics:');
    console.log(`System Status: ${systemHealth.status.toUpperCase()}`);
    console.log(`Total Generations: ${analytics.totalGenerations}`);
    console.log(`AI Success Rate: ${(analytics.aiSuccessRate * 100).toFixed(1)}%`);
    console.log(`Token Usage: ${analytics.totalTokenUsage}`);

    console.log('\n');
  }
}

// Export for use
export const productionTestSuite = new ProductionTestSuite();

// Run tests if called directly
if (require.main === module) {
  productionTestSuite.runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}



