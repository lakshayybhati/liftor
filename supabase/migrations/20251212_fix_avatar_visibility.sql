-- Fix avatar visibility by making bucket public again
-- Previous security fix made it private, but frontend uses getPublicUrl

-- 1. Make avatars bucket public
update storage.buckets 
set public = true 
where id = 'avatars';

-- 2. Drop the restrictive select policy (that restricted to owner only)
drop policy if exists "avatars_select_own" on storage.objects;

-- 3. Create public read policy
-- Check if it exists first to avoid error, or just drop if exists
drop policy if exists "avatars_public_read" on storage.objects;

create policy "avatars_public_read" 
on storage.objects for select 
using (bucket_id = 'avatars');


