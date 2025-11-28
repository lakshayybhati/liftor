import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getProductionConfig } from '@/utils/production-config';

const GAME_STORAGE_KEY = 'Liftor_game_stats';

export interface GameStats {
  highScore: number;
  lastPlanGameDate: string; // YYYY-MM-DD
  todayScore: number | null;
  todayDate: string | null; // YYYY-MM-DD
}

const DEFAULT_STATS: GameStats = {
  highScore: 0,
  lastPlanGameDate: '',
  todayScore: null,
  todayDate: null,
};

// Lazy Supabase client for backend persistence
let supabaseClient: SupabaseClient | null = null;

const getSupabaseClient = (): SupabaseClient | null => {
  if (supabaseClient) return supabaseClient;

  try {
    const config = getProductionConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      // In dev or misconfigured environments, just skip backend sync
      return null;
    }
    supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey);
    return supabaseClient;
  } catch (e) {
    console.warn('[GameStorage] Failed to create Supabase client for game stats', e);
    return null;
  }
};

// Helper to get scoped key
const getStorageKey = (userId?: string) => 
  userId ? `${GAME_STORAGE_KEY}:${userId}` : GAME_STORAGE_KEY;

export const getGameStats = async (userId?: string): Promise<GameStats> => {
  try {
    const json = await AsyncStorage.getItem(getStorageKey(userId));
    if (!json) return DEFAULT_STATS;
    return { ...DEFAULT_STATS, ...JSON.parse(json) };
  } catch (e) {
    console.warn('Failed to load game stats', e);
    return DEFAULT_STATS;
  }
};

export const saveGameScore = async (score: number, userId?: string) => {
  try {
    const stats = await getGameStats(userId);
    const today = new Date().toISOString().split('T')[0];
    
    const newStats: GameStats = {
      highScore: Math.max(stats.highScore, score),
      lastPlanGameDate: today,
      todayScore: score,
      todayDate: today,
    };

    await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(newStats));

    // Also persist to backend so game stats are available server-side
    const supabase = getSupabaseClient();
    if (supabase && userId) {
      try {
        await supabase
          .from('game_stats')
          .upsert(
            {
              user_id: userId,
              date: today,
              score,
              high_score: newStats.highScore,
            } as any,
            { onConflict: 'user_id,date' }
          );
      } catch (err) {
        // Don't fail the app if analytics sync fails
        console.warn('[GameStorage] Failed to sync game stats to backend', err);
      }
    }

    return newStats;
  } catch (e) {
    console.error('Failed to save game stats', e);
    return null;
  }
};

export const markGamePlayedToday = async (userId?: string) => {
  try {
    const stats = await getGameStats(userId);
    const today = new Date().toISOString().split('T')[0];
    
    const newStats: GameStats = {
      ...stats,
      lastPlanGameDate: today,
    };

    await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(newStats));
  } catch (e) {
    console.error('Failed to mark game played', e);
  }
};

export const canPlayGame = async (isRedo: boolean, userId?: string): Promise<boolean> => {
  if (isRedo) return false;

  const stats = await getGameStats(userId);
  const today = new Date().toISOString().split('T')[0];

  // Only play if we haven't played today
  return stats.lastPlanGameDate !== today;
};
