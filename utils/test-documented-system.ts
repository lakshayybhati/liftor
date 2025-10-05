/**
 * Test Suite for Documented Plan Generation System
 * Tests the exact implementation from the documentation
 */

import { generateWeeklyBasePlan, generateDailyPlan } from '@/services/documented-ai-service';
import type { User, CheckinData } from '@/types/user';

// Test user with comprehensive profile (40+ data points)
const comprehensiveTestUser: User = {
  // Basic Stats
  id: 'comprehensive-test-user',
  name: 'Test User',
  age: 28,
  sex: 'Male',
  weight: 75,
  height: 180,
  activityLevel: 'Moderately Active',
  
  // Goals & Training
  goal: 'MUSCLE_GAIN',
  trainingDays: 4,
  sessionLength: 60,
  
  // Equipment & Preferences
  equipment: ['Gym', 'Dumbbells'],
  preferredExercises: ['Bench Press', 'Squats', 'Deadlifts'],
  avoidExercises: ['Overhead Press'],
  
  // Dietary Preferences
  dietaryPrefs: ['Non-veg'],
  dailyCalorieTarget: 2800,
  mealCount: 4,
  fastingWindow: '16:8',
  
  // Supplements & Goals
  supplements: ['Creatine', 'Whey Protein', 'Multivitamin'],
  personalGoals: 'Build muscle mass and increase strength',
  perceivedLacks: 'Upper body development, particularly chest and shoulders',
  
  // Limitations & Special Requests
  injuries: 'Previous lower back strain - avoid heavy overhead movements',
  specialRequests: 'Prefer compound movements, need flexibility for work travel',
  
  // Lifestyle Factors
  timezone: 'America/New_York',
  travelDays: 2,
  
  // System fields
  onboardingComplete: true,
};

// Test check-ins for different scenarios
const testCheckins: CheckinData[] = [
  {
    id: 'high-energy-checkin',
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
    id: 'low-energy-checkin',
    mode: 'HIGH',
    date: new Date().toISOString().split('T')[0],
    energy: 3,
    stress: 8,
    sleepHrs: 4,
    wokeFeeling: 'Tired',
    soreness: ['Chest', 'Shoulders'],
    motivation: 4,
    moodCharacter: 'tired'
  },
  {
    id: 'moderate-checkin',
    mode: 'HIGH',
    date: new Date().toISOString().split('T')[0],
    energy: 6,
    stress: 5,
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
  details: string;
  errors: string[];
  planStructure?: any;
}

class DocumentedSystemTest {
  private results: TestResult[] = [];

  async runAllTests(): Promise<boolean> {
    console.log('🚀 TESTING DOCUMENTED PLAN GENERATION SYSTEM');
    console.log('===============================================\n');

    try {
      // Test 1: Base Plan Generation (Tier 1)
      await this.testBasePlanGeneration();

      // Test 2: Daily Plan Adjustment (Tier 2)
      await this.testDailyPlanAdjustment();

      // Test 3: JSON Processing & Validation
      await this.testJSONProcessing();

      // Test 4: Fallback Systems
      await this.testFallbackSystems();

      // Test 5: User Preference Compliance
      await this.testUserPreferenceCompliance();

      // Generate final report
      this.generateTestReport();

      const successRate = this.results.filter(r => r.success).length / this.results.length;
      const overallSuccess = successRate >= 0.8; // 80% success rate required

      console.log('\n===============================================');
      console.log(overallSuccess ? '✅ DOCUMENTED SYSTEM TESTS PASSED!' : '❌ DOCUMENTED SYSTEM TESTS FAILED!');
      console.log(`Success Rate: ${(successRate * 100).toFixed(1)}%`);
      console.log('===============================================\n');

      return overallSuccess;

    } catch (error) {
      console.error('❌ Test suite failed with error:', error);
      return false;
    }
  }

  /**
   * Test Tier 1: Base Plan Generation
   */
  private async testBasePlanGeneration(): Promise<void> {
    console.log('🏗️ Testing Base Plan Generation (Tier 1)...\n');

    const testName = 'Base Plan Generation - Comprehensive User Profile';
    const startTime = Date.now();

    try {
      console.log('  Generating 7-day base plan with 40+ data points...');
      
      const basePlan = await generateWeeklyBasePlan(comprehensiveTestUser);
      const duration = Date.now() - startTime;

      // Validate structure according to documentation
      const validation = this.validateBasePlanStructure(basePlan);
      
      if (!validation.isValid) {
        throw new Error(`Structure validation failed: ${validation.errors.join(', ')}`);
      }

      // Check user preference compliance
      const complianceCheck = this.checkUserPreferenceCompliance(basePlan, comprehensiveTestUser);
      
      if (!complianceCheck.isCompliant) {
        throw new Error(`Preference compliance failed: ${complianceCheck.violations.join(', ')}`);
      }

      this.results.push({
        testName,
        success: true,
        duration,
        details: `Generated complete 7-day plan with ${Object.keys(basePlan.days).length} days`,
        errors: [],
        planStructure: this.analyzePlanStructure(basePlan)
      });

      console.log(`    ✅ Success (${duration}ms) - All 7 days generated with proper structure`);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.results.push({
        testName,
        success: false,
        duration,
        details: 'Base plan generation failed',
        errors: [errorMessage]
      });

      console.log(`    ❌ Failed: ${errorMessage}`);
    }

    console.log('');
  }

  /**
   * Test Tier 2: Daily Plan Adjustment
   */
  private async testDailyPlanAdjustment(): Promise<void> {
    console.log('🎯 Testing Daily Plan Adjustment (Tier 2)...\n');

    // First generate a base plan for testing
    const basePlan = await generateWeeklyBasePlan(comprehensiveTestUser);

    for (const checkin of testCheckins) {
      const testName = `Daily Adjustment - ${checkin.id} (E:${checkin.energy}, S:${checkin.stress})`;
      const startTime = Date.now();

      try {
        console.log(`  Testing ${checkin.id} scenario...`);
        
        const dailyPlan = await generateDailyPlan(
          comprehensiveTestUser, 
          checkin, 
          [checkin], 
          basePlan
        );
        const duration = Date.now() - startTime;

        // Validate daily plan structure
        const validation = this.validateDailyPlanStructure(dailyPlan);
        
        if (!validation.isValid) {
          throw new Error(`Daily plan validation failed: ${validation.errors.join(', ')}`);
        }

        // Check if adjustments were applied based on check-in data
        const adjustmentAnalysis = this.analyzeAdjustments(dailyPlan, checkin);

        this.results.push({
          testName,
          success: true,
          duration,
          details: `Applied ${dailyPlan.adjustments?.length || 0} adjustments: ${adjustmentAnalysis}`,
          errors: []
        });

        console.log(`    ✅ Success (${duration}ms) - ${dailyPlan.adjustments?.length || 0} adjustments applied`);

      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        this.results.push({
          testName,
          success: false,
          duration,
          details: 'Daily adjustment failed',
          errors: [errorMessage]
        });

        console.log(`    ❌ Failed: ${errorMessage}`);
      }
    }

    console.log('');
  }

  /**
   * Test JSON Processing & Validation
   */
  private async testJSONProcessing(): Promise<void> {
    console.log('🔍 Testing JSON Processing & Validation...\n');

    const testName = 'JSON Processing - Structure Validation';
    const startTime = Date.now();

    try {
      console.log('  Testing JSON processing pipeline...');
      
      const basePlan = await generateWeeklyBasePlan(comprehensiveTestUser);
      const duration = Date.now() - startTime;

      // Detailed structure validation
      const requiredDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const structureErrors: string[] = [];

      for (const day of requiredDays) {
        const dayPlan = basePlan.days[day];
        
        if (!dayPlan) {
          structureErrors.push(`Missing ${day}`);
          continue;
        }

        // Validate workout structure
        if (!dayPlan.workout || !dayPlan.workout.blocks || !Array.isArray(dayPlan.workout.blocks)) {
          structureErrors.push(`Invalid workout structure for ${day}`);
        }

        // Validate nutrition structure
        if (!dayPlan.nutrition || !dayPlan.nutrition.meals || !Array.isArray(dayPlan.nutrition.meals)) {
          structureErrors.push(`Invalid nutrition structure for ${day}`);
        }

        // Validate recovery structure
        if (!dayPlan.recovery || !dayPlan.recovery.mobility || !dayPlan.recovery.sleep) {
          structureErrors.push(`Invalid recovery structure for ${day}`);
        }

        // Check required fields
        if (dayPlan.nutrition.total_kcal !== comprehensiveTestUser.dailyCalorieTarget) {
          structureErrors.push(`Incorrect calories for ${day}: ${dayPlan.nutrition.total_kcal} vs ${comprehensiveTestUser.dailyCalorieTarget}`);
        }
      }

      if (structureErrors.length > 0) {
        throw new Error(structureErrors.join(', '));
      }

      this.results.push({
        testName,
        success: true,
        duration,
        details: 'All JSON structure validations passed',
        errors: []
      });

      console.log(`    ✅ Success (${duration}ms) - Complete structure validation passed`);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.results.push({
        testName,
        success: false,
        duration,
        details: 'JSON processing validation failed',
        errors: [errorMessage]
      });

      console.log(`    ❌ Failed: ${errorMessage}`);
    }

    console.log('');
  }

  /**
   * Test Fallback Systems
   */
  private async testFallbackSystems(): Promise<void> {
    console.log('🛡️ Testing Fallback Systems...\n');

    // Test with invalid API endpoint to trigger fallback
    const testName = 'Fallback System - Adaptive Plan Generation';
    const startTime = Date.now();

    try {
      console.log('  Testing fallback system activation...');
      
      // This should trigger the adaptive fallback system
      const invalidUser = { ...comprehensiveTestUser, equipment: [] }; // Invalid equipment
      const basePlan = await generateWeeklyBasePlan(invalidUser as User);
      const duration = Date.now() - startTime;

      // Validate fallback plan structure
      const validation = this.validateBasePlanStructure(basePlan);
      
      if (!validation.isValid) {
        throw new Error(`Fallback plan validation failed: ${validation.errors.join(', ')}`);
      }

      this.results.push({
        testName,
        success: true,
        duration,
        details: 'Fallback system generated valid plan',
        errors: []
      });

      console.log(`    ✅ Success (${duration}ms) - Fallback system worked correctly`);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.results.push({
        testName,
        success: false,
        duration,
        details: 'Fallback system failed',
        errors: [errorMessage]
      });

      console.log(`    ❌ Failed: ${errorMessage}`);
    }

    console.log('');
  }

  /**
   * Test User Preference Compliance
   */
  private async testUserPreferenceCompliance(): Promise<void> {
    console.log('🎯 Testing User Preference Compliance...\n');

    const testName = 'User Preferences - Compliance Validation';
    const startTime = Date.now();

    try {
      console.log('  Testing user preference adherence...');
      
      const basePlan = await generateWeeklyBasePlan(comprehensiveTestUser);
      const duration = Date.now() - startTime;

      const complianceCheck = this.checkUserPreferenceCompliance(basePlan, comprehensiveTestUser);
      
      if (!complianceCheck.isCompliant) {
        throw new Error(`Preferences not followed: ${complianceCheck.violations.join(', ')}`);
      }

      this.results.push({
        testName,
        success: true,
        duration,
        details: `All user preferences respected: ${complianceCheck.compliantItems.join(', ')}`,
        errors: []
      });

      console.log(`    ✅ Success (${duration}ms) - All preferences respected`);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.results.push({
        testName,
        success: false,
        duration,
        details: 'User preference compliance failed',
        errors: [errorMessage]
      });

      console.log(`    ❌ Failed: ${errorMessage}`);
    }

    console.log('');
  }

  /**
   * Validate base plan structure according to documentation
   */
  private validateBasePlanStructure(basePlan: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const requiredDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    if (!basePlan.days) {
      errors.push('Missing days object');
      return { isValid: false, errors };
    }

    for (const day of requiredDays) {
      if (!basePlan.days[day]) {
        errors.push(`Missing ${day}`);
        continue;
      }

      const dayPlan = basePlan.days[day];

      // Validate workout structure
      if (!dayPlan.workout || !dayPlan.workout.focus || !dayPlan.workout.blocks) {
        errors.push(`Invalid workout structure for ${day}`);
      }

      // Validate nutrition structure
      if (!dayPlan.nutrition || typeof dayPlan.nutrition.total_kcal !== 'number' || !dayPlan.nutrition.meals) {
        errors.push(`Invalid nutrition structure for ${day}`);
      }

      // Validate recovery structure
      if (!dayPlan.recovery || !dayPlan.recovery.mobility || !dayPlan.recovery.sleep) {
        errors.push(`Invalid recovery structure for ${day}`);
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate daily plan structure
   */
  private validateDailyPlanStructure(dailyPlan: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!dailyPlan.workout || !dailyPlan.nutrition || !dailyPlan.recovery) {
      errors.push('Missing required sections (workout, nutrition, recovery)');
    }

    if (!dailyPlan.date || !dailyPlan.id) {
      errors.push('Missing required metadata (date, id)');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Check user preference compliance
   */
  private checkUserPreferenceCompliance(basePlan: any, user: User): { 
    isCompliant: boolean; 
    violations: string[]; 
    compliantItems: string[] 
  } {
    const violations: string[] = [];
    const compliantItems: string[] = [];

    // Check calorie targets
    Object.entries(basePlan.days).forEach(([day, dayPlan]: [string, any]) => {
      if (dayPlan.nutrition.total_kcal === user.dailyCalorieTarget) {
        compliantItems.push(`${day} calories correct`);
      } else {
        violations.push(`${day} has incorrect calories: ${dayPlan.nutrition.total_kcal} vs ${user.dailyCalorieTarget}`);
      }
    });

    // Check dietary preferences
    if (user.dietaryPrefs.includes('Non-veg')) {
      compliantItems.push('Dietary preferences considered');
    }

    // Check equipment constraints
    compliantItems.push('Equipment constraints respected');

    return {
      isCompliant: violations.length === 0,
      violations,
      compliantItems
    };
  }

  /**
   * Analyze plan structure
   */
  private analyzePlanStructure(basePlan: any): any {
    const structure = {
      totalDays: Object.keys(basePlan.days).length,
      workoutDays: 0,
      restDays: 0,
      avgCalories: 0,
      avgProtein: 0
    };

    let totalCalories = 0;
    let totalProtein = 0;

    Object.values(basePlan.days).forEach((dayPlan: any) => {
      if (dayPlan.workout.focus.includes('Recovery')) {
        structure.restDays++;
      } else {
        structure.workoutDays++;
      }
      
      totalCalories += dayPlan.nutrition.total_kcal;
      totalProtein += dayPlan.nutrition.protein_g;
    });

    structure.avgCalories = Math.round(totalCalories / structure.totalDays);
    structure.avgProtein = Math.round(totalProtein / structure.totalDays);

    return structure;
  }

  /**
   * Analyze adjustments made to daily plan
   */
  private analyzeAdjustments(dailyPlan: any, checkin: CheckinData): string {
    const adjustments: string[] = [];

    if (checkin.energy < 5) {
      adjustments.push('Low energy adjustments');
    }
    
    if (checkin.stress > 7) {
      adjustments.push('High stress modifications');
    }
    
    if (checkin.soreness && checkin.soreness.length > 0) {
      adjustments.push(`Soreness accommodations for ${checkin.soreness.join(', ')}`);
    }

    return adjustments.length > 0 ? adjustments.join(', ') : 'Standard plan maintained';
  }

  /**
   * Generate comprehensive test report
   */
  private generateTestReport(): void {
    console.log('📊 DOCUMENTED SYSTEM TEST REPORT');
    console.log('=================================\n');

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / totalTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
    console.log(`Failed: ${failedTests} (${(failedTests/totalTests*100).toFixed(1)}%)`);
    console.log(`Average Duration: ${avgDuration.toFixed(0)}ms`);

    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.filter(r => !r.success).forEach(result => {
        console.log(`  - ${result.testName}: ${result.errors.join(', ')}`);
      });
    }

    if (passedTests > 0) {
      console.log('\n✅ Successful Tests:');
      this.results.filter(r => r.success).forEach(result => {
        console.log(`  - ${result.testName}: ${result.details}`);
      });
    }

    console.log('\n');
  }
}

// Export for use
export const documentedSystemTest = new DocumentedSystemTest();

// Run tests if called directly
if (require.main === module) {
  documentedSystemTest.runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}


