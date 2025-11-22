/**
 * Production Configuration Test Suite
 * Ensures all services are properly configured and optimized
 */

import { getProductionConfig } from '@/utils/production-config';
import { generateAICompletion } from '@/utils/ai-client';
import { runPlanGenerationDiagnostics } from '@/utils/plan-generation-diagnostics';
import { generateWeeklyBasePlan as generateDocumented } from '@/services/documented-ai-service';
import { generateWeeklyBasePlan as generateChunked } from '@/services/chunked-ai-service';
import { generateWeeklyBasePlan as generateProduction } from '@/services/production-ai-service';
import { generateWeeklyBasePlan as generateBase } from '@/services/ai-service';
import type { User } from '@/types/user';

// Test user for plan generation
const TEST_USER: User = {
  id: 'test-user',
  age: 28,
  sex: 'Male',
  height: 175,
  weight: 75,
  activityLevel: 'Moderately Active',
  goal: 'MUSCLE_GAIN',
  trainingDays: 4,
  sessionLength: 60,
  equipment: ['Gym', 'Dumbbells'],
  dietaryPrefs: ['Non-veg'],
  dailyCalorieTarget: 2800,
  mealCount: 4,
  preferredExercises: ['Bench Press', 'Squats'],
  avoidExercises: [],
  fastingWindow: 'None',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
}

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

async function testConfiguration(): Promise<TestResult> {
  const startTime = Date.now();
  try {
    const config = getProductionConfig();
    
    // Check critical configuration
    const issues: string[] = [];
    
    // Check AI configuration
    if (!config.aiApiKey && config.aiProvider !== 'rork') {
      issues.push('No AI API key configured for non-Rork provider');
    }
    
    // Check Supabase configuration
    if (!config.supabaseUrl || config.supabaseUrl.includes('your-')) {
      issues.push('Invalid Supabase URL');
    }
    if (!config.supabaseAnonKey || config.supabaseAnonKey.includes('your-')) {
      issues.push('Invalid Supabase Anon Key');
    }
    
    // Check RevenueCat (only for production)
    if (config.isProduction) {
      if (!config.revenuecatIosKey) {
        issues.push('Missing RevenueCat iOS key for production');
      }
      if (!config.revenuecatAndroidKey) {
        issues.push('Missing RevenueCat Android key for production');
      }
    }
    
    if (issues.length > 0) {
      return {
        name: 'Configuration Check',
        passed: false,
        message: `Issues found: ${issues.join(', ')}`,
        duration: Date.now() - startTime,
      };
    }
    
    return {
      name: 'Configuration Check',
      passed: true,
      message: `Provider: ${config.aiProvider}, Model: ${config.aiModel}, Fallback: ${config.enableFallback}`,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'Configuration Check',
      passed: false,
      message: `Error: ${error}`,
      duration: Date.now() - startTime,
    };
  }
}

async function testAIClient(): Promise<TestResult> {
  const startTime = Date.now();
  try {
    const response = await generateAICompletion([
      { role: 'user', content: 'Return the text "TEST_SUCCESS"' }
    ]);
    
    if (!response.completion) {
      throw new Error('No completion in response');
    }
    
    if (!response.completion.includes('TEST_SUCCESS') && !response.completion.includes('test')) {
      throw new Error('Unexpected response content');
    }
    
    return {
      name: 'AI Client Test',
      passed: true,
      message: 'AI client working correctly with fallback chain',
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'AI Client Test',
      passed: false,
      message: `Error: ${error}`,
      duration: Date.now() - startTime,
    };
  }
}

async function testDiagnostics(): Promise<TestResult> {
  const startTime = Date.now();
  try {
    const diagnostics = await runPlanGenerationDiagnostics();
    
    // Check for critical issues
    if (diagnostics.errors.length > 0) {
      return {
        name: 'Diagnostics Test',
        passed: false,
        message: `Errors: ${diagnostics.errors.join(', ')}`,
        duration: Date.now() - startTime,
      };
    }
    
    // Check endpoint accessibility
    const endpointStatus = [];
    if (diagnostics.endpoints.deepseekAccessible) endpointStatus.push('DeepSeek');
    if (diagnostics.endpoints.geminiAccessible) endpointStatus.push('Gemini');
    if (diagnostics.endpoints.rorkAccessible) endpointStatus.push('Rork');
    
    if (endpointStatus.length === 0) {
      return {
        name: 'Diagnostics Test',
        passed: false,
        message: 'No AI endpoints accessible',
        duration: Date.now() - startTime,
      };
    }
    
    return {
      name: 'Diagnostics Test',
      passed: true,
      message: `Accessible endpoints: ${endpointStatus.join(', ')}`,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'Diagnostics Test',
      passed: false,
      message: `Error: ${error}`,
      duration: Date.now() - startTime,
    };
  }
}

async function testServiceConsistency(): Promise<TestResult> {
  const startTime = Date.now();
  const results: { service: string; success: boolean; error?: string }[] = [];
  
  // Test each service can generate a plan
  const services = [
    { name: 'documented-ai-service', fn: generateDocumented },
    { name: 'chunked-ai-service', fn: generateChunked },
    { name: 'production-ai-service', fn: generateProduction },
    { name: 'ai-service', fn: generateBase },
  ];
  
  for (const service of services) {
    try {
      log(`  Testing ${service.name}...`, COLORS.cyan);
      const plan = await service.fn(TEST_USER);
      
      // Basic validation
      if (!plan.days || Object.keys(plan.days).length !== 7) {
        throw new Error('Invalid plan structure');
      }
      
      const monday = plan.days.monday;
      if (!monday?.workout || !monday?.nutrition || !monday?.recovery) {
        throw new Error('Missing required sections in plan');
      }
      
      results.push({ service: service.name, success: true });
    } catch (error) {
      results.push({ 
        service: service.name, 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  const failedServices = results.filter(r => !r.success);
  
  if (failedServices.length > 0) {
    return {
      name: 'Service Consistency Test',
      passed: false,
      message: `${failedServices.length}/${services.length} services failed: ${failedServices.map(s => s.service).join(', ')}`,
      duration: Date.now() - startTime,
    };
  }
  
  return {
    name: 'Service Consistency Test',
    passed: true,
    message: `All ${services.length} services working correctly`,
    duration: Date.now() - startTime,
  };
}

async function testPlanQuality(): Promise<TestResult> {
  const startTime = Date.now();
  try {
    // Use the documented service as it uses the central AI client
    const plan = await generateDocumented(TEST_USER);
    
    const issues: string[] = [];
    
    // Check all days exist
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      if (!plan.days[day]) {
        issues.push(`Missing ${day}`);
      } else {
        const dayPlan = plan.days[day];
        
        // Check workout structure
        if (!dayPlan.workout?.blocks || dayPlan.workout.blocks.length === 0) {
          issues.push(`${day}: No workout blocks`);
        }
        
        // Check nutrition
        if (!dayPlan.nutrition?.meals || dayPlan.nutrition.meals.length === 0) {
          issues.push(`${day}: No meals`);
        }
        
        // Check calorie and protein targets
        const targetCalories = TEST_USER.dailyCalorieTarget || 2800;
        const targetProtein = Math.round(TEST_USER.weight! * 2.2 * 0.9);
        
        if (Math.abs(dayPlan.nutrition?.total_kcal - targetCalories) > 100) {
          issues.push(`${day}: Calories off target (${dayPlan.nutrition?.total_kcal} vs ${targetCalories})`);
        }
        
        if (Math.abs(dayPlan.nutrition?.protein_g - targetProtein) > 10) {
          issues.push(`${day}: Protein off target (${dayPlan.nutrition?.protein_g} vs ${targetProtein})`);
        }
      }
    }
    
    if (issues.length > 0) {
      return {
        name: 'Plan Quality Test',
        passed: false,
        message: `Issues: ${issues.slice(0, 3).join(', ')}${issues.length > 3 ? ` and ${issues.length - 3} more` : ''}`,
        duration: Date.now() - startTime,
      };
    }
    
    return {
      name: 'Plan Quality Test',
      passed: true,
      message: 'Plan meets all quality criteria',
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'Plan Quality Test',
      passed: false,
      message: `Error: ${error}`,
      duration: Date.now() - startTime,
    };
  }
}

async function testPerformance(): Promise<TestResult> {
  const startTime = Date.now();
  const timings: number[] = [];
  
  try {
    // Test AI response time
    for (let i = 0; i < 3; i++) {
      const testStart = Date.now();
      await generateAICompletion([
        { role: 'user', content: 'Generate a simple JSON object with one field' }
      ]);
      timings.push(Date.now() - testStart);
    }
    
    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    const maxTime = Math.max(...timings);
    
    if (maxTime > 60000) {
      return {
        name: 'Performance Test',
        passed: false,
        message: `Response time exceeds 60s timeout (max: ${maxTime}ms)`,
        duration: Date.now() - startTime,
      };
    }
    
    if (avgTime > 30000) {
      return {
        name: 'Performance Test',
        passed: false,
        message: `Average response time too high: ${avgTime.toFixed(0)}ms`,
        duration: Date.now() - startTime,
      };
    }
    
    return {
      name: 'Performance Test',
      passed: true,
      message: `Avg: ${avgTime.toFixed(0)}ms, Max: ${maxTime}ms`,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'Performance Test',
      passed: false,
      message: `Error: ${error}`,
      duration: Date.now() - startTime,
    };
  }
}

export async function runProductionTests() {
  log('\n' + '='.repeat(60), COLORS.bright);
  log('  🚀 Production Configuration Test Suite', COLORS.bright);
  log('='.repeat(60), COLORS.bright);
  
  const tests = [
    testConfiguration,
    testAIClient,
    testDiagnostics,
    testServiceConsistency,
    testPlanQuality,
    testPerformance,
  ];
  
  const results: TestResult[] = [];
  
  for (const test of tests) {
    log(`\n⚡ Running ${test.name.replace('async function ', '')}...`, COLORS.yellow);
    const result = await test();
    results.push(result);
    
    if (result.passed) {
      log(`  ✅ ${result.name}: PASSED`, COLORS.green);
      log(`     ${result.message}`, COLORS.blue);
    } else {
      log(`  ❌ ${result.name}: FAILED`, COLORS.red);
      log(`     ${result.message}`, COLORS.red);
    }
    
    if (result.duration) {
      log(`     Duration: ${result.duration}ms`, COLORS.cyan);
    }
  }
  
  // Summary
  log('\n' + '='.repeat(60), COLORS.bright);
  log('  📊 Test Summary', COLORS.bright);
  log('='.repeat(60), COLORS.bright);
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  log(`\n  Total Tests: ${results.length}`, COLORS.bright);
  log(`  ✅ Passed: ${passed}`, COLORS.green);
  log(`  ❌ Failed: ${failed}`, failed > 0 ? COLORS.red : COLORS.green);
  
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  log(`  ⏱️  Total Time: ${totalDuration}ms`, COLORS.cyan);
  
  if (failed === 0) {
    log('\n🎉 All tests passed! The app is production-ready.', COLORS.green);
    
    const config = getProductionConfig();
    log('\n📋 Current Configuration:', COLORS.bright);
    log(`  Provider: ${config.aiProvider}`, COLORS.blue);
    log(`  Model: ${config.aiModel}`, COLORS.blue);
    log(`  Fallback: ${config.enableFallback}`, COLORS.blue);
    log(`  Environment: ${config.environment}`, COLORS.blue);
  } else {
    log('\n⚠️  Some tests failed. Please fix the issues before deploying.', COLORS.yellow);
    
    const failedTests = results.filter(r => !r.passed);
    log('\nFailed Tests:', COLORS.red);
    failedTests.forEach(test => {
      log(`  - ${test.name}: ${test.message}`, COLORS.red);
    });
  }
  
  log('\n' + '='.repeat(60), COLORS.bright);
  
  return {
    passed: failed === 0,
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      duration: totalDuration,
    },
  };
}

// Export for external use
export { runProductionTests as testProductionConfig };

// Run if executed directly
if (require.main === module) {
  runProductionTests().catch(console.error);
}
