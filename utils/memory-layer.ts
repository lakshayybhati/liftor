import { User, CheckinData, TrendMemory, LastDayContext, DailyPlan } from '@/types/user';

// Scoring functions based on 0-1 scale
const scoreSleep = (hrs: number): number => {
  if (hrs < 2) return 0;
  if (hrs < 4) return 0.25;
  if (hrs < 7) return 0.5;
  if (hrs <= 10) return 1.0;
  return 0.75; // 10+ hours
};

const scoreEnergy = (val: number): number => {
  if (val < 3) return 0;
  if (val < 5) return 0.5;
  if (val < 7) return 0.75;
  return 1.0;
};

const scoreWater = (liters: number): number => {
  if (liters < 1) return 0;
  if (liters < 3.5) return 0.5;
  return 1.0; // 3.5 - 5 (and assuming >5 is also good/1.0)
};

const scoreStress = (val: number): number => {
  if (val < 3) return 1.0;
  if (val < 5) return 0.75;
  if (val < 7) return 0.25;
  return 0.0;
};

// EMA Calculation
// EMA_today = alpha * today + (1 - alpha) * previousEMA
const calculateEMA = (values: number[], alpha: number = 0.6): number => {
  if (values.length === 0) return 0; // Should not happen if guarded
  
  let ema = values[0]; // Start with the oldest available value as initial EMA
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i] + (1 - alpha) * ema;
  }
  return parseFloat(ema.toFixed(2));
};

export const buildMemoryLayer = (user: User, recentCheckins: CheckinData[]): TrendMemory | null => {
  // We need at least some history to build memory.
  // Prompt says "if the previos checkins are none or less we wont use memory".
  // We'll interpret this as needing at least 1 past checkin to form a trend/memory.
  if (!recentCheckins || recentCheckins.length < 4) {
    return null;
  }

  // Sort checkins by date ascending (oldest first)
  const sortedCheckins = [...recentCheckins].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Take up to last 4 days for EMA and streaks
  // Note: recentCheckins might include today's checkin if passed from generatePlan.
  // The prompt implies using "last 4 days of the user's check-in input".
  // We will use the last 4 available entries.
  const last4 = sortedCheckins.slice(-4);

  // --- EMA Calculations ---
  // Extract scores. If a value is missing, we skip that day for that metric or assume average? 
  // Better to filter out days where the metric is missing to avoid skewing.
  
  const extractScores = <T>(data: CheckinData[], extractor: (c: CheckinData) => T | undefined, scorer: (val: T) => number) => {
    return data
      .map(c => {
        const val = extractor(c);
        return val !== undefined && val !== null ? scorer(val) : null;
      })
      .filter((s): s is number => s !== null);
  };

  const sleepScores = extractScores(last4, c => c.sleepHrs, scoreSleep);
  const energyScores = extractScores(last4, c => c.energy, scoreEnergy);
  const waterScores = extractScores(last4, c => c.waterL, scoreWater);
  const stressScores = extractScores(last4, c => c.stress, scoreStress);

  // Calculate EMAs (using whatever length we have, up to 4)
  // If no data points for a metric, default to a neutral score or 0? 
  // Let's use 0.5 (neutral) if absolutely no data, or 0 if we want to be strict. 
  // Given 0=bad, 1=good, maybe 0.5 is safer fallback, but 0 highlights missing data.
  // Let's return the last computed EMA.
  
  const ema = {
    sleep: sleepScores.length > 0 ? calculateEMA(sleepScores) : 0.5,
    energy: energyScores.length > 0 ? calculateEMA(energyScores) : 0.5,
    water: waterScores.length > 0 ? calculateEMA(waterScores) : 0.5,
    stress: stressScores.length > 0 ? calculateEMA(stressScores) : 0.5,
  };
  
  const currentScores = {
    sleep: sleepScores.length > 0 ? sleepScores[sleepScores.length - 1] : 0,
    energy: energyScores.length > 0 ? energyScores[energyScores.length - 1] : 0,
    water: waterScores.length > 0 ? waterScores[waterScores.length - 1] : 0,
    stress: stressScores.length > 0 ? stressScores[stressScores.length - 1] : 0,
  };

  // --- Soreness History & Streaks ---
  // "Soreness in last 4 days is – legs, back, arms, chest"
  const sorenessParts = last4.map(c => {
    if (!c.soreness || c.soreness.length === 0) return 'none';
    return c.soreness.join(', ');
  });
  const sorenessHistory = `Soreness in last 4 days is – ${sorenessParts.join(', ')}`;

  // Simple streak detection: if same body part appears in consecutive days
  // We flatten the days. If 'legs' is in day 1 and day 2, that's a streak of 2.
  // We track streaks per body part.
  const sorenessStreaks: { area: string; length: number; isRedFlag: boolean }[] = [];
  
  // Get all unique body parts mentioned
  const allParts = Array.from(new Set(last4.flatMap(c => c.soreness || [])));
  
  for (const part of allParts) {
    let currentStreak = 0;
    let maxStreak = 0;
    // Check each day
    for (const day of last4) {
      if (day.soreness?.includes(part)) {
        currentStreak++;
      } else {
        maxStreak = Math.max(maxStreak, currentStreak);
        currentStreak = 0;
      }
    }
    maxStreak = Math.max(maxStreak, currentStreak);
    
    if (maxStreak >= 3) {
      sorenessStreaks.push({
        area: part,
        length: maxStreak,
        isRedFlag: true // >3 days is flagged
      });
    }
  }

  // --- Digestion History & Streaks ---
  const digestionStates = last4.map(c => c.digestion || 'Normal');
  const digestionHistory = `Digestion in last 4 days is – ${digestionStates.join(', ')}`;
  
  const digestionStreaks: { state: string; length: number; isRedFlag: boolean }[] = [];
  // Check for streaks of same state
  if (digestionStates.length > 0) {
    let currentRun = 1;
    let currentState = digestionStates[0];
    
    for (let i = 1; i < digestionStates.length; i++) {
      if (digestionStates[i] === currentState) {
        currentRun++;
      } else {
        if (currentRun >= 3 && currentState !== 'Normal') {
           digestionStreaks.push({ state: currentState, length: currentRun, isRedFlag: true });
        }
        currentState = digestionStates[i];
        currentRun = 1;
      }
    }
    // Check last run
    if (currentRun >= 3 && currentState !== 'Normal') {
        digestionStreaks.push({ state: currentState, length: currentRun, isRedFlag: true });
    }
  }

  // --- Weight Trend (Last 7 Days) ---
  const last7 = sortedCheckins.slice(-7);
  const weightPoints = last7
    .map(c => ({ date: c.date, weight: c.currentWeight ?? c.bodyWeight }))
    .filter(p => p.weight !== undefined && p.weight !== null) as { date: string; weight: number }[];

  let deltaKg = 0;
  let direction: 'up' | 'down' | 'flat' = 'flat';
  let recommendedCalorieDelta = 0;

  if (weightPoints.length >= 2) {
    const start = weightPoints[0].weight;
    const end = weightPoints[weightPoints.length - 1].weight;
    deltaKg = parseFloat((end - start).toFixed(2));

    // Define flat as within 0.2kg fluctuation
    if (Math.abs(deltaKg) < 0.2) {
      direction = 'flat';
    } else {
      direction = deltaKg > 0 ? 'up' : 'down';
    }

    const goal = user.goal; // WEIGHT_LOSS, MUSCLE_GAIN, etc.

    // "If the weight is the same or not moving towards the goal, then change it... maybe add/subtract ~100 calories"
    if (goal === 'WEIGHT_LOSS') {
        if (direction === 'flat' || direction === 'up') {
            recommendedCalorieDelta = -100; 
        }
    } else if (goal === 'MUSCLE_GAIN') {
        if (direction === 'flat' || direction === 'down') {
            recommendedCalorieDelta = 100;
        }
    }
    // For other goals, maybe neutral? strict logic requested mainly for weight direction
  }

  return {
    scores: currentScores,
    ema,
    sorenessHistory,
    sorenessStreaks,
    digestionHistory,
    digestionStreaks,
    weightTrend: {
      last7Days: weightPoints,
      deltaKg,
      direction,
      recommendedCalorieDelta,
    },
  };
};

// ============================================================================
// YESTERDAY SNAPSHOT LAYER
// ============================================================================

// Health-related keywords to parse from specialRequest
const HEALTH_KEYWORDS = [
  'sore throat', 'cold', 'fever', 'sick', 'headache', 'nausea', 'flu',
  'cough', 'congestion', 'fatigue', 'tired', 'exhausted', 'migraine',
  'stomach', 'digestive', 'cramps', 'pain', 'injury', 'injured',
  'pulled muscle', 'strain', 'sprain', 'ache', 'unwell', 'ill',
];

// Lifestyle-related keywords to parse from specialRequest
const LIFESTYLE_KEYWORDS = [
  'travel', 'traveling', 'travelling', 'trip', 'flight',
  'busy', 'hectic', 'stressful', 'work', 'deadline',
  'rest day', 'recovery day', 'deload', 'light day',
  'celebration', 'party', 'event', 'wedding', 'birthday',
  'vacation', 'holiday', 'weekend',
];

/**
 * Parse health notes from a specialRequest string
 */
function parseHealthNote(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  
  for (const keyword of HEALTH_KEYWORDS) {
    if (lower.includes(keyword)) {
      // Extract a clean phrase around the keyword
      const idx = lower.indexOf(keyword);
      const start = Math.max(0, idx - 10);
      const end = Math.min(text.length, idx + keyword.length + 15);
      let snippet = text.slice(start, end).trim();
      
      // Clean up the snippet
      if (start > 0) snippet = '...' + snippet;
      if (end < text.length) snippet = snippet + '...';
      
      // Return just the keyword for cleaner output
      return keyword;
    }
  }
  return undefined;
}

/**
 * Parse lifestyle notes from a specialRequest string
 */
function parseLifestyleNote(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  
  for (const keyword of LIFESTYLE_KEYWORDS) {
    if (lower.includes(keyword)) {
      // Map to clean descriptors
      if (keyword.includes('travel') || keyword === 'trip' || keyword === 'flight') {
        return 'travel day';
      }
      if (keyword === 'busy' || keyword === 'hectic' || keyword === 'stressful' || keyword === 'deadline') {
        return 'very busy day';
      }
      if (keyword.includes('rest') || keyword.includes('recovery') || keyword === 'deload' || keyword === 'light day') {
        return 'rest day';
      }
      if (keyword === 'celebration' || keyword === 'party' || keyword === 'event' || keyword === 'wedding' || keyword === 'birthday') {
        return 'special event';
      }
      if (keyword === 'vacation' || keyword === 'holiday') {
        return 'vacation';
      }
      return keyword;
    }
  }
  return undefined;
}

/**
 * Determine workout status from a daily plan
 */
function getWorkoutStatus(plan: DailyPlan | undefined): 'completed' | 'partial' | 'skipped' | undefined {
  if (!plan) return undefined;
  
  // Check adherence if available
  if (plan.adherence !== undefined) {
    if (plan.adherence >= 80) return 'completed';
    if (plan.adherence >= 30) return 'partial';
    if (plan.adherence === 0) return 'skipped';
  }
  
  // If no adherence data, we can't determine status
  return undefined;
}

/**
 * Determine nutrition status from a daily plan
 */
function getNutritionStatus(plan: DailyPlan | undefined): 'on_target' | 'under' | 'over' | 'unknown' {
  if (!plan || !plan.nutrition) return 'unknown';
  
  // Would need food log data to determine actual adherence
  // For now, return unknown if we don't have that data
  return 'unknown';
}

/**
 * Build the Yesterday Snapshot context
 * 
 * @param recentCheckins - Array of recent check-ins (should include yesterday's if available)
 * @param recentPlans - Array of recent daily plans (to check workout/nutrition adherence)
 * @param todayDate - Today's date string (YYYY-MM-DD format)
 */
export function buildLastDayContext(
  recentCheckins: CheckinData[],
  recentPlans: DailyPlan[] = [],
  todayDate?: string,
  yesterdayCompletedSupplements: string[] = []
): LastDayContext {
  const today = todayDate || new Date().toISOString().split('T')[0];
  const todayMs = new Date(today).getTime();
  
  // Sort check-ins by date descending (most recent first)
  const sortedCheckins = [...recentCheckins].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  // Find the most recent check-in that's NOT today
  const pastCheckins = sortedCheckins.filter(c => c.date !== today);
  const lastCheckin = pastCheckins.length > 0 ? pastCheckins[0] : null;
  
  // Calculate days since last check-in
  let daysSinceLastCheckin = 0;
  let lastCheckinDate: string | null = null;
  
  if (lastCheckin) {
    lastCheckinDate = lastCheckin.date;
    const lastMs = new Date(lastCheckin.date).getTime();
    daysSinceLastCheckin = Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24));
  } else {
    // No previous check-ins at all
    daysSinceLastCheckin = 999; // Large number to indicate no history
  }
  
  const hadCheckinYesterday = daysSinceLastCheckin === 1;
  
  // Find yesterday's plan for workout/nutrition status
  const yesterdayDate = new Date(todayMs - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const yesterdayPlan = recentPlans.find(p => p.date === yesterdayDate);
  
  // Parse health and lifestyle notes from yesterday's check-in
  const yesterdayCheckin = pastCheckins.find(c => c.date === yesterdayDate);
  const healthNote = parseHealthNote(yesterdayCheckin?.specialRequest);
  const lifestyleNote = parseLifestyleNote(yesterdayCheckin?.specialRequest);
  
  // Get yesterday's AI-generated highlights if available
  const yesterdayHighlights = yesterdayPlan?.dailyHighlights;
  
  // Determine supplements status
  const yesterdaySupplementsStatus: 'taken' | 'skipped' | 'unknown' = 
    yesterdayCompletedSupplements.length > 0 ? 'taken' : 'unknown';

  return {
    lastCheckinDate,
    daysSinceLastCheckin,
    hadCheckinYesterday,
    yesterdayWorkoutStatus: getWorkoutStatus(yesterdayPlan),
    yesterdayNutritionStatus: getNutritionStatus(yesterdayPlan),
    yesterdaySupplementsStatus,
    yesterdayCompletedSupplements,
    healthNote,
    lifestyleNote,
    yesterdaySpecialRequest: yesterdayCheckin?.specialRequest || null,
    yesterdayHighlights,
  };
}

