/**
 * Production Configuration Manager
 * Centralized configuration reading for all services in production/TestFlight
 */

import Constants from 'expo-constants';

export interface ProductionConfig {
  // Supabase
  supabaseUrl: string;
  supabaseAnonKey: string;
  
  // AI Service
  aiProvider: string;
  aiApiKey: string;
  aiModel: string;
  enableFallback: boolean;
  geminiApiKey: string;
  aiTimeoutMs: number;
  
  // RevenueCat
  revenuecatIosKey: string;
  revenuecatAndroidKey: string;
  revenuecatEntitlement: string;
  
  // Environment
  environment: 'development' | 'production';
  isProduction: boolean;
  isTestFlight: boolean;
  
  // Status
  isValid: boolean;
  errors: string[];
}

/**
 * Get configuration from Constants (works in all environments)
 * In production/TestFlight, ONLY Constants.expoConfig.extra has the values
 * process.env is NOT available in production builds
 */
function getConfig(): Record<string, any> {
  // Read from both sources to ensure TestFlight compatibility
  const fromExpoConfig = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
  const fromManifest2 = ((Constants as any).manifest2?.extra ?? {}) as Record<string, any>;
  
  // In development, also check process.env as a last resort
  const fromProcessEnv = __DEV__ ? (process.env as Record<string, any>) : {};
  
  // Merge: process.env (dev only) < expoConfig < manifest2
  return { ...fromProcessEnv, ...fromExpoConfig, ...fromManifest2 };
}

/**
 * Get production configuration with validation
 */
export function getProductionConfig(): ProductionConfig {
  const extra = getConfig();
  const isDev = __DEV__;
  const errors: string[] = [];
  
  // Supabase configuration - only from extra in production
  const supabaseUrl = extra.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = extra.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  
  // AI configuration - only from extra in production
  // Priority: DeepSeek (EXPO_PUBLIC_AI_API_KEY) → Gemini (EXPO_PUBLIC_GEMINI_API_KEY) → Rork
  const aiApiKey = extra.EXPO_PUBLIC_AI_API_KEY || '';
  const geminiApiKey = extra.EXPO_PUBLIC_GEMINI_API_KEY || '';
  const aiTimeoutMs = Number(extra.EXPO_PUBLIC_AI_TIMEOUT_MS) || 180000;
  
  const aiProvider = extra.EXPO_PUBLIC_AI_PROVIDER || 
                    (aiApiKey ? 'deepseek' : geminiApiKey ? 'gemini' : 'rork');
  
  // Smart model selection based on provider
  const defaultModel = aiProvider === 'deepseek' ? 'deepseek-chat' : 
                      aiProvider === 'gemini' ? 'gemini-1.5-flash-latest' : 
                      'gpt-4o-mini';
  const aiModel = extra.EXPO_PUBLIC_AI_MODEL || defaultModel;
  const enableFallback = extra.EXPO_PUBLIC_ENABLE_FALLBACK !== 'false';
  
  // RevenueCat configuration - only from extra in production
  const revenuecatIosKey = extra.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || 
                          extra.EXPO_PUBLIC_REVENUECAT_KEY || '';
  const revenuecatAndroidKey = extra.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || 
                              extra.EXPO_PUBLIC_REVENUECAT_KEY || '';
  const revenuecatEntitlement = extra.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT || 'pro';
  
  // Environment detection
  const environment = (extra.EXPO_PUBLIC_ENVIRONMENT || 
                      (isDev ? 'development' : 'production')) as 'development' | 'production';
  const isProduction = !isDev;
  const isTestFlight = isProduction && Constants.appOwnership === 'expo';
  
  // Validation
  if (!supabaseUrl || supabaseUrl.length < 20 || supabaseUrl.includes('your-')) {
    errors.push('Invalid or missing Supabase URL');
  }
  if (!supabaseAnonKey || supabaseAnonKey.length < 20 || supabaseAnonKey.includes('your-')) {
    errors.push('Invalid or missing Supabase Anon Key');
  }
  if (!aiApiKey && aiProvider !== 'rork') {
    errors.push(`No API key for AI provider: ${aiProvider}`);
  }
  if (!revenuecatIosKey && isProduction) {
    errors.push('Missing RevenueCat iOS API key');
  }
  if (!revenuecatAndroidKey && isProduction) {
    errors.push('Missing RevenueCat Android API key');
  }
  
  const config: ProductionConfig = {
    supabaseUrl,
    supabaseAnonKey,
    aiProvider,
    aiApiKey,
    aiModel,
    enableFallback,
    geminiApiKey,
    aiTimeoutMs,
    revenuecatIosKey,
    revenuecatAndroidKey,
    revenuecatEntitlement,
    environment,
    isProduction,
    isTestFlight,
    isValid: errors.length === 0,
    errors,
  };
  
  // Log configuration in production for debugging
  if (isProduction) {
    console.log('🔍 === PRODUCTION CONFIGURATION ===');
    console.log('Environment:', environment);
    console.log('TestFlight:', isTestFlight);
    console.log('Supabase:', supabaseUrl ? '✅ Configured' : '❌ Missing');
    console.log('AI Provider:', aiProvider);
    console.log('AI Key:', aiApiKey ? '✅ Present' : '❌ Missing');
    console.log('RevenueCat iOS:', revenuecatIosKey ? '✅ Present' : '❌ Missing');
    console.log('RevenueCat Android:', revenuecatAndroidKey ? '✅ Present' : '❌ Missing');
    console.log('Valid:', config.isValid ? '✅' : '❌');
    if (errors.length > 0) {
      console.error('Configuration errors:', errors);
    }
    console.log('🔍 ================================');
  }
  
  return config;
}

/**
 * Validate production configuration and throw if invalid
 */
export function validateProductionConfig(): void {
  const config = getProductionConfig();
  
  if (!config.isValid && config.isProduction) {
    const errorMessage = `Production configuration errors:\n${config.errors.join('\n')}`;
    console.error('❌ ' + errorMessage);
    
    // In production, we should still try to run but log the issues
    if (config.errors.some(e => e.includes('Supabase'))) {
      console.error('⚠️ App will have limited functionality without Supabase');
    }
  }
}

/**
 * Get a specific configuration value with fallback
 */
export function getConfigValue<T>(
  key: string,
  fallback: T,
  validator?: (value: any) => boolean
): T {
  const extra = getConfig();
  
  // Only use extra in production (process.env not available)
  const value = extra[key] || fallback;
  
  // Validate if validator provided
  if (validator && !validator(value)) {
    console.warn(`Invalid config value for ${key}, using fallback`);
    return fallback;
  }
  
  return value;
}

/**
 * Check if a feature is enabled in production
 */
export function isFeatureEnabled(feature: string): boolean {
  const extra = getConfig();
  const key = `EXPO_PUBLIC_ENABLE_${feature.toUpperCase()}`;
  
  return extra[key] === 'true' || extra[key] === true;
}

/**
 * Get API endpoint URL with environment awareness
 */
export function getApiEndpoint(service: 'supabase' | 'ai' | 'revenuecat'): string {
  const config = getProductionConfig();
  
  switch (service) {
    case 'supabase':
      return config.supabaseUrl;
    case 'ai':
      if (config.aiProvider === 'deepseek' && config.aiApiKey) {
        return 'https://api.deepseek.com/v1/chat/completions';
      }
      if (config.aiProvider === 'gemini' && config.geminiApiKey) {
        // Ensure a valid Gemini model string
        const m = config.aiModel;
        const modelForGemini = !m || !/^gemini-/i.test(m)
          ? 'gemini-1.5-flash-latest'
          : m;
        return `https://generativelanguage.googleapis.com/v1/models/${modelForGemini}:generateContent`;
      }
      if (config.aiProvider === 'openai' && config.aiApiKey) {
        return 'https://api.openai.com/v1/chat/completions';
      }
      return 'https://toolkit.rork.com/text/llm/';
    case 'revenuecat':
      return 'https://api.revenuecat.com/v1/';
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}

/**
 * Log production metrics for monitoring
 */
export function logProductionMetric(
  category: 'api' | 'auth' | 'data' | 'error',
  action: string,
  value?: any
): void {
  const config = getProductionConfig();
  
  if (config.isProduction) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      category,
      action,
      value,
      environment: config.environment,
      isTestFlight: config.isTestFlight,
    };
    
    // In production, you might want to send this to a monitoring service
    console.log(`[${category.toUpperCase()}] ${action}`, value || '');
    
    // Store locally for debugging
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      AsyncStorage.getItem('production_logs').then((logs: string | null) => {
        const existingLogs = logs ? JSON.parse(logs) : [];
        existingLogs.push(logEntry);
        // Keep only last 100 logs
        if (existingLogs.length > 100) {
          existingLogs.shift();
        }
        AsyncStorage.setItem('production_logs', JSON.stringify(existingLogs));
      });
    } catch (err) {
      // Ignore storage errors
    }
  }
}
