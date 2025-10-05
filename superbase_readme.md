# Supabase Production Setup Guide (Liftor)

This guide configures Supabase for the Liftor app in production: schema, RLS, auth providers, storage, Edge Functions, secrets, and verification.

## 1) Create Supabase project
- Go to `https://supabase.com/` → New project
- Choose region close to users; set strong DB password
- After creation, note:
  - Project URL (e.g., `https://xxxx.supabase.co`)
  - anon public key (client)
  - service_role key (server-only; never ship in app)

## 2) Apply database schema
- Open Supabase Dashboard → SQL Editor
- Paste file `supabase/schema.sql` from this repo and run once.
- What this does:
  - Creates enums, tables, indexes, triggers
  - Enables RLS on all user data tables
  - Adds plan/check-in tables, helper functions
  - Creates public `avatars` storage bucket with policies
  - Adds RevenueCat subscription columns to `public.profiles`
  - Adds triggers to auto-create a profile row when a new auth user is created and to keep `profiles.email` synced with `auth.users`

## 3) Auth configuration
- Dashboard → Authentication → URL Configuration
  - Site URL: `https://liftor.app`
  - Redirect URLs (Allowed):
    - `liftor://authcallback`
    - `https://liftor.app/authcallback`
  - Enable Email Confirmations (recommended)
  - Optional: configure Custom SMTP for better deliverability

### 3.1 Google OAuth
- Dashboard → Authentication → Providers → Google → Enable
- In Google Cloud Console:
  - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
  - Paste Client ID and Client Secret back into Supabase

### 3.2 Security
- Dashboard → Authentication → Settings → Auth → CORS
  - Allowed origins: `https://liftor.app` (and any staging origin)
- Session settings: keep defaults unless you have a policy to change

## 4) Storage
- The schema creates a public `avatars` bucket and policies.
- Verify in Dashboard → Storage that bucket `avatars` exists and is public.

## 5) RevenueCat webhook (Edge Function)
The app syncs subscription state into `public.profiles` using a Supabase Edge Function, deployed from `supabase/functions/revenuecat-webhook/`.

### 5.1 Prereqs
- Install Supabase CLI: `npm i -g supabase`
- Login: `supabase login`
- Link project: `supabase link --project-ref <your-project-ref>`

### 5.2 Deploy function
- From repo root:
  - `supabase functions deploy revenuecat-webhook --project-ref <your-project-ref>`

### 5.3 Set secrets (production env)
- Replace placeholders and run:
```
supabase secrets set --project-ref <your-project-ref> --env prod \
  SUPABASE_URL="https://<your-project-ref>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
  REVENUECAT_SECRET_API_KEY="<rc_secret_api_key>" \
  REVENUECAT_WEBHOOK_SECRET="<strong_shared_secret>"
```

Notes:
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and used here because the function runs on Supabase infra.
- Do not expose service_role anywhere in the mobile app.

### 5.4 Configure RevenueCat dashboard
- Webhooks → Add webhook
  - URL: `https://<your-project-ref>.functions.supabase.co/revenuecat-webhook`
  - Authorization header: `Bearer <REVENUECAT_WEBHOOK_SECRET>`
- Trigger a test event or make a sandbox purchase to verify.

## 6) Environment variables for the app (EAS)
The mobile app requires the public Supabase URL and anon key at build time.

Set these as EAS secrets or in `.env.production` (never commit real values):
- `EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_public_key>`

Optional (for other services):
- `EXPO_PUBLIC_GEMINI_API_KEY=<gemini_key>`
- RevenueCat client keys (already templated in `app.json` via `extra`):
  - `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
  - `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
  - `EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT=elite`

EAS example:
```
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://<ref>.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon>"
```

## 7) RLS and permissions
RLS is enabled by the schema.
- `profiles`, `weekly_base_plans`, `daily_plans`, `plan_versions`, `plan_runs`, `checkins`, `food_extras` all restrict access to the authenticated user via policies.
- Storage bucket `avatars` allows public read; insert/update/delete gated by owner policy.

Sanity check with SQL (run as authenticated user in SQL editor or in a policy debugger):
- Select own profile: `select * from public.profiles where id = auth.uid();`
- Cannot select another user’s rows.

## 8) Post-setup smoke tests
1) Email/password signup → click verification link → app logs in.
2) Google sign-in:
   - Web: redirects back to `https://liftor.app/authcallback`.
   - Native: deep link `liftor://authcallback` triggers `exchangeCodeForSession`.
3) Profile row auto-created on signup (check `public.profiles`).
4) Update email from app account settings → `profiles.email` updates via trigger.
5) Upload avatar → public URL works; row in `storage.objects` under `avatars/<userId>/...`.
6) RevenueCat test webhook or sandbox purchase → `profiles.subscription_active` flips, `rc_entitlements` filled.

## 9) Backups and hardening
- Enable daily backups with sufficient retention in Supabase project settings.
- Restrict CORS and Redirect URLs to production domains only.
- Rotate keys if any were previously committed.
- Monitor function logs and Postgres logs for errors.

## 10) Troubleshooting
- Auth callback issues: verify Site URL and Allowed Redirect URLs. Check deep links in app config.
- Google OAuth errors: ensure Google Console redirect URI matches Supabase callback exactly.
- 401 on webhook: RevenueCat Authorization header must be `Bearer <REVENUECAT_WEBHOOK_SECRET>`.
- RLS denied: verify you’re authenticated and policies match `auth.uid()` columns.

You’re done. Supabase is now production-ready for the Liftor app.
