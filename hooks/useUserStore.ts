import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { User, CheckinData, DailyPlan, WeeklyBasePlan, WorkoutPlan, NutritionPlan, RecoveryPlan } from '@/types/user';
import { useAuth } from '@/hooks/useAuth';

interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  mealType: string;
  timestamp: string;
}

interface ExtraFood {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  timestamp: string;
  confidence?: number;
  notes?: string;
  portionHint?: string;
  imageUri?: string;
}

interface DailyFoodLog {
  date: string;
  entries: FoodEntry[];
  extras: ExtraFood[];
  totalCalories: number;
  totalProtein: number;
  totalFat: number;
  totalCarbs: number;
}

interface PlanCompletionDay {
  date: string;
  completedMeals: string[];
  completedExercises: string[];
}

// Base storage keys (now namespaced per Supabase user below)
const USER_STORAGE_KEY = 'Liftor_user';
const CHECKINS_STORAGE_KEY = 'Liftor_checkins';
const PLANS_STORAGE_KEY = 'Liftor_plans';
const BASE_PLANS_STORAGE_KEY = 'Liftor_base_plans';
const FOOD_LOG_STORAGE_KEY = 'Liftor_food_log';
const EXTRAS_STORAGE_KEY = 'Liftor_extras';
const COMPLETIONS_STORAGE_KEY = 'Liftor_plan_completions';

// Helper to namespace keys per-authenticated user to avoid cross-account leakage
const scopedKey = (base: string, userId: string | null | undefined) => `${base}:${userId ?? 'anon'}`;

export const [UserProvider, useUserStore] = createContextHook(() => {
  const { session, supabase } = useAuth();
  const uid = session?.user?.id ?? null;
  const KEYS = {
    USER: scopedKey(USER_STORAGE_KEY, uid),
    CHECKINS: scopedKey(CHECKINS_STORAGE_KEY, uid),
    PLANS: scopedKey(PLANS_STORAGE_KEY, uid),
    BASE_PLANS: scopedKey(BASE_PLANS_STORAGE_KEY, uid),
    FOOD_LOG: scopedKey(FOOD_LOG_STORAGE_KEY, uid),
    EXTRAS: scopedKey(EXTRAS_STORAGE_KEY, uid),
    COMPLETIONS: scopedKey(COMPLETIONS_STORAGE_KEY, uid),
  } as const;
  const [user, setUser] = useState<User | null>(null);
  const [checkins, setCheckins] = useState<CheckinData[]>([]);
  const [plans, setPlans] = useState<DailyPlan[]>([]);
  const [basePlans, setBasePlans] = useState<WeeklyBasePlan[]>([]);
  const [foodLogs, setFoodLogs] = useState<DailyFoodLog[]>([]);
  const [extras, setExtras] = useState<ExtraFood[]>([]);
  const [completionsByDate, setCompletionsByDate] = useState<Record<string, PlanCompletionDay>>({});
  const [isLoading, setIsLoading] = useState(true);

  const loadUserData = useCallback(async () => {
    try {
      // Migrate legacy keys if present
      const legacy = {
        user: 'fitcoach_user',
        checkins: 'fitcoach_checkins',
        plans: 'fitcoach_plans',
        basePlans: 'fitcoach_base_plans',
        foodLog: 'fitcoach_food_log',
        extras: 'fitcoach_extras',
      } as const;

      // Move values from legacy FitCoach keys to old Liftor generic keys if new was empty (pre-namespace)
      const [oldLiftorUser, legacyUser] = await Promise.all([
        AsyncStorage.getItem(USER_STORAGE_KEY),
        AsyncStorage.getItem(legacy.user),
      ]);
      if (!oldLiftorUser && legacyUser) {
        await AsyncStorage.setItem(USER_STORAGE_KEY, legacyUser);
      }

      // Namespace migration: if generic Liftor_user belongs to this uid, migrate it to namespaced key
      try {
        const genericUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
        const scopedUser = await AsyncStorage.getItem(KEYS.USER);
        if (!scopedUser && genericUser) {
          const parsed = JSON.parse(genericUser);
          if (parsed && typeof parsed === 'object' && parsed.id && parsed.id === uid) {
            await AsyncStorage.setItem(KEYS.USER, genericUser);
          }
        }
      } catch {}

      // Optionally clean up old keys (non-destructive if migration succeeded)
      await Promise.all([
        AsyncStorage.removeItem(legacy.user),
        AsyncStorage.removeItem(legacy.checkins),
        AsyncStorage.removeItem(legacy.plans),
        AsyncStorage.removeItem(legacy.basePlans),
        AsyncStorage.removeItem(legacy.foodLog),
        AsyncStorage.removeItem(legacy.extras),
      ]).catch(() => {});

      const [userData, checkinsData, plansData, basePlansData, foodLogsData, extrasData, completionsData] = await Promise.all([
        AsyncStorage.getItem(KEYS.USER),
        AsyncStorage.getItem(KEYS.CHECKINS),
        AsyncStorage.getItem(KEYS.PLANS),
        AsyncStorage.getItem(KEYS.BASE_PLANS),
        AsyncStorage.getItem(KEYS.FOOD_LOG),
        AsyncStorage.getItem(KEYS.EXTRAS),
        AsyncStorage.getItem(KEYS.COMPLETIONS),
      ]);

      if (userData && userData.trim().startsWith('{') && userData.trim().endsWith('}')) {
        try {
          const parsed = JSON.parse(userData);
          if (parsed && typeof parsed === 'object') {
            // Map legacy "None" to "Non-veg" for backward compatibility
            if (parsed.dietaryPrefs && Array.isArray(parsed.dietaryPrefs)) {
              parsed.dietaryPrefs = parsed.dietaryPrefs.map((p: string) => 
                p === 'None' ? 'Non-veg' : p
              );
            }
            setUser(parsed);
          }
        } catch (e) {
          console.error('Error parsing user data, clearing corrupted data:', e);
          await AsyncStorage.removeItem(KEYS.USER);
        }
      } else if (userData) {
        console.warn('Invalid user data format, clearing:', userData.substring(0, 100));
        await AsyncStorage.removeItem(KEYS.USER);
      }
      if (checkinsData && checkinsData.trim().startsWith('[') && checkinsData.trim().endsWith(']')) {
        try {
          const parsed = JSON.parse(checkinsData);
          if (Array.isArray(parsed)) {
            setCheckins(parsed);
          }
        } catch (e) {
          console.error('Error parsing checkins data, clearing corrupted data:', e);
          await AsyncStorage.removeItem(KEYS.CHECKINS);
        }
      } else if (checkinsData) {
        console.warn('Invalid checkins data format, clearing:', checkinsData.substring(0, 100));
        await AsyncStorage.removeItem(KEYS.CHECKINS);
      }
      if (plansData && plansData.trim().startsWith('[') && plansData.trim().endsWith(']')) {
        try {
          const parsed = JSON.parse(plansData);
          if (Array.isArray(parsed)) {
            setPlans(parsed);
          }
        } catch (e) {
          console.error('Error parsing plans data, clearing corrupted data:', e);
          await AsyncStorage.removeItem(KEYS.PLANS);
        }
      } else if (plansData) {
        console.warn('Invalid plans data format, clearing:', plansData.substring(0, 100));
        await AsyncStorage.removeItem(KEYS.PLANS);
      }
      if (basePlansData && basePlansData.trim().startsWith('[') && basePlansData.trim().endsWith(']')) {
        try {
          const parsed = JSON.parse(basePlansData);
          if (Array.isArray(parsed)) {
            setBasePlans(parsed);
          }
        } catch (e) {
          console.error('Error parsing base plans data, clearing corrupted data:', e);
          await AsyncStorage.removeItem(KEYS.BASE_PLANS);
        }
      } else if (basePlansData) {
        console.warn('Invalid base plans data format, clearing:', basePlansData.substring(0, 100));
        await AsyncStorage.removeItem(KEYS.BASE_PLANS);
      }
      if (foodLogsData && foodLogsData.trim().startsWith('[') && foodLogsData.trim().endsWith(']')) {
        try {
          const parsed = JSON.parse(foodLogsData);
          if (Array.isArray(parsed)) {
            // Migrate old food logs to include extras array
            const migratedLogs = parsed.map(log => ({
              ...log,
              extras: log.extras || []
            }));
            setFoodLogs(migratedLogs);
          }
        } catch (e) {
          console.error('Error parsing food logs data, clearing corrupted data:', e);
          await AsyncStorage.removeItem(KEYS.FOOD_LOG);
        }
      } else if (foodLogsData) {
        console.warn('Invalid food logs data format, clearing:', foodLogsData.substring(0, 100));
        await AsyncStorage.removeItem(KEYS.FOOD_LOG);
      }
      if (extrasData && extrasData.trim().startsWith('[') && extrasData.trim().endsWith(']')) {
        try {
          const parsed = JSON.parse(extrasData);
          if (Array.isArray(parsed)) {
            setExtras(parsed);
          }
        } catch (e) {
          console.error('Error parsing extras data, clearing corrupted data:', e);
          await AsyncStorage.removeItem(KEYS.EXTRAS);
        }
      } else if (extrasData) {
        console.warn('Invalid extras data format, clearing:', extrasData.substring(0, 100));
        await AsyncStorage.removeItem(KEYS.EXTRAS);
      }

      // Load completions map
      if (completionsData && completionsData.trim().startsWith('{') && completionsData.trim().endsWith('}')) {
        try {
          const parsed = JSON.parse(completionsData);
          if (parsed && typeof parsed === 'object') {
            setCompletionsByDate(parsed);
          }
        } catch (e) {
          console.error('Error parsing completions data, clearing corrupted data:', e);
          await AsyncStorage.removeItem(KEYS.COMPLETIONS);
        }
      } else if (completionsData) {
        console.warn('Invalid completions data format, clearing:', completionsData.substring(0, 100));
        await AsyncStorage.removeItem(KEYS.COMPLETIONS);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [KEYS.USER, KEYS.CHECKINS, KEYS.PLANS, KEYS.BASE_PLANS, KEYS.FOOD_LOG, KEYS.EXTRAS, uid]);

  // Reload scoped data whenever the authenticated user changes
  useEffect(() => {
    // Reset in-memory state immediately to avoid showing previous user's data
    setUser(null);
    setCheckins([]);
    setPlans([]);
    setBasePlans([]);
    setFoodLogs([]);
    setExtras([]);
    setIsLoading(true);
    loadUserData();
  }, [uid, loadUserData]);

  const updateUser = useCallback(async (userData: User) => {
    if (!userData?.id) return;
    try {
      setUser(userData);
      await AsyncStorage.setItem(KEYS.USER, JSON.stringify(userData));
    } catch (error) {
      console.error('Error saving user data:', error);
    }
  }, [KEYS.USER]);

  const addCheckin = useCallback(async (checkin: CheckinData) => {
    try {
      const updatedCheckins = [...checkins, checkin];
      setCheckins(updatedCheckins);
      await AsyncStorage.setItem(KEYS.CHECKINS, JSON.stringify(updatedCheckins));
    } catch (error) {
      console.error('Error saving checkin:', error);
    }
  }, [checkins, KEYS.CHECKINS]);

  const addPlan = useCallback(async (plan: DailyPlan) => {
    try {
      // Upsert by date to avoid duplicates when generation runs twice
      const idx = plans.findIndex(p => p.date === plan.date);
      let updatedPlans: DailyPlan[];
      if (idx >= 0) {
        updatedPlans = [...plans];
        updatedPlans[idx] = plan;
      } else {
        updatedPlans = [...plans, plan];
      }
      setPlans(updatedPlans);
      await AsyncStorage.setItem(KEYS.PLANS, JSON.stringify(updatedPlans));
    } catch (error) {
      console.error('Error saving plan:', error);
    }
  }, [plans, KEYS.PLANS]);

  const addBasePlan = useCallback(async (basePlan: WeeklyBasePlan) => {
    try {
      const updatedBasePlans = [...basePlans, basePlan];
      setBasePlans(updatedBasePlans);
      await AsyncStorage.setItem(KEYS.BASE_PLANS, JSON.stringify(updatedBasePlans));
    } catch (error) {
      console.error('Error saving base plan:', error);
    }
  }, [basePlans, KEYS.BASE_PLANS]);

  // Persist local data to Supabase so it is available after sign out
  const syncLocalToBackend = useCallback(async () => {
    if (!uid) {
      console.warn('[Sync] No user session; skipping backend sync');
      return { success: false, reason: 'no-session' };
    }
    try {
      // Upsert check-ins (unique by user_id + date)
      if (checkins.length > 0) {
        const rows = checkins.map((c) => ({
          user_id: uid,
          mode: c.mode,
          date: c.date,
          body_weight: c.bodyWeight ?? null,
          current_weight: c.currentWeight ?? null,
          mood: typeof c.mood === 'string' ? c.mood : String(c.mood ?? ''),
          mood_character: c.moodCharacter ?? null,
          energy: c.energy ?? null,
          sleep_hrs: c.sleepHrs ?? null,
          sleep_quality: c.sleepQuality ?? null,
          woke_feeling: c.wokeFeeling ?? null,
          soreness: c.soreness ?? [],
          appearance: c.appearance ?? null,
          digestion: c.digestion ?? null,
          stress: c.stress ?? null,
          water_l: c.waterL ?? null,
          salt_yn: c.saltYN ?? null,
          supps_yn: c.suppsYN ?? null,
          steps: c.steps ?? null,
          kcal_est: c.kcalEst ?? null,
          caffeine_yn: c.caffeineYN ?? null,
          alcohol_yn: c.alcoholYN ?? null,
          motivation: c.motivation ?? null,
          hr: c.hr ?? null,
          hrv: c.hrv ?? null,
          injuries: c.injuries ?? null,
          busy_blocks: c.busyBlocks ?? null,
          travel_yn: c.travelYN ?? null,
        }));
        const { error: upErr } = await supabase
          .from('checkins')
          .upsert(rows as any, { onConflict: 'user_id,date' });
        if (upErr) console.warn('[Sync] checkins upsert error', upErr);
      }

      // Upsert daily plans (unique by user_id + date)
      if (plans.length > 0) {
        const rows = plans.map((p) => ({
          user_id: uid,
          date: p.date,
          workout: p.workout ?? null,
          nutrition: p.nutrition ?? null,
          recovery: p.recovery ?? null,
          motivation: p.motivation ?? null,
          adherence: p.adherence ?? null,
          adjustments: p.adjustments ?? [],
          is_from_base_plan: p.isFromBasePlan ?? false,
        }));
        const { error: upErr } = await supabase
          .from('daily_plans')
          .upsert(rows as any, { onConflict: 'user_id,date' });
        if (upErr) console.warn('[Sync] daily_plans upsert error', upErr);
      }

      // Optionally persist the current base plan snapshot to profiles.base_plan
      try {
        const currentBase = getCurrentBasePlan();
        if (currentBase) {
          const { error: profErr } = await supabase
            .from('profiles')
            .update({ base_plan: currentBase as any })
            .eq('id', uid);
          if (profErr) console.warn('[Sync] profiles.base_plan update error', profErr);
        }
      } catch (e) {
        console.warn('[Sync] base_plan update exception', e);
      }

      return { success: true };
    } catch (e) {
      console.error('[Sync] Unexpected error during backend sync', e);
      return { success: false, reason: 'exception' };
    }
  }, [uid, supabase, checkins, plans, getCurrentBasePlan]);

  const getCurrentBasePlan = useCallback(() => {
    return basePlans.find(plan => !plan.isLocked) || basePlans[basePlans.length - 1];
  }, [basePlans]);

  const updateBasePlanDay = useCallback(async (dayKey: string, dayData: { workout: WorkoutPlan; nutrition: NutritionPlan; recovery: RecoveryPlan }) => {
    try {
      const currentBasePlan = getCurrentBasePlan();
      if (!currentBasePlan) {
        console.error('No current base plan found');
        return false;
      }

      // Create updated base plan with the modified day
      const updatedBasePlan = {
        ...currentBasePlan,
        days: {
          ...currentBasePlan.days,
          [dayKey]: dayData
        }
      };

      // Update the base plans array
      const updatedBasePlans = basePlans.map(plan => 
        plan.id === currentBasePlan.id ? updatedBasePlan : plan
      );

      setBasePlans(updatedBasePlans);
      await AsyncStorage.setItem(KEYS.BASE_PLANS, JSON.stringify(updatedBasePlans));
      
      console.log(`Successfully updated ${dayKey} in base plan`);
      return true;
    } catch (error) {
      console.error('Error updating base plan day:', error);
      return false;
    }
  }, [basePlans, getCurrentBasePlan]);

  const getRecentCheckins = useCallback((days: number = 15) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return checkins.filter(checkin => 
      new Date(checkin.date) >= cutoffDate
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [checkins]);

  const getTodayCheckin = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    return checkins.find(checkin => checkin.date === today);
  }, [checkins]);

  const getTodayPlan = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    // Ensure only one plan per day exists by collapsing duplicates if any slipped in
    const todays = plans.filter(plan => plan.date === today);
    if (todays.length <= 1) return todays[0];
    const [keep, ...dupes] = todays;
    // Remove duplicates and persist fix quietly
    const deduped = plans.filter(p => p.date !== today).concat(keep);
    setPlans(deduped);
    AsyncStorage.setItem(KEYS.PLANS, JSON.stringify(deduped)).catch(() => {});
    return keep;
  }, [plans]);

  const getStreak = useCallback(() => {
    let streak = 0;
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];
      
      const hasCheckin = checkins.some(checkin => checkin.date === dateStr);
      if (hasCheckin) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    
    return streak;
  }, [checkins]);

  const getWeightData = useCallback(() => {
    // Support both currentWeight (PRO mode) and legacy/bodyWeight fields
    return checkins
      .map(checkin => {
        const weightVal = (checkin.currentWeight ?? checkin.bodyWeight) as unknown as number | undefined;
        const weight = typeof weightVal === 'string' ? parseFloat(weightVal as any) : weightVal;
        if (weight === undefined || weight === null || Number.isNaN(weight)) return null as any;
        return { date: checkin.date, weight: Number(weight) };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [checkins]);

  const getLatestWeight = useCallback(() => {
    const weightData = getWeightData();
    return weightData.length > 0 ? weightData[weightData.length - 1].weight : null;
  }, [getWeightData]);

  const getWeightProgress = useCallback(() => {
    if (user?.goalWeight === undefined || user?.goalWeight === null) return null;

    // Prefer the latest tracked weight; fall back to profile weight if no check-ins yet
    const latestWeight = getLatestWeight();
    const current = latestWeight ?? (typeof user.weight === 'number' ? user.weight : null);
    if (current === null) return null;

    const goal = user.goalWeight as number;
    const remaining = Math.abs(current - goal);
    const isGaining = goal > current;

    // Compute progress toward goal using initial profile weight as baseline when available
    const start = typeof user.weight === 'number' ? user.weight : current;
    const totalDelta = Math.abs(start - goal);
    const achievedDelta = Math.abs(current - start);
    const progressPct = totalDelta > 0 ? Math.max(0, Math.min(100, (achievedDelta / totalDelta) * 100)) : 0;

    return {
      current,
      goal,
      remaining,
      isGaining,
      progress: progressPct,
    };
  }, [user, getLatestWeight]);

  // --- Persistent completion API ---
  const getCompletedMealsForDate = useCallback((date: string) => {
    return completionsByDate[date]?.completedMeals ?? [];
  }, [completionsByDate]);

  const getCompletedExercisesForDate = useCallback((date: string) => {
    return completionsByDate[date]?.completedExercises ?? [];
  }, [completionsByDate]);

  const persistCompletions = useCallback(async (next: Record<string, PlanCompletionDay>) => {
    setCompletionsByDate(next);
    try {
      await AsyncStorage.setItem(KEYS.COMPLETIONS, JSON.stringify(next));
    } catch (e) {
      console.error('Error saving completions to storage:', e);
    }
  }, [KEYS.COMPLETIONS]);

  const updatePlanAdherenceAndSync = useCallback(async (date: string) => {
    try {
      const plan = plans.find(p => p.date === date);
      if (!plan) return;

      const completedExercises = new Set(getCompletedExercisesForDate(date));
      const totalExercises = (plan.workout?.blocks || []).reduce((sum, b) => sum + (b.items?.length || 0), 0);
      const workoutComp = totalExercises > 0 ? Math.min(1, completedExercises.size / totalExercises) : 0;

      const mealCount = user?.mealCount || 3;
      const distMap: Record<number, number[]> = { 3: [0.3,0.4,0.3], 4: [0.25,0.15,0.35,0.25], 5: [0.25,0.125,0.35,0.1,0.275], 6: [0.2,0.1,0.3,0.1,0.25,0.05] };
      const mealTemplates = [ { mealType: 'breakfast' }, { mealType: 'morning_snack' }, { mealType: 'lunch' }, { mealType: 'afternoon_snack' }, { mealType: 'dinner' }, { mealType: 'evening_snack' } ];
      const selectedMeals = (mealCount === 3) ? [mealTemplates[0], mealTemplates[2], mealTemplates[4]] : (mealCount === 4) ? [mealTemplates[0], mealTemplates[1], mealTemplates[2], mealTemplates[4]] : (mealCount === 5) ? [mealTemplates[0], mealTemplates[1], mealTemplates[2], mealTemplates[3], mealTemplates[4]] : mealTemplates;
      const dist = distMap[mealCount as 3|4|5|6] || distMap[3];
      const totalCalTarget = plan.nutrition?.total_kcal || 2000;
      const completedMeals = new Set(getCompletedMealsForDate(date));
      const tickCalories = selectedMeals.reduce((sum, m, idx) => sum + (completedMeals.has(m.mealType) ? Math.round(totalCalTarget * dist[idx]) : 0), 0);
      const dayLog = foodLogs.find(l => l.date === date);
      const extrasCal = dayLog?.totalCalories || 0;
      const nutritionComp = Math.min(1, (tickCalories + extrasCal) / Math.max(1, totalCalTarget));

      const adherence = (workoutComp + nutritionComp) / 2;

      const idx = plans.findIndex(p => p.date === date);
      if (idx >= 0) {
        const updated = [...plans];
        updated[idx] = { ...updated[idx], adherence } as any;
        setPlans(updated);
        await AsyncStorage.setItem(KEYS.PLANS, JSON.stringify(updated));
      }

      if (uid) {
        try {
          await supabase.from('daily_plans').upsert({ user_id: uid, date, adherence } as any, { onConflict: 'user_id,date' });
        } catch (e) {
          console.warn('[Sync] adherence upsert failed', e);
        }
      }
    } catch (e) {
      console.error('Failed to compute/sync adherence:', e);
    }
  }, [plans, user?.mealCount, foodLogs, uid, supabase, KEYS.PLANS, getCompletedMealsForDate, getCompletedExercisesForDate]);

  const toggleMealCompleted = useCallback(async (date: string, mealType: string) => {
    const prev = completionsByDate[date] || { date, completedMeals: [], completedExercises: [] } as PlanCompletionDay;
    const nextMeals = new Set(prev.completedMeals);
    if (nextMeals.has(mealType)) nextMeals.delete(mealType); else nextMeals.add(mealType);
    const next = { ...completionsByDate, [date]: { ...prev, completedMeals: Array.from(nextMeals) } };
    await persistCompletions(next);
    updatePlanAdherenceAndSync(date);
  }, [completionsByDate, persistCompletions, updatePlanAdherenceAndSync]);

  const toggleExerciseCompleted = useCallback(async (date: string, exerciseId: string) => {
    const prev = completionsByDate[date] || { date, completedMeals: [], completedExercises: [] } as PlanCompletionDay;
    const nextSet = new Set(prev.completedExercises);
    if (nextSet.has(exerciseId)) nextSet.delete(exerciseId); else nextSet.add(exerciseId);
    const next = { ...completionsByDate, [date]: { ...prev, completedExercises: Array.from(nextSet) } };
    await persistCompletions(next);
    updatePlanAdherenceAndSync(date);
  }, [completionsByDate, persistCompletions, updatePlanAdherenceAndSync]);
  const getTodayFoodLog = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    return foodLogs.find(log => log.date === today);
  }, [foodLogs]);

  const addFoodEntry = useCallback(async (entry: Omit<FoodEntry, 'id' | 'timestamp'>) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const newEntry: FoodEntry = {
        ...entry,
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
      };

      const existingLogIndex = foodLogs.findIndex(log => log.date === today);
      let updatedFoodLogs: DailyFoodLog[];

      if (existingLogIndex >= 0) {
        // Update existing log
        const existingLog = foodLogs[existingLogIndex];
        const updatedEntries = [...existingLog.entries, newEntry];
        const updatedLog: DailyFoodLog = {
          date: today,
          entries: updatedEntries,
          extras: existingLog.extras || [],
          totalCalories: updatedEntries.reduce((sum, e) => sum + e.calories, 0) + (existingLog.extras || []).reduce((sum, e) => sum + e.calories, 0),
          totalProtein: updatedEntries.reduce((sum, e) => sum + e.protein, 0) + (existingLog.extras || []).reduce((sum, e) => sum + e.protein, 0),
          totalFat: updatedEntries.reduce((sum, e) => sum + e.fat, 0) + (existingLog.extras || []).reduce((sum, e) => sum + e.fat, 0),
          totalCarbs: updatedEntries.reduce((sum, e) => sum + e.carbs, 0) + (existingLog.extras || []).reduce((sum, e) => sum + e.carbs, 0),
        };
        
        updatedFoodLogs = [...foodLogs];
        updatedFoodLogs[existingLogIndex] = updatedLog;
      } else {
        // Create new log
        const newLog: DailyFoodLog = {
          date: today,
          entries: [newEntry],
          extras: [],
          totalCalories: newEntry.calories,
          totalProtein: newEntry.protein,
          totalFat: newEntry.fat,
          totalCarbs: newEntry.carbs,
        };
        updatedFoodLogs = [...foodLogs, newLog];
      }

      setFoodLogs(updatedFoodLogs);
      await AsyncStorage.setItem(KEYS.FOOD_LOG, JSON.stringify(updatedFoodLogs));
      
      console.log('Food entry added successfully');
      return true;
    } catch (error) {
      console.error('Error adding food entry:', error);
      return false;
    }
  }, [foodLogs, KEYS.FOOD_LOG]);

  const addExtraFood = useCallback(async (extraFood: Omit<ExtraFood, 'id' | 'timestamp'>) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const nowIso = new Date().toISOString();
      const newExtra: ExtraFood = {
        ...extraFood,
        id: Date.now().toString(),
        timestamp: nowIso,
      };

      if (uid) {
        try {
          console.log('[Supabase] Inserting into food_extras');
          let nutritionPlanId: string | null = null;
          try {
            const { data: rpcData, error: rpcError } = await supabase.rpc('get_todays_nutrition_plan', { user_uuid: uid });
            if (rpcError) {
              console.warn('[Supabase] get_todays_nutrition_plan error', rpcError);
            } else if (rpcData) {
              nutritionPlanId = rpcData as string;
            }
          } catch (e) {
            console.warn('[Supabase] RPC exception', e);
          }

          const insertPayload = {
            user_id: uid,
            nutrition_plan_id: nutritionPlanId,
            date: nowIso,
            name: newExtra.name,
            calories: Math.round(newExtra.calories),
            protein: Number(newExtra.protein),
            carbs: Number(newExtra.carbs),
            fat: Number(newExtra.fat),
            portion: newExtra.portionHint ?? null,
            image_url: newExtra.imageUri ?? null,
            confidence: newExtra.confidence ?? null,
            notes: newExtra.notes ?? null,
          } as const;

          const { error: insertError } = await supabase.from('food_extras').insert(insertPayload);
          if (insertError) {
            console.error('[Supabase] Insert food_extras failed', insertError);
          } else {
            console.log('[Supabase] Inserted food_extras successfully');
          }
        } catch (e) {
          console.error('[Supabase] addExtraFood remote sync failed', e);
        }
      } else {
        console.log('[Supabase] No session, storing locally only');
      }

      const existingLogIndex = foodLogs.findIndex(log => log.date === today);
      let updatedFoodLogs: DailyFoodLog[];

      if (existingLogIndex >= 0) {
        const existingLog = foodLogs[existingLogIndex];
        const updatedExtras = [...(existingLog.extras || []), newExtra];
        const updatedLog: DailyFoodLog = {
          ...existingLog,
          extras: updatedExtras,
          totalCalories: existingLog.entries.reduce((sum, e) => sum + e.calories, 0) + updatedExtras.reduce((sum, e) => sum + e.calories, 0),
          totalProtein: existingLog.entries.reduce((sum, e) => sum + e.protein, 0) + updatedExtras.reduce((sum, e) => sum + e.protein, 0),
          totalFat: existingLog.entries.reduce((sum, e) => sum + e.fat, 0) + updatedExtras.reduce((sum, e) => sum + e.fat, 0),
          totalCarbs: existingLog.entries.reduce((sum, e) => sum + e.carbs, 0) + updatedExtras.reduce((sum, e) => sum + e.carbs, 0),
        };
        
        updatedFoodLogs = [...foodLogs];
        updatedFoodLogs[existingLogIndex] = updatedLog;
      } else {
        const newLog: DailyFoodLog = {
          date: today,
          entries: [],
          extras: [newExtra],
          totalCalories: newExtra.calories,
          totalProtein: newExtra.protein,
          totalFat: newExtra.fat,
          totalCarbs: newExtra.carbs,
        };
        updatedFoodLogs = [...foodLogs, newLog];
      }

      setFoodLogs(updatedFoodLogs);
      await AsyncStorage.setItem(KEYS.FOOD_LOG, JSON.stringify(updatedFoodLogs));
      
      console.log('Extra food added successfully');
      return true;
    } catch (error) {
      console.error('Error adding extra food:', error);
      return false;
    }
  }, [foodLogs, uid, supabase, KEYS.FOOD_LOG]);

  const getTodayExtras = useCallback(() => {
    const todayLog = getTodayFoodLog();
    return todayLog?.extras || [];
  }, [getTodayFoodLog]);

  const removeExtraFood = useCallback(async (extraId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const existingLogIndex = foodLogs.findIndex(log => log.date === today);
      if (existingLogIndex < 0) return false;

      const existingLog = foodLogs[existingLogIndex];
      const updatedExtras = (existingLog.extras || []).filter(e => e.id !== extraId);

      const updatedLog: DailyFoodLog = {
        ...existingLog,
        extras: updatedExtras,
        totalCalories: existingLog.entries.reduce((sum, e) => sum + e.calories, 0) + updatedExtras.reduce((sum, e) => sum + e.calories, 0),
        totalProtein: existingLog.entries.reduce((sum, e) => sum + e.protein, 0) + updatedExtras.reduce((sum, e) => sum + e.protein, 0),
        totalFat: existingLog.entries.reduce((sum, e) => sum + e.fat, 0) + updatedExtras.reduce((sum, e) => sum + e.fat, 0),
        totalCarbs: existingLog.entries.reduce((sum, e) => sum + e.carbs, 0) + updatedExtras.reduce((sum, e) => sum + e.carbs, 0),
      };

      const updatedFoodLogs = [...foodLogs];
      updatedFoodLogs[existingLogIndex] = updatedLog;
      setFoodLogs(updatedFoodLogs);
      await AsyncStorage.setItem(KEYS.FOOD_LOG, JSON.stringify(updatedFoodLogs));

      // Best-effort remote cleanup
      if (uid) {
        try {
          await supabase.from('food_extras').delete().match({ user_id: uid, id: extraId });
        } catch {}
      }

      return true;
    } catch (error) {
      console.error('Error removing extra food:', error);
      return false;
    }
  }, [foodLogs, uid, supabase, KEYS.FOOD_LOG]);

  const getNutritionProgress = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayPlan = getTodayPlan();
    const todayFoodLog = getTodayFoodLog();

    if (!todayPlan?.nutrition) {
      return { calories: 0, protein: 0, fat: 0, carbs: 0 };
    }

    const targetCalories = todayPlan.nutrition.total_kcal || 2000;
    const targetProtein = todayPlan.nutrition.protein_g || 150;
    const targetFat = Math.round((targetCalories * 0.25) / 9);
    const targetCarbs = Math.round((targetCalories - (targetProtein * 4) - (targetFat * 9)) / 4);

    // Include calories from completed planned meals+extras
    const mealCount = user?.mealCount || 3;
    const distMap: Record<number, number[]> = { 3: [0.3,0.4,0.3], 4: [0.25,0.15,0.35,0.25], 5: [0.25,0.125,0.35,0.1,0.275], 6: [0.2,0.1,0.3,0.1,0.25,0.05] };
    const mealTemplates = [ { mealType: 'breakfast' }, { mealType: 'morning_snack' }, { mealType: 'lunch' }, { mealType: 'afternoon_snack' }, { mealType: 'dinner' }, { mealType: 'evening_snack' } ];
    const selectedMeals = (mealCount === 3) ? [mealTemplates[0], mealTemplates[2], mealTemplates[4]] : (mealCount === 4) ? [mealTemplates[0], mealTemplates[1], mealTemplates[2], mealTemplates[4]] : (mealCount === 5) ? [mealTemplates[0], mealTemplates[1], mealTemplates[2], mealTemplates[3], mealTemplates[4]] : mealTemplates;
    const dist = distMap[mealCount as 3|4|5|6] || distMap[3];
    const completedMeals = new Set(completionsByDate[today]?.completedMeals ?? []);
    const tickCalories = selectedMeals.reduce((sum, m, idx) => sum + (completedMeals.has(m.mealType) ? Math.round(targetCalories * dist[idx]) : 0), 0);
    const logCalories = todayFoodLog?.totalCalories || 0;

    const eatenCalories = tickCalories + logCalories;

    return {
      calories: Math.min(eatenCalories / targetCalories, 1),
      protein: Math.min((todayFoodLog?.totalProtein || 0) / targetProtein, 1),
      fat: Math.min((todayFoodLog?.totalFat || 0) / targetFat, 1),
      carbs: Math.min((todayFoodLog?.totalCarbs || 0) / targetCarbs, 1),
    };
  }, [getTodayPlan, getTodayFoodLog, completionsByDate, user?.mealCount]);

  const clearAllData = useCallback(async () => {
    try {
      console.log('Starting data clear process...');
      
      // Reset state first
      setUser(null);
      setCheckins([]);
      setPlans([]);
      setBasePlans([]);
      setFoodLogs([]);
      setExtras([]);
      
      // Then clear AsyncStorage (scoped to current uid)
      await Promise.all([
        AsyncStorage.removeItem(KEYS.USER),
        AsyncStorage.removeItem(KEYS.CHECKINS),
        AsyncStorage.removeItem(KEYS.PLANS),
        AsyncStorage.removeItem(KEYS.BASE_PLANS),
        AsyncStorage.removeItem(KEYS.FOOD_LOG),
        AsyncStorage.removeItem(KEYS.EXTRAS),
      ]);
      
      console.log('All data cleared successfully');
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }, [KEYS.USER, KEYS.CHECKINS, KEYS.PLANS, KEYS.BASE_PLANS, KEYS.FOOD_LOG, KEYS.EXTRAS]);

  const value = useMemo(() => ({
    user,
    checkins,
    plans,
    basePlans,
    foodLogs,
    extras,
    isLoading,
    updateUser,
    addCheckin,
    addPlan,
    addBasePlan,
    updateBasePlanDay,
    getCurrentBasePlan,
    getRecentCheckins,
    getTodayCheckin,
    getTodayPlan,
    getTodayFoodLog,
    getTodayExtras,
    addFoodEntry,
    addExtraFood,
    removeExtraFood,
    getNutritionProgress,
    getStreak,
    getWeightData,
    getLatestWeight,
    getWeightProgress,
    getCompletedMealsForDate,
    getCompletedExercisesForDate,
    toggleMealCompleted,
    toggleExerciseCompleted,
    clearAllData,
    syncLocalToBackend,
  }), [user, checkins, plans, basePlans, foodLogs, extras, isLoading, updateUser, addCheckin, addPlan, addBasePlan, updateBasePlanDay, getCurrentBasePlan, getRecentCheckins, getTodayCheckin, getTodayPlan, getTodayFoodLog, getTodayExtras, addFoodEntry, addExtraFood, getNutritionProgress, getStreak, getWeightData, getLatestWeight, getWeightProgress, getCompletedMealsForDate, getCompletedExercisesForDate, toggleMealCompleted, toggleExerciseCompleted, clearAllData, syncLocalToBackend]);

  return value;
});