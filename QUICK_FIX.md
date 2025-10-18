# 🚨 Quick Fix for App Crash

## The Problem

Your app crashes on launch because it was built with **placeholder environment variables**.

## The Solution (3 Simple Steps)

### Option A: Interactive Script (Easiest) ⭐

```bash
cd /Users/lakshaybhati/Downloads/fitcoach-AI-main
./setup-secrets.sh
```

This script will:
- ✅ Prompt you for real credentials
- ✅ Add them to EAS Secrets
- ✅ Tell you what to do next

### Option B: Manual Commands

```bash
cd /Users/lakshaybhati/Downloads/fitcoach-AI-main

# Replace with YOUR real values:
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR-PROJECT.supabase.co" --type string

eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJhbGci..." --type string

eas secret:create --scope project --name EXPO_PUBLIC_GEMINI_API_KEY --value "AIza..." --type string

# Verify
eas secret:list

# Rebuild
npx expo prebuild --clean
eas build --platform ios --profile production --non-interactive
```

---

## Where to Get Your Credentials

### Supabase (Required)
1. Go to https://app.supabase.com
2. Select your project → **Settings** → **API**
3. Copy:
   - **Project URL**
   - **anon public** key

### Gemini API (Required)
1. Go to https://aistudio.google.com/app/apikey
2. Create/copy your API key

---

## After Adding Secrets

```bash
# Clean and rebuild
npx expo prebuild --clean
eas build --platform ios --profile production --non-interactive

# Then submit
eas submit --platform ios --latest
```

---

## ⏱️ Timeline

- Setup secrets: 5 minutes
- Rebuild: 15-30 minutes
- Submit: 5 minutes
- **Total: ~30-40 minutes**

---

## ✅ What Got Fixed

1. **Code changes:**
   - ✅ `hooks/useAuth.tsx` - Won't crash with missing credentials
   - ✅ `app/_layout.tsx` - Better error handling
   - ✅ Created `.npmrc` - Handles React 19 dependencies

2. **Next step:**
   - ⚠️ **Add real environment variables to EAS**
   - ⚠️ **Rebuild the app**

---

## 📞 Need Help?

See the full guide: `FIX_CRASH_GUIDE.md`

**Run the script now:**
```bash
./setup-secrets.sh
```

