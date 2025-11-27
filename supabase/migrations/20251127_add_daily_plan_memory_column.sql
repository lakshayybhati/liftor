-- Ensure the `daily_plans.memory` column exists for storing AI memory snapshots.
-- This migration is idempotent and safe to run multiple times.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_plans'
      and column_name = 'memory'
  ) then
    alter table public.daily_plans
      add column memory jsonb null;
  end if;
end
$$;

comment on column public.daily_plans.memory is
  'Serialized AI memory snapshot used for contextual plan adjustments';

