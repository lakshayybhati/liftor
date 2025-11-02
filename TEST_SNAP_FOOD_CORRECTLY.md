# How to Test Snap Food Function Correctly

## The Problem with Your Current Test

You're getting `{"code":401,"message":"Invalid JWT"}` because you're using the wrong authorization token.

### What You Used (WRONG):
```bash
-H "Authorization: Bearer sbp_5f2a3242006b9889ada3f4e1a134921f384229cc"
```

This is a **service role key** (`sbp_...`) which is NOT a valid JWT token for the function.

## What You Need to Use

### Option 1: Use the ANON KEY (Recommended for Testing)

The ANON KEY is a JWT token that starts with `eyJ...`. Find it in:
- Supabase Dashboard → Settings → API → Project API keys → `anon` `public`

```bash
export SUPABASE_URL="https://oyvxcdjvwxchmachnrtb.supabase.co"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ..."  # Your actual anon key

# Test manual entry (uses DeepSeek)
curl -X POST "$SUPABASE_URL/functions/v1/macros" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "text",
    "name": "chicken breast",
    "portion": "100g",
    "previewOnly": true
  }'
```

**Note:** Edge Functions require BOTH:
- `Authorization: Bearer <anon_key>` header
- `apikey: <anon_key>` header

### Option 2: Use a Real User Access Token (Most Accurate)

For testing with actual user authentication (like the app does):

1. **Get a user access token from your app:**
   - Log in to your app
   - In your app code, add: `console.log(session?.access_token)`
   - Copy the token from console

2. **Use it in curl:**
```bash
export USER_ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # From app console

curl -X POST "$SUPABASE_URL/functions/v1/macros" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "text",
    "name": "rice and curry",
    "portion": "1 cup",
    "previewOnly": true
  }'
```

## Why the Gemini API Works Directly But Not in Function

When you test Gemini API directly with curl, you're using:
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  ...
```

This works because you're authenticating with Google's API directly.

However, when calling the Supabase Edge Function:
1. **First**, you need to authenticate with Supabase (using anon key or user token)
2. **Then**, the function uses the Gemini API key internally (set as a Supabase secret)

The 401 error is happening at step 1 (Supabase authentication), not step 2 (Gemini API).

## Fix Your Test Script

Update your test command to:

```bash
#!/bin/bash

# Get your ANON KEY from Supabase Dashboard → Settings → API
export SUPABASE_URL="https://oyvxcdjvwxchmachnrtb.supabase.co"
export SUPABASE_ANON_KEY="YOUR_ANON_KEY_HERE"  # Starts with eyJ...

echo "Testing macros function..."

# Test manual text entry
curl -i -X POST "$SUPABASE_URL/functions/v1/macros" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "text",
    "name": "paneer tikka",
    "portion": "150g",
    "previewOnly": true
  }'
```

## Expected Results

### ✅ Success (200 OK):
```json
{
  "items": [
    {
      "name": "Paneer Tikka",
      "quantity": "150g",
      "calories": 250,
      "protein_g": 20,
      "carbs_g": 5,
      "fat_g": 15
    }
  ],
  "totals": {
    "kcal": 250,
    "protein_g": 20,
    "carbs_g": 5,
    "fat_g": 15
  },
  "confidence": 0.85,
  "notes": ""
}
```

### ❌ Error (500) - Missing API Key:
```json
{
  "code": "INTERNAL",
  "message": "DeepSeek API key not configured"
}
```

If you get this, set the secret:
```bash
supabase secrets set DEEPSEEK_API_KEY='your-key'
supabase functions deploy macros
```

## Check Function Logs

After testing, check logs to see what happened:
```bash
supabase functions logs macros --limit 20
```

Look for entries with `[macros]` prefix for detailed debugging info.

## Common Mistakes

1. ❌ Using service role key (`sbp_...`) instead of anon key
2. ❌ Forgetting the `apikey` header
3. ❌ Using expired user access token
4. ❌ Not setting DEEPSEEK_API_KEY or GEMINI_API_KEY as Supabase secrets


