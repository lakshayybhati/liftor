# Fitness Coach App (Expo + Supabase)

A modern, production‑ready React Native app built with Expo Router, TypeScript, React Query, and Supabase. Runs in Expo Go (SDK 53) and on the web via React Native Web.

- Cross‑platform: iOS, Android, Web
- Auth: Email/password with Supabase, email confirmation + resend
- Profiles: Name synced from onboarding; editable full profile & preferences
- Daily flow: Check‑in → AI plan screens (workout, nutrition, recovery) → History
- “Snap Food”: Camera/Image Picker friendly UI for quick adds
- UI: Clean, modern design; lucide icons; cards; progress; error boundaries
Contents
- Tech Stack
- Project Structure
- Quick Start
- Environment Variables
- Running the App
- Features
- Supabase Schema & Policies
- Auth Flow Details
- Web Compatibility Notes
- Testing & Common Pitfalls
- Troubleshooting
- Contributing
- License

---
Tech Stack
- Expo SDK 53, Expo Router 5
- React Native 0.79, React 19, TypeScript 5
- @tanstack/react-query for server state
- @nkzw/create-context-hook for typed context
- Supabase JS v2 (Auth + Postgres)
- React Native Web
- UI: lucide-react-native, custom Button/Card/Slider/Chip, StyleSheet
Project Structure
app/
_layout.tsx               # Root providers: React Query, Auth, User
index.tsx                 # Auth gate → /home or /auth/login
(tabs)/_layout.tsx        # Tabs: Home, History, Settings
(tabs)/home.tsx           # Home: greeting, quick actions, plan CTA
(tabs)/history.tsx        # History
(tabs)/settings.tsx       # Settings (profile entry)
onboarding.tsx            # Onboarding flow
checkin.tsx               # Daily check-in
generating-plan.tsx       # Plan generation status
generating-base-plan.tsx  # Base plan generation
plan.tsx                  # Plan details
plan-preview.tsx          # Preview
program-settings.tsx      # Program settings
snap-food.tsx             # Food capture / add
profile.tsx               # Edit profile & preferences
auth/login.tsx            # Sign in + resend confirmation
auth/signup.tsx           # Sign up (captures name)

components/
ui/Button.tsx
ui/Card.tsx
ui/Slider.tsx
ui/Chip.tsx
ui/MoodCharacter.tsx
ui/CircularProgress.tsx

constants/
colors.ts                 # Theme tokens
fitness.ts                # Fitness constants

hooks/
useAuth.tsx               # Supabase client + auth context
useProfile.ts             # Profile react-query hook
useUserStore.ts           # Local user/program helpers

types/
user.ts

assets/
images/*                  # App icons, splash
Quick Start
1) Prerequisites
- Node 18+ and Bun (recommended) or npm/yarn
- Expo Go on a device
- Supabase project (URL + anon key)

2) Install
bun install
# or: npm install / yarn install / pnpm install
3) Configure environment (.env in project root)
EXPO_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT-ref.supabase.co"
EXPO_PUBLIC_SUPABASE_ANON_KEY="YOUR_ANON_KEY"
The app also reads from app.json extra if you prefer. Do not use service_role keys in the app.

4) Start
# Native (Expo Go QR)
bun run start

# Web
bun run start-web
Scan the QR for iOS/Android. Open the shown localhost URL for web.
Environment Variables
- EXPO_PUBLIC_SUPABASE_URL: Supabase project URL
- EXPO_PUBLIC_SUPABASE_ANON_KEY: Supabase anon key
Running the App
- bun run start — Expo dev server with tunnel
- bun run start-web — React Native Web
- bun run start-web-dev — verbose web logs
- bun run lint — ESLint
Features
- Authentication
  - Email/password sign up and sign in via Supabase
  - Sign up captures name (user_metadata and profiles table)
  - Resend confirmation email button if “Email not confirmed”
  - Persistent session; auth state listener
- Profiles & Preferences
  - Name shown in Home greeting and Settings
  - Edit profile and onboarding preferences in Profile screen
  - Auto-seed profile row on first sign-in if missing
- Check‑ins & Plans
  - Check-in collects day metrics
  - Daily plan: workout, nutrition, recovery
  - History of prior days
- Snap Food
  - Add meals/food quickly; designed for camera/image picker
- Design
  - Theme tokens in constants/colors.ts
  - Cards, Buttons, CircularProgress; lucide icons
- Quality
  - Error boundaries; user-friendly error messages; extensive console logs
  - testID props to support E2E/UI tests
Supabase Schema & Policies
Run the provided SQL (profiles, programs, check_ins, nutrition_plans, food_extras, daily_plans, meal_completions) with RLS enabled. Highlights:
- Trigger creates a profiles row for each new auth user
- get_current_program(user_uuid) helper
- get_todays_nutrition_plan(user_uuid) helper
Ensure Email Auth is enabled in Supabase.
Auth Flow Details
- hooks/useAuth.tsx
  - Creates Supabase client
  - Uses AsyncStorage on native; default on web
  - autoRefreshToken/persistSession/detectSessionInUrl configured
- signUp(email, password, name?)
  - Stores name in user_metadata
  - Upserts profiles row if session active; otherwise relies on DB trigger
- signIn(email, password)
  - Seeds missing profiles row and backfills blank name from metadata/email
- resendConfirmationEmail(email)
  - Available on login screen when needed
- signOut()
  - Clears session
  
Production Auth Configuration (Supabase + Deep Links)

Use the following values in Supabase → Auth → URL Configuration:

- Site URL: `https://liftor.app`
- Additional Redirect URLs:
  - `liftor://authcallback`
  - `https://liftor.app/authcallback`
  - `exp://127.0.0.1:19000/--/auth/callback`
- Providers → Google → Redirect URL: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`

Implementation details:

- Clear any existing session before email/password sign in or sign up
- Single Supabase client with AsyncStorage on native, auto refresh, persist session, detectSessionInUrl=false
- One deep-link listener exchanges the `code` for a session and navigates by session state
- Google sign-in uses `signInWithOAuth` and redirects to `liftor://authcallback` (native) or `https://liftor.app/authcallback` (web)
- Logout asks for confirmation, signs out, clears user-scoped storage, and returns to login

1-minute test checklist:

1) New Email Signup
- Sign up with new email
- Confirm via email link
- App shows you logged in

2) Google Sign-In Round-Trip
- Tap Continue with Google
- Complete Google auth
- App returns and shows you logged in

3) Logout Confirmation
- Tap Sign out in Settings
- Confirm dialog appears; accept
- App returns to login

4) Relaunch App
- Close and reopen app
- No old session is rehydrated
- You are prompted to log in
Web Compatibility Notes
- React Native Web used for web builds
- Expo Haptics calls are guarded with Platform checks (no-ops on web)
- Camera: use CameraView; some features differ on web
- Avoid Reanimated layout animations on web; prefer RN Animated or static fallback
- Keep components SSR-safe and avoid native-only APIs during render
Testing & Common Pitfalls
- Rules of Hooks
  - Call hooks at the top level in the same order; never inside conditionals/loops
  - Avoid early returns before hooks execute
- “Unexpected text node: A text node cannot be a child of a <View>”
  - Wrap text in <Text>, not directly under <View>
- “React has detected a change in the order of Hooks…”
  - Ensure consistent hook ordering; no conditional hook calls
- Add testID for key elements to support automation
Troubleshooting
- Email not confirmed
  - Use “Resend confirmation email,” or confirm in your inbox
  - You can disable confirmations in Supabase Auth settings for development (not advised for production)
- Env not loaded / 401
  - Verify .env values; restart dev server; ensure names start with EXPO_PUBLIC_
- Session not persisting on web
  - detectSessionInUrl is enabled; avoid blocking cookies
- DB rows missing
  - Confirm RLS policies; ensure auth.uid() matches; run the provided SQL
Contributing
- Use strict TypeScript
- Style with StyleSheet
- Prefer React.memo/useMemo/useCallback for expensive trees
- Server state with React Query; local UI state with useState
- Do not commit secrets or service_role keys
License
Proprietary. All rights reserved.

how to run the app in terminal - 
Prereqs
- Node 18+ and Bun (or npm/yarn)
- Expo CLI (use npx/yarn/bunx)
- iOS: Xcode with at least one iOS Simulator installed (macOS only)
- Android: Android Studio with an AVD created and SDK set up

1) Install dependencies
- Bun: bun install
- npm: npm install
- yarn: yarn

2) Start the dev server
- Bun: bunx expo start
- npm: npx expo start
- yarn: yarn expo start

iOS Simulator (macOS only)
- One-shot: bunx expo start --ios
- Or when Metro is running: press i
- DevTools UI: “Run on iOS simulator”
If it doesn’t boot: open Xcode > Open Developer Tool > Simulator, then retry. Clear cache if needed: bunx expo start -c

Android Emulator
- One-shot: bunx expo start --android
- Or when Metro is running: press a
- DevTools UI: “Run on Android device/emulator”
If it doesn’t connect: start your AVD in Android Studio first. Clear cache: bunx expo start -c

Web
- bunx expo start --web

Physical Devices (Expo Go)
- Install “Expo Go” on iOS/Android
- Run bunx expo start and scan the QR from DevTools (iOS: Camera app; Android: inside Expo Go)

Environment variables
Create .env:
EXPO_PUBLIC_SUPABASE_URL=your-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

Notes
- This cloud environment can’t launch simulators; use your local machine.
- App targets Expo Go v53 and supports React Native Web.