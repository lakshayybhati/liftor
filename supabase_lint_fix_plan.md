# Supabase Lint Fix Plan for Liftor

_Order of operations: Security → Data Integrity → Performance._

## 1) Security (Fix ASAP)


### Policy & RLS Templates

**Enable RLS (example)**
```sql
alter table public.user_profiles enable row level security;
```

**Owner-only select/update**
```sql
create policy "owner select"
on public.user_profiles for select
using (auth.uid() = user_id);

create policy "owner update"
on public.user_profiles for update
using (auth.uid() = user_id);
```

**Allow inserts for logged-in users**
```sql
create policy "self insert"
on public.user_profiles for insert to authenticated
with check (auth.uid() = user_id);
```

**Secure RPC as invoker and check auth**
```sql
create or replace function public.secure_action(_arg text)
returns text
language sql
security invoker
as $$
  select case when auth.role() = 'authenticated' then _arg else null end;
$$;
```

**Storage bucket: make private + owner policies**
```sql
-- Deny public access
update storage.buckets set public = false where id = 'liftor-user-media';

-- Example policies (adjust 'owner' column to your schema)
create policy "owner read media"
on storage.objects for select
using ( auth.uid() = owner );

create policy "owner write media"
on storage.objects for insert to authenticated
with check ( auth.uid() = owner );
```

## 2) Data Integrity & Schema


### Useful SQL


**NOT NULL + DEFAULTs**
```sql
alter table public.workouts alter column created_at set not null;
alter table public.workouts alter column created_at set default now();
```

**Foreign Keys**
```sql
alter table public.logs
add constraint logs_user_id_fkey
foreign key (user_id) references public.users(id) on delete cascade;
```

## 3) Performance


### Index Templates

**Composite index for common filters**
```sql
create index concurrently if not exists idx_logs_user_created_at
on public.logs (user_id, created_at desc);
```

**Functional index (ILIKE search)**
```sql
create index concurrently if not exists idx_foods_name_lower
on public.foods (lower(name));
```

**Partial index (sparse data)**
```sql
create index concurrently if not exists idx_sessions_active
on public.sessions (user_id) where active = true;
```

**Analyze and check slow queries**
```sql
explain analyze select * from public.logs where user_id = '...';
```


## 4) Client (Expo/React Native) Best Practices
- Use only **anon** key in client; service-role only on server/Edge Functions.
- Throttle and retry Supabase calls with jitter.
- Avoid `select('*')` on large tables; project only required columns.
- Paginate with `.range()` and cache with react-query/SWR.
- Prefer RPC for multi-join business logic to reduce roundtrips.
