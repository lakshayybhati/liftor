/**
 * Local Plan Storage Utility
 * 
 * Handles offline-first storage of base plans using AsyncStorage.
 * Plans are saved locally and NOT synced to server for historical viewing.
 * 
 * ⚠️ WARNING: Deleting the app will delete all saved plans!
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WeeklyBasePlan, CheckinData, DailyPlan, WeeklyPlanStatus } from '@/types/user';

// Storage keys
const LOCAL_PLANS_KEY = 'Liftor_local_plans';
const DATA_WARNING_SHOWN_KEY = 'Liftor_data_warning_shown';

export interface LocalPlanWithStats extends WeeklyBasePlan {
  localId: string; // UUID for local reference
  savedAt: string; // When plan was saved locally
  stats: {
    weightChangeKg?: number;
    consistencyPercent?: number;
    daysActive?: number;
    totalWorkouts?: number;
    avgAdherence?: number;
  };
}

/**
 * Generate a unique local ID
 */
export function generateLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if user has seen the data warning popup
 */
export async function hasSeenDataWarning(userId: string): Promise<boolean> {
  try {
    const key = `${DATA_WARNING_SHOWN_KEY}:${userId}`;
    const value = await AsyncStorage.getItem(key);
    return value === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark data warning as shown
 */
export async function markDataWarningShown(userId: string): Promise<void> {
  try {
    const key = `${DATA_WARNING_SHOWN_KEY}:${userId}`;
    await AsyncStorage.setItem(key, 'true');
  } catch (error) {
    console.warn('[LocalPlanStorage] Failed to mark warning shown:', error);
  }
}

/**
 * Get all locally saved plans for a user
 */
export async function getLocalPlans(userId: string): Promise<LocalPlanWithStats[]> {
  try {
    const key = `${LOCAL_PLANS_KEY}:${userId}`;
    const data = await AsyncStorage.getItem(key);
    if (!data) return [];
    
    const plans = JSON.parse(data) as LocalPlanWithStats[];
    // Sort by savedAt, newest first
    return plans.sort((a, b) => 
      new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
  } catch (error) {
    console.warn('[LocalPlanStorage] Failed to get local plans:', error);
    return [];
  }
}

/**
 * Save a plan locally with stats calculation
 */
export async function saveLocalPlan(
  userId: string,
  plan: WeeklyBasePlan,
  checkins: CheckinData[],
  dailyPlans: DailyPlan[]
): Promise<LocalPlanWithStats> {
  try {
    const existingPlans = await getLocalPlans(userId);
    
    // Calculate stats for this plan
    const stats = calculatePlanStats(plan, checkins, dailyPlans);
    
    const localPlan: LocalPlanWithStats = {
      ...plan,
      localId: plan.id || generateLocalId(),
      savedAt: new Date().toISOString(),
      status: plan.isActive ? 'active' : 'archived',
      stats,
    };
    
    // Check if plan already exists (update) or is new (add)
    const existingIndex = existingPlans.findIndex(p => p.id === plan.id || p.localId === plan.id);
    
    if (existingIndex >= 0) {
      existingPlans[existingIndex] = localPlan;
    } else {
      existingPlans.unshift(localPlan);
    }
    
    // Save back to storage
    const key = `${LOCAL_PLANS_KEY}:${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(existingPlans));
    
    console.log('[LocalPlanStorage] ✅ Plan saved locally:', localPlan.localId);
    return localPlan;
  } catch (error) {
    console.error('[LocalPlanStorage] Failed to save plan:', error);
    throw error;
  }
}

/**
 * Update a local plan's status (activate/deactivate/archive)
 */
export async function updateLocalPlanStatus(
  userId: string,
  planId: string,
  status: WeeklyPlanStatus,
  stats?: LocalPlanWithStats['stats']
): Promise<boolean> {
  try {
    const plans = await getLocalPlans(userId);
    const planIndex = plans.findIndex(p => p.id === planId || p.localId === planId);
    
    if (planIndex < 0) {
      console.warn('[LocalPlanStorage] Plan not found:', planId);
      return false;
    }
    
    // If activating this plan, deactivate all others
    if (status === 'active') {
      plans.forEach((p, i) => {
        if (i !== planIndex && p.status === 'active') {
          p.status = 'archived';
          p.isActive = false;
          p.deactivatedAt = new Date().toISOString();
        }
      });
    }
    
    // Update the target plan
    plans[planIndex] = {
      ...plans[planIndex],
      status,
      isActive: status === 'active',
      isLocked: status === 'archived',
      activatedAt: status === 'active' ? new Date().toISOString() : plans[planIndex].activatedAt,
      deactivatedAt: status === 'archived' ? new Date().toISOString() : undefined,
      stats: stats || plans[planIndex].stats,
    };
    
    const key = `${LOCAL_PLANS_KEY}:${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(plans));
    
    console.log('[LocalPlanStorage] ✅ Plan status updated:', planId, status);
    return true;
  } catch (error) {
    console.error('[LocalPlanStorage] Failed to update plan status:', error);
    return false;
  }
}

/**
 * Rename a local plan
 */
export async function renameLocalPlan(
  userId: string,
  planId: string,
  newName: string
): Promise<boolean> {
  try {
    const plans = await getLocalPlans(userId);
    const planIndex = plans.findIndex(p => p.id === planId || p.localId === planId);
    
    if (planIndex < 0) return false;
    
    plans[planIndex].name = newName;
    
    const key = `${LOCAL_PLANS_KEY}:${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(plans));
    
    return true;
  } catch (error) {
    console.error('[LocalPlanStorage] Failed to rename plan:', error);
    return false;
  }
}

/**
 * Delete a local plan
 */
export async function deleteLocalPlan(
  userId: string,
  planId: string
): Promise<boolean> {
  try {
    const plans = await getLocalPlans(userId);
    const filtered = plans.filter(p => p.id !== planId && p.localId !== planId);
    
    if (filtered.length === plans.length) {
      console.warn('[LocalPlanStorage] Plan not found for deletion:', planId);
      return false;
    }
    
    const key = `${LOCAL_PLANS_KEY}:${userId}`;
    await AsyncStorage.setItem(key, JSON.stringify(filtered));
    
    console.log('[LocalPlanStorage] ✅ Plan deleted:', planId);
    return true;
  } catch (error) {
    console.error('[LocalPlanStorage] Failed to delete plan:', error);
    return false;
  }
}

/**
 * Calculate stats for a plan based on check-ins and daily plans
 */
export function calculatePlanStats(
  plan: WeeklyBasePlan,
  checkins: CheckinData[],
  dailyPlans: DailyPlan[]
): LocalPlanWithStats['stats'] {
  const startDate = plan.activatedAt 
    ? new Date(plan.activatedAt) 
    : new Date(plan.createdAt);
  const endDate = plan.deactivatedAt 
    ? new Date(plan.deactivatedAt) 
    : new Date();
  
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  // Filter data to plan's active period
  const periodCheckins = checkins.filter(c => 
    c.date >= startDateStr && c.date <= endDateStr
  );
  const periodPlans = dailyPlans.filter(p => 
    p.date >= startDateStr && p.date <= endDateStr
  );
  
  // Calculate days active
  const daysActive = Math.max(1, Math.floor(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  ));
  
  // Calculate weight change
  let weightChangeKg: number | undefined;
  const weights = periodCheckins
    .map(c => c.currentWeight ?? c.bodyWeight)
    .filter((w): w is number => typeof w === 'number' && !isNaN(w))
    .sort((a, b) => a - b);
  
  if (weights.length >= 2) {
    const firstWeight = weights[0];
    const lastWeight = weights[weights.length - 1];
    weightChangeKg = lastWeight - firstWeight;
  }
  
  // Calculate consistency/adherence
  let consistencyPercent: number | undefined;
  let avgAdherence: number | undefined;
  const adherenceValues = periodPlans
    .map(p => p.adherence)
    .filter((a): a is number => typeof a === 'number' && !isNaN(a));
  
  if (adherenceValues.length > 0) {
    avgAdherence = adherenceValues.reduce((sum, a) => sum + a, 0) / adherenceValues.length;
    consistencyPercent = Math.round(avgAdherence * 100);
  }
  
  // Count total workouts
  const totalWorkouts = periodPlans.filter(p => p.workout?.blocks?.length > 0).length;
  
  return {
    weightChangeKg,
    consistencyPercent,
    daysActive,
    totalWorkouts,
    avgAdherence,
  };
}

/**
 * Archive current active plan when a new one is created
 */
export async function archiveActivePlan(
  userId: string,
  checkins: CheckinData[],
  dailyPlans: DailyPlan[]
): Promise<void> {
  try {
    const plans = await getLocalPlans(userId);
    const activePlan = plans.find(p => p.status === 'active' || p.isActive);
    
    if (activePlan) {
      const stats = calculatePlanStats(activePlan, checkins, dailyPlans);
      await updateLocalPlanStatus(userId, activePlan.id || activePlan.localId, 'archived', stats);
    }
  } catch (error) {
    console.warn('[LocalPlanStorage] Failed to archive active plan:', error);
  }
}

/**
 * Get the currently active plan
 */
export async function getActivePlan(userId: string): Promise<LocalPlanWithStats | null> {
  const plans = await getLocalPlans(userId);
  return plans.find(p => p.status === 'active' || p.isActive) || null;
}

/**
 * Migrate existing basePlans from useUserStore to local storage
 * Called once to sync existing plans
 */
export async function migrateExistingPlans(
  userId: string,
  existingPlans: WeeklyBasePlan[],
  checkins: CheckinData[],
  dailyPlans: DailyPlan[]
): Promise<void> {
  try {
    const localPlans = await getLocalPlans(userId);
    
    for (const plan of existingPlans) {
      // Check if already migrated
      const exists = localPlans.some(p => p.id === plan.id);
      if (!exists) {
        await saveLocalPlan(userId, plan, checkins, dailyPlans);
      }
    }
    
    console.log('[LocalPlanStorage] ✅ Migration complete');
  } catch (error) {
    console.error('[LocalPlanStorage] Migration failed:', error);
  }
}


