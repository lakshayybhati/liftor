/**
 * Background Plan Generation Service
 * 
 * Manages base plan generation as a background job with clear status tracking.
 * Decoupled from UI - generation continues even if user navigates away.
 * 
 * NOTIFICATION POLICY:
 * - Notifications are ONLY sent when the plan status TRANSITIONS from pending to ready/error.
 * - No notifications are sent on app open or component mount.
 * - Uses the centralized NotificationService for all notification delivery.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, WeeklyBasePlan } from '@/types/user';
import { generateBasePlan, isGenerationInProgress, getCurrentGenerationId } from '@/services/basePlanEngine';
import { NotificationService } from '@/services/NotificationService';
import { recordGenerationTime, calculateProfileComplexity } from '@/utils/plan-time-estimator';

// ============================================================================
// TYPES
// ============================================================================

export type BasePlanStatus = 'idle' | 'pending' | 'ready' | 'error';

export interface BasePlanJobState {
  status: BasePlanStatus;
  jobId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  verified: boolean; // true only after user taps "Start my journey"
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  JOB_STATE: 'Liftor_basePlanJobState',
} as const;

// Namespace storage keys per user
const scopedKey = (base: string, userId: string | null | undefined) => 
  `${base}:${userId ?? 'anon'}`;

// ============================================================================
// JOB STATE MANAGEMENT
// ============================================================================

// Maximum time a job can be "pending" before considered stale (15 minutes)
const STALE_JOB_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Check if a pending job is stale (started too long ago without completing)
 */
function isJobStale(state: BasePlanJobState): boolean {
  if (state.status !== 'pending' || !state.startedAt) {
    return false;
  }
  
  const startedAt = new Date(state.startedAt).getTime();
  const now = Date.now();
  const elapsed = now - startedAt;
  
  return elapsed > STALE_JOB_TIMEOUT_MS;
}

/**
 * Get the current base plan job state
 * Automatically cleans up stale pending states
 */
export async function getBasePlanJobState(userId: string | null): Promise<BasePlanJobState> {
  try {
    const key = scopedKey(STORAGE_KEYS.JOB_STATE, userId);
    const data = await AsyncStorage.getItem(key);
    if (data) {
      const state = JSON.parse(data) as BasePlanJobState;
      
      // Check for stale pending state
      // If the job has been "pending" for too long and no generation is actually running,
      // reset it to idle to prevent the user from being stuck
      if (state.status === 'pending' && isJobStale(state) && !isBackgroundGenerationInProgress()) {
        console.warn('[BackgroundGen] ⚠️ Detected stale pending job, resetting to idle');
        console.warn(`   Started at: ${state.startedAt}`);
        console.warn(`   Current time: ${new Date().toISOString()}`);
        
        // Reset to idle
        const resetState: BasePlanJobState = {
          ...state,
          status: 'idle',
          error: 'Previous generation timed out. Please try again.',
        };
        await AsyncStorage.setItem(key, JSON.stringify(resetState));
        return resetState;
      }
      
      return state;
    }
  } catch (error) {
    console.error('[BackgroundGen] Error reading job state:', error);
  }
  
  // Default state
  return {
    status: 'idle',
    jobId: null,
    startedAt: null,
    completedAt: null,
    error: null,
    verified: false,
  };
}

/**
 * Save the base plan job state
 */
export async function saveBasePlanJobState(
  userId: string | null, 
  state: Partial<BasePlanJobState>
): Promise<void> {
  try {
    const key = scopedKey(STORAGE_KEYS.JOB_STATE, userId);
    const current = await getBasePlanJobState(userId);
    const updated = { ...current, ...state };
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    console.log('[BackgroundGen] Job state saved:', updated.status);
  } catch (error) {
    console.error('[BackgroundGen] Error saving job state:', error);
  }
}

/**
 * Reset the job state to idle
 */
export async function resetBasePlanJobState(userId: string | null): Promise<void> {
  await saveBasePlanJobState(userId, {
    status: 'idle',
    jobId: null,
    startedAt: null,
    completedAt: null,
    error: null,
    // Keep verified status - only reset by explicit action
  });
}

/**
 * Validate if a "pending" job state is actually valid.
 * A pending state is valid ONLY if:
 * 1. There's an actual generation running in memory, OR
 * 2. The job was started recently (within timeout window)
 * 
 * If invalid, this function resets the state to idle and returns false.
 */
export async function validatePendingJobState(userId: string | null): Promise<boolean> {
  const state = await getBasePlanJobState(userId);
  
  // Not pending - nothing to validate
  if (state.status !== 'pending') {
    return false;
  }
  
  // Check if generation is actually running in memory
  if (isBackgroundGenerationInProgress()) {
    console.log('[BackgroundGen] ✅ Pending state valid - generation in progress');
    return true;
  }
  
  // Check if job is stale
  if (isJobStale(state)) {
    console.warn('[BackgroundGen] ⚠️ Pending state invalid - job is stale');
    await resetBasePlanJobState(userId);
    return false;
  }
  
  // If no generation is running but job is recent, it might have crashed
  // Give it a grace period of 30 seconds before considering it invalid
  if (state.startedAt) {
    const startedAt = new Date(state.startedAt).getTime();
    const elapsed = Date.now() - startedAt;
    const GRACE_PERIOD_MS = 30 * 1000; // 30 seconds
    
    if (elapsed > GRACE_PERIOD_MS) {
      console.warn('[BackgroundGen] ⚠️ Pending state invalid - no generation running after grace period');
      await saveBasePlanJobState(userId, {
        status: 'error',
        error: 'Generation process was interrupted. Please try again.',
        completedAt: new Date().toISOString(),
      });
      return false;
    }
  }
  
  // Within grace period - might still be initializing
  console.log('[BackgroundGen] ⏳ Pending state - within grace period');
  return true;
}

/**
 * Clean up stale job states on app startup.
 * Call this from _layout.tsx during app initialization.
 */
export async function cleanupStaleJobStates(userId: string | null): Promise<void> {
  try {
    const state = await getBasePlanJobState(userId); // This already handles stale detection
    
    // If still pending after getBasePlanJobState (which checks for stale), validate it
    if (state.status === 'pending') {
      const isValid = await validatePendingJobState(userId);
      if (!isValid) {
        console.log('[BackgroundGen] Cleaned up stale job state on startup');
      }
    }
  } catch (error) {
    console.error('[BackgroundGen] Error cleaning up stale job states:', error);
  }
}

/**
 * Mark the plan as verified (user tapped "Start my journey")
 */
export async function verifyBasePlan(userId: string | null): Promise<void> {
  await saveBasePlanJobState(userId, { verified: true });
  console.log('[BackgroundGen] Plan verified by user');
}

// ============================================================================
// NOTIFICATION HELPERS (Delegated to NotificationService)
// ============================================================================

/**
 * Send a notification when plan is ready.
 * This is ONLY called when the plan status TRANSITIONS to 'ready'.
 * Delegated to centralized NotificationService.
 */
async function sendPlanReadyNotification(): Promise<void> {
  await NotificationService.sendBasePlanReadyNotification();
}

/**
 * Send a notification when plan generation fails.
 * This is ONLY called when the plan status TRANSITIONS to 'error'.
 * Delegated to centralized NotificationService.
 */
async function sendPlanErrorNotification(errorMessage: string): Promise<void> {
  await NotificationService.sendBasePlanErrorNotification(errorMessage);
}

// ============================================================================
// BACKGROUND GENERATION
// ============================================================================

// Global promise to track the current generation
let currentGenerationPromise: Promise<WeeklyBasePlan | null> | null = null;
let currentJobId: string | null = null;

/**
 * Check if background generation is in progress
 */
export function isBackgroundGenerationInProgress(): boolean {
  return currentGenerationPromise !== null || isGenerationInProgress();
}

/**
 * Get the current background job ID
 */
export function getCurrentBackgroundJobId(): string | null {
  return currentJobId || getCurrentGenerationId();
}

/**
 * Start background plan generation
 * 
 * This function:
 * 1. Creates a job ID and sets status to 'pending'
 * 2. Starts async generation that continues even if UI navigates away
 * 3. On success: saves plan, sets status to 'ready', sends notifications
 * 4. On error: sets status to 'error', sends error notification
 * 
 * Returns the job ID immediately - does NOT wait for generation to complete
 */
export async function startBasePlanGeneration(
  user: User,
  userId: string | null,
  addBasePlan: (plan: WeeklyBasePlan) => Promise<void>
): Promise<string> {
  // Check if generation is already in progress
  if (isBackgroundGenerationInProgress()) {
    const existingJobId = getCurrentBackgroundJobId();
    console.log('[BackgroundGen] Generation already in progress, returning existing job ID:', existingJobId);
    return existingJobId || 'existing_job';
  }
  
  // Create new job ID
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  currentJobId = jobId;
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 [BackgroundGen] Starting background plan generation');
  console.log(`   Job ID: ${jobId}`);
  console.log(`   User: ${user.name || 'Unknown'}`);
  console.log('═══════════════════════════════════════════════════════════');
  
  // Set initial state
  await saveBasePlanJobState(userId, {
    status: 'pending',
    jobId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    verified: false,
  });
  
  // Track generation start time for performance metrics
  const generationStartTime = Date.now();
  const profileComplexity = calculateProfileComplexity(user);
  
  // Start generation in background (don't await!)
  currentGenerationPromise = (async (): Promise<WeeklyBasePlan | null> => {
    try {
      console.log('[BackgroundGen] Generation started in background...');
      console.log(`   Profile complexity: ${profileComplexity}/100`);
      
      // Call the actual generation
      const basePlan = await generateBasePlan(user);
      
      // Calculate actual generation duration
      const generationDuration = Math.round((Date.now() - generationStartTime) / 1000);
      console.log('[BackgroundGen] Generation completed successfully!');
      console.log(`   Plan ID: ${basePlan.id}`);
      console.log(`   Days: ${Object.keys(basePlan.days).length}`);
      console.log(`   Duration: ${generationDuration}s`);
      
      // Save the plan
      await addBasePlan(basePlan);
      
      // Update job state to ready
      await saveBasePlanJobState(userId, {
        status: 'ready',
        completedAt: new Date().toISOString(),
        error: null,
      });
      
      // Send notification via centralized service
      // The NotificationService.sendBasePlanReadyNotification() handles both
      // OS notification and in-app notification center entry
      await sendPlanReadyNotification();
      
      // Record generation time for future estimation improvement
      await recordGenerationTime(
        userId ?? 'anon',
        generationDuration,
        profileComplexity,
        true // success
      );
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ [BackgroundGen] Background generation COMPLETE');
      console.log(`   Job ID: ${jobId}`);
      console.log(`   Plan ID: ${basePlan.id}`);
      console.log(`   Total time: ${generationDuration}s`);
      console.log('═══════════════════════════════════════════════════════════');
      
      return basePlan;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const failedDuration = Math.round((Date.now() - generationStartTime) / 1000);
      console.error('[BackgroundGen] Generation failed:', errorMessage);
      
      // Update job state to error
      await saveBasePlanJobState(userId, {
        status: 'error',
        completedAt: new Date().toISOString(),
        error: errorMessage,
      });
      
      // Send error notification via centralized service
      // The NotificationService.sendBasePlanErrorNotification() handles both
      // OS notification and in-app notification center entry
      await sendPlanErrorNotification(errorMessage);
      
      // Record failed generation time (helps understand failure patterns)
      await recordGenerationTime(
        userId ?? 'anon',
        failedDuration,
        profileComplexity,
        false // failed
      );
      
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ [BackgroundGen] Background generation FAILED');
      console.error(`   Job ID: ${jobId}`);
      console.error(`   Error: ${errorMessage}`);
      console.error(`   Failed after: ${failedDuration}s`);
      console.error('═══════════════════════════════════════════════════════════');
      
      return null;
      
    } finally {
      // Clean up
      currentGenerationPromise = null;
      currentJobId = null;
    }
  })();
  
  // Return job ID immediately - don't wait for generation
  return jobId;
}

/**
 * Cancel the current background generation (if possible)
 * Note: This doesn't actually cancel the API call, but resets the state
 */
export async function cancelBasePlanGeneration(userId: string | null): Promise<void> {
  console.log('[BackgroundGen] Cancelling generation...');
  await resetBasePlanJobState(userId);
  currentGenerationPromise = null;
  currentJobId = null;
}

/**
 * Retry plan generation after an error
 */
export async function retryBasePlanGeneration(
  user: User,
  userId: string | null,
  addBasePlan: (plan: WeeklyBasePlan) => Promise<void>
): Promise<string> {
  console.log('[BackgroundGen] Retrying generation...');
  await resetBasePlanJobState(userId);
  return startBasePlanGeneration(user, userId, addBasePlan);
}

