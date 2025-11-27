/**
 * Production Configuration Test Suite
 * Ensures all services are properly configured and optimized
 * 
 * Updated to use the new Base Plan Engine (no fallback services)
 */

import { getProductionConfig } from '@/utils/production-config';
import { generateAICompletion } from '@/utils/ai-client';
import { runPlanGenerationDiagnostics } from '@/utils/plan-generation-diagnostics';
import { generateWeeklyBasePlan } from '@/services/plan-generation';
import type { User } from '@/types/user';

// Test user for plan generation
const TEST_USER: User = {
  id: 'test-user',
  name: 'Test User',
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
  trainingStylePreferences: ['Strength', 'Hypertrophy'],
  avoidExercises: [],
  fastingWindow: 'None',
  timezone: 'America/New_York',
  onboardingComplete: true,
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
};

function log(color: keyof typeof COLORS, message: string) {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

/**
 * Run all production configuration tests
 */
export async function runProductionTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  log('bright', '\n🔬 PRODUCTION CONFIGURATION TEST SUITE\n');
  log('blue', '═'.repeat(50));
  
  // Test 1: Configuration Loading
  log('yellow', '\n📋 Test 1: Configuration Loading');
  try {
    const config = getProductionConfig();
    const configValid = config.isValid;
    const hasAIKey = !!config.aiApiKey;
    
    results.push({
      name: 'Configuration Loading',
      passed: true,
      message: `Config loaded - Valid: ${configValid}, AI Key: ${hasAIKey ? 'Present' : 'Missing'}`
    });
    log('green', `   ✅ Config loaded successfully`);
    log('blue', `      - Valid: ${configValid}`);
    log('blue', `      - AI Provider: ${config.aiProvider || 'Default'}`);
    log('blue', `      - AI Key: ${hasAIKey ? '✓' : '✗'}`);
  } catch (error) {
    results.push({
      name: 'Configuration Loading',
      passed: false,
      message: `Error: ${error}`
    });
    log('red', `   ❌ Config loading failed: ${error}`);
  }
  
  // Test 2: AI Client Connection
  log('yellow', '\n📡 Test 2: AI Client Connection');
  try {
    const startTime = Date.now();
    const response = await generateAICompletion([
      { role: 'user', content: 'Say "OK" if you can hear me.' }
    ]);
    const duration = Date.now() - startTime;
    
    const hasResponse = !!response.completion;
    results.push({
      name: 'AI Client Connection',
      passed: hasResponse,
      message: hasResponse ? `Response received in ${duration}ms` : 'No response',
      duration
    });
    
    if (hasResponse) {
      log('green', `   ✅ AI connected (${duration}ms)`);
    } else {
      log('red', `   ❌ No response from AI`);
    }
  } catch (error) {
    results.push({
      name: 'AI Client Connection',
      passed: false,
      message: `Error: ${error}`
    });
    log('red', `   ❌ AI connection failed: ${error}`);
  }
  
  // Test 3: Plan Generation Diagnostics
  log('yellow', '\n🔍 Test 3: Plan Generation Diagnostics');
  try {
    const diagnostics = await runPlanGenerationDiagnostics();
    const anyEndpointAccessible = 
      diagnostics.endpoints.deepseekAccessible || 
      diagnostics.endpoints.geminiAccessible || 
      diagnostics.endpoints.rorkAccessible;
    
    results.push({
      name: 'Plan Generation Diagnostics',
      passed: anyEndpointAccessible,
      message: `DeepSeek: ${diagnostics.endpoints.deepseekAccessible}, Gemini: ${diagnostics.endpoints.geminiAccessible}, Rork: ${diagnostics.endpoints.rorkAccessible}`
    });
    
    log('green', `   ✅ Diagnostics completed`);
    log('blue', `      - DeepSeek: ${diagnostics.endpoints.deepseekAccessible ? '✓' : '✗'}`);
    log('blue', `      - Gemini: ${diagnostics.endpoints.geminiAccessible ? '✓' : '✗'}`);
    log('blue', `      - Rork: ${diagnostics.endpoints.rorkAccessible ? '✓' : '✗'}`);
  } catch (error) {
    results.push({
      name: 'Plan Generation Diagnostics',
      passed: false,
      message: `Error: ${error}`
    });
    log('red', `   ❌ Diagnostics failed: ${error}`);
  }
  
  // Test 4: Base Plan Generation (New Engine)
  log('yellow', '\n🏗️ Test 4: Base Plan Generation (New Engine)');
  try {
    const startTime = Date.now();
    const plan = await generateWeeklyBasePlan(TEST_USER);
    const duration = Date.now() - startTime;
    
    const dayCount = Object.keys(plan.days || {}).length;
    const success = dayCount === 7;
    
    results.push({
      name: 'Base Plan Generation',
      passed: success,
      message: success ? `Generated ${dayCount} days in ${duration}ms` : `Only ${dayCount} days generated`,
      duration
    });
    
    if (success) {
      log('green', `   ✅ Plan generated (${duration}ms)`);
      log('blue', `      - Days: ${dayCount}`);
      log('blue', `      - Plan ID: ${plan.id}`);
    } else {
      log('red', `   ❌ Plan incomplete: ${dayCount}/7 days`);
    }
  } catch (error) {
    results.push({
      name: 'Base Plan Generation',
      passed: false,
      message: `Error: ${error}`
    });
    log('red', `   ❌ Plan generation failed: ${error}`);
  }
  
  // Summary
  log('blue', '\n' + '═'.repeat(50));
  log('bright', '\n📊 TEST SUMMARY\n');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const successRate = (passed / total * 100).toFixed(1);
  
  log('blue', `Total Tests: ${total}`);
  log('green', `Passed: ${passed}`);
  log('red', `Failed: ${total - passed}`);
  log('bright', `Success Rate: ${successRate}%`);
  
  if (passed === total) {
    log('green', '\n✅ ALL TESTS PASSED!\n');
  } else {
    log('red', '\n❌ SOME TESTS FAILED\n');
    log('yellow', 'Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      log('red', `   - ${r.name}: ${r.message}`);
    });
  }
  
  return results;
}

// Run tests if called directly
if (require.main === module) {
  runProductionTests().then(results => {
    const allPassed = results.every(r => r.passed);
    process.exit(allPassed ? 0 : 1);
  });
}
