-- Create cancellation_feedback table and RLS policies (idempotent)

create table if not exists public.cancellation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  feedback text,
  created_at timestamptz not null default now()
);

alter table public.cancellation_feedback enable row level security;

-- Users can insert their own feedback
create policy if not exists "cxl_feedback_insert_own"
  on public.cancellation_feedback for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can read their own feedback
create policy if not exists "cxl_feedback_select_own"
  on public.cancellation_feedback for select
  using (user_id = auth.uid());

-- Minimal grants; RLS restricts access
revoke all on public.cancellation_feedback from anon, authenticated;
grant select, insert on public.cancellation_feedback to authenticated;
grant all on public.cancellation_feedback to service_role;

