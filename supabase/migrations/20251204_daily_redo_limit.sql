-- Migration: Add daily redo limit tracking to weekly_base_plans
-- This supports the PRODUCTION feature: max 2 redos per plan per day
-- The redo count resets each day automatically

-- Add column for tracking how many redos were used today
ALTER TABLE weekly_base_plans 
ADD COLUMN IF NOT EXISTS redo_count_today INTEGER DEFAULT 0;

-- Add column for tracking the last date a redo was used (for daily reset logic)
ALTER TABLE weekly_base_plans 
ADD COLUMN IF NOT EXISTS last_redo_date DATE;

-- Add comments for documentation
COMMENT ON COLUMN weekly_base_plans.redo_count_today IS 
  'Number of plan redos used on the current day (max 2 per day). Resets when last_redo_date changes.';
  
COMMENT ON COLUMN weekly_base_plans.last_redo_date IS 
  'The date (YYYY-MM-DD) when the last redo was used. Used to reset redo_count_today daily.';

-- Update the select columns in the existing RPC and policies if needed
-- (The existing policies don't need to change since they use wildcard selection)
