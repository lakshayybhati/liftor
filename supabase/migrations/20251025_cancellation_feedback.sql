-- Create cancellation_feedback table and RLS policies (idempotent)

create table if not exists public.cancellation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  feedback text,
  created_at timestamptz not null default now()
);

alter table public.cancellation_feedback enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cancellation_feedback'
      and policyname = 'cxl_feedback_insert_own'
  ) then
    create policy "cxl_feedback_insert_own"
      on public.cancellation_feedback for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;
end
$$;

-- Users can read their own feedback
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cancellation_feedback'
      and policyname = 'cxl_feedback_select_own'
  ) then
    create policy "cxl_feedback_select_own"
      on public.cancellation_feedback for select
      using (user_id = auth.uid());
  end if;
end
$$;

-- Minimal grants; RLS restricts access
revoke all on public.cancellation_feedback from anon, authenticated;
grant select, insert on public.cancellation_feedback to authenticated;
grant all on public.cancellation_feedback to service_role;

