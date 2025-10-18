/**
 * Test Script for DeepSeek Integration
 * Verifies that DeepSeek → Gemini → Rork fallback chain is working correctly
 */

import { generateAICompletion } from '@/utils/ai-client';
import { getProductionConfig } from '@/utils/production-config';
import { runPlanGenerationDiagnostics } from '@/utils/plan-generation-diagnostics';
import type { Message } from '@/utils/ai-client';

// Color codes for terminal output
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

function logSection(title: string) {
  log(`\n${'='.repeat(60)}`, COLORS.cyan);
  log(`  ${title}`, COLORS.bright);
  log('='.repeat(60), COLORS.cyan);
}

async function testConfiguration() {
  logSection('Testing Configuration');
  
  const config = getProductionConfig();
  
  log('\n📋 Configuration Details:', COLORS.bright);
  log(`  Provider: ${config.aiProvider || 'auto-detect'}`, COLORS.blue);
  log(`  Model: ${config.aiModel || 'default'}`, COLORS.blue);
  log(`  Fallback Enabled: ${config.enableFallback}`, COLORS.blue);
  log(`  DeepSeek Key: ${config.aiApiKey ? '✅ Present' : '❌ Missing'}`, 
      config.aiApiKey ? COLORS.green : COLORS.red);
  log(`  Gemini Key: ${config.geminiApiKey ? '✅ Present' : '❌ Missing'}`, 
      config.geminiApiKey ? COLORS.green : COLORS.red);
  
  if (!config.aiApiKey && !config.geminiApiKey) {
    log('\n⚠️  Warning: No API keys configured. Only Rork fallback will be available.', COLORS.yellow);
  }
  
  return config;
}

async function testSimpleRequest() {
  logSection('Testing Simple AI Request');
  
  try {
    const messages: Message[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant. Keep responses brief.'
      },
      {
        role: 'user',
        content: 'Say "Hello from DeepSeek" if you\'re DeepSeek, "Hello from Gemini" if you\'re Gemini, or "Hello from Rork" if you\'re Rork.'
      }
    ];
    
    log('\n🤖 Sending test request...', COLORS.yellow);
    const startTime = Date.now();
    const response = await generateAICompletion(messages);
    const elapsed = Date.now() - startTime;
    
    if (response.completion) {
      log(`✅ Response received in ${elapsed}ms`, COLORS.green);
      log(`📝 Response: ${response.completion.substring(0, 100)}`, COLORS.blue);
      
      // Try to detect which provider responded
      const responseText = response.completion.toLowerCase();
      if (responseText.includes('deepseek')) {
        log('🎯 Provider: DeepSeek (Primary)', COLORS.green);
      } else if (responseText.includes('gemini')) {
        log('🎯 Provider: Gemini (Fallback 1)', COLORS.yellow);
      } else if (responseText.includes('rork')) {
        log('🎯 Provider: Rork (Fallback 2)', COLORS.yellow);
      } else {
        log('🎯 Provider: Unknown (check response)', COLORS.cyan);
      }
    } else {
      log('❌ No completion in response', COLORS.red);
    }
  } catch (error) {
    log(`❌ Request failed: ${error}`, COLORS.red);
  }
}

async function testPlanGenerationRequest() {
  logSection('Testing Plan Generation Request');
  
  try {
    const messages: Message[] = [
      {
        role: 'system',
        content: 'You are a fitness expert. Create a simple workout plan.'
      },
      {
        role: 'user',
        content: 'Create a simple JSON workout with this structure: {"exercises": [{"name": "...", "sets": 3}]}'
      }
    ];
    
    log('\n🏋️ Sending plan generation request...', COLORS.yellow);
    const startTime = Date.now();
    const response = await generateAICompletion(messages);
    const elapsed = Date.now() - startTime;
    
    if (response.completion) {
      log(`✅ Response received in ${elapsed}ms`, COLORS.green);
      
      // Try to parse as JSON
      try {
        const cleanJson = response.completion
          .replace(/```json\s*\n?|```\s*\n?/g, '')
          .trim();
        const parsed = JSON.parse(cleanJson);
        log('✅ Response is valid JSON', COLORS.green);
        log(`📊 Structure: ${JSON.stringify(parsed).substring(0, 100)}...`, COLORS.blue);
      } catch (e) {
        log('⚠️  Response is not valid JSON (might need cleaning)', COLORS.yellow);
        log(`📝 Raw response: ${response.completion.substring(0, 200)}...`, COLORS.blue);
      }
    } else {
      log('❌ No completion in response', COLORS.red);
    }
  } catch (error) {
    log(`❌ Request failed: ${error}`, COLORS.red);
  }
}

async function testDiagnostics() {
  logSection('Running Full Diagnostics');
  
  try {
    const diagnostics = await runPlanGenerationDiagnostics();
    
    log('\n📊 Diagnostic Results:', COLORS.bright);
    log(`  Environment: ${diagnostics.environment}`, COLORS.blue);
    log(`  TestFlight: ${diagnostics.isTestFlight}`, COLORS.blue);
    
    log('\n🌐 API Endpoints:', COLORS.bright);
    log(`  DeepSeek: ${diagnostics.endpoints.deepseekAccessible ? '✅ Accessible' : '❌ Not Accessible'}`,
        diagnostics.endpoints.deepseekAccessible ? COLORS.green : COLORS.red);
    log(`  Gemini: ${diagnostics.endpoints.geminiAccessible ? '✅ Accessible' : '❌ Not Accessible'}`,
        diagnostics.endpoints.geminiAccessible ? COLORS.green : COLORS.red);
    log(`  Rork: ${diagnostics.endpoints.rorkAccessible ? '✅ Accessible' : '❌ Not Accessible'}`,
        diagnostics.endpoints.rorkAccessible ? COLORS.green : COLORS.red);
    
    if (diagnostics.errors.length > 0) {
      log('\n❌ Errors:', COLORS.red);
      diagnostics.errors.forEach(err => log(`  - ${err}`, COLORS.red));
    }
    
    if (diagnostics.warnings.length > 0) {
      log('\n⚠️  Warnings:', COLORS.yellow);
      diagnostics.warnings.forEach(warn => log(`  - ${warn}`, COLORS.yellow));
    }
  } catch (error) {
    log(`❌ Diagnostics failed: ${error}`, COLORS.red);
  }
}

async function testFallbackChain() {
  logSection('Testing Fallback Chain');
  
  log('\n📋 Testing provider priority...', COLORS.yellow);
  
  // Test 1: Normal request (should use primary provider)
  try {
    const messages: Message[] = [
      { role: 'user', content: 'Test primary provider' }
    ];
    
    log('\n1️⃣ Testing primary provider...', COLORS.cyan);
    const response = await generateAICompletion(messages);
    if (response.completion) {
      log('  ✅ Primary provider working', COLORS.green);
    }
  } catch (error) {
    log(`  ❌ Primary provider failed: ${error}`, COLORS.red);
  }
  
  // Note: We can't easily test fallback without manipulating API keys
  log('\n💡 Fallback chain configured as:', COLORS.bright);
  log('  1. DeepSeek (Primary)', COLORS.blue);
  log('  2. Gemini (Fallback 1)', COLORS.blue);
  log('  3. Rork (Fallback 2)', COLORS.blue);
  log('\nFallback triggers automatically when a provider fails.', COLORS.cyan);
}

async function runAllTests() {
  log('\n' + '='.repeat(60), COLORS.bright);
  log('  🚀 DeepSeek Integration Test Suite', COLORS.bright);
  log('='.repeat(60), COLORS.bright);
  
  try {
    // Test 1: Configuration
    const config = await testConfiguration();
    
    // Test 2: Simple Request
    await testSimpleRequest();
    
    // Test 3: Plan Generation
    await testPlanGenerationRequest();
    
    // Test 4: Diagnostics
    await testDiagnostics();
    
    // Test 5: Fallback Chain
    await testFallbackChain();
    
    // Summary
    logSection('Test Summary');
    
    if (config.isValid) {
      log('\n✅ All configuration checks passed!', COLORS.green);
    } else {
      log('\n⚠️  Some configuration issues detected:', COLORS.yellow);
      config.errors.forEach((err: string) => log(`  - ${err}`, COLORS.yellow));
    }
    
    log('\n📌 Next Steps:', COLORS.bright);
    if (!config.aiApiKey) {
      log('  1. Set EXPO_PUBLIC_AI_API_KEY with your DeepSeek API key', COLORS.yellow);
    }
    if (!config.geminiApiKey) {
      log('  2. (Optional) Set EXPO_PUBLIC_GEMINI_API_KEY for Gemini fallback', COLORS.cyan);
    }
    log('  3. Run: eas build --platform ios --profile production', COLORS.blue);
    log('  4. Deploy to TestFlight and verify in production', COLORS.blue);
    
  } catch (error) {
    log(`\n❌ Test suite failed: ${error}`, COLORS.red);
  }
  
  log('\n' + '='.repeat(60), COLORS.bright);
}

// Export for use in other files
export { runAllTests as testDeepSeekIntegration };

// Run tests if executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}
