import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useCallback } from 'react';

export interface Profile {
  id: string;
  email: string;
  name: string;
  goal: 'WEIGHT_LOSS' | 'MUSCLE_GAIN' | 'ENDURANCE' | 'GENERAL_FITNESS' | 'FLEXIBILITY_MOBILITY' | null;
  equipment: string[];
  dietary_prefs: string[];
  dietary_notes: string | null;
  training_days: number | null;
  timezone: string | null;
  onboarding_complete: boolean | null;
  age: number | null;
  sex: 'Male' | 'Female' | null;
  height: number | null;
  weight: number | null;
  activity_level: 'Sedentary' | 'Lightly Active' | 'Moderately Active' | 'Very Active' | 'Extra Active' | null;
  daily_calorie_target: number | null;
  goal_weight: number | null;
  supplements: string[];
  supplement_notes: string | null;
  personal_goals: string[];
  perceived_lacks: string[];
  training_style_preferences: string[];
  avoid_exercises: string[];
  preferred_training_time: string | null;
  session_length: number | null;
  travel_days: number | null;
  fasting_window: string | null;
  meal_count: number | null;
  injuries: string | null;
  budget_constraints: string | null;
  wake_time: string | null;
  sleep_time: string | null;
  step_target: number | null;
  caffeine_frequency: string | null;
  alcohol_frequency: string | null;
  stress_baseline: number | null;
  sleep_quality_baseline: number | null;
  preferred_workout_split: string | null;
  special_requests: string | null;
  vmn_transcription: string | null;
  workout_intensity: 'Optimal' | 'Ego lifts' | 'Recovery focused' | null;
  base_plan: unknown | null;
  // RevenueCat subscription fields
  rc_app_user_id?: string | null;
  rc_customer_id?: string | null;
  rc_entitlements?: string[];
  subscription_active?: boolean;
  subscription_platform?: string | null;
  subscription_will_renew?: boolean | null;
  subscription_expiration_at?: string | null;
  subscription_renewal_at?: string | null;
  last_rc_event?: unknown | null;
  
  // Local trial fields (server-managed 3-day trial)
  trial_type?: 'none' | 'local' | 'storekit' | null;
  trial_active?: boolean;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  has_had_local_trial?: boolean;
  
  // Discount eligibility
  discount_eligible_immediate?: boolean;
  discount_used_at?: string | null;
}

export function useProfile() {
  const { supabase, session } = useAuth();
  const qc = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ['profile', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async (): Promise<Profile | null> => {
      if (!session?.user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      if (error) throw error;
      
      // Map legacy DB column to new field
      const profile = data as any;
      if (profile) {
        profile.training_style_preferences = profile.preferred_exercises;
      }
      return profile as Profile;
    },
    staleTime: 0,
    gcTime: 0,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      if (!session?.user?.id) throw new Error('No user session');
      
      const payload: any = { ...updates, id: session.user.id };
      // Map new field to legacy DB column
      if (payload.training_style_preferences !== undefined) {
        payload.preferred_exercises = payload.training_style_preferences;
        delete payload.training_style_preferences;
      }

      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      
      // Map result back
      const profile = data as any;
      if (profile) {
        profile.training_style_preferences = profile.preferred_exercises;
      }
      return profile as Profile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', session?.user?.id] });
    },
  });

  const updateAvatarUrl = useMutation({
    mutationFn: async (avatarUrl: string) => {
      if (!session) throw new Error('No session');
      const { error } = await supabase.auth.updateUser({
        data: { avatar_url: avatarUrl },
      });
      if (error) throw error;
      // Ensure session metadata reflects the new avatar immediately across the app
      try { await supabase.auth.refreshSession(); } catch {}
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', session?.user?.id] });
    },
  });

  const uploadAvatar = useCallback(
    async (uri: string): Promise<string> => {
      const userId = session?.user?.id;
      if (!userId) throw new Error('No user');
      const safeUri = (uri ?? '').trim();
      if (!safeUri) throw new Error('Invalid image');
      const fileName = `${userId}/${Date.now()}.jpg`;
      const res = await fetch(safeUri);
      const blob = await res.blob();
      const { data, error } = await supabase.storage.from('avatars').upload(fileName, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(data.path);
      return pub.publicUrl;
    },
    [session, supabase]
  );

  return {
    data: profileQuery.data ?? null,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error as Error | null,
    refetch: profileQuery.refetch,
    updateProfile: updateProfileMutation.mutateAsync,
    isUpdating: updateProfileMutation.isPending,
    uploadAvatar,
    updateAvatarUrl: updateAvatarUrl.mutateAsync,
  };
}
