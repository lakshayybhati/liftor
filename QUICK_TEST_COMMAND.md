# 🚀 Quick Test Command for Snap Food

## 🔴 Your Current Error

```
{"code":401,"message":"Invalid JWT"}
```

This means you're using the **WRONG KEY TYPE**.

---

## ✅ The Correct Way to Test

### Step 1: Get Your ANON KEY

Go to your Supabase Dashboard:
1. Navigate to: **Settings** → **API**
2. Find: **Project API keys** section
3. Copy the **`anon`** **`public`** key
   - It starts with: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - It's LONG (hundreds of characters)

### Step 2: Set Environment Variables

```bash
# Your project URL
export SUPABASE_URL="https://oyvxcdjvwxchmachnrtb.supabase.co"

# Your ANON KEY (NOT the service role key!)
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # Replace with your actual anon key
```

### Step 3: Test the Function

```bash
# Test manual text entry (uses DeepSeek)
curl -i -X POST "$SUPABASE_URL/functions/v1/macros" \
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

**Important:** You need BOTH headers:
- `Authorization: Bearer $SUPABASE_ANON_KEY`
- `apikey: $SUPABASE_ANON_KEY`

---

## ❌ What You Were Using (WRONG)

```bash
-H "Authorization: Bearer sbp_5f2a3242006b9889ada3f4e1a134921f384229cc"
```

This is a **SERVICE ROLE KEY** (starts with `sbp_...`). Edge Functions don't accept this key type directly in the Authorization header.

---

## 📊 Key Types Explained

| Key Type | Prefix | Where to Use | For Edge Functions? |
|----------|--------|--------------|---------------------|
| **ANON KEY** | `eyJ...` | Client apps, Edge Functions | ✅ YES |
| **Service Role** | `sbp_...` | Server-side only, admin operations | ❌ NO (not in Auth header) |

---

## 🧪 Use the Test Script

Or use our automated test script:

```bash
# Set your credentials
export SUPABASE_URL="https://oyvxcdjvwxchmachnrtb.supabase.co"
export SUPABASE_ANON_KEY="eyJ..."  # Your anon key

# Run the test
./test-macros-function.sh
```

This will automatically:
- ✅ Check your environment variables
- ✅ Test the function with proper authentication
- ✅ Show detailed error analysis if it fails
- ✅ Provide specific solutions for each error type

---

## 🎯 Expected Success Response

If everything is configured correctly, you should see:

```json
HTTP/2 200

{
  "items": [
    {
      "name": "Chicken Breast",
      "quantity": "100g",
      "calories": 165,
      "protein_g": 31,
      "carbs_g": 0,
      "fat_g": 3.6
    }
  ],
  "totals": {
    "kcal": 165,
    "protein_g": 31,
    "carbs_g": 0,
    "fat_g": 3.6
  },
  "confidence": 0.9,
  "notes": "Skinless, boneless chicken breast"
}
```

---

## 🔍 If You Still Get Errors

### Error: "DeepSeek API key not configured"
```bash
supabase secrets set DEEPSEEK_API_KEY='your-deepseek-api-key'
supabase functions deploy macros
```

### Error: "Gemini API key not configured"
```bash
supabase secrets set GEMINI_API_KEY='your-gemini-api-key'
supabase functions deploy macros
```

### Check Function Logs
```bash
supabase functions logs macros --limit 20
```

Look for `[macros]` entries to see detailed debugging info.

---

## 📝 Summary

1. ❌ **Don't use:** `sbp_...` (service role key)
2. ✅ **Do use:** `eyJ...` (anon key)
3. ✅ **Include both:** `Authorization` AND `apikey` headers
4. ✅ **Set secrets:** DeepSeek and Gemini API keys in Supabase


