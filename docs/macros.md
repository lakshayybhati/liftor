# Macros Edge Function & Client Integration

## Env Vars (Supabase Edge)
- GEMINI_API_KEY
- DEEPSEEK_API_KEY
- TZ_LOCAL=Asia/Kolkata
- RETENTION_DAYS=90 (retention function)

## Storage
- Bucket: `food_snaps` (private)
- Path: `food_snaps/{user_id}/{YYYY}/{MM}/{DD}/{uuid}.jpg`
- Signed URLs via batch helper; no public URLs in DB

## API Contracts
- Preview (no write): `POST /functions/v1/macros` with body `{ kind: 'text'|'image', ... , previewOnly: true }`
- Insert (idempotent): same body with `previewOnly: false` and `Idempotency-Key` header
- Responses:
  - Preview: `MacroResp` JSON
  - Insert: row from `food_extras`
- Errors: `{ code, message }`
  - BAD_INPUT, RATE_LIMITED, MODEL_TIMEOUT, PARSE_FAILED, STORAGE_ERROR, UNAUTHORIZED, CONFLICT, INTERNAL

## Error → User copy
- MODEL_TIMEOUT: "Analysis took too long—try again or use Manual."
- PARSE_FAILED: "Couldn’t read nutrition—edit values manually."
- RATE_LIMITED: "Daily analysis limit reached—try tomorrow."

## Feature Flags
- EXPO_PUBLIC_ENABLE_MACROS=true
- EXPO_PUBLIC_DISABLE_DEEPSEEK / EXPO_PUBLIC_DISABLE_GEMINI

## Runbooks
- Rotate API keys in Supabase Edge env vars, redeploy functions
- Storage leakage: run `retention` function; tune RETENTION_DAYS
- Load testing: `k6 run scripts/k6/macros_preview_test.js` with SUPABASE_URL, ACCESS_TOKEN


