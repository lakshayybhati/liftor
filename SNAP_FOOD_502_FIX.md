# Snap Food 502 Error Fix

## Problem Summary
The snap food feature was failing with a 502 error from the Supabase Edge Function. The error log showed a 502 status code but didn't provide clear details about the root cause.

## Root Causes Identified
1. **Missing API Keys**: The Gemini or DeepSeek API keys were not properly configured in Supabase Edge Functions
2. **Poor Error Visibility**: The client wasn't capturing the actual error details from the 502 response
3. **Incomplete Error Handling**: The function wasn't logging enough information for debugging

## Fixes Applied

### 1. Enhanced Function Error Handling
**File**: `supabase/functions/macros/index.ts`

- Added comprehensive logging throughout the function
- Added validation for API keys before attempting to call external services
- Improved error messages to be more descriptive
- Added environment variable checks at startup

Key changes:
- Log request details on entry
- Check and log availability of API keys
- Return specific error codes for missing API keys
- Log all errors with context

### 2. Improved Client-Side Error Capture
**File**: `app/snap-food.tsx`

- Enhanced `invokeWithRetry` function to capture full error details
- Added structured error code handling
- Improved error messages based on specific error codes
- Added better logging for debugging

Key improvements:
- Capture error context and details from function response
- Map error codes to user-friendly messages
- Don't retry on configuration errors
- Log full error details for debugging

### 3. Created Diagnostic Tools

#### `verify-macros-setup.sh`
Checks if environment variables are properly configured locally and provides instructions for setting up Supabase secrets.

#### `test-macros-function.sh`
Tests the macros function directly to identify specific issues and provides actionable feedback.

## How to Fix the 502 Error

### Step 1: Verify API Keys are Set in Supabase

```bash
# Check which secrets are currently set
supabase secrets list

# Set the required API keys
supabase secrets set DEEPSEEK_API_KEY='your-deepseek-api-key'
supabase secrets set GEMINI_API_KEY='your-gemini-api-key'
supabase secrets set TZ_LOCAL='Asia/Kolkata'  # Optional, defaults to Asia/Kolkata
```

### Step 2: Deploy the Updated Function

```bash
# Deploy the macros function with the fixes
supabase functions deploy macros
```

### Step 3: Test the Function

Run the test script to verify it's working:

```bash
./test-macros-function.sh
```

Or test manually with curl:

```bash
# Test manual text entry (uses DeepSeek)
curl -X POST "$SUPABASE_URL/functions/v1/macros" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "text",
    "name": "chicken breast",
    "portion": "100g",
    "previewOnly": true
  }'
```

### Step 4: Check Function Logs

If issues persist, check the function logs:

```bash
supabase functions logs macros
```

Look for entries starting with `[macros]` for detailed debugging information.

## Common Error Codes and Solutions

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `INTERNAL` with "API key" | Missing API key configuration | Set the appropriate API key using `supabase secrets set` |
| `STORAGE_ERROR` | Failed to access uploaded image | Check storage bucket permissions and path |
| `UNAUTHORIZED` | Missing or invalid authentication | Ensure user is logged in with valid session |
| `PARSE_FAILED` | AI response couldn't be parsed | Usually temporary, retry or use manual entry |
| `BAD_INPUT` | Invalid request format | Check request body matches expected schema |

## Testing in the App

1. **Test Manual Entry First**: 
   - Go to snap food screen
   - Choose "Manual Entry"
   - Enter food name and portion
   - This tests DeepSeek integration

2. **Test Image Analysis**:
   - Take a photo of food
   - Add any additional notes
   - Analyze the image
   - This tests Gemini integration

## Monitoring

The enhanced logging will help identify issues:

1. **Client-side logs** (in console):
   - Look for `[snap-food]` prefixed messages
   - Check error details including code and status

2. **Function logs** (in Supabase):
   - Look for `[macros]` prefixed messages
   - Check environment variable availability
   - Review request/response details

## Prevention

To prevent similar issues in the future:

1. **Always validate environment variables** before using them
2. **Return structured error responses** with clear error codes
3. **Log important operations** for debugging
4. **Test functions locally** before deployment
5. **Document API key requirements** clearly

## Additional Notes

- The function now checks for API keys before attempting to use them
- Error messages are more user-friendly and actionable
- The client will not retry on configuration errors (missing API keys)
- All errors are logged with full context for easier debugging


