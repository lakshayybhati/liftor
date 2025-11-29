export type Goal = 'WEIGHT_LOSS' | 'MUSCLE_GAIN' | 'ENDURANCE' | 'GENERAL_FITNESS' | 'FLEXIBILITY_MOBILITY';

export type CheckinMode = 'LOW' | 'HIGH' | 'PRO';

export type Equipment = 'Dumbbells' | 'Bands' | 'Bodyweight' | 'Gym';

export type DietaryPref = 'Vegetarian' | 'Eggitarian' | 'Non-veg';

export type Sex = 'Male' | 'Female';

export type ActivityLevel = 'Sedentary' | 'Lightly Active' | 'Moderately Active' | 'Very Active' | 'Extra Active';

export type WorkoutIntensity = 'Optimal' | 'Ego lifts' | 'Recovery focused';

export type TrainingLevel = 'Beginner' | 'Intermediate' | 'Professional';

export interface User {
  id: string;
  name: string;
  goal: Goal;
  equipment: Equipment[];
  dietaryPrefs: DietaryPref[];
  dietaryNotes?: string; // Optional: foods to prefer/avoid
  trainingDays: number;
  timezone: string;
  onboardingComplete: boolean;
  // Body stats for BMR/TDEE calculation
  age?: number;
  sex?: Sex;
  height?: number; // in cm
  weight?: number; // in kg
  activityLevel?: ActivityLevel;
  dailyCalorieTarget?: number; // Computed TDEE or user-adjusted
  // Optional supplementation & personal needs
  supplements?: string[]; // Current supplements
  supplementNotes?: string; // Additional supplement info
  personalGoals?: string[]; // e.g., "bigger arms", "better sleep"
  perceivedLacks?: string[]; // e.g., "protein intake", "recovery"
  // New specifics fields
  trainingStylePreferences?: string[];
  avoidExercises?: string[];
  preferredTrainingTime?: string;
  sessionLength?: number; // in minutes
  travelDays?: number; // days per month
  fastingWindow?: string; // e.g., "16:8", "18:6"
  mealCount?: number; // 1-8 meals per day
  injuries?: string;
  budgetConstraints?: string;
  wakeTime?: string;
  sleepTime?: string;
  stepTarget?: number;
  caffeineFrequency?: string;
  alcoholFrequency?: string;
  // Daily check-in reminder time in human format, e.g., "9:00 AM"
  checkInReminderTime?: string;
  stressBaseline?: number; // 1-10
  sleepQualityBaseline?: number; // 1-10
  preferredWorkoutSplit?: string;
  specialRequests?: string;
  // Temporary, request-specific instructions when regenerating the weekly base plan
  planRegenerationRequest?: string;
  vmnTranscription?: string; // VMN Transcription value
  workoutIntensity?: WorkoutIntensity; // Workout intensity preference
  // Numeric slider-based intensity (1-10) used for plan fine-tuning
  // 1 = very light effort per workout, 10 = maximum intensity per workout
  workoutIntensityLevel?: number;
  // Training experience level
  trainingLevel?: TrainingLevel; // Beginner (<1yr), Intermediate (1-3yrs), Professional (>3yrs)
  // Weight tracking
  goalWeight?: number; // in kg
  // Base plan storage
  basePlan?: WeeklyBasePlan;
  // Base Plan Management - regeneration enforcement
  lastBasePlanGeneratedAt?: string; // ISO timestamp for 2-week enforcement
}

export interface CheckinData {
  id: string;
  mode: CheckinMode;
  date: string;
  bodyWeight?: number;
  currentWeight?: number; // in kg - for PRO mode weight tracking
  specialRequest?: string; // free-text request (PRO mode)
  mood?: string | number; // Support both emoji string and 1-5 numeric scale
  moodCharacter?: string;
  energy?: number;
  sleepHrs?: number;
  sleepQuality?: number;
  wokeFeeling?: 'Tired' | 'Refreshed' | 'Wired';
  soreness?: string[];
  appearance?: 'Flat' | 'Full' | 'Dry' | 'Smooth';
  digestion?: 'Heavy' | 'Normal' | 'Light';
  stress?: number;
  waterL?: number;
  saltYN?: boolean;
  suppsYN?: boolean;
  steps?: number;
  kcalEst?: number;
  caffeineYN?: boolean;
  alcoholYN?: boolean;
  motivation?: number;
  hr?: number;
  hrv?: number;
  injuries?: string;
  busyBlocks?: { start: string; end: string; reason: string }[];
  travelYN?: boolean;
  workoutIntensity?: number; // Workout intensity slider value (1-10)
  yesterdayWorkoutQuality?: number; // 1-10 rating of yesterday's workout
}

export interface WorkoutPlan {
  focus: string[];
  blocks: {
    name: string;
    items: {
      exercise?: string;
      type?: string;
      sets?: number;
      reps?: string;
      RIR?: number;
      duration_min?: number;
    }[];
  }[];
  intensity?: string;
  notes?: string;
}

export interface NutritionPlan {
  total_kcal: number;
  protein_g: number;
  meals_per_day?: number;
  meals: {
    name: string;
    items: {
      food: string;
      qty: string;
    }[];
  }[];
  hydration_l: number;
}

export interface RecoveryPlan {
  mobility: string[];
  sleep: string[];
  // Optional personalized care content
  careNotes?: string; // human-friendly paragraph with very specific advice
  supplements?: string[]; // suggested supplements (safe, general guidance)
  // UI-level structured card for supplements: current + add-ons
  supplementCard?: {
    current: string[]; // from onboarding user.supplements
    addOns: string[];  // recommended with timing cues
  };
}

export interface DailyPlan {
  id: string;
  date: string;
  workout: WorkoutPlan;
  nutrition: NutritionPlan;
  recovery: RecoveryPlan;
  motivation: string;
  adherence?: number;
  adjustments?: string[]; // List of adjustments made from base plan (workout-focused)
  nutritionAdjustments?: string[]; // List of nutrition-specific adjustments based on check-in
  memoryAdjustments?: string[]; // List of specific memory-based adjustments
  flags?: string[]; // AI-generated flags for specific conditions (e.g., LOW_SLEEP_TREND)
  dailyHighlights?: string; // Short paragraph summarizing the day for memory storage
  isFromBasePlan?: boolean;
  isAiAdjusted?: boolean;
  memorySnapshot?: TrendMemory;
}

export interface TrendMemory {
  scores: {
    sleep: number;
    energy: number;
    water: number;
    stress: number;
  };
  ema: {
    sleep: number;
    energy: number;
    water: number;
    stress: number;
  };
  sorenessHistory: string;
  sorenessStreaks: {
    area: string;
    length: number;
    isRedFlag: boolean;
  }[];
  digestionHistory: string;
  digestionStreaks: {
    state: string;
    length: number;
    isRedFlag: boolean;
  }[];
  weightTrend: {
    last7Days: { date: string; weight: number }[];
    deltaKg: number;
    direction: 'up' | 'down' | 'flat';
    recommendedCalorieDelta: number;
  };
}

/**
 * Yesterday Snapshot Layer
 * Provides a crisp, one-day conclusion context that complements the EMA trends.
 * Captures what happened (or didn't happen) in the last 1-3 days.
 */
export interface LastDayContext {
  lastCheckinDate: string | null;
  daysSinceLastCheckin: number;        // 0 = today, 1 = yesterday, 3 = they vanished 3 days
  hadCheckinYesterday: boolean;

  // Behaviour
  yesterdayWorkoutStatus?: 'completed' | 'partial' | 'skipped';
  yesterdayNutritionStatus?: 'on_target' | 'under' | 'over' | 'unknown';
  yesterdaySupplementsStatus?: 'taken' | 'skipped' | 'unknown';
  yesterdayCompletedSupplements?: string[];

  // Notes / symptoms parsed from free text
  healthNote?: string;                 // e.g. "sore throat", "mild cold", "headache"
  lifestyleNote?: string;              // e.g. "travel day", "very busy day"

  // Copy yesterday's specialRequest if it matters
  yesterdaySpecialRequest?: string | null;

  // AI-generated summary of yesterday's session (from dailyHighlights)
  yesterdayHighlights?: string;        // Short paragraph summary of previous day
}

export interface WeeklyBasePlan {
  id: string;
  createdAt: string;
  days: {
    [key: string]: { // 'monday', 'tuesday', etc.
      workout: WorkoutPlan;
      nutrition: NutritionPlan;
      recovery: RecoveryPlan;
      reason?: string; // brief explanation for why this day's plan fits the user
    };
  };
  isLocked?: boolean;
  expectedWeeksToGoal?: number;
  isGenerating?: boolean;
  generationProgress?: number; // 1-7
  editCount?: number;
  // Per-day edit counters to limit how often each day can be modified
  editCounts?: {
    [dayKey: string]: number;
  };
  // Base Plan Management fields
  name?: string;              // User-editable name, defaults to "Plan - {date}"
  isActive?: boolean;         // Whether this plan is currently in use
  activatedAt?: string;       // ISO timestamp when plan was activated
  deactivatedAt?: string;     // ISO timestamp when plan was deactivated
  stats?: {
    weightChangeKg?: number;  // Weight change during active period
    consistencyPercent?: number; // Avg adherence during active period
    daysActive?: number;      // Total days this plan was active
  };
}