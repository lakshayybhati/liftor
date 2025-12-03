-- ============================================================================
-- Plan Generation Jobs Table
-- ============================================================================
-- 
-- This table enables server-side plan generation that works even when the app
-- is closed. Users submit a job, and the server processes it asynchronously,
-- sending a push notification when complete.
--
-- Job Flow:
-- 1. User triggers plan generation → Edge Function creates 'pending' job
-- 2. Process queue Edge Function picks up pending jobs
-- 3. Server generates plan using DeepSeek AI
-- 4. On success: saves plan to weekly_base_plans, updates job to 'completed'
-- 5. Server sends push notification to user
-- ============================================================================

-- Create job status enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_job_status') THEN
    CREATE TYPE public.plan_job_status AS ENUM (
      'pending',     -- Job created, waiting to be processed
      'processing',  -- Worker has picked up the job
      'completed',   -- Plan generated successfully
      'failed'       -- Generation failed after retries
    );
  END IF;
END $$;

-- Create the plan generation jobs table
CREATE TABLE IF NOT EXISTS public.plan_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Job status tracking
  status public.plan_job_status NOT NULL DEFAULT 'pending',
  
  -- User profile snapshot at time of request (JSON blob)
  -- This ensures we generate with the exact data the user had when they requested
  profile_snapshot JSONB NOT NULL,
  
  -- Result reference (set when completed)
  result_plan_id UUID REFERENCES public.weekly_base_plans(id) ON DELETE SET NULL,
  
  -- Error tracking (set when failed)
  error_message TEXT,
  error_code TEXT, -- e.g., 'AI_TIMEOUT', 'RATE_LIMITED', 'VALIDATION_FAILED'
  
  -- Retry tracking
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  
  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,        -- When processing began
  completed_at TIMESTAMPTZ,      -- When job finished (success or final failure)
  
  -- Worker tracking (prevents duplicate processing)
  worker_id TEXT,                -- ID of the worker processing this job
  locked_until TIMESTAMPTZ       -- Prevents other workers from picking up
);

-- Indexes for efficient queue operations
CREATE INDEX IF NOT EXISTS idx_plan_jobs_pending 
  ON public.plan_generation_jobs(status, created_at) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_plan_jobs_processing 
  ON public.plan_generation_jobs(status, locked_until) 
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_plan_jobs_user 
  ON public.plan_generation_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_jobs_user_status 
  ON public.plan_generation_jobs(user_id, status);

-- Enable RLS
ALTER TABLE public.plan_generation_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see and create their own jobs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='plan_generation_jobs' AND policyname='plan_jobs_select_own'
  ) THEN
    CREATE POLICY plan_jobs_select_own 
      ON public.plan_generation_jobs 
      FOR SELECT 
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='plan_generation_jobs' AND policyname='plan_jobs_insert_own'
  ) THEN
    CREATE POLICY plan_jobs_insert_own 
      ON public.plan_generation_jobs 
      FOR INSERT 
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Service role can do everything (for Edge Functions)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='plan_generation_jobs' AND policyname='plan_jobs_service_role_all'
  ) THEN
    CREATE POLICY plan_jobs_service_role_all 
      ON public.plan_generation_jobs 
      FOR ALL 
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to claim the next pending job (atomic operation)
-- Returns the job ID if claimed, NULL if no jobs available
CREATE OR REPLACE FUNCTION public.claim_next_plan_job(p_worker_id TEXT, p_lock_duration_seconds INT DEFAULT 600)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Find and lock the oldest pending job that isn't locked
  UPDATE public.plan_generation_jobs
  SET 
    status = 'processing',
    started_at = NOW(),
    worker_id = p_worker_id,
    locked_until = NOW() + (p_lock_duration_seconds || ' seconds')::INTERVAL
  WHERE id = (
    SELECT id
    FROM public.plan_generation_jobs
    WHERE status = 'pending'
      OR (status = 'processing' AND locked_until < NOW()) -- Reclaim stale locks
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id INTO v_job_id;
  
  RETURN v_job_id;
END;
$$;

-- Function to complete a job successfully
CREATE OR REPLACE FUNCTION public.complete_plan_job(
  p_job_id UUID, 
  p_result_plan_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.plan_generation_jobs
  SET 
    status = 'completed',
    result_plan_id = p_result_plan_id,
    completed_at = NOW(),
    worker_id = NULL,
    locked_until = NULL
  WHERE id = p_job_id
    AND status = 'processing';
  
  RETURN FOUND;
END;
$$;

-- Function to fail a job (with retry logic)
CREATE OR REPLACE FUNCTION public.fail_plan_job(
  p_job_id UUID, 
  p_error_message TEXT,
  p_error_code TEXT DEFAULT 'UNKNOWN'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retry_count INT;
  v_max_retries INT;
BEGIN
  -- Get current retry info
  SELECT retry_count, max_retries 
  INTO v_retry_count, v_max_retries
  FROM public.plan_generation_jobs
  WHERE id = p_job_id;
  
  IF v_retry_count < v_max_retries THEN
    -- Still have retries left - mark as pending again
    UPDATE public.plan_generation_jobs
    SET 
      status = 'pending',
      retry_count = retry_count + 1,
      error_message = p_error_message,
      error_code = p_error_code,
      worker_id = NULL,
      locked_until = NULL,
      started_at = NULL
    WHERE id = p_job_id;
  ELSE
    -- No retries left - mark as failed
    UPDATE public.plan_generation_jobs
    SET 
      status = 'failed',
      error_message = p_error_message,
      error_code = p_error_code,
      completed_at = NOW(),
      worker_id = NULL,
      locked_until = NULL
    WHERE id = p_job_id;
  END IF;
  
  RETURN FOUND;
END;
$$;

-- Function to get user's active job (for polling status)
CREATE OR REPLACE FUNCTION public.get_active_plan_job(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  status public.plan_job_status,
  created_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  retry_count INT,
  error_message TEXT
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
    j.error_message
  FROM public.plan_generation_jobs j
  WHERE j.user_id = p_user_id
    AND j.status IN ('pending', 'processing')
  ORDER BY j.created_at DESC
  LIMIT 1;
END;
$$;

-- Grant execute permissions to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.claim_next_plan_job(TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_plan_job(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_plan_job(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_active_plan_job(UUID) TO authenticated;

-- ============================================================================
-- Cleanup: Auto-delete old completed/failed jobs after 7 days
-- ============================================================================

-- This can be called by a scheduled function or manually
CREATE OR REPLACE FUNCTION public.cleanup_old_plan_jobs()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.plan_generation_jobs
  WHERE status IN ('completed', 'failed')
    AND completed_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_plan_jobs() TO service_role;




