import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Dev-only environment diagnostics to help catch misconfiguration early.
// Safe no-ops in production and never throws.
export function runEnvironmentDiagnostics(): void {
  try {
    if (!__DEV__) return; // Only log in development

    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;

    const supabaseUrl = extra.EXPO_PUBLIC_SUPABASE_URL
      || process.env?.EXPO_PUBLIC_SUPABASE_URL
      || '';
    const supabaseAnonKey = extra.EXPO_PUBLIC_SUPABASE_ANON_KEY
      || process.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY
      || '';

    const rcIos = extra.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '';
    const rcAndroid = extra.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || '';

    const missing: string[] = [];
    if (!supabaseUrl) missing.push('EXPO_PUBLIC_SUPABASE_URL');
    if (!supabaseAnonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    if (Platform.OS === 'ios' && !rcIos) missing.push('EXPO_PUBLIC_REVENUECAT_IOS_API_KEY');
    if (Platform.OS === 'android' && !rcAndroid) missing.push('EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY');

    // High-level environment summary
    console.log('[Diagnostics] Platform:', Platform.OS, 'AppOwnership:', Constants.appOwnership || 'unknown');
    console.log('[Diagnostics] Extra keys found:', Object.keys(extra));

    if (missing.length > 0) {
      console.warn('[Diagnostics] Missing configuration keys:', missing.join(', '));
    }
  } catch (err) {
    // Never throw from diagnostics; only log
    console.log('[Diagnostics] Skipped or failed:', err);
  }
}

export function logDetailedEnvironment(): void {
  try {
    if (!__DEV__) return;
    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
    console.log('[Diagnostics] Detailed extra config:', extra);
  } catch (err) {
    console.log('[Diagnostics] Detailed log failed:', err);
  }
}


