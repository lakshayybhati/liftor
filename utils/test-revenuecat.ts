/**
 * RevenueCat Configuration Test Utility
 * 
 * Use this to verify your RevenueCat setup is correct.
 * Run this check before deploying to TestFlight.
 */

import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';

interface ConfigCheckResult {
  success: boolean;
  message: string;
  details?: any;
}

export async function checkRevenueCatConfiguration(): Promise<ConfigCheckResult[]> {
  const results: ConfigCheckResult[] = [];

  // Check 1: Platform check
  if (Platform.OS === 'web') {
    results.push({
      success: false,
      message: 'Platform Check',
      details: 'RevenueCat does not work on web. Use EAS build or dev client.'
    });
    return results;
  }

  if (Constants.appOwnership === 'expo') {
    results.push({
      success: false,
      message: 'Runtime Check',
      details: 'Running in Expo Go. RevenueCat requires EAS build or dev client.'
    });
    return results;
  }

  results.push({
    success: true,
    message: 'Platform Check',
    details: `Running on ${Platform.OS} in standalone build`
  });

  // Check 2: API Keys
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  const iosKey = extra.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  const androidKey = extra.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  const requiredEntitlement = extra.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT;

  const apiKey = Platform.OS === 'ios' ? iosKey : androidKey;

  if (!apiKey) {
    results.push({
      success: false,
      message: 'API Key Check',
      details: {
        platform: Platform.OS,
        iosKeyPresent: !!iosKey,
        androidKeyPresent: !!androidKey,
        error: 'No API key found for current platform'
      }
    });
  } else {
    const expectedPrefix = Platform.OS === 'ios' ? 'appl_' : 'goog_';
    const hasCorrectPrefix = apiKey.startsWith(expectedPrefix);
    
    results.push({
      success: hasCorrectPrefix,
      message: 'API Key Check',
      details: {
        platform: Platform.OS,
        keyPresent: true,
        keyPrefix: apiKey.substring(0, 5) + '...',
        correctPrefix: hasCorrectPrefix,
        expectedPrefix
      }
    });
  }

  // Check 3: Entitlement configuration
  if (!requiredEntitlement) {
    results.push({
      success: false,
      message: 'Entitlement Check',
      details: 'No required entitlement specified in app.json'
    });
  } else {
    results.push({
      success: true,
      message: 'Entitlement Check',
      details: {
        requiredEntitlement,
        recommendation: 'Ensure this exact identifier exists in RevenueCat dashboard'
      }
    });
  }

  // Check 4: SDK Configuration
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    
    results.push({
      success: true,
      message: 'SDK Configuration',
      details: {
        configured: true,
        originalAppUserId: customerInfo.originalAppUserId,
        activeEntitlements: Object.keys(customerInfo.entitlements.active),
        hasRequiredEntitlement: !!customerInfo.entitlements.active[requiredEntitlement],
        allEntitlements: Object.keys(customerInfo.entitlements.all)
      }
    });
  } catch (error: any) {
    results.push({
      success: false,
      message: 'SDK Configuration',
      details: {
        configured: false,
        error: error.message || 'Unknown error',
        recommendation: 'Ensure Purchases.configure() was called at app startup'
      }
    });
  }

  // Check 5: Bundle ID match
  const bundleId = Platform.OS === 'ios' 
    ? Constants.expoConfig?.ios?.bundleIdentifier 
    : Constants.expoConfig?.android?.package;

  results.push({
    success: !!bundleId,
    message: 'Bundle ID Check',
    details: {
      platform: Platform.OS,
      bundleId,
      recommendation: 'Ensure this matches your RevenueCat project configuration'
    }
  });

  return results;
}

/**
 * Print configuration check results to console
 */
export async function runRevenueCatDiagnostics(): Promise<void> {
  console.log('\n=== RevenueCat Configuration Diagnostics ===\n');
  
  const results = await checkRevenueCatConfiguration();
  
  let allPassed = true;
  
  results.forEach((result, index) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.message}`);
    
    if (result.details) {
      console.log('   Details:', JSON.stringify(result.details, null, 2));
    }
    
    if (!result.success) {
      allPassed = false;
    }
    
    console.log('');
  });
  
  console.log('===========================================\n');
  
  if (allPassed) {
    console.log('🎉 All checks passed! RevenueCat is properly configured.\n');
  } else {
    console.log('⚠️  Some checks failed. Review the details above.\n');
  }
}

/**
 * Get current subscription status for logged-in user
 */
export async function checkSubscriptionStatus(): Promise<{
  isSubscribed: boolean;
  entitlement: string;
  activeEntitlements: string[];
  expirationDate?: string;
}> {
  try {
    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
    const requiredEntitlement = extra.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT || 'pro';
    
    const customerInfo = await Purchases.getCustomerInfo();
    const activeEntitlements = Object.keys(customerInfo.entitlements.active);
    const isSubscribed = activeEntitlements.includes(requiredEntitlement);
    
    let expirationDate: string | undefined;
    if (isSubscribed) {
      const entitlement = customerInfo.entitlements.active[requiredEntitlement];
      expirationDate = entitlement.expirationDate || undefined;
    }
    
    return {
      isSubscribed,
      entitlement: requiredEntitlement,
      activeEntitlements,
      expirationDate
    };
  } catch (error) {
    console.error('[RevenueCat] Error checking subscription status:', error);
    return {
      isSubscribed: false,
      entitlement: '',
      activeEntitlements: []
    };
  }
}

/**
 * Force refresh customer info from RevenueCat servers
 */
export async function refreshSubscriptionStatus(): Promise<void> {
  try {
    console.log('[RevenueCat] Refreshing customer info from server...');
    const customerInfo = await Purchases.getCustomerInfo();
    console.log('[RevenueCat] Customer info refreshed');
    console.log('[RevenueCat] Active entitlements:', Object.keys(customerInfo.entitlements.active));
  } catch (error) {
    console.error('[RevenueCat] Error refreshing customer info:', error);
  }
}





