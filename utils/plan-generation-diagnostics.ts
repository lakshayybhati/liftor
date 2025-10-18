/**
 * Plan Generation Diagnostics for TestFlight Debugging
 * This utility helps diagnose why plan generation might fail in production
 */

import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DiagnosticResult {
  timestamp: string;
  environment: 'development' | 'production' | 'unknown';
  isTestFlight: boolean;
  apiConfiguration: {
    provider: string | null;
    apiKeyPresent: boolean;
    apiKeyLength: number;
    apiKeyPrefix: string | null;
    model: string | null;
    fallbackEnabled: boolean;
  };
  endpoints: {
    deepseekAccessible: boolean;
    geminiAccessible: boolean;
    rorkAccessible: boolean;
  };
  userDataStatus: {
    hasUser: boolean;
    hasBasePlan: boolean;
    hasCheckin: boolean;
  };
  errors: string[];
  warnings: string[];
}

/**
 * Get configuration from Constants (works in TestFlight)
 */
function getConfig(): Record<string, any> {
  const fromExpoConfig = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
  const fromManifest2 = ((Constants as any).manifest2?.extra ?? {}) as Record<string, any>;
  const extra = { ...fromManifest2, ...fromExpoConfig };
  
  // Log all available keys for debugging
  console.log('📋 Available config keys:', Object.keys(extra));
  
  return extra;
}

/**
 * Run comprehensive diagnostics for plan generation
 */
export async function runPlanGenerationDiagnostics(): Promise<DiagnosticResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    console.log('🔍 === PLAN GENERATION DIAGNOSTICS ===');
    
    // Get configuration
    const config = getConfig();
    const isDev = __DEV__;
    const isTestFlight = !isDev && Constants.appOwnership === 'expo';
    
    console.log('Environment:', isDev ? 'development' : 'production');
    console.log('TestFlight:', isTestFlight);
    
    // Check API configuration (process.env not available in production)
    const apiKey = config.EXPO_PUBLIC_AI_API_KEY || 
                   config.EXPO_PUBLIC_GEMINI_API_KEY;
    
    const provider = config.EXPO_PUBLIC_AI_PROVIDER || 'gemini';
    const model = config.EXPO_PUBLIC_AI_MODEL || 'gemini-1.5-flash-latest';
    const fallbackEnabled = config.EXPO_PUBLIC_ENABLE_FALLBACK === 'true';
    
    console.log('API Provider:', provider);
    console.log('API Key present:', !!apiKey);
    console.log('API Key length:', apiKey?.length || 0);
    console.log('Model:', model);
    console.log('Fallback enabled:', fallbackEnabled);
    
    if (!apiKey) {
      errors.push('No API key found in configuration');
      console.error('❌ CRITICAL: No API key found!');
      console.log('Checked keys:', [
        'EXPO_PUBLIC_AI_API_KEY',
        'EXPO_PUBLIC_GEMINI_API_KEY'
      ]);
    } else {
      console.log('✅ API key found, first 10 chars:', apiKey.substring(0, 10) + '...');
    }
    
    // Test API endpoints
    let deepseekAccessible = false;
    let geminiAccessible = false;
    let rorkAccessible = false;
    
    // Test DeepSeek endpoint if API key exists
    if (apiKey && (provider === 'deepseek' || !provider)) {
      try {
        console.log('Testing DeepSeek API...');
        const testUrl = 'https://api.deepseek.com/v1/chat/completions';
        const response = await fetch(testUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 10,
          }),
        });
        
        deepseekAccessible = response.ok || response.status === 400; // 400 might be bad request but endpoint is accessible
        console.log('DeepSeek API test:', deepseekAccessible ? '✅ Accessible' : '❌ Not accessible');
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          if (errorText.includes('invalid_api_key') || response.status === 401) {
            errors.push('DeepSeek API key is invalid');
          } else if (errorText.includes('insufficient_quota') || response.status === 402) {
            warnings.push('DeepSeek API quota may be exceeded');
          } else if (errorText.includes('rate_limit') || response.status === 429) {
            warnings.push('DeepSeek API rate limit hit');
          }
          console.log('DeepSeek error:', errorText.substring(0, 200));
        }
      } catch (error) {
        console.error('DeepSeek API test failed:', error);
        errors.push(`DeepSeek API test failed: ${error}`);
      }
    }
    
    // Test Gemini endpoint if API key exists
    const geminiKey = config.EXPO_PUBLIC_GEMINI_API_KEY;
    if (geminiKey && (provider === 'gemini' || !provider)) {
      try {
        console.log('Testing Gemini API...');
        const testUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`;
        const response = await fetch(testUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{ text: 'Test' }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 10,
            },
          }),
        });
        
        geminiAccessible = response.ok || response.status === 400; // 400 might be bad request but endpoint is accessible
        console.log('Gemini API test:', geminiAccessible ? '✅ Accessible' : '❌ Not accessible');
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          if (errorText.includes('API_KEY_INVALID')) {
            warnings.push('Gemini API key is invalid');
          } else if (errorText.includes('quota')) {
            warnings.push('Gemini API quota may be exceeded');
          }
          console.log('Gemini error:', errorText.substring(0, 200));
        }
      } catch (error) {
        console.error('Gemini API test failed:', error);
        warnings.push(`Gemini API test failed: ${error}`);
      }
    }
    
    // Test Rork endpoint (fallback)
    try {
      console.log('Testing Rork fallback API...');
      const response = await fetch('https://toolkit.rork.com/text/llm/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Test' }]
        }),
      });
      rorkAccessible = response.ok;
      console.log('Rork API test:', rorkAccessible ? '✅ Accessible' : '❌ Not accessible');
    } catch (error) {
      console.error('Rork API test failed:', error);
      warnings.push('Rork fallback API not accessible');
    }
    
    // Check user data from AsyncStorage
    let hasUser = false;
    let hasBasePlan = false;
    let hasCheckin = false;
    
    try {
      const userData = await AsyncStorage.getItem('user');
      const basePlans = await AsyncStorage.getItem('basePlans');
      const checkins = await AsyncStorage.getItem('checkins');
      
      hasUser = !!userData;
      hasBasePlan = !!basePlans && JSON.parse(basePlans).length > 0;
      hasCheckin = !!checkins && JSON.parse(checkins).length > 0;
      
      console.log('User data:', hasUser ? '✅ Present' : '❌ Missing');
      console.log('Base plans:', hasBasePlan ? '✅ Present' : '❌ Missing');
      console.log('Check-ins:', hasCheckin ? '✅ Present' : '⚠️ No check-ins yet');
    } catch (error) {
      console.error('Failed to check user data:', error);
      warnings.push('Could not verify user data');
    }
    
    // Compile diagnostic result
    const result: DiagnosticResult = {
      timestamp: new Date().toISOString(),
      environment: isDev ? 'development' : 'production',
      isTestFlight,
      apiConfiguration: {
        provider: provider || null,
        apiKeyPresent: !!apiKey,
        apiKeyLength: apiKey?.length || 0,
        apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : null,
        model: model || null,
        fallbackEnabled,
      },
      endpoints: {
        deepseekAccessible,
        geminiAccessible,
        rorkAccessible,
      },
      userDataStatus: {
        hasUser,
        hasBasePlan,
        hasCheckin,
      },
      errors,
      warnings,
    };
    
    // Log summary
    console.log('🔍 === DIAGNOSTIC SUMMARY ===');
    console.log('✅ Working:', [
      apiKey && 'API key configured',
      deepseekAccessible && 'DeepSeek API accessible',
      geminiAccessible && 'Gemini API accessible',
      rorkAccessible && 'Rork fallback available',
      hasUser && 'User data present',
      hasBasePlan && 'Base plan exists',
    ].filter(Boolean).join(', ') || 'None');
    
    console.log('❌ Issues:', errors.length ? errors.join(', ') : 'None');
    console.log('⚠️ Warnings:', warnings.length ? warnings.join(', ') : 'None');
    console.log('🔍 ============================');
    
    // Store diagnostics for later retrieval
    await AsyncStorage.setItem('lastDiagnostics', JSON.stringify(result));
    
    return result;
    
  } catch (error) {
    console.error('Diagnostic error:', error);
    errors.push(`Diagnostic error: ${error}`);
    
    return {
      timestamp: new Date().toISOString(),
      environment: 'unknown',
      isTestFlight: false,
      apiConfiguration: {
        provider: null,
        apiKeyPresent: false,
        apiKeyLength: 0,
        apiKeyPrefix: null,
        model: null,
        fallbackEnabled: false,
      },
      endpoints: {
        deepseekAccessible: false,
        geminiAccessible: false,
        rorkAccessible: false,
      },
      userDataStatus: {
        hasUser: false,
        hasBasePlan: false,
        hasCheckin: false,
      },
      errors,
      warnings,
    };
  }
}

/**
 * Log detailed plan generation attempt
 */
export async function logPlanGenerationAttempt(
  stage: 'base' | 'daily',
  success: boolean,
  error?: any,
  details?: any
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    stage,
    success,
    error: error ? String(error) : undefined,
    details,
  };
  
  console.log(`📝 Plan Generation ${stage} - ${success ? '✅ Success' : '❌ Failed'}`);
  if (error) {
    console.error('Error:', error);
  }
  if (details) {
    console.log('Details:', details);
  }
  
  // Store in AsyncStorage for later retrieval
  try {
    const logs = await AsyncStorage.getItem('planGenerationLogs');
    const existingLogs = logs ? JSON.parse(logs) : [];
    existingLogs.push(logEntry);
    // Keep only last 50 logs
    if (existingLogs.length > 50) {
      existingLogs.shift();
    }
    await AsyncStorage.setItem('planGenerationLogs', JSON.stringify(existingLogs));
  } catch (err) {
    console.warn('Could not store log:', err);
  }
}

/**
 * Get stored diagnostics and logs
 */
export async function getStoredDiagnostics() {
  try {
    const diagnostics = await AsyncStorage.getItem('lastDiagnostics');
    const logs = await AsyncStorage.getItem('planGenerationLogs');
    
    return {
      lastDiagnostics: diagnostics ? JSON.parse(diagnostics) : null,
      recentLogs: logs ? JSON.parse(logs) : [],
    };
  } catch (error) {
    console.error('Failed to retrieve diagnostics:', error);
    return {
      lastDiagnostics: null,
      recentLogs: [],
    };
  }
}
