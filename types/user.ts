export type Goal = 'WEIGHT_LOSS' | 'MUSCLE_GAIN' | 'ENDURANCE' | 'GENERAL_FITNESS' | 'FLEXIBILITY_MOBILITY';

export type CheckinMode = 'LOW' | 'HIGH' | 'PRO';

export type Equipment = 'Dumbbells' | 'Bands' | 'Bodyweight' | 'Gym';

export type DietaryPref = 'Vegetarian' | 'Eggitarian' | 'Non-veg';

export type Sex = 'Male' | 'Female';

export type ActivityLevel = 'Sedentary' | 'Lightly Active' | 'Moderately Active' | 'Very Active' | 'Extra Active';

export type WorkoutIntensity = 'Optimal' | 'Ego lifts' | 'Recovery focused';

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
  preferredExercises?: string[];
  avoidExercises?: string[];
  preferredTrainingTime?: string;
  sessionLength?: number; // in minutes
  travelDays?: number; // days per month
  fastingWindow?: string; // e.g., "16:8", "18:6"
  mealCount?: number; // 3-6 meals per day
  injuries?: string;
  budgetConstraints?: string;
  wakeTime?: string;
  sleepTime?: string;
  stepTarget?: number;
  caffeineFrequency?: string;
  alcoholFrequency?: string;
  stressBaseline?: number; // 1-10
  sleepQualityBaseline?: number; // 1-10
  preferredWorkoutSplit?: string;
  specialRequests?: string;
  vmnTranscription?: string; // VMN Transcription value
  workoutIntensity?: WorkoutIntensity; // Workout intensity preference
  // Weight tracking
  goalWeight?: number; // in kg
  // Base plan storage
  basePlan?: WeeklyBasePlan;
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
  busyBlocks?: {start: string; end: string; reason: string}[];
  travelYN?: boolean;
  workoutIntensity?: number; // Workout intensity slider value (1-10)
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
  notes?: string;
}

export interface NutritionPlan {
  total_kcal: number;
  protein_g: number;
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
}

export interface DailyPlan {
  id: string;
  date: string;
  workout: WorkoutPlan;
  nutrition: NutritionPlan;
  recovery: RecoveryPlan;
  motivation: string;
  adherence?: number;
  adjustments?: string[]; // List of adjustments made from base plan
  isFromBasePlan?: boolean;
}

export interface WeeklyBasePlan {
  id: string;
  createdAt: string;
  days: {
    [key: string]: { // 'monday', 'tuesday', etc.
      workout: WorkoutPlan;
      nutrition: NutritionPlan;
      recovery: RecoveryPlan;
    };
  };
  isLocked?: boolean;
}