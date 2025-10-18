// Dynamic app configuration with environment variable support
const IS_DEV = process.env.EXPO_PUBLIC_ENVIRONMENT !== 'production';

module.exports = ({ config }) => {
  return {
    ...config,
    // Override values from app.json with environment variables
    extra: {
      ...config.extra,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      EXPO_PUBLIC_GEMINI_API_KEY: process.env.EXPO_PUBLIC_GEMINI_API_KEY,
      // Generic AI config (so TestFlight has everything it needs)
      EXPO_PUBLIC_AI_PROVIDER: process.env.EXPO_PUBLIC_AI_PROVIDER,
      // Do NOT fallback to Gemini key for the generic AI key; ensures DeepSeek primary
      EXPO_PUBLIC_AI_API_KEY: process.env.EXPO_PUBLIC_AI_API_KEY,
      EXPO_PUBLIC_AI_MODEL: process.env.EXPO_PUBLIC_AI_MODEL,
      EXPO_PUBLIC_AI_TIMEOUT_MS: process.env.EXPO_PUBLIC_AI_TIMEOUT_MS || '120000',
      EXPO_PUBLIC_ENABLE_FALLBACK: process.env.EXPO_PUBLIC_ENABLE_FALLBACK,
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:
        process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ||
        process.env.EXPO_PUBLIC_REVENUECAT_KEY ||
        config.extra?.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
      EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:
        process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ||
        process.env.EXPO_PUBLIC_REVENUECAT_KEY ||
        config.extra?.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
      EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT: process.env.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT || config.extra?.EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT,
      eas: config.extra?.eas,
    },
    // Enable updates in production
    updates: IS_DEV
      ? undefined
      : {
          // Compute EAS Updates URL from projectId if provided
          url: (() => {
            const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;
            return projectId ? `https://u.expo.dev/${projectId}` : config.updates?.url;
          })(),
          enabled: true,
          checkAutomatically: 'ON_LOAD',
          fallbackToCacheTimeout: 0,
        },
  };
};


