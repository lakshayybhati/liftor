-- Add workout_intensity column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS workout_intensity text null;

-- Add workout_intensity column to checkins table
ALTER TABLE public.checkins
ADD COLUMN IF NOT EXISTS workout_intensity int null;


