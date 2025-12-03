-- ============================================================================
-- Plan Generation Checkpoints
-- ============================================================================
-- Allows plan generation to save progress and resume from where it left off
-- if the function times out or fails.
-- ============================================================================

-- Add checkpoint_data column to store intermediate progress
ALTER TABLE public.plan_generation_jobs 
ADD COLUMN IF NOT EXISTS checkpoint_data JSONB DEFAULT NULL;

-- Add checkpoint_phase to track which phase we're on
ALTER TABLE public.plan_generation_jobs 
ADD COLUMN IF NOT EXISTS checkpoint_phase INT DEFAULT 0;

-- Function to save checkpoint
CREATE OR REPLACE FUNCTION public.save_plan_checkpoint(
  p_job_id UUID,
  p_phase INT,
  p_data JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.plan_generation_jobs
  SET 
    checkpoint_phase = p_phase,
    checkpoint_data = p_data,
    locked_until = NOW() + INTERVAL '180 seconds' -- Extend lock when saving checkpoint
  WHERE id = p_job_id
    AND status = 'processing';
  
  RETURN FOUND;
END;
$$;

-- Function to get checkpoint data
CREATE OR REPLACE FUNCTION public.get_plan_checkpoint(p_job_id UUID)
RETURNS TABLE (
  checkpoint_phase INT,
  checkpoint_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.checkpoint_phase,
    j.checkpoint_data
  FROM public.plan_generation_jobs j
  WHERE j.id = p_job_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.save_plan_checkpoint(UUID, INT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_plan_checkpoint(UUID) TO service_role;

COMMENT ON COLUMN public.plan_generation_jobs.checkpoint_data IS 'Stores intermediate plan data so generation can resume from where it left off';
COMMENT ON COLUMN public.plan_generation_jobs.checkpoint_phase IS 'Which phase completed: 0=none, 1=workout, 2=nutrition, 3=merged, 4=reasons, 5=supplements, 6=validated';
