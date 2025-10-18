#!/usr/bin/env npx ts-node

/**
 * Production Tests Runner
 * Run this script to verify everything is production-ready
 */

import { testDeepSeekIntegration } from './utils/test-deepseek-integration';
import { testProductionConfig } from './utils/test-production-config';
import { runPlanGenerationDiagnostics } from './utils/plan-generation-diagnostics';

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

async function runAllTests() {
  log('\n' + '='.repeat(70), COLORS.bright);
  log('  🚀 LIFTOR PRODUCTION READINESS TEST SUITE', COLORS.bright);
  log('='.repeat(70), COLORS.bright);
  log('', COLORS.reset);
  
  let allTestsPassed = true;
  
  // Test 1: DeepSeek Integration
  log('1️⃣  Testing DeepSeek Integration...', COLORS.cyan);
  log('─'.repeat(70), COLORS.cyan);
  try {
    await testDeepSeekIntegration();
    log('✅ DeepSeek Integration Test: PASSED\n', COLORS.green);
  } catch (error) {
    log(`❌ DeepSeek Integration Test: FAILED - ${error}\n`, COLORS.red);
    allTestsPassed = false;
  }
  
  // Test 2: Production Configuration
  log('2️⃣  Testing Production Configuration...', COLORS.cyan);
  log('─'.repeat(70), COLORS.cyan);
  try {
    const result = await testProductionConfig();
    if (result.passed) {
      log('✅ Production Configuration Test: PASSED\n', COLORS.green);
    } else {
      log('❌ Production Configuration Test: FAILED\n', COLORS.red);
      allTestsPassed = false;
    }
  } catch (error) {
    log(`❌ Production Configuration Test: FAILED - ${error}\n`, COLORS.red);
    allTestsPassed = false;
  }
  
  // Test 3: Plan Generation Diagnostics
  log('3️⃣  Running Plan Generation Diagnostics...', COLORS.cyan);
  log('─'.repeat(70), COLORS.cyan);
  try {
    const diagnostics = await runPlanGenerationDiagnostics();
    
    if (diagnostics.errors.length === 0) {
      log('✅ Plan Generation Diagnostics: PASSED', COLORS.green);
      log(`   Accessible endpoints: DeepSeek=${diagnostics.endpoints.deepseekAccessible}, Gemini=${diagnostics.endpoints.geminiAccessible}, Rork=${diagnostics.endpoints.rorkAccessible}\n`, COLORS.blue);
    } else {
      log('❌ Plan Generation Diagnostics: ISSUES FOUND', COLORS.red);
      diagnostics.errors.forEach(err => log(`   - ${err}`, COLORS.red));
      allTestsPassed = false;
    }
  } catch (error) {
    log(`❌ Plan Generation Diagnostics: FAILED - ${error}\n`, COLORS.red);
    allTestsPassed = false;
  }
  
  // Final Summary
  log('='.repeat(70), COLORS.bright);
  log('  📊 FINAL SUMMARY', COLORS.bright);
  log('='.repeat(70), COLORS.bright);
  
  if (allTestsPassed) {
    log('\n🎉 ALL TESTS PASSED! Your app is PRODUCTION READY! 🎉', COLORS.green);
    log('\n✅ DeepSeek integration configured correctly', COLORS.green);
    log('✅ Fallback chain working (DeepSeek → Gemini → Rork)', COLORS.green);
    log('✅ All services using centralized AI client', COLORS.green);
    log('✅ Plan generation consistent across services', COLORS.green);
    log('✅ Error handling and timeouts in place', COLORS.green);
    log('✅ iOS network configuration correct', COLORS.green);
    
    log('\n📋 Next Steps:', COLORS.bright);
    log('1. Build for production: eas build --platform ios --profile production', COLORS.blue);
    log('2. Submit to TestFlight: eas submit --platform ios', COLORS.blue);
    log('3. Monitor costs: ~$63/month for 5,000 users', COLORS.blue);
    log('4. Track metrics: Response time <5s, Success rate >99%', COLORS.blue);
  } else {
    log('\n⚠️  SOME TESTS FAILED - Please fix issues before deploying', COLORS.yellow);
    log('\nRun ./verify-deepseek-setup.sh to check configuration', COLORS.yellow);
    log('Check logs above for specific failures', COLORS.yellow);
  }
  
  log('\n' + '='.repeat(70), COLORS.bright);
  log('  📚 Documentation:', COLORS.cyan);
  log('  - Setup Guide: DEEPSEEK_SETUP_GUIDE.md', COLORS.cyan);
  log('  - Production Summary: PRODUCTION_READY_SUMMARY.md', COLORS.cyan);
  log('  - Implementation Details: DEEPSEEK_IMPLEMENTATION_SUMMARY.md', COLORS.cyan);
  log('='.repeat(70) + '\n', COLORS.bright);
  
  process.exit(allTestsPassed ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  log(`\n❌ Test suite crashed: ${error}`, COLORS.red);
  process.exit(1);
});
