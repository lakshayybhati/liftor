# Environment Keys Usage

## AI (DeepSeek primary)
- EXPO_PUBLIC_AI_PROVIDER
  - Value: `deepseek`
  - Purpose: Selects the primary AI provider.
  - Used in: `utils/production-config.ts` → `getProductionConfig()` and `utils/ai-client.ts` provider selection.

- EXPO_PUBLIC_AI_API_KEY
  - Value: DeepSeek API key
  - Purpose: Auth for DeepSeek API.
  - Used in: `utils/production-config.ts` (as `aiApiKey`), `utils/ai-client.ts` (DeepSeek client).

- EXPO_PUBLIC_AI_MODEL
  - Value: `deepseek-chat`
  - Purpose: Model string for the active provider.
  - Used in: `utils/production-config.ts` and `utils/ai-client.ts`.

- EXPO_PUBLIC_ENABLE_FALLBACK
  - Value: `true`
  - Purpose: Enables fallback chain.
  - Used in: `utils/ai-client.ts` to trigger Gemini → Rork on failures.

- EXPO_PUBLIC_GEMINI_API_KEY (optional)
  - Value: Gemini API key
  - Purpose: Enables Gemini fallback.
  - Used in: `utils/production-config.ts` (as `geminiApiKey`), `utils/ai-client.ts` (Gemini client).

## RevenueCat
- EXPO_PUBLIC_REVENUECAT_IOS_API_KEY / EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
  - Purpose: RevenueCat SDK keys.
  - Used in: `utils/production-config.ts` and paywall code.

- EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT
  - Purpose: Required entitlement identifier.

## Supabase
- EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
  - Purpose: Backend database access.
  - Used in: Supabase client initialization.

## How keys are read in production
- All keys are injected via EAS env and read from `Constants.expoConfig.extra` in `utils/production-config.ts`.
- Process env is only used in development.

## Network permissions (iOS)
- Allowed ATS domains: `api.deepseek.com`, `generativelanguage.googleapis.com`, `toolkit.rork.com`, `supabase.co`.

## Provider order
- Primary: DeepSeek
- Fallback 1: Gemini (if key present)
- Fallback 2: Rork
