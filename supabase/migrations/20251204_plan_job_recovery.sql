-- ============================================================================
-- Plan Job Recovery Policies and Functions
-- ============================================================================
-- 
-- Adds the ability for users to:
-- 1. Reset their own stuck jobs
-- 2. Cancel their own pending/processing jobs
-- 3. Extend job locks (heartbeat for long-running operations)
--
-- This is needed for client-side recovery when Edge Functions time out.
-- ============================================================================

-- ============================================================================
-- RPC Function: Extend job lock (heartbeat)
-- ============================================================================
-- Called by the worker during long operations to prevent other workers from
-- reclaiming the job. Only extends if the job is still owned by this worker.

-- Drop first in case signature changed
DROP FUNCTION IF EXISTS public.extend_job_lock(UUID, TEXT, INT);

CREATE OR REPLACE FUNCTION public.extend_job_lock(
  p_job_id UUID, 
  p_worker_id TEXT, 
  p_extension_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.plan_generation_jobs
  SET locked_until = NOW() + (p_extension_seconds::TEXT || ' seconds')::INTERVAL
  WHERE id = p_job_id
    AND worker_id = p_worker_id
    AND status = 'processing';
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Grant execute to service role only (workers use service role)
GRANT EXECUTE ON FUNCTION public.extend_job_lock(UUID, TEXT, INT) TO service_role;

-- Allow users to update their own jobs (for cancellation/reset)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='plan_generation_jobs' AND policyname='plan_jobs_update_own'
  ) THEN
    CREATE POLICY plan_jobs_update_own 
      ON public.plan_generation_jobs 
      FOR UPDATE 
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ============================================================================
-- RPC Function: Reset a stuck job
-- ============================================================================
-- Called by the client when a job appears to be stuck (processing too long).
-- Only resets jobs that are:
-- 1. Owned by the calling user
-- 2. In 'processing' status
-- 3. Started more than 3 minutes ago (to prevent premature reset)

CREATE OR REPLACE FUNCTION public.reset_stuck_plan_job(p_job_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status public.plan_job_status;
  v_started_at TIMESTAMPTZ;
  v_retry_count INT;
  v_max_retries INT;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check job exists and belongs to user
  SELECT status, started_at, retry_count, max_retries 
  INTO v_status, v_started_at, v_retry_count, v_max_retries
  FROM public.plan_generation_jobs
  WHERE id = p_job_id AND user_id = v_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found or not owned by user';
  END IF;
  
  -- Only reset processing jobs
  IF v_status != 'processing' THEN
    RAISE EXCEPTION 'Job is not in processing status (current: %)', v_status;
  END IF;
  
  -- Only reset if started more than 3 minutes ago
  IF v_started_at IS NOT NULL AND v_started_at > NOW() - INTERVAL '3 minutes' THEN
    RAISE EXCEPTION 'Job has not been processing long enough to reset (started: %)', v_started_at;
  END IF;
  
  -- Check if we have retries left
  IF v_retry_count >= v_max_retries THEN
    -- No retries left, mark as failed
    UPDATE public.plan_generation_jobs
    SET 
      status = 'failed',
      completed_at = NOW(),
      error_message = 'Job timed out after all retries',
      error_code = 'MAX_RETRIES_EXCEEDED',
      worker_id = NULL,
      locked_until = NULL
    WHERE id = p_job_id;
    
    RETURN FALSE; -- Indicates job was failed, not reset
  END IF;
  
  -- Reset the job to pending for retry
  UPDATE public.plan_generation_jobs
  SET 
    status = 'pending',
    started_at = NULL,
    worker_id = NULL,
    locked_until = NULL,
    retry_count = retry_count + 1,
    error_message = 'Job reset by client due to timeout',
    error_code = 'CLIENT_RESET'
  WHERE id = p_job_id;
  
  RETURN TRUE; -- Job was successfully reset
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.reset_stuck_plan_job(UUID) TO authenticated;

-- ============================================================================
-- RPC Function: Cancel a job
-- ============================================================================
-- Called by the client when user explicitly cancels generation.

CREATE OR REPLACE FUNCTION public.cancel_plan_job(p_job_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status public.plan_job_status;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check job exists, belongs to user, and is in cancellable status
  SELECT status INTO v_status
  FROM public.plan_generation_jobs
  WHERE id = p_job_id AND user_id = v_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found or not owned by user';
  END IF;
  
  -- Only cancel pending or processing jobs
  IF v_status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'Job cannot be cancelled (status: %)', v_status;
  END IF;
  
  -- Cancel the job
  UPDATE public.plan_generation_jobs
  SET 
    status = 'failed',
    completed_at = NOW(),
    error_message = 'Cancelled by user',
    error_code = 'USER_CANCELLED',
    worker_id = NULL,
    locked_until = NULL
  WHERE id = p_job_id;
  
  RETURN TRUE;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.cancel_plan_job(UUID) TO authenticated;

-- ============================================================================
-- Update get_active_plan_job to return more fields for stuck detection
-- ============================================================================

-- Must drop first because we're changing the return type
DROP FUNCTION IF EXISTS public.get_active_plan_job(UUID);

CREATE FUNCTION public.get_active_plan_job(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  status public.plan_job_status,
  created_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  retry_count INT,
  error_message TEXT,
  error_code TEXT,
  locked_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return the most recent non-completed job for this user
  RETURN QUERY
  SELECT 
    j.id,
    j.status,
    j.created_at,
    j.started_at,
    j.retry_count,
    j.error_message,
    j.error_code,
    j.locked_until
  FROM public.plan_generation_jobs j
  WHERE j.user_id = p_user_id
    AND j.status IN ('pending', 'processing')
  ORDER BY j.created_at DESC
  LIMIT 1;
END;
$$;

-- Re-grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_active_plan_job(UUID) TO authenticated;
