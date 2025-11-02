create extension if not exists "uuid-ossp";

create table if not exists push_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  device_info jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, token)
);

create index if not exists idx_push_tokens_user_id on push_tokens(user_id);
create index if not exists idx_push_tokens_token on push_tokens(token);

alter table push_tokens enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'push_tokens' and policyname = 'Users can manage own tokens'
  ) then
    create policy "Users can manage own tokens" on push_tokens
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;


