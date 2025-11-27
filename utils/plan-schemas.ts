import { z } from 'zod';
import type { User } from '@/types/user';

// Exercise schema
export const ExerciseSchema = z.object({
  exercise: z.string().min(1, "Exercise name is required"),
  sets: z.number().int().min(1).max(10),
  reps: z.string().min(1, "Reps specification is required"),
  RIR: z.number().int().min(0).max(5),
  duration_min: z.number().optional(),
});

// Workout block schema
export const WorkoutBlockSchema = z.object({
  name: z.string().min(1, "Block name is required"),
  items: z.array(ExerciseSchema).min(1, "Block must have at least one exercise"),
});

// Workout schema
export const WorkoutSchema = z.object({
  focus: z.array(z.string()).min(1, "Workout must have at least one focus area"),
  blocks: z.array(WorkoutBlockSchema).min(1, "Workout must have at least one block"),
  notes: z.string().optional(),
});

// Food item schema
export const FoodItemSchema = z.object({
  food: z.string().min(1, "Food name is required"),
  qty: z.string().min(1, "Quantity is required"),
});

// Meal schema
export const MealSchema = z.object({
  name: z.string().min(1, "Meal name is required"),
  items: z.array(FoodItemSchema).min(1, "Meal must have at least one food item"),
});

// Nutrition schema
export const NutritionSchema = z.object({
  total_kcal: z.number().int().min(1000).max(6000),
  protein_g: z.number().int().min(50).max(400),
  meals: z.array(MealSchema).min(1, "Must have at least one meal"),
  hydration_l: z.number().min(1).max(6),
});

// Recovery schema
export const SupplementCardSchema = z.object({
  current: z.array(z.string()).default([]),
  addOns: z.array(z.string()).default([]),
  optimizeNotes: z.array(z.string()).optional(),
});

export const RecoverySchema = z.object({
  mobility: z.array(z.string()).min(1, "Must have at least one mobility tip"),
  sleep: z.array(z.string()).min(1, "Must have at least one sleep tip"),
  supplements: z.array(z.string()).optional(),
  careNotes: z.string().optional(),
  supplementCard: SupplementCardSchema.optional(),
});

// Daily plan schema
export const DayPlanSchema = z.object({
  workout: WorkoutSchema,
  nutrition: NutritionSchema,
  recovery: RecoverySchema,
  reason: z.string().min(1, "Reason is required"),
});

// Weekly base plan schema
export const WeeklyBasePlanSchema = z.object({
  days: z.object({
    monday: DayPlanSchema,
    tuesday: DayPlanSchema,
    wednesday: DayPlanSchema,
    thursday: DayPlanSchema,
    friday: DayPlanSchema,
    saturday: DayPlanSchema,
    sunday: DayPlanSchema,
  }),
});

// Daily plan response schema (with additional fields)
export const DailyPlanResponseSchema = DayPlanSchema.omit({ reason: true }).extend({
  reason: z.string().optional(),
  motivation: z.string().optional(),
  adjustments: z.array(z.string()).optional(),
});

// Type exports
export type Exercise = z.infer<typeof ExerciseSchema>;
export type WorkoutBlock = z.infer<typeof WorkoutBlockSchema>;
export type Workout = z.infer<typeof WorkoutSchema>;
export type FoodItem = z.infer<typeof FoodItemSchema>;
export type Meal = z.infer<typeof MealSchema>;
export type Nutrition = z.infer<typeof NutritionSchema>;
export type Recovery = z.infer<typeof RecoverySchema>;
export type DayPlan = z.infer<typeof DayPlanSchema>;
export type SupplementCard = z.infer<typeof SupplementCardSchema>;
export type WeeklyBasePlanData = z.infer<typeof WeeklyBasePlanSchema>;
export type DailyPlanResponse = z.infer<typeof DailyPlanResponseSchema>;

/**
 * Validates a weekly base plan and returns detailed validation errors
 */
export function validateWeeklyPlan(data: unknown): {
  success: boolean;
  data?: WeeklyBasePlanData;
  errors?: string[];
} {
  try {
    const result = WeeklyBasePlanSchema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err: any) => 
        `${err.path.join('.')}: ${err.message}`
      );
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
}

/**
 * Validates a daily plan response and returns detailed validation errors
 */
export function validateDailyPlan(data: unknown): {
  success: boolean;
  data?: DailyPlanResponse;
  errors?: string[];
} {
  try {
    const result = DailyPlanResponseSchema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err: any) => 
        `${err.path.join('.')}: ${err.message}`
      );
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
}

/**
 * Attempts to fix common validation errors in plan data
 */
export function repairPlanData(data: any, targetCalories: number, targetProtein: number, user?: User): any {
  if (!data || typeof data !== 'object') return data;

  // Fix nutrition values
  if (data.nutrition) {
    data.nutrition.total_kcal = targetCalories;
    data.nutrition.protein_g = targetProtein;
    
    // Ensure hydration is valid
    if (typeof data.nutrition.hydration_l !== 'number' || data.nutrition.hydration_l < 1) {
      data.nutrition.hydration_l = 2.5;
    }

    // Ensure meals array exists
    if (!Array.isArray(data.nutrition.meals)) {
      data.nutrition.meals = [];
    }

    // Fix meals without items
    data.nutrition.meals = data.nutrition.meals.map((meal: any) => ({
      ...meal,
      items: Array.isArray(meal.items) ? meal.items : []
    }));
  }

  // Fix workout structure
  if (data.workout) {
    // Ensure focus is an array
    if (!Array.isArray(data.workout.focus)) {
      data.workout.focus = typeof data.workout.focus === 'string' 
        ? [data.workout.focus] 
        : ['Full Body'];
    }

    // Ensure blocks is an array
    if (!Array.isArray(data.workout.blocks)) {
      data.workout.blocks = [];
    }

    // Fix blocks without items
    data.workout.blocks = data.workout.blocks.map((block: any) => ({
      ...block,
      items: Array.isArray(block.items) ? block.items : []
    }));

    // Fix exercise items
    data.workout.blocks.forEach((block: any) => {
      block.items = block.items.map((item: any) => ({
        exercise: item.exercise || 'Exercise',
        sets: typeof item.sets === 'number' ? item.sets : 3,
        reps: item.reps || '8-12',
        RIR: typeof item.RIR === 'number' ? Math.min(Math.max(item.RIR, 0), 5) : 2
      }));
    });
  }

  // Fix recovery structure
  if (data.recovery) {
    data.recovery.mobility = Array.isArray(data.recovery.mobility) 
      ? data.recovery.mobility 
      : ['Stretching routine'];
    
    data.recovery.sleep = Array.isArray(data.recovery.sleep) 
      ? data.recovery.sleep 
      : ['7-8 hours recommended'];

    // Ensure supplementCard structure exists (but let AI decide the contents)
    if (!data.recovery.supplementCard) {
      data.recovery.supplementCard = {
        current: [],
        addOns: []
      };
    }
  }

  return data;
}
