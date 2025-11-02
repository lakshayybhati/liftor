# 📸 Snap Food Feature - Final Status & Next Steps

## ✅ What Was Fixed

### 1. Edge Function (macros)
- ✅ Fixed all syntax errors
- ✅ Added comprehensive logging with `[macros]` prefix
- ✅ Added API key validation before use
- ✅ Return specific error codes for each issue
- ✅ Improved error messages for debugging

### 2. Client App (snap-food.tsx)
- ✅ Enhanced error capture to get full 502 details
- ✅ Map error codes to user-friendly messages
- ✅ Smart retry logic (don't retry config errors)
- ✅ Better logging with `[snap-food]` prefix

### 3. Documentation & Testing
- ✅ Created comprehensive testing guides
- ✅ Created diagnostic scripts
- ✅ Documented all error codes and solutions

---

## 🔴 Current Issue: Authentication Error

You're getting:
```
{"code":401,"message":"Invalid JWT"}
```

### Root Cause
You're using the **SERVICE ROLE KEY** (`sbp_...`) instead of the **ANON KEY** (`eyJ...`)

### Solution
Use the correct key from: **Supabase Dashboard → Settings → API → anon public**

```bash
export SUPABASE_ANON_KEY="eyJhbGci..."  # Your actual anon key (NOT sbp_...)

curl -X POST "https://oyvxcdjvwxchmachnrtb.supabase.co/functions/v1/macros" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "text",
    "name": "chicken",
    "portion": "100g",
    "previewOnly": true
  }'
```

---

## 🎯 Next Steps to Get Snap Food Working

### 1. Test Authentication (5 minutes)
```bash
# Get your anon key from Supabase Dashboard
export SUPABASE_ANON_KEY="eyJ..."

# Run the test script
./test-macros-function.sh
```

**Expected:** Either success OR a specific error about missing API keys

### 2. Set API Keys in Supabase (5 minutes)
If you get "API key not configured" errors:

```bash
# For manual text entry (DeepSeek)
supabase secrets set DEEPSEEK_API_KEY='your-deepseek-key'

# For image analysis (Gemini)
supabase secrets set GEMINI_API_KEY='your-gemini-key'

# Deploy the function
supabase functions deploy macros
```

### 3. Test Again (2 minutes)
```bash
./test-macros-function.sh
```

**Expected:** 200 OK with nutrition data

### 4. Test in App (5 minutes)
1. Open your app
2. Navigate to snap food
3. Try manual entry first (tests DeepSeek)
4. If that works, try image snap (tests Gemini)

---

## 📊 Understanding the Error Flow

```
User Action (Snap Food)
    ↓
Client sends request to Supabase Edge Function
    ↓
[CHECK 1] Valid JWT token? ← YOU ARE HERE (401 error)
    ↓ ✅ YES
[CHECK 2] DeepSeek/Gemini API key set?
    ↓ ✅ YES
[CHECK 3] Call external AI API
    ↓ ✅ YES
[CHECK 4] Parse response
    ↓ ✅ YES
Return nutrition data
```

You're currently failing at **CHECK 1** because you're using the wrong key type.

---

## 🔑 Key Types Reference

| What You Have | What It's Called | Can Use for Edge Functions? |
|---------------|------------------|----------------------------|
| `sbp_5f2a...` | Service Role Key | ❌ NO (wrong key type) |
| `eyJhbGci...` | Anon Key | ✅ YES (this is what you need) |
| User's `access_token` | User Session Token | ✅ YES (from app login) |

---

## 🧪 Verification Checklist

Before testing in the app, verify:

- [ ] Can call function with anon key via curl (no 401 error)
- [ ] DeepSeek API key is set as Supabase secret
- [ ] Gemini API key is set as Supabase secret
- [ ] Function is deployed: `supabase functions deploy macros`
- [ ] Function logs show successful requests: `supabase functions logs macros`

---

## 📝 Files Created for Debugging

1. **SNAP_FOOD_502_FIX.md** - Comprehensive fix documentation
2. **TEST_SNAP_FOOD_CORRECTLY.md** - Correct testing method
3. **QUICK_TEST_COMMAND.md** - Quick reference for test commands
4. **test-macros-function.sh** - Automated test script
5. **verify-macros-setup.sh** - Setup verification script

---

## 💡 Why Your Direct Gemini Test Works But Function Fails

When you test Gemini directly:
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  ...
```

✅ **This works** because you're authenticating directly with Google.

When you call the Supabase Edge Function:
```bash
curl "$SUPABASE_URL/functions/v1/macros" \
  -H "Authorization: Bearer sbp_..." \  ← WRONG KEY!
  ...
```

❌ **This fails** because:
1. First, you must authenticate with **Supabase** (using anon key or user token)
2. Then, the function internally uses the Gemini API key

The 401 error happens at step 1 (Supabase auth), not step 2 (Gemini API).

---

## 🎉 Once Everything Works

The snap food feature will:
1. ✅ Accept manual text entry (powered by DeepSeek)
2. ✅ Accept food images (powered by Gemini)
3. ✅ Return structured nutrition data
4. ✅ Save to user's food log
5. ✅ Show user-friendly errors if something fails
6. ✅ Provide detailed logs for debugging

---

## 🆘 Still Having Issues?

1. **Check function logs:**
   ```bash
   supabase functions logs macros --limit 50
   ```
   Look for `[macros]` entries

2. **Run diagnostics:**
   ```bash
   ./verify-macros-setup.sh
   ```

3. **Test with verbose output:**
   ```bash
   curl -v -X POST "$SUPABASE_URL/functions/v1/macros" \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"kind":"text","name":"rice","portion":"1 cup","previewOnly":true}'
   ```

4. **Verify secrets are set:**
   ```bash
   supabase secrets list
   ```
   Should show: DEEPSEEK_API_KEY, GEMINI_API_KEY

---

## 📞 Quick Reference

| Issue | Solution |
|-------|----------|
| 401 Invalid JWT | Use anon key (eyJ...), not service role key (sbp_...) |
| Missing apikey header | Add `-H "apikey: $SUPABASE_ANON_KEY"` |
| DeepSeek key missing | `supabase secrets set DEEPSEEK_API_KEY='...'` |
| Gemini key missing | `supabase secrets set GEMINI_API_KEY='...'` |
| Function not deployed | `supabase functions deploy macros` |


