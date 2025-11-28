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

export interface InAppNotification {
  id: string;
  type: 'base_plan_ready' | 'base_plan_error' | 'general';
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  link?: string;
  data?: any;
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  JOB_STATE: 'Liftor_basePlanJobState',
  NOTIFICATIONS: 'Liftor_inAppNotifications',
} as const;

// Namespace storage keys per user
const scopedKey = (base: string, userId: string | null | undefined) => 
  `${base}:${userId ?? 'anon'}`;

// ============================================================================
// JOB STATE MANAGEMENT
// ============================================================================

/**
 * Get the current base plan job state
 */
export async function getBasePlanJobState(userId: string | null): Promise<BasePlanJobState> {
  try {
    const key = scopedKey(STORAGE_KEYS.JOB_STATE, userId);
    const data = await AsyncStorage.getItem(key);
    if (data) {
      return JSON.parse(data);
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
 * Mark the plan as verified (user tapped "Start my journey")
 */
export async function verifyBasePlan(userId: string | null): Promise<void> {
  await saveBasePlanJobState(userId, { verified: true });
  console.log('[BackgroundGen] Plan verified by user');
}

// ============================================================================
// IN-APP NOTIFICATION CENTER
// ============================================================================

/**
 * Get all in-app notifications
 */
export async function getInAppNotifications(userId: string | null): Promise<InAppNotification[]> {
  try {
    const key = scopedKey(STORAGE_KEYS.NOTIFICATIONS, userId);
    const data = await AsyncStorage.getItem(key);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[BackgroundGen] Error reading notifications:', error);
  }
  return [];
}

/**
 * Add an in-app notification
 */
export async function addInAppNotification(
  userId: string | null,
  notification: Omit<InAppNotification, 'id' | 'createdAt' | 'read'>
): Promise<void> {
  try {
    const notifications = await getInAppNotifications(userId);
    const newNotification: InAppNotification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    notifications.unshift(newNotification); // Add to front
    
    // Keep only last 50 notifications
    const trimmed = notifications.slice(0, 50);
    
    const key = scopedKey(STORAGE_KEYS.NOTIFICATIONS, userId);
    await AsyncStorage.setItem(key, JSON.stringify(trimmed));
    console.log('[BackgroundGen] In-app notification added:', notification.type);
  } catch (error) {
    console.error('[BackgroundGen] Error adding notification:', error);
  }
}

/**
 * Mark a notification as read
 */
export async function markNotificationRead(
  userId: string | null,
  notificationId: string
): Promise<void> {
  try {
    const notifications = await getInAppNotifications(userId);
    const updated = notifications.map(n => 
      n.id === notificationId ? { ...n, read: true } : n
    );
    const key = scopedKey(STORAGE_KEYS.NOTIFICATIONS, userId);
    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch (error) {
    console.error('[BackgroundGen] Error marking notification read:', error);
  }
}

/**
 * Get unread notification count
 */
export async function getUnreadNotificationCount(userId: string | null): Promise<number> {
  const notifications = await getInAppNotifications(userId);
  return notifications.filter(n => !n.read).length;
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications(userId: string | null): Promise<void> {
  try {
    const key = scopedKey(STORAGE_KEYS.NOTIFICATIONS, userId);
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error('[BackgroundGen] Error clearing notifications:', error);
  }
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
  
  // Start generation in background (don't await!)
  currentGenerationPromise = (async (): Promise<WeeklyBasePlan | null> => {
    try {
      console.log('[BackgroundGen] Generation started in background...');
      
      // Call the actual generation
      const basePlan = await generateBasePlan(user);
      
      console.log('[BackgroundGen] Generation completed successfully!');
      console.log(`   Plan ID: ${basePlan.id}`);
      console.log(`   Days: ${Object.keys(basePlan.days).length}`);
      
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
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ [BackgroundGen] Background generation COMPLETE');
      console.log(`   Job ID: ${jobId}`);
      console.log(`   Plan ID: ${basePlan.id}`);
      console.log('═══════════════════════════════════════════════════════════');
      
      return basePlan;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
      
      console.error('═══════════════════════════════════════════════════════════');
      console.error('❌ [BackgroundGen] Background generation FAILED');
      console.error(`   Job ID: ${jobId}`);
      console.error(`   Error: ${errorMessage}`);
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

