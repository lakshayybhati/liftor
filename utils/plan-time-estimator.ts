/**
 * Intelligent Plan Generation Time Estimator
 * 
 * Estimates plan generation time based on:
 * 1. User profile complexity factors
 * 2. Historical generation times (learned from actual runs)
 * 3. Server/AI model performance patterns
 * 
 * Based on real testing: typical generation takes 5-7 minutes (300-420 seconds)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@/types/user';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Base time estimates (in seconds) based on real-world testing
 * The AI pipeline involves:
 * - Stage 1: Raw plan generation (~2-3 min)
 * - Stage 2: Verification & fixing (~2-3 min)
 * - Retries if needed (adds ~2+ min per retry)
 */
const BASE_TIME_SECONDS = {
  // Minimum realistic time for generation
  MIN: 180, // 3 minutes
  
  // Typical time based on testing
  TYPICAL: 360, // 6 minutes
  
  // Maximum before showing "taking longer than usual"
  MAX: 480, // 8 minutes
  
  // Absolute timeout (job is considered stale)
  TIMEOUT: 900, // 15 minutes
};

/**
 * Complexity weights - each factor adds to the base time
 * Values are in seconds
 */
const COMPLEXITY_WEIGHTS = {
  // Training days (more days = more to generate)
  trainingDays: {
    1: 0,
    2: 10,
    3: 15,
    4: 20,
    5: 30,
    6: 40,
    7: 50, // Full week plan is most complex
  } as Record<number, number>,
  
  // Equipment variety (more options = longer meal/exercise matching)
  equipmentCount: {
    0: 0,    // Bodyweight only
    1: 5,    // 1 equipment type
    2: 10,   // 2 equipment types
    3: 15,   // 3 equipment types
    4: 20,   // Full gym access
  },
  
  // Dietary restrictions (more restrictions = harder to plan meals)
  dietaryRestrictions: {
    none: 0,
    one: 15,
    multiple: 30,
    withNotes: 45, // Has custom dietary notes
  },
  
  // Goal complexity
  goals: {
    GENERAL_FITNESS: 0,
    WEIGHT_LOSS: 10,
    MUSCLE_GAIN: 15,
    ENDURANCE: 10,
    FLEXIBILITY_MOBILITY: 5,
  } as Record<string, number>,
  
  // Training level (beginners need more detailed explanations)
  trainingLevel: {
    Beginner: 20,
    Intermediate: 0,
    Professional: 10, // More advanced exercises to consider
  } as Record<string, number>,
  
  // Personal specifics complexity
  hasInjuries: 30,
  hasSupplements: 10,
  hasFastingWindow: 15,
  hasAvoidExercises: 15,
  hasSpecialRequests: 20,
  hasVMNTranscription: 25,
  hasPlanRegenerationRequest: 15,
};

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  GENERATION_HISTORY: 'Liftor_generationTimeHistory',
  LAST_ESTIMATE_ACCURACY: 'Liftor_lastEstimateAccuracy',
};

interface GenerationTimeRecord {
  timestamp: string;
  userId: string;
  durationSeconds: number;
  profileComplexity: number;
  success: boolean;
}

// ============================================================================
// COMPLEXITY CALCULATION
// ============================================================================

/**
 * Calculate a complexity score for a user profile (0-100)
 */
export function calculateProfileComplexity(user: User): number {
  let complexity = 0;
  
  // Training days (0-10 points)
  const trainingDays = user.trainingDays || 3;
  complexity += Math.min(trainingDays * 1.5, 10);
  
  // Equipment variety (0-10 points)
  const equipmentCount = user.equipment?.length || 0;
  complexity += Math.min(equipmentCount * 2.5, 10);
  
  // Dietary restrictions (0-15 points)
  const dietaryCount = user.dietaryPrefs?.length || 0;
  complexity += Math.min(dietaryCount * 5, 10);
  if (user.dietaryNotes && user.dietaryNotes.length > 10) {
    complexity += 5;
  }
  
  // Goal complexity (0-10 points)
  const goalWeight = COMPLEXITY_WEIGHTS.goals[user.goal] || 0;
  complexity += goalWeight / 1.5;
  
  // Training level (0-10 points)
  const levelWeight = COMPLEXITY_WEIGHTS.trainingLevel[user.trainingLevel || 'Intermediate'] || 0;
  complexity += levelWeight / 2;
  
  // Personal specifics (0-35 points)
  if (user.injuries && user.injuries.length > 5) complexity += 7;
  if (user.supplements && user.supplements.length > 0) complexity += 3;
  if (user.fastingWindow) complexity += 4;
  if (user.avoidExercises && user.avoidExercises.length > 0) complexity += 4;
  if (user.specialRequests && user.specialRequests.length > 10) complexity += 5;
  if (user.vmnTranscription && user.vmnTranscription.length > 50) complexity += 6;
  if (user.planRegenerationRequest) complexity += 4;
  if (user.personalGoals && user.personalGoals.length > 0) complexity += 2;
  
  // Normalize to 0-100
  return Math.min(Math.round(complexity), 100);
}

/**
 * Estimate generation time based on user profile
 * Returns time in seconds
 */
export function estimateGenerationTime(user: User): {
  estimatedSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  complexity: number;
  breakdown: string[];
} {
  const breakdown: string[] = [];
  let estimatedTime = BASE_TIME_SECONDS.TYPICAL;
  
  // Calculate complexity score
  const complexity = calculateProfileComplexity(user);
  breakdown.push(`Base complexity score: ${complexity}/100`);
  
  // Adjust base time based on complexity
  // Low complexity (0-30): reduce time
  // Medium complexity (30-60): use typical time
  // High complexity (60-100): add time
  if (complexity < 30) {
    estimatedTime -= 60; // 1 minute less for simple profiles
    breakdown.push('Simple profile: -60s');
  } else if (complexity > 60) {
    const extraTime = Math.round((complexity - 60) * 1.5);
    estimatedTime += extraTime;
    breakdown.push(`Complex profile: +${extraTime}s`);
  }
  
  // Training days factor
  const trainingDays = user.trainingDays || 3;
  const daysBonus = COMPLEXITY_WEIGHTS.trainingDays[trainingDays] || 15;
  estimatedTime += daysBonus;
  breakdown.push(`${trainingDays} training days: +${daysBonus}s`);
  
  // Equipment factor
  const equipmentCount = user.equipment?.length || 0;
  const equipKey = Math.min(equipmentCount, 4) as 0 | 1 | 2 | 3 | 4;
  const equipBonus = COMPLEXITY_WEIGHTS.equipmentCount[equipKey];
  estimatedTime += equipBonus;
  if (equipBonus > 0) {
    breakdown.push(`${equipmentCount} equipment types: +${equipBonus}s`);
  }
  
  // Dietary complexity
  const dietaryCount = user.dietaryPrefs?.length || 0;
  let dietKey: 'none' | 'one' | 'multiple' | 'withNotes' = 'none';
  if (user.dietaryNotes && user.dietaryNotes.length > 10) {
    dietKey = 'withNotes';
  } else if (dietaryCount > 1) {
    dietKey = 'multiple';
  } else if (dietaryCount === 1) {
    dietKey = 'one';
  }
  const dietBonus = COMPLEXITY_WEIGHTS.dietaryRestrictions[dietKey];
  estimatedTime += dietBonus;
  if (dietBonus > 0) {
    breakdown.push(`Dietary restrictions (${dietKey}): +${dietBonus}s`);
  }
  
  // Injuries add significant complexity
  if (user.injuries && user.injuries.length > 5) {
    estimatedTime += COMPLEXITY_WEIGHTS.hasInjuries;
    breakdown.push(`Injuries to consider: +${COMPLEXITY_WEIGHTS.hasInjuries}s`);
  }
  
  // Special requests add AI thinking time
  if (user.specialRequests && user.specialRequests.length > 10) {
    estimatedTime += COMPLEXITY_WEIGHTS.hasSpecialRequests;
    breakdown.push(`Special requests: +${COMPLEXITY_WEIGHTS.hasSpecialRequests}s`);
  }
  
  // VMN transcription (voice memo) adds processing
  if (user.vmnTranscription && user.vmnTranscription.length > 50) {
    estimatedTime += COMPLEXITY_WEIGHTS.hasVMNTranscription;
    breakdown.push(`Voice memo analysis: +${COMPLEXITY_WEIGHTS.hasVMNTranscription}s`);
  }
  
  // Plan regeneration request
  if (user.planRegenerationRequest) {
    estimatedTime += COMPLEXITY_WEIGHTS.hasPlanRegenerationRequest;
    breakdown.push(`Regeneration request: +${COMPLEXITY_WEIGHTS.hasPlanRegenerationRequest}s`);
  }
  
  // Clamp to reasonable bounds
  const minSeconds = Math.max(BASE_TIME_SECONDS.MIN, estimatedTime - 90);
  const maxSeconds = Math.min(BASE_TIME_SECONDS.MAX, estimatedTime + 120);
  estimatedTime = Math.max(BASE_TIME_SECONDS.MIN, Math.min(estimatedTime, BASE_TIME_SECONDS.MAX));
  
  return {
    estimatedSeconds: Math.round(estimatedTime),
    minSeconds: Math.round(minSeconds),
    maxSeconds: Math.round(maxSeconds),
    complexity,
    breakdown,
  };
}

// ============================================================================
// HISTORICAL TRACKING
// ============================================================================

/**
 * Record a generation time for future estimation improvement
 */
export async function recordGenerationTime(
  userId: string,
  durationSeconds: number,
  profileComplexity: number,
  success: boolean
): Promise<void> {
  try {
    const key = STORAGE_KEYS.GENERATION_HISTORY;
    const existing = await AsyncStorage.getItem(key);
    let history: GenerationTimeRecord[] = existing ? JSON.parse(existing) : [];
    
    // Add new record
    history.push({
      timestamp: new Date().toISOString(),
      userId,
      durationSeconds,
      profileComplexity,
      success,
    });
    
    // Keep only last 20 records
    if (history.length > 20) {
      history = history.slice(-20);
    }
    
    await AsyncStorage.setItem(key, JSON.stringify(history));
    console.log(`[TimeEstimator] Recorded generation time: ${durationSeconds}s (complexity: ${profileComplexity})`);
  } catch (error) {
    console.warn('[TimeEstimator] Failed to record generation time:', error);
  }
}

/**
 * Get average historical generation time
 * Returns null if no history available
 */
export async function getHistoricalAverage(): Promise<{
  averageSeconds: number;
  sampleCount: number;
  successRate: number;
} | null> {
  try {
    const key = STORAGE_KEYS.GENERATION_HISTORY;
    const existing = await AsyncStorage.getItem(key);
    
    if (!existing) return null;
    
    const history: GenerationTimeRecord[] = JSON.parse(existing);
    if (history.length === 0) return null;
    
    // Only use successful generations for average
    const successfulRecords = history.filter(r => r.success);
    if (successfulRecords.length === 0) return null;
    
    const totalTime = successfulRecords.reduce((sum, r) => sum + r.durationSeconds, 0);
    const averageSeconds = Math.round(totalTime / successfulRecords.length);
    const successRate = successfulRecords.length / history.length;
    
    return {
      averageSeconds,
      sampleCount: successfulRecords.length,
      successRate,
    };
  } catch (error) {
    console.warn('[TimeEstimator] Failed to get historical average:', error);
    return null;
  }
}

/**
 * Get a smart estimate combining profile-based and historical data
 */
export async function getSmartEstimate(user: User): Promise<{
  estimatedSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  confidence: 'low' | 'medium' | 'high';
  source: 'profile' | 'historical' | 'combined';
  complexity: number;
}> {
  // Get profile-based estimate
  const profileEstimate = estimateGenerationTime(user);
  
  // Get historical average if available
  const historical = await getHistoricalAverage();
  
  if (!historical || historical.sampleCount < 3) {
    // Not enough historical data - use profile-based estimate
    return {
      ...profileEstimate,
      confidence: 'low',
      source: 'profile',
    };
  }
  
  // Combine profile estimate with historical average
  // Weight: 40% profile, 60% historical (historical is more reliable)
  const combinedEstimate = Math.round(
    profileEstimate.estimatedSeconds * 0.4 + historical.averageSeconds * 0.6
  );
  
  // Adjust bounds based on historical variance
  const minSeconds = Math.max(BASE_TIME_SECONDS.MIN, combinedEstimate - 90);
  const maxSeconds = Math.min(BASE_TIME_SECONDS.MAX, combinedEstimate + 90);
  
  const confidence = historical.sampleCount >= 10 ? 'high' : 
                     historical.sampleCount >= 5 ? 'medium' : 'low';
  
  return {
    estimatedSeconds: combinedEstimate,
    minSeconds,
    maxSeconds,
    confidence,
    source: 'combined',
    complexity: profileEstimate.complexity,
  };
}

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Format seconds into human-readable time string
 */
export function formatTimeEstimate(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (remainingSeconds === 0) {
    return `${minutes} min`;
  }
  
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Get a dynamic message based on elapsed time vs estimate
 */
export function getProgressMessage(
  elapsedSeconds: number,
  estimatedSeconds: number,
  maxSeconds: number
): {
  message: string;
  isDelayed: boolean;
  showGame: boolean;
} {
  const progress = elapsedSeconds / estimatedSeconds;
  
  if (progress < 0.25) {
    return {
      message: 'Analyzing your profile & goals...',
      isDelayed: false,
      showGame: false,
    };
  }
  
  if (progress < 0.5) {
    return {
      message: 'Crafting your personalized workouts...',
      isDelayed: false,
      showGame: false,
    };
  }
  
  if (progress < 0.75) {
    return {
      message: 'Building your nutrition plan...',
      isDelayed: false,
      showGame: false,
    };
  }
  
  if (progress < 1) {
    return {
      message: 'Verifying and optimizing...',
      isDelayed: false,
      showGame: true, // Show game option at 75% progress
    };
  }
  
  // Past estimated time
  if (elapsedSeconds < maxSeconds) {
    return {
      message: 'Almost there, finalizing details...',
      isDelayed: true,
      showGame: true,
    };
  }
  
  // Past max expected time
  return {
    message: 'Taking longer than usual. Hang tight!',
    isDelayed: true,
    showGame: true,
  };
}

/**
 * Calculate dynamic remaining time message
 */
export function getRemainingTimeMessage(
  elapsedSeconds: number,
  estimatedSeconds: number
): string {
  const remaining = estimatedSeconds - elapsedSeconds;
  
  if (remaining <= 0) {
    return 'Almost ready...';
  }
  
  if (remaining <= 30) {
    return `About ${remaining}s remaining`;
  }
  
  if (remaining <= 60) {
    return 'Less than a minute remaining';
  }
  
  const minutes = Math.ceil(remaining / 60);
  if (minutes === 1) {
    return 'About 1 minute remaining';
  }
  
  return `About ${minutes} minutes remaining`;
}

