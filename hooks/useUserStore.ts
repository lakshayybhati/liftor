import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { celebrateMilestone } from '@/utils/notifications';
import { getNotificationPreferences } from '@/utils/notification-storage';
import type { User, CheckinData, DailyPlan, WeeklyBasePlan, WorkoutPlan, NutritionPlan, RecoveryPlan } from '@/types/user';
import { useAuth } from '@/hooks/useAuth';
import { logProductionMetric, getProductionConfig } from '@/utils/production-config';

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
  serverId?: string; // Supabase row id for deletes/sync
  imagePath?: string; // Storage path in food_snaps
  source?: 'manual' | 'snap';
  syncStatus?: 'synced' | 'syncing' | 'failed';
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

// Retry helper for Supabase operations
async function retrySupabaseOperation<T>(
  operation: () => Promise<{ data: T; error: any }>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (result.error) throw result.error;
      return result.data;
    } catch (error) {
      lastError = error;

      // Don't retry on auth errors or permission errors
      const errorMessage = (error && typeof error === 'object' && 'message' in error) ? (error as any).message : '';
      const errorCode = (error && typeof error === 'object' && 'code' in error) ? (error as any).code : '';
      if (errorMessage.includes('JWT') || errorMessage.includes('auth') ||
          errorCode === 'PGRST301' || errorCode === 'PGRST116') {
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt - 1);
        console.log(`[UserStore] Retrying Supabase operation in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export const [UserProvider, useUserStore] = createContextHook(() => {
  const { session, supabase, isAuthLoading } = useAuth();
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
  const [pendingFoodOps, setPendingFoodOps] = useState<any[]>([]);
  const hydratedUidRef = useRef<string | null>(null);

  const loadUserData = useCallback(async () => {
    if (!uid) {
      console.warn('[UserStore] Skipping data load - no uid (auth not ready)');
      return;
    }
    console.log('[UserStore] Starting data load for uid:', uid ? uid.substring(0, 8) + '...' : 'anon');
    const loadStartTime = Date.now();
    
    try {
      // Migrate legacy keys if present (do this in background after initial load)
      const legacy = {
        user: 'fitcoach_user',
        checkins: 'fitcoach_checkins',
        plans: 'fitcoach_plans',
        basePlans: 'fitcoach_base_plans',
        foodLog: 'fitcoach_food_log',
        extras: 'fitcoach_extras',
      } as const;

      // Fast path: Load current user data first
      const [userData, checkinsData, plansData, basePlansData, foodLogsData, extrasData, completionsData] = await Promise.all([
        AsyncStorage.getItem(KEYS.USER),
        AsyncStorage.getItem(KEYS.CHECKINS),
        AsyncStorage.getItem(KEYS.PLANS),
        AsyncStorage.getItem(KEYS.BASE_PLANS),
        AsyncStorage.getItem(KEYS.FOOD_LOG),
        AsyncStorage.getItem(KEYS.EXTRAS),
        AsyncStorage.getItem(KEYS.COMPLETIONS),
      ]);

      console.log('[UserStore] Local storage read in', Date.now() - loadStartTime, 'ms');

      // Track whether we hydrated a valid local user
      let hasLocalUser = false;

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
            hasLocalUser = true;
          }
        } catch (e) {
          console.error('Error parsing user data, clearing corrupted data:', e);
          await AsyncStorage.removeItem(KEYS.USER);
        }
      } else if (userData) {
        console.warn('Invalid user data format, clearing:', userData.substring(0, 100));
        await AsyncStorage.removeItem(KEYS.USER);
      }
      
      // Do legacy migration in background (non-blocking)
      Promise.all([
        AsyncStorage.getItem(USER_STORAGE_KEY),
        AsyncStorage.getItem(legacy.user),
      ]).then(async ([oldLiftorUser, legacyUser]) => {
        if (!oldLiftorUser && legacyUser) {
          await AsyncStorage.setItem(USER_STORAGE_KEY, legacyUser);
        }
        
        // Namespace migration
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
        
        // Clean up old keys
        await Promise.all([
          AsyncStorage.removeItem(legacy.user),
          AsyncStorage.removeItem(legacy.checkins),
          AsyncStorage.removeItem(legacy.plans),
          AsyncStorage.removeItem(legacy.basePlans),
          AsyncStorage.removeItem(legacy.foodLog),
          AsyncStorage.removeItem(legacy.extras),
        ]).catch(() => {});
        
        console.log('[UserStore] Background migration completed');
      }).catch(err => {
        console.warn('[UserStore] Background migration failed:', err);
      });
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
      
      // Parse remaining local data
      if (plansData && plansData.trim().startsWith('[') && plansData.trim().endsWith(']')) {
        try {
          const parsed = JSON.parse(plansData);
          if (Array.isArray(parsed)) {
            setPlans(parsed);
          }
        } catch (e) {
          console.error('Error parsing plans data:', e);
          await AsyncStorage.removeItem(KEYS.PLANS);
        }
      }
      
      if (basePlansData && basePlansData.trim().startsWith('[') && basePlansData.trim().endsWith(']')) {
        try {
          const parsed = JSON.parse(basePlansData);
          if (Array.isArray(parsed)) {
            setBasePlans(parsed);
          }
        } catch (e) {
          console.error('Error parsing base plans data:', e);
          await AsyncStorage.removeItem(KEYS.BASE_PLANS);
        }
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
          console.error('Error parsing food logs data:', e);
          await AsyncStorage.removeItem(KEYS.FOOD_LOG);
        }
      }
      
      if (extrasData && extrasData.trim().startsWith('[') && extrasData.trim().endsWith(']')) {
        try {
          const parsed = JSON.parse(extrasData);
          if (Array.isArray(parsed)) {
            setExtras(parsed);
          }
        } catch (e) {
          console.error('Error parsing extras data:', e);
          await AsyncStorage.removeItem(KEYS.EXTRAS);
        }
      }
      try {
        const ops = await AsyncStorage.getItem(scopedKey('Liftor_food_ops', uid));
        if (ops && ops.trim().startsWith('[')) {
          const parsedOps = JSON.parse(ops);
          if (Array.isArray(parsedOps)) setPendingFoodOps(parsedOps);
        }
      } catch {}
      
      if (completionsData && completionsData.trim().startsWith('{') && completionsData.trim().endsWith('}')) {
        try {
          const parsed = JSON.parse(completionsData);
          if (parsed && typeof parsed === 'object') {
            setCompletionsByDate(parsed);
          }
        } catch (e) {
          console.error('Error parsing completions data:', e);
          await AsyncStorage.removeItem(KEYS.COMPLETIONS);
        }
      }
      
      // Mark as loaded IMMEDIATELY after local data is hydrated
      // Remote sync can happen in background
      console.log('[UserStore] ✅ Local data loaded in', Date.now() - loadStartTime, 'ms');
      setIsLoading(false);

      // Remote hydration from Supabase profile for fresh installs/new devices
      // If there is a logged-in user (uid) but no local user stored yet, pull profile
      // This happens in background and doesn't block app initialization
      if (!hasLocalUser && uid) {
        try {
          console.log('[UserStore] No local user found, fetching from Supabase for uid:', uid.substring(0, 8) + '...');
        let retryCount = 0;
        const maxRetries = 3;
        let profile = null;
        let profileErr = null;
        
        // Use retry helper for profile fetching
        const profileData = await retrySupabaseOperation(async () =>
          await supabase
            .from('profiles')
            .select(
              [
                'id',
                'email',
                'name',
                'goal',
                'equipment',
                'dietary_prefs',
                'dietary_notes',
                'training_days',
                'timezone',
                'onboarding_complete',
                'age',
                'sex',
                'height',
                'weight',
                'activity_level',
                'daily_calorie_target',
                'supplements',
                'supplement_notes',
                'personal_goals',
                'perceived_lacks',
                'preferred_exercises',
                'avoid_exercises',
                'preferred_training_time',
                'session_length',
                'travel_days',
                'fasting_window',
                'meal_count',
                'injuries',
                'step_target',
                'preferred_workout_split',
                'special_requests',
                'goal_weight',
                'base_plan'
              ].join(', ')
            )
            .eq('id', uid)
            .maybeSingle()
        );

        profile = profileData;
        profileErr = null;

        if (profile && typeof profile === 'object' && 'id' in profile && !('message' in profile)) {
            console.log('[UserStore] Hydrating user from remote profile');
            logProductionMetric('data', 'profile_hydrated', { uid });
            // Type-safe access to profile properties - we've verified it's not an error
            const profileRecord = profile as Record<string, any>;
            const hydratedUser: User = {
              id: profileRecord.id,
              name: (profileRecord.name as string) || 'User',
              goal: (profileRecord.goal as any) || 'GENERAL_FITNESS',
              equipment: (profileRecord.equipment as any) || [],
              dietaryPrefs: Array.isArray(profileRecord.dietary_prefs)
                ? (profileRecord.dietary_prefs as string[]).map((p) => (p === 'None' ? 'Non-veg' : (p as any)))
                : [],
              dietaryNotes: (profileRecord.dietary_notes as any) ?? undefined,
              trainingDays: (profileRecord.training_days as number) ?? 3,
              timezone: (profileRecord.timezone as string) || Intl.DateTimeFormat().resolvedOptions().timeZone,
              onboardingComplete: !!profileRecord.onboarding_complete,
              age: (profileRecord.age as number | null) ?? undefined,
              sex: (profileRecord.sex as any) ?? undefined,
              height: (profileRecord.height as number | null) ?? undefined,
              weight: (profileRecord.weight as number | null) ?? undefined,
              activityLevel: (profileRecord.activity_level as any) ?? undefined,
              dailyCalorieTarget: (profileRecord.daily_calorie_target as number | null) ?? undefined,
              supplements: (profileRecord.supplements as string[] | null) ?? undefined,
              supplementNotes: (profileRecord.supplement_notes as string | null) ?? undefined,
              personalGoals: (profileRecord.personal_goals as string[] | null) ?? undefined,
              perceivedLacks: (profileRecord.perceived_lacks as string[] | null) ?? undefined,
              preferredExercises: (profileRecord.preferred_exercises as string[] | null) ?? undefined,
              avoidExercises: (profileRecord.avoid_exercises as string[] | null) ?? undefined,
              preferredTrainingTime: (profileRecord.preferred_training_time as string | null) ?? undefined,
              checkInReminderTime: (profileRecord as any).checkin_reminder_time ?? undefined,
              sessionLength: (profileRecord.session_length as number | null) ?? undefined,
              travelDays: (profileRecord.travel_days as number | null) ?? undefined,
              fastingWindow: (profileRecord.fasting_window as string | null) ?? undefined,
              mealCount: (profileRecord.meal_count as number | null) ?? undefined,
              injuries: (profileRecord.injuries as string | null) ?? undefined,
              stepTarget: (profileRecord.step_target as number | null) ?? undefined,
              preferredWorkoutSplit: (profileRecord.preferred_workout_split as string | null) ?? undefined,
              specialRequests: (profileRecord.special_requests as string | null) ?? undefined,
              goalWeight: (profileRecord.goal_weight as number | null) ?? undefined,
              workoutIntensity: (profileRecord.workout_intensity as any) ?? undefined,
              basePlan: (profileRecord.base_plan as any) ?? undefined,
            };

            setUser(hydratedUser);
            try { await AsyncStorage.setItem(KEYS.USER, JSON.stringify(hydratedUser)); } catch {}

            // If a base plan snapshot is stored on the profile, hydrate local base plans
            const profileBasePlan = (profile && typeof profile === 'object' && 'base_plan' in profile && !('message' in profile)) ? (profileRecord.base_plan as any) ?? null : null;
            if (profileBasePlan && typeof profileBasePlan === 'object') {
              try {
                const normalizedPlan = {
                  // Ensure required fields exist with reasonable fallbacks
                  id: (profileBasePlan.id as string) || `base_${Date.now()}`,
                  createdAt: (profileBasePlan.createdAt as string) || new Date().toISOString(),
                  days: profileBasePlan.days || {},
                  isLocked: profileBasePlan.isLocked ?? false,
                } as any;
                setBasePlans([normalizedPlan]);
                await AsyncStorage.setItem(KEYS.BASE_PLANS, JSON.stringify([normalizedPlan]));
              } catch (e) {
                console.warn('[UserStore] Failed to hydrate base plan from profile', e);
              }
            }
            hasLocalUser = true;
          } else if (profileErr) {
            console.error('[UserStore] ❌ Failed to fetch profile after all retries');
            logProductionMetric('error', 'profile_fetch_all_retries_failed', { uid, error: String(profileErr) });
            
            // Create a minimal user object so app doesn't break
            console.log('[UserStore] Creating minimal fallback user to prevent app break');
            const fallbackUser: User = {
              id: uid,
              name: 'User',
              goal: 'GENERAL_FITNESS',
              equipment: [],
              dietaryPrefs: ['Non-veg'],
              trainingDays: 3,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              onboardingComplete: false,
            };
            setUser(fallbackUser);
            try { 
              await AsyncStorage.setItem(KEYS.USER, JSON.stringify(fallbackUser)); 
            } catch {}
            hasLocalUser = true;
          }
        } catch (e) {
          console.error('[UserStore] Remote hydration exception:', e);
          logProductionMetric('error', 'profile_hydration_exception', { uid, error: String(e) });
        }
      }
      
      // Log final hydration status
      if (uid && !hasLocalUser) {
        console.error('[UserStore] ❌ User not hydrated after all attempts');
        logProductionMetric('error', 'user_not_hydrated', { uid });
      } else if (uid && hasLocalUser) {
        console.log('[UserStore] ✅ User data ready');
        logProductionMetric('data', 'user_ready', { uid, hasOnboarding: user?.onboardingComplete });
      }
      
      console.log('[UserStore] ✅ Background sync completed');
    } catch (error) {
      console.error('Error loading user data:', error);
      // Don't set isLoading(false) again here - it's already set after local data load
    }
  }, [uid, supabase]); // KEYS are derived from uid, so uid is sufficient
  // Queue processing for offline ops
  const persistFoodOps = useCallback(async (ops: any[]) => {
    setPendingFoodOps(ops);
    try { await AsyncStorage.setItem(scopedKey('Liftor_food_ops', uid), JSON.stringify(ops)); } catch {}
  }, [uid]);

  const processFoodOpsQueue = useCallback(async () => {
    if (!uid) return;
    if (pendingFoodOps.length === 0) return;
    const remaining: any[] = [];
    for (const op of pendingFoodOps) {
      try {
        if (op.type === 'insert_text') {
          const idem = op.idemKey || `${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
          const { error } = await supabase.functions.invoke('macros', {
            body: {
              kind: 'text',
              name: op.name,
              portion: op.portion,
              notes: op.notes,
              previewOnly: false,
              occurred_at_local: op.occurred_at_local,
            },
            headers: { 'Idempotency-Key': idem },
          });
          if (error) throw error;
          // On success, nothing else — UI will fetch latest via local state
        } else if (op.type === 'insert_image') {
          // Upload local image then call macros insert
          const d = new Date();
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const path = `${uid}/${yyyy}/${mm}/${dd}/${op.localId || Date.now()}.jpg`;
          const res = await fetch(op.localUri);
          const blob = await res.blob();
          const { error: upErr } = await supabase.storage.from('food_snaps').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
          if (upErr) throw upErr;
          const idem = op.idemKey || `${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
          const { error } = await supabase.functions.invoke('macros', {
            body: {
              kind: 'image',
              image_path: path,
              notes: op.notes,
              previewOnly: false,
              occurred_at_local: op.occurred_at_local,
            },
            headers: { 'Idempotency-Key': idem },
          });
          if (error) throw error;
        } else if (op.type === 'delete') {
          await supabase.from('food_extras').delete().eq('id', op.id);
        }
      } catch (e) {
        // keep op for next retry
        remaining.push({ ...op, retries: (op.retries || 0) + 1 });
      }
    }
    await persistFoodOps(remaining);
  }, [pendingFoodOps, uid, supabase, persistFoodOps]);


  // Hydrate state from Supabase (server → device) after login or reinstall
  const hydrateFromDatabase = useCallback(async () => {
    if (!uid) {
      console.warn('[Hydrate] No user session; skipping database hydration');
      return { success: false, reason: 'no-session' } as const;
    }

    try {
      console.log('[Hydrate] Starting database hydration...');
      const now = new Date();
      const fmt = (d: Date) => d.toISOString().split('T')[0];
      const since90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [dbCheckins, dbPlans, dbBasePlans, dbExtras, dbProfile] = await Promise.all([
        retrySupabaseOperation(async () =>
          await supabase
            .from('checkins')
            .select('*')
            .eq('user_id', uid)
            .gte('date', fmt(since90))
            .order('date', { ascending: true })
        ),
        retrySupabaseOperation(async () =>
          await supabase
            .from('daily_plans')
            .select('*')
            .eq('user_id', uid)
            .gte('date', fmt(since30))
            .order('date', { ascending: true })
        ),
        retrySupabaseOperation(async () =>
          await supabase
            .from('weekly_base_plans')
            .select('*')
            .eq('user_id', uid)
            .order('created_at', { ascending: true })
            .limit(10)
        ),
        retrySupabaseOperation(async () =>
          await supabase
            .from('food_extras')
            .select('*')
            .eq('user_id', uid)
            .gte('day_key_local', fmt(since30))
            .order('occurred_at_utc', { ascending: true })
        ),
        retrySupabaseOperation(async () =>
          await supabase
            .from('profiles')
            .select(
              [
                'id',
                'onboarding_complete',
                'base_plan',
                // Subscription-related fields (fetched for completeness)
                'subscription_active',
                'subscription_platform',
                'subscription_will_renew',
                'subscription_expiration_at',
                'rc_entitlements'
              ].join(', ')
            )
            .eq('id', uid)
            .maybeSingle()
        ),
      ]);

      // Map and persist check-ins
      try {
        if (Array.isArray(dbCheckins) && dbCheckins.length > 0) {
          const mapped = dbCheckins.map((c: any) => ({
            id: c.id,
            mode: c.mode,
            date: c.date,
            bodyWeight: c.body_weight ?? undefined,
            currentWeight: c.current_weight ?? undefined,
            mood: c.mood ?? undefined,
            moodCharacter: c.mood_character ?? undefined,
            energy: c.energy ?? undefined,
            sleepHrs: c.sleep_hrs ?? undefined,
            sleepQuality: c.sleep_quality ?? undefined,
            wokeFeeling: c.woke_feeling ?? undefined,
            soreness: c.soreness ?? undefined,
            appearance: c.appearance ?? undefined,
            digestion: c.digestion ?? undefined,
            stress: c.stress ?? undefined,
            waterL: c.water_l ?? undefined,
            saltYN: c.salt_yn ?? undefined,
            suppsYN: c.supps_yn ?? undefined,
            steps: c.steps ?? undefined,
            kcalEst: c.kcal_est ?? undefined,
            caffeineYN: c.caffeine_yn ?? undefined,
            alcoholYN: c.alcohol_yn ?? undefined,
            motivation: c.motivation ?? undefined,
            hr: c.hr ?? undefined,
            hrv: c.hrv ?? undefined,
            injuries: c.injuries ?? undefined,
            busyBlocks: c.busy_blocks ?? undefined,
            travelYN: c.travel_yn ?? undefined,
            workoutIntensity: c.workout_intensity ?? undefined,
          })) as CheckinData[];

          setCheckins(mapped);
          await AsyncStorage.setItem(KEYS.CHECKINS, JSON.stringify(mapped));
          console.log('[Hydrate] Check-ins loaded:', mapped.length);
        }
      } catch (e) {
        console.warn('[Hydrate] Failed to map/persist check-ins', e);
      }

      // Map and persist daily plans
      try {
        if (Array.isArray(dbPlans) && dbPlans.length > 0) {
          const mapped = dbPlans.map((p: any) => ({
            id: p.id,
            date: p.date,
            workout: p.workout ?? undefined,
            nutrition: p.nutrition ?? undefined,
            recovery: p.recovery ?? undefined,
            motivation: p.motivation ?? undefined,
            adherence: p.adherence ?? undefined,
            adjustments: p.adjustments ?? undefined,
            isFromBasePlan: p.is_from_base_plan ?? undefined,
          })) as DailyPlan[];

          setPlans(mapped);
          await AsyncStorage.setItem(KEYS.PLANS, JSON.stringify(mapped));
          console.log('[Hydrate] Daily plans loaded:', mapped.length);
        }
      } catch (e) {
        console.warn('[Hydrate] Failed to map/persist daily plans', e);
      }

      // Map and persist base plans
      try {
        if (Array.isArray(dbBasePlans) && dbBasePlans.length > 0) {
          const mapped = dbBasePlans.map((bp: any) => ({
            id: bp.id,
            createdAt: bp.created_at,
            days: bp.days,
            isLocked: bp.is_locked,
          })) as WeeklyBasePlan[];

          setBasePlans(mapped);
          await AsyncStorage.setItem(KEYS.BASE_PLANS, JSON.stringify(mapped));
          console.log('[Hydrate] Base plans loaded:', mapped.length);
        }
      } catch (e) {
        console.warn('[Hydrate] Failed to map/persist base plans', e);
      }

      // Map and merge food extras into DailyFoodLog
      try {
        if (Array.isArray(dbExtras)) {
          const byDay: Record<string, ExtraFood[]> = {};
          for (const row of dbExtras as any[]) {
            const day: string = row.day_key_local || (row.occurred_at_utc || '').split('T')[0];
            const extra: ExtraFood = {
              id: String(row.id),
              name: row.name,
              calories: Number(row.calories) || 0,
              protein: Number(row.protein) || 0,
              fat: Number(row.fat) || 0,
              carbs: Number(row.carbs) || 0,
              timestamp: row.occurred_at_utc || new Date().toISOString(),
              confidence: row.confidence ?? undefined,
              notes: row.notes ?? undefined,
              portionHint: row.portion ?? undefined,
              imagePath: row.image_path ?? undefined,
              source: row.source === 'snap' ? 'snap' : 'manual',
              serverId: String(row.id),
              syncStatus: 'synced',
            };
            byDay[day] = byDay[day] || [];
            byDay[day].push(extra);
          }

          // Merge with existing local logs: keep entries, replace extras per day, recompute totals
          const existingMap: Record<string, DailyFoodLog> = Object.fromEntries(
            (foodLogs || []).map(l => [l.date, l])
          );
          const allDays = new Set<string>([
            ...Object.keys(existingMap),
            ...Object.keys(byDay),
          ]);

          const merged: DailyFoodLog[] = Array.from(allDays).map(day => {
            const localLog = existingMap[day];
            const entries = localLog?.entries || [];
            // Combine extras with de-duplication by serverId/id
            const dbDayExtras = byDay[day] || [];
            const combined = [...(localLog?.extras || []), ...dbDayExtras];
            const dedupMap = new Map<string, ExtraFood>();
            for (const e of combined) {
              const key = e.serverId || e.id;
              if (!dedupMap.has(key)) dedupMap.set(key, e);
            }
            const extrasArr = Array.from(dedupMap.values());

            const totalsFrom = (arr: { calories: number; protein: number; fat: number; carbs: number }[]) =>
              arr.reduce((acc, it) => ({
                calories: acc.calories + (Number(it.calories) || 0),
                protein: acc.protein + (Number(it.protein) || 0),
                fat: acc.fat + (Number(it.fat) || 0),
                carbs: acc.carbs + (Number(it.carbs) || 0),
              }), { calories: 0, protein: 0, fat: 0, carbs: 0 });

            const entryTotals = totalsFrom(entries);
            const extrasTotals = totalsFrom(extrasArr);
            return {
              date: day,
              entries,
              extras: extrasArr,
              totalCalories: entryTotals.calories + extrasTotals.calories,
              totalProtein: entryTotals.protein + extrasTotals.protein,
              totalFat: entryTotals.fat + extrasTotals.fat,
              totalCarbs: entryTotals.carbs + extrasTotals.carbs,
            } as DailyFoodLog;
          }).sort((a, b) => b.date.localeCompare(a.date));

          setFoodLogs(merged);
          await AsyncStorage.setItem(KEYS.FOOD_LOG, JSON.stringify(merged));
          console.log('[Hydrate] Food extras merged into logs for days:', merged.length);
        }
      } catch (e) {
        console.warn('[Hydrate] Failed to map/merge food extras', e);
      }

      // Light profile alignment: ensure onboarding flag reflects server
      try {
        if (dbProfile && typeof dbProfile === 'object' && (dbProfile as any).id) {
          const remoteOnboarded = !!(dbProfile as any).onboarding_complete;
          if (user && user.onboardingComplete !== remoteOnboarded) {
            const nextUser = { ...user, onboardingComplete: remoteOnboarded } as User;
            setUser(nextUser);
            await AsyncStorage.setItem(KEYS.USER, JSON.stringify(nextUser));
          }
          // base_plan already handled via weekly_base_plans fetch; subscription fields are fetched by useProfile
        }
      } catch (e) {
        console.warn('[Hydrate] Failed to align profile fields', e);
      }

      console.log('[Hydrate] ✅ Database hydration complete');
      return { success: true } as const;
    } catch (e) {
      console.error('[Hydrate] Unexpected error during hydration', e);
      return { success: false, reason: 'exception' } as const;
    }
  }, [uid, supabase, KEYS.CHECKINS, KEYS.PLANS, KEYS.BASE_PLANS, KEYS.FOOD_LOG, KEYS.USER]);

  // Trigger hydration after local load completes
  useEffect(() => {
    if (isAuthLoading) return; // wait for auth to stabilize
    if (!uid) return;
    if (isLoading) return; // wait until local data is in place to merge cleanly
    if (hydratedUidRef.current === uid) return; // already hydrated for this uid
    hydratedUidRef.current = uid;
    hydrateFromDatabase().catch(err => console.warn('[Hydrate] Background hydration failed:', err));
  }, [uid, isLoading, isAuthLoading]);


  // Reload scoped data whenever the authenticated user changes
  useEffect(() => {
    if (isAuthLoading || !uid) return; // prevent anon→uid oscillation triggers during auth bootstrap
    // Reset in-memory state immediately to avoid showing previous user's data
    setUser(null);
    setCheckins([]);
    setPlans([]);
    setBasePlans([]);
    setFoodLogs([]);
    setExtras([]);
    setIsLoading(true);
    loadUserData();
  }, [uid, isAuthLoading, loadUserData]);

  const updateUser = useCallback(async (userData: User) => {
    if (!userData?.id) return;
    try {
      setUser(userData);
      await AsyncStorage.setItem(KEYS.USER, JSON.stringify(userData));
      // Milestone notifications: weight goal
      try {
        const prefs = await getNotificationPreferences();
        if (prefs.milestonesEnabled && typeof userData.weight === 'number' && typeof userData.goalWeight === 'number') {
          const diff = Math.abs((userData.weight as number) - (userData.goalWeight as number));
          if (diff < 0.5) {
            await celebrateMilestone('weight_goal', { weight: userData.goalWeight });
          }
        }
      } catch {}
      
      // Log success in production
      const config = getProductionConfig();
      if (config.isProduction) {
        logProductionMetric('data', 'user_updated', { userId: userData.id });
      }
    } catch (error) {
      console.error('Error saving user data:', error);
      
      // Log error in production
      const config = getProductionConfig();
      if (config.isProduction) {
        logProductionMetric('error', 'user_update_failed', { 
          error: String(error),
          userId: userData?.id 
        });
      }
      
      // Don't throw error to prevent app crash, but log it
    }
  }, [KEYS.USER]);

  const addCheckin = useCallback(async (checkin: CheckinData) => {
    try {
      const updatedCheckins = [...checkins, checkin];
      setCheckins(updatedCheckins);
      await AsyncStorage.setItem(KEYS.CHECKINS, JSON.stringify(updatedCheckins));
      // Milestone notifications: streaks
      try {
        const prefs = await getNotificationPreferences();
        if (prefs.milestonesEnabled) {
          let streak = 0;
          const today = new Date();
          for (let i = 0; i < 30; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const hasCheckin = updatedCheckins.some(c => c.date === dateStr);
            if (hasCheckin) streak++; else if (i > 0) break;
          }
          if (streak === 7 || streak === 14 || streak === 30) {
            await celebrateMilestone('streak', { days: streak });
          }
        }
      } catch {}
      
      // Log success in production
      const config = getProductionConfig();
      if (config.isProduction) {
        logProductionMetric('data', 'checkin_added', { date: checkin.date });
      }
    } catch (error) {
      console.error('Error saving checkin:', error);
      
      const config = getProductionConfig();
      if (config.isProduction) {
        logProductionMetric('error', 'checkin_save_failed', { error: String(error) });
      }
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
      // Milestone notifications: plan completed (adherence)
      try {
        const prefs = await getNotificationPreferences();
        const adherence = (plan as any).adherence as number | undefined;
        if (prefs.milestonesEnabled && typeof adherence === 'number' && adherence > 0.8) {
          await celebrateMilestone('plan_completed', { date: plan.date });
        }
      } catch {}
      
      // Log success in production
      const config = getProductionConfig();
      if (config.isProduction) {
        logProductionMetric('data', 'plan_added', { date: plan.date, isUpdate: idx >= 0 });
      }
    } catch (error) {
      console.error('Error saving plan:', error);
      
      const config = getProductionConfig();
      if (config.isProduction) {
        logProductionMetric('error', 'plan_save_failed', { error: String(error), date: plan.date });
      }
    }
  }, [plans, KEYS.PLANS]);

  const addBasePlan = useCallback(async (basePlan: WeeklyBasePlan) => {
    try {
      console.log('[UserStore] addBasePlan called with plan ID:', basePlan.id);
      console.log('[UserStore] Current basePlans count:', basePlans.length);
      console.log('[UserStore] New plan has', Object.keys(basePlan.days || {}).length, 'days');
      
      const updatedBasePlans = [...basePlans, basePlan];
      console.log('[UserStore] Updating state with', updatedBasePlans.length, 'plans...');
      setBasePlans(updatedBasePlans);
      console.log('[UserStore] ✅ State updated');
      
      console.log('[UserStore] Saving to AsyncStorage...');
      await AsyncStorage.setItem(KEYS.BASE_PLANS, JSON.stringify(updatedBasePlans));
      console.log('[UserStore] ✅ AsyncStorage save complete');

      // Best-effort: persist to Supabase weekly_base_plans so edits survive reloads and cross-device
      if (uid) {
        try {
          const inserted = await retrySupabaseOperation(async () =>
            await supabase
              .from('weekly_base_plans')
              .insert({
                user_id: uid,
                days: basePlan.days as any,
                is_locked: !!basePlan.isLocked,
              } as any)
              .select('*')
              .single()
          );

          if (inserted && (inserted as any).id) {
            const serverPlan: WeeklyBasePlan = {
              id: (inserted as any).id,
              createdAt: (inserted as any).created_at,
              days: (inserted as any).days,
              isLocked: (inserted as any).is_locked,
            } as any;
            const merged = [...updatedBasePlans.slice(0, -1), serverPlan];
            setBasePlans(merged);
            await AsyncStorage.setItem(KEYS.BASE_PLANS, JSON.stringify(merged));
            console.log('[UserStore] ✅ weekly_base_plans inserted and local state/id aligned');
          }
        } catch (e) {
          console.warn('[UserStore] weekly_base_plans insert failed (will remain local-only until next sync)', e);
        }
      }
      
      // Log success in production
      const config = getProductionConfig();
      if (config.isProduction) {
        logProductionMetric('data', 'base_plan_added', { 
          planId: basePlan.id,
          dayCount: Object.keys(basePlan.days || {}).length 
        });
      }
      
      console.log('[UserStore] ✅ addBasePlan completed successfully');
    } catch (error) {
      console.error('[UserStore] ❌ Error saving base plan:', error);
      
      const config = getProductionConfig();
      if (config.isProduction) {
        logProductionMetric('error', 'base_plan_save_failed', { 
          error: String(error),
          planId: basePlan.id 
        });
      }
      
      // Re-throw to let caller know there was an error
      throw error;
    }
  }, [basePlans, KEYS.BASE_PLANS, uid, supabase]);

  // Define getCurrentBasePlan BEFORE syncLocalToBackend since it's used as a dependency
  const getCurrentBasePlan = useCallback(() => {
    console.log('[UserStore] getCurrentBasePlan called, basePlans.length:', basePlans.length);
    const unlocked = basePlans.find(plan => !plan.isLocked);
    const latest = basePlans[basePlans.length - 1];
    const result = unlocked || latest;
    console.log('[UserStore] getCurrentBasePlan result:', result ? `Plan ID: ${result.id}` : 'NULL');
    return result;
  }, [basePlans]);

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

        try {
          await retrySupabaseOperation(async () =>
            await supabase
              .from('checkins')
              .upsert(rows as any, { onConflict: 'user_id,date' })
          );
        } catch (upErr) {
          console.warn('[Sync] checkins upsert error', upErr);
        }
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

        try {
          await retrySupabaseOperation(async () =>
            await supabase
              .from('daily_plans')
              .upsert(rows as any, { onConflict: 'user_id,date' })
          );
        } catch (upErr) {
          console.warn('[Sync] daily_plans upsert error', upErr);
        }
      }

      // Optionally persist the current base plan snapshot to profiles.base_plan
      try {
        const currentBase = getCurrentBasePlan();
        if (currentBase) {
          try {
            await retrySupabaseOperation(async () =>
              await supabase
                .from('profiles')
                .update({ base_plan: currentBase as any })
                .eq('id', uid)
            );
          } catch (profErr) {
            console.warn('[Sync] profiles.base_plan update error', profErr);
          }
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
      
      // Persist change to Supabase when possible
      if (uid) {
        try {
          const isUuid = /^[0-9a-fA-F-]{36}$/.test(currentBasePlan.id);
          if (isUuid) {
            await retrySupabaseOperation(async () =>
              await supabase
                .from('weekly_base_plans')
                .update({ days: updatedBasePlan.days as any })
                .eq('id', currentBasePlan.id)
            );
          } else {
            // No server row yet — insert a new one and align local id
            const inserted = await retrySupabaseOperation(async () =>
              await supabase
                .from('weekly_base_plans')
                .insert({
                  user_id: uid,
                  days: updatedBasePlan.days as any,
                  is_locked: !!updatedBasePlan.isLocked,
                } as any)
                .select('*')
                .single()
            );
            if (inserted && (inserted as any).id) {
              const merged = basePlans.map(plan => 
                plan.id === currentBasePlan.id 
                  ? ({
                      ...updatedBasePlan,
                      id: (inserted as any).id,
                      createdAt: (inserted as any).created_at,
                      isLocked: (inserted as any).is_locked,
                    } as WeeklyBasePlan)
                  : plan
              );
              setBasePlans(merged);
              await AsyncStorage.setItem(KEYS.BASE_PLANS, JSON.stringify(merged));
            }
          }
          // Also keep profile snapshot fresh for redundancy
          try {
            await retrySupabaseOperation(async () =>
              await supabase
                .from('profiles')
                .update({ base_plan: updatedBasePlan as any })
                .eq('id', uid)
            );
          } catch (e) {
            console.warn('[UserStore] profiles.base_plan snapshot update failed', e);
          }
        } catch (e) {
          console.warn('[UserStore] weekly_base_plans sync failed', e);
        }
      }
      
      console.log(`Successfully updated ${dayKey} in base plan`);
      return true;
    } catch (error) {
      console.error('Error updating base plan day:', error);
      return false;
    }
  }, [basePlans, getCurrentBasePlan, uid, supabase, KEYS.BASE_PLANS]);

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
          await retrySupabaseOperation(async () =>
            await supabase.from('daily_plans').upsert({ user_id: uid, date, adherence } as any, { onConflict: 'user_id,date' })
          );
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
        syncStatus: 'synced',
      };

      // Local-only update; server insert is handled by Edge Function from the UI flow

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
      // Find the first log containing this extra id
      const logIndex = foodLogs.findIndex(log => (log.extras || []).some(e => e.id === extraId));
      if (logIndex < 0) return false;

      const existingLog = foodLogs[logIndex];
      const removedItem = (existingLog.extras || []).find(e => e.id === extraId);
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
      updatedFoodLogs[logIndex] = updatedLog;
      setFoodLogs(updatedFoodLogs);
      await AsyncStorage.setItem(KEYS.FOOD_LOG, JSON.stringify(updatedFoodLogs));

      // Best-effort remote cleanup by server id if present
      const serverRowId = removedItem?.serverId || removedItem?.id || extraId;
      if (uid && serverRowId) {
        try {
          await retrySupabaseOperation(async () =>
            await supabase.from('food_extras').delete().match({ user_id: uid, id: serverRowId })
          );
        } catch (e) {
          // queue delete
          const next = [...pendingFoodOps, { type: 'delete', id: serverRowId, createdAt: Date.now(), retries: 0 }];
          await persistFoodOps(next);
          console.warn('[Supabase] Delete failed, queued');
        }
      }

      return true;
    } catch (error) {
      console.error('Error removing extra food:', error);
      return false;
    }
  }, [foodLogs, uid, supabase, KEYS.FOOD_LOG, pendingFoodOps, persistFoodOps]);

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
    // Derive totals from entries + extras (avoid drift)
    const entryTotals = (todayFoodLog?.entries || []).reduce((acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      fat: acc.fat + e.fat,
      carbs: acc.carbs + e.carbs,
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });
    const extraTotals = (todayFoodLog?.extras || []).reduce((acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      fat: acc.fat + e.fat,
      carbs: acc.carbs + e.carbs,
    }), { calories: 0, protein: 0, fat: 0, carbs: 0 });

    const eatenCalories = tickCalories + entryTotals.calories + extraTotals.calories;

    return {
      calories: Math.min(eatenCalories / targetCalories, 1),
      protein: Math.min((entryTotals.protein + extraTotals.protein) / targetProtein, 1),
      fat: Math.min((entryTotals.fat + extraTotals.fat) / targetFat, 1),
      carbs: Math.min((entryTotals.carbs + extraTotals.carbs) / targetCarbs, 1),
    };
  }, [getTodayPlan, getTodayFoodLog, completionsByDate, user?.mealCount]);

  const clearAllData = useCallback(async () => {
    try {
      console.log('Starting data clear process...');
      
      // Reset state first (only app-scoped user data; do NOT touch subscription state)
      setUser(null);
      setCheckins([]);
      setPlans([]);
      setBasePlans([]);
      setFoodLogs([]);
      setExtras([]);
      setCompletionsByDate({});
      
      // Then clear AsyncStorage (scoped to current uid). Intentionally preserve any
      // subscription-related keys (e.g., RevenueCat cache, paywall bypass) and notification prefs.
      await Promise.all([
        AsyncStorage.removeItem(KEYS.USER),
        AsyncStorage.removeItem(KEYS.CHECKINS),
        AsyncStorage.removeItem(KEYS.PLANS),
        AsyncStorage.removeItem(KEYS.BASE_PLANS),
        AsyncStorage.removeItem(KEYS.FOOD_LOG),
        AsyncStorage.removeItem(KEYS.EXTRAS),
        AsyncStorage.removeItem(KEYS.COMPLETIONS),
        AsyncStorage.removeItem(scopedKey('Liftor_food_ops', uid)),
      ]);
      
      console.log('All data cleared successfully (subscription data preserved)');
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }, [KEYS.USER, KEYS.CHECKINS, KEYS.PLANS, KEYS.BASE_PLANS, KEYS.FOOD_LOG, KEYS.EXTRAS, KEYS.COMPLETIONS, uid]);

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
    loadUserData,
    processFoodOpsQueue,
    hydrateFromDatabase,
  }), [user, checkins, plans, basePlans, foodLogs, extras, isLoading, updateUser, addCheckin, addPlan, addBasePlan, updateBasePlanDay, getCurrentBasePlan, getRecentCheckins, getTodayCheckin, getTodayPlan, getTodayFoodLog, getTodayExtras, addFoodEntry, addExtraFood, getNutritionProgress, getStreak, getWeightData, getLatestWeight, getWeightProgress, getCompletedMealsForDate, getCompletedExercisesForDate, toggleMealCompleted, toggleExerciseCompleted, clearAllData, syncLocalToBackend, loadUserData, processFoodOpsQueue, hydrateFromDatabase]);

  return value;
});