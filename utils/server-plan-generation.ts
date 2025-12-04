/**
 * Server-Side Plan Generation Client
 * 
 * This is the PRIMARY plan generation system. ALL plan generation happens
 * on the server via Supabase Edge Functions.
 * 
 * BENEFITS:
 * 1. User can close the app while plan generates
 * 2. No battery drain from AI calls on device
 * 3. Push notification when plan is ready
 * 4. Automatic retries handled by server
 * 
 * FLOW:
 * 1. Client creates job via create-plan-job Edge Function
 * 2. Client triggers process-plan-queue Edge Function
 * 3. Server generates plan (Stage 1: Raw + Stage 2: Fix)
 * 4. Server saves plan and sends push notification
 * 5. Client polls for completion or receives notification
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProductionConfig } from '@/utils/production-config';
import type { User, WeeklyBasePlan, WeeklyPlanStatus } from '@/types/user';

// ============================================================================
// SUPABASE CLIENT (Lazy initialization with session persistence)
// ============================================================================

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  try {
    const config = getProductionConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      console.warn('[ServerPlanGen] Supabase not configured');
      return null;
    }
    // CRITICAL: Use AsyncStorage for session persistence to share session with useAuth
    supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    return supabaseClient;
  } catch (e) {
    console.warn('[ServerPlanGen] Failed to create Supabase client:', e);
    return null;
  }
}

// Helper to ensure supabase is available
function requireSupabase(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client not available');
  }
  return client;
}

// ============================================================================
// TYPES
// ============================================================================

export type ServerJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ServerPlanJob {
  id: string;
  status: ServerJobStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result_plan_id: string | null;
  error_message: string | null;
  error_code: string | null;
  retry_count: number;
  locked_until: string | null;
}

export interface CreateJobResult {
  success: boolean;
  jobId?: string;
  existingJobId?: string;
  existingPlanId?: string;
  existingPlanStatus?: WeeklyPlanStatus;
  status: 'created' | 'existing' | 'plan_exists' | 'redo_started' | 'redo_limit_reached' | 'redo_already_used' | 'redo_blocked_activated' | 'redo_blocked_generating' | 'error';
  error?: string;
  redoAllowed?: boolean;
}

export interface RedoOptions {
  redo?: boolean;
  redoReason?: string;
  redoType?: 'workout' | 'nutrition' | 'both'; // What to redo
  sourcePlanId?: string;
  // Force regeneration - used when 14-day cycle has passed
  forceRegenerate?: boolean;
}

export interface JobStatusResult {
  success: boolean;
  job?: ServerPlanJob;
  plan?: WeeklyBasePlan;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Polling interval when checking job status (in milliseconds)
const POLL_INTERVAL_MS = 5000;

// Maximum time to wait for a job to complete (in milliseconds)
const MAX_WAIT_TIME_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Create a server-side plan generation job.
 * 
 * This does NOT start generation immediately - it queues the job.
 * The actual generation happens when the process-plan-queue function runs.
 * 
 * @param user - The user profile to generate a plan for
 * @param options - Optional redo parameters
 * @returns Job creation result with job ID
 */
export async function createServerPlanJob(user: User, options?: RedoOptions): Promise<CreateJobResult> {
  try {
    const isRedo = options?.redo === true;
    console.log(`[ServerPlanGen] Creating server-side plan job${isRedo ? ' (REDO)' : ''}...`);

    const supabase = requireSupabase();
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) {
      return { success: false, status: 'error', error: 'Not authenticated' };
    }

    // Build profile snapshot (exclude non-serializable fields)
    const profileSnapshot = {
      id: user.id,
      name: user.name,
      goal: user.goal,
      equipment: user.equipment,
      dietaryPrefs: user.dietaryPrefs,
      dietaryNotes: user.dietaryNotes,
      trainingDays: user.trainingDays,
      timezone: user.timezone,
      age: user.age,
      sex: user.sex,
      height: user.height,
      weight: user.weight,
      activityLevel: user.activityLevel,
      dailyCalorieTarget: user.dailyCalorieTarget,
      supplements: user.supplements,
      supplementNotes: user.supplementNotes,
      personalGoals: user.personalGoals,
      perceivedLacks: user.perceivedLacks,
      trainingStylePreferences: user.trainingStylePreferences,
      avoidExercises: user.avoidExercises,
      preferredTrainingTime: user.preferredTrainingTime,
      sessionLength: user.sessionLength,
      travelDays: user.travelDays,
      fastingWindow: user.fastingWindow,
      mealCount: user.mealCount,
      injuries: user.injuries,
      budgetConstraints: user.budgetConstraints,
      wakeTime: user.wakeTime,
      sleepTime: user.sleepTime,
      stepTarget: user.stepTarget,
      caffeineFrequency: user.caffeineFrequency,
      alcoholFrequency: user.alcoholFrequency,
      stressBaseline: user.stressBaseline,
      sleepQualityBaseline: user.sleepQualityBaseline,
      preferredWorkoutSplit: user.preferredWorkoutSplit,
      specialRequests: user.specialRequests,
      planRegenerationRequest: user.planRegenerationRequest,
      workoutIntensity: user.workoutIntensity,
      workoutIntensityLevel: user.workoutIntensityLevel,
      trainingLevel: user.trainingLevel,
      goalWeight: user.goalWeight,
    };

    // Retry logic for resilience against cold starts and network blips
    let response;
    let attempt = 0;
    const MAX_ATTEMPTS = 3;

    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      try {
        // Add a small delay for retries
        if (attempt > 1) {
          console.log(`[ServerPlanGen] Retrying job creation (Attempt ${attempt}/${MAX_ATTEMPTS})...`);
          await new Promise(resolve => setTimeout(resolve, (attempt - 1) * 1500));
        }

        response = await supabase.functions.invoke('create-plan-job', {
          body: {
            profileSnapshot,
            // Redo parameters
            redo: options?.redo,
            redoReason: options?.redoReason,
            redoType: options?.redoType, // 'workout' | 'nutrition' | 'both'
            sourcePlanId: options?.sourcePlanId,
            // Force regeneration (for 14-day cycle reset)
            forceRegenerate: options?.forceRegenerate,
          },
        });

        if (!response.error) {
          break; // Success
        }

        console.warn(`[ServerPlanGen] Attempt ${attempt} failed:`, response.error);
      } catch (err) {
        console.error(`[ServerPlanGen] Exception on attempt ${attempt}:`, err);
        // Create a synthetic error response to handle consistently
        response = { error: { message: err instanceof Error ? err.message : String(err) } };
      }
    }

    if (!response) {
      return { success: false, status: 'error', error: 'Failed to create job after retries' };
    }

    if (response.error) {
      console.error('[ServerPlanGen] Final error creating job:', response.error);
      return {
        success: false,
        status: 'error',
        error: response.error.message || String(response.error)
      };
    }

    const data = response.data as CreateJobResult;
    console.log('[ServerPlanGen] Job creation result:', data);

    return data;

  } catch (error) {
    console.error('[ServerPlanGen] Unexpected error creating job:', error);
    return {
      success: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check the status of a plan generation job.
 * 
 * @param jobId - The job ID to check
 * @returns Job status and result plan if completed
 */
export async function getJobStatus(jobId: string): Promise<JobStatusResult> {
  try {
    const supabase = requireSupabase();

    // Fetch job status
    const { data: job, error: jobError } = await supabase
      .from('plan_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      console.error('[ServerPlanGen] Error fetching job:', jobError);
      return { success: false, error: jobError?.message || 'Job not found' };
    }

    const typedJob = job as ServerPlanJob;

    // If completed, also fetch the plan
    if (typedJob.status === 'completed' && typedJob.result_plan_id) {
      const { data: plan, error: planError } = await supabase
        .from('weekly_base_plans')
        .select('*')
        .eq('id', typedJob.result_plan_id)
        .single();

      if (planError || !plan) {
        console.warn('[ServerPlanGen] Job completed but plan not found:', planError);
        return { success: true, job: typedJob };
      }

      // Transform DB plan to app format
      const appPlan: WeeklyBasePlan = {
        id: plan.id,
        createdAt: plan.created_at,
        days: plan.days as WeeklyBasePlan['days'],
        isLocked: plan.is_locked,
        isGenerating: false,
        generationProgress: 7,
        editCounts: {},
        // CRITICAL: Include weekStartDate from server to ensure correct deduplication
        // Without this, the client calculates it from createdAt which may be wrong
        // after forceRegenerate reuses an existing plan row
        weekStartDate: plan.week_start_date ?? undefined,
        // Status and activation fields
        status: plan.status as WeeklyPlanStatus || 'generated',
        isActive: plan.status === 'active',
        activatedAt: plan.activated_at ?? undefined,
        generatedAt: plan.generated_at ?? undefined,
        generationJobId: plan.generation_job_id ?? undefined,
        // Redo tracking fields
        redoUsed: plan.redo_used ?? false,
        redoReason: plan.redo_reason ?? undefined,
        originalPlanId: plan.original_plan_id ?? undefined,
        // Daily redo limit tracking
        redoCountToday: plan.redo_count_today ?? 0,
        lastRedoDate: plan.last_redo_date ?? undefined,
      };

      return { success: true, job: typedJob, plan: appPlan };
    }

    return { success: true, job: typedJob };

  } catch (error) {
    console.error('[ServerPlanGen] Unexpected error getting job status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get the user's active (pending/processing) plan job, if any.
 * 
 * @returns Active job or null if none
 */
export async function getActiveJob(): Promise<ServerPlanJob | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) {
      return null;
    }

    const { data, error } = await supabase.rpc('get_active_plan_job', {
      p_user_id: session.session.user.id,
    });

    if (error) {
      console.error('[ServerPlanGen] Error getting active job:', error);
      return null;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    // RPC returns array, get first item
    const job = Array.isArray(data) ? data[0] : data;
    return job as ServerPlanJob;

  } catch (error) {
    console.error('[ServerPlanGen] Unexpected error getting active job:', error);
    return null;
  }
}

/**
 * Get the user's most recent job, regardless of status.
 * This is used to check for recently completed jobs when no active job is found.
 * 
 * @returns Most recent job (within last 10 minutes) or null
 */
export async function getMostRecentJob(): Promise<ServerPlanJob | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) {
      return null;
    }

    // Query for the most recent job created within the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('plan_generation_jobs')
      .select('id, status, created_at, started_at, completed_at, result_plan_id, error_message, error_code, retry_count, locked_until')
      .eq('user_id', session.session.user.id)
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[ServerPlanGen] Error getting recent job:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    return data as ServerPlanJob;

  } catch (error) {
    console.error('[ServerPlanGen] Unexpected error getting recent job:', error);
    return null;
  }
}

/**
 * Poll for job completion with a callback for progress updates.
 * 
 * @param jobId - The job ID to monitor
 * @param onProgress - Callback for status updates
 * @param maxWaitMs - Maximum time to wait (default 10 minutes)
 * @returns Final job status and plan if completed
 */
export async function waitForJobCompletion(
  jobId: string,
  onProgress?: (job: ServerPlanJob) => void,
  maxWaitMs: number = MAX_WAIT_TIME_MS
): Promise<JobStatusResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await getJobStatus(jobId);

    if (!result.success) {
      return result;
    }

    if (result.job) {
      // Call progress callback
      onProgress?.(result.job);

      // Check if job is done
      if (result.job.status === 'completed') {
        console.log('[ServerPlanGen] Job completed successfully');
        return result;
      }

      if (result.job.status === 'failed') {
        console.log('[ServerPlanGen] Job failed:', result.job.error_message);
        return {
          success: false,
          job: result.job,
          error: result.job.error_message || 'Job failed',
        };
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return {
    success: false,
    error: 'Timeout waiting for job completion',
  };
}

/**
 * Trigger processing of the plan queue.
 * 
 * This manually invokes the process-plan-queue function.
 * Normally this would be called by a cron job, but can be triggered manually.
 * 
 * Note: This requires the caller to have appropriate permissions.
 */
export async function triggerQueueProcessing(): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('[ServerPlanGen] Supabase not available for queue processing');
      return false;
    }

    console.log('[ServerPlanGen] Triggering queue processing...');

    // Retry logic for resilience against cold starts and network blips
    let response;
    let attempt = 0;
    const MAX_ATTEMPTS = 3;

    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      try {
        // Add a small delay for retries
        if (attempt > 1) {
          console.log(`[ServerPlanGen] Retrying queue trigger (Attempt ${attempt}/${MAX_ATTEMPTS})...`);
          await new Promise(resolve => setTimeout(resolve, (attempt - 1) * 1500));
        }

        response = await supabase.functions.invoke('process-plan-queue', {
          body: {},
        });

        if (!response.error) {
          break; // Success
        }

        console.warn(`[ServerPlanGen] Attempt ${attempt} failed:`, response.error);
      } catch (err) {
        console.error(`[ServerPlanGen] Exception on attempt ${attempt}:`, err);
        // Create a synthetic error response to handle consistently
        response = { error: { message: err instanceof Error ? err.message : String(err) } };
      }
    }

    if (!response) {
      console.warn('[ServerPlanGen] Queue trigger failed after retries');
      return false;
    }

    if (response.error) {
      // Use warn instead of error to avoid red screen in dev mode
      // This is a recoverable error - job will still be processed
      console.warn('[ServerPlanGen] Queue trigger issue (non-critical):', response.error.message || response.error);
      return false;
    }

    console.log('[ServerPlanGen] Queue processing triggered successfully:', response.data);
    return true;

  } catch (error) {
    // Use warn instead of error to avoid red screen in dev mode
    console.warn('[ServerPlanGen] Queue trigger failed (non-critical):', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Create a job and immediately trigger processing.
 * 
 * This is useful when you want the server to generate the plan ASAP
 * rather than waiting for the next cron run.
 * 
 * @param user - The user profile to generate a plan for
 * @param options - Optional redo parameters
 * @returns Job creation result
 */
export async function createAndTriggerServerPlanJob(user: User, options?: RedoOptions): Promise<CreateJobResult> {
  const createResult = await createServerPlanJob(user, options);

  if (!createResult.success) {
    return createResult;
  }

  if (createResult.status === 'created' || createResult.status === 'existing' || createResult.status === 'redo_started') {
    console.log('[ServerPlanGen] Triggering queue processing for job...');
    triggerQueueProcessing().catch((err) => {
      console.warn('[ServerPlanGen] Failed to trigger processing:', err);
    });
  } else if (createResult.status === 'plan_exists') {
    console.log('[ServerPlanGen] Plan already exists for this cycle, skipping queue trigger.');
  }

  return createResult;
}

// ============================================================================
// UTILITY: Check if server-side generation is available
// ============================================================================

/**
 * Check if server-side plan generation is available.
 * 
 * This checks if the Edge Functions are deployed and accessible.
 * Use this to decide whether to show server-side generation options.
 */
export async function isServerGenerationAvailable(): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    // Simple health check - try to invoke the function with a health check flag
    // This is a lightweight way to check if the function exists
    const { error } = await supabase.functions.invoke('create-plan-job', {
      body: { healthCheck: true },
    });

    // If no error, the function is available
    return !error;
  } catch {
    return false;
  }
}

// ============================================================================
// STALE JOB RECOVERY
// ============================================================================

// Jobs in processing state for longer than this should be reset
const MAX_PROCESSING_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a job appears to be stuck (processing for too long).
 */
export function isJobStuck(job: ServerPlanJob): boolean {
  if (job.status !== 'processing') return false;

  const now = Date.now();
  const lockedUntil = job.locked_until ? new Date(job.locked_until).getTime() : 0;
  if (lockedUntil && lockedUntil < now) {
    return true;
  }

  const startedAt = job.started_at ? new Date(job.started_at).getTime() : 0;
  if (!startedAt) return false;

  return now - startedAt > MAX_PROCESSING_DURATION_MS;
}

/**
 * Reset a stuck job back to pending state so it can be retried.
 * This should only be called when the job appears to be stuck.
 * Uses a secure RPC function that validates ownership and timing.
 */
export async function resetStuckJob(jobId: string): Promise<boolean> {
  try {
    const supabase = requireSupabase();

    console.log(`[ServerPlanGen] Resetting stuck job ${jobId} to pending...`);

    // Use RPC function for secure reset with validation
    const { data, error } = await supabase.rpc('reset_stuck_plan_job', {
      p_job_id: jobId,
    });

    if (error) {
      // Don't log as error if it's a validation failure (e.g., not stuck long enough)
      if (error.message?.includes('not been processing long enough')) {
        console.log('[ServerPlanGen] Job not stuck long enough to reset yet');
        return false;
      }
      console.error('[ServerPlanGen] Failed to reset job:', error.message);
      return false;
    }

    if (data === true) {
      console.log(`[ServerPlanGen] ✅ Job ${jobId} reset successfully, will retry`);
      return true;
    } else {
      console.log(`[ServerPlanGen] Job ${jobId} reached max retries, marked as failed`);
      return false; // Job was failed, not reset
    }
  } catch (error) {
    console.error('[ServerPlanGen] Error resetting job:', error);
    return false;
  }
}

/**
 * Cancel a job that the user wants to abandon.
 * This marks the job as failed so a new one can be created.
 * Uses a secure RPC function that validates ownership.
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  try {
    const supabase = requireSupabase();

    console.log(`[ServerPlanGen] Cancelling job ${jobId}...`);

    // Use RPC function for secure cancellation
    const { data, error } = await supabase.rpc('cancel_plan_job', {
      p_job_id: jobId,
    });

    if (error) {
      console.error('[ServerPlanGen] Failed to cancel job:', error.message);
      return false;
    }

    console.log(`[ServerPlanGen] ✅ Job ${jobId} cancelled`);
    return data === true;
  } catch (error) {
    console.error('[ServerPlanGen] Error cancelling job:', error);
    return false;
  }
}

/**
 * Get job details with stuck detection.
 * Returns additional metadata about whether the job appears stuck.
 */
export async function getJobWithHealthCheck(jobId: string): Promise<{
  job: ServerPlanJob | null;
  isStuck: boolean;
  shouldReset: boolean;
}> {
  const result = await getJobStatus(jobId);

  if (!result.success || !result.job) {
    return { job: null, isStuck: false, shouldReset: false };
  }

  const job = result.job;
  const stuck = isJobStuck(job);

  return {
    job,
    isStuck: stuck,
    shouldReset: stuck && job.status === 'processing',
  };
}
