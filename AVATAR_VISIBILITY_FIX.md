# Avatar Visibility Fix

## Issue
Users were able to upload profile pictures, but they would not appear in the settings or profile screens.

## Cause
A previous security migration (`20251014_security_fixes.sql`) made the `avatars` storage bucket **private** and restricted access to the owner only. However, the frontend code (`useProfile.ts`) generates a **public URL** (`getPublicUrl`) and stores it in the user metadata.

Public URLs for private buckets are not accessible (they return 403 Forbidden), causing the image to fail to load.

## Fix
A new migration `supabase/migrations/20251212_fix_avatar_visibility.sql` has been added to:
1.  Set the `avatars` bucket back to **public**.
2.  Remove the owner-only select policy.
3.  Add a policy allowing public read access to the `avatars` bucket.

## How to Apply
Run the migration against your Supabase project:

```bash
supabase db push
```

Or execute the SQL manually in the Supabase Dashboard SQL Editor.


