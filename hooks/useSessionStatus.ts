/**
 * useSessionStatus - Client-side hook for session/access state
 * 
 * Fetches from /session/status on mount and app resume.
 * Provides the single source of truth for access control on the client.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useCallback, useEffect, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import Constants from 'expo-constants';

export interface SessionStatus {
  access: {
    full: boolean;
    trial: boolean;
    canUseApp: boolean;
    canExportData: boolean;
    canEditPreferences: boolean;
  };
  trial: {
    active: boolean;
    endsAt: string | null;
    type: 'none' | 'local' | 'storekit';
  };
  subscriptionStatus: 'none' | 'active' | 'expired';
  hasHadLocalTrial: boolean;
  discountEligibleImmediate: boolean;
}

// Default status when endpoint is unavailable - fail OPEN to prevent paywall loops
// This allows the app to function while edge functions are being deployed
const DEFAULT_SESSION_STATUS: SessionStatus = {
  access: {
    full: false,
    trial: false,
    canUseApp: true, // Fail open - allow access when endpoint unavailable
    canExportData: false,
    canEditPreferences: false,
  },
  trial: {
    active: false,
    endsAt: null,
    type: 'none',
  },
  subscriptionStatus: 'none',
  hasHadLocalTrial: false,
  discountEligibleImmediate: true,
};

// Status returned when endpoint fails - indicates we should use fallback logic
// Note: We fail OPEN for canUseApp (to prevent paywall loops) but CLOSED for premium features
const FALLBACK_SESSION_STATUS: SessionStatus = {
  access: {
    full: false,
    trial: false,
    canUseApp: true, // Fail open - allow app access to prevent loops
    canExportData: false, // Fail closed - premium feature
    canEditPreferences: false, // Fail closed - premium feature
  },
  trial: {
    active: false,
    endsAt: null,
    type: 'none',
  },
  subscriptionStatus: 'none',
  hasHadLocalTrial: false,
  discountEligibleImmediate: true,
};

async function fetchSessionStatus(supabaseUrl: string, accessToken: string): Promise<SessionStatus> {
  const url = `${supabaseUrl}/functions/v1/session-status`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[useSessionStatus] Fetch failed:', response.status, errorText);
    throw new Error(`Failed to fetch session status: ${response.status}`);
  }

  const data = await response.json();
  return data as SessionStatus;
}

export async function startLocalTrial(supabaseUrl: string, accessToken: string): Promise<SessionStatus> {
  const url = `${supabaseUrl}/functions/v1/trial-local-start`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.message || errorData.error || 'Failed to start trial';
    console.error('[startLocalTrial] Failed:', response.status, errorData);
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data as SessionStatus;
}

export function useSessionStatus() {
  const { session, supabase } = useAuth();
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const queryClient = useQueryClient();

  // Get Supabase URL from config
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  const supabaseUrl = extra.EXPO_PUBLIC_SUPABASE_URL || '';

  const sessionStatusQuery = useQuery({
    queryKey: ['sessionStatus', session?.user?.id],
    enabled: !!session?.access_token && !!supabaseUrl,
    queryFn: async (): Promise<SessionStatus> => {
      if (!session?.access_token || !supabaseUrl) {
        return DEFAULT_SESSION_STATUS;
      }
      
      try {
        return await fetchSessionStatus(supabaseUrl, session.access_token);
      } catch (error) {
        console.error('[useSessionStatus] Error fetching status:', error);
        // Return fallback status on error - fail OPEN to prevent paywall loops
        // This allows the app to function while edge functions are being deployed
        console.warn('[useSessionStatus] Using fallback status - edge function may not be deployed');
        return FALLBACK_SESSION_STATUS;
      }
    },
    staleTime: 30 * 1000, // Consider fresh for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  // Compute effective status - PRIORITIZE profile data FIRST
  // Profile is the most reliable source (updated by RevenueCat webhook)
  // Only fall back to API/defaults if profile doesn't show subscription/trial
  const effectiveStatus = useMemo((): SessionStatus => {
    // FIRST: Check profile data (most reliable, doesn't depend on edge function)
    const profileSubscribed = Boolean(profile?.subscription_active);
    const profileTrialActive = Boolean(profile?.trial_active);
    const profileTrialEndsAt = profile?.trial_ends_at || null;
    const profileTrialType = profile?.trial_type || 'none';
    const profileHasHadTrial = Boolean(profile?.has_had_local_trial);
    
    // If profile shows subscription, use that (RevenueCat webhook updates this)
    if (profileSubscribed) {
      return {
        access: {
          full: true,
          trial: false,
          canUseApp: true,
          canExportData: true,
          canEditPreferences: true,
        },
        trial: {
          active: false,
          endsAt: null,
          type: 'none',
        },
        subscriptionStatus: 'active',
        hasHadLocalTrial: profileHasHadTrial,
        discountEligibleImmediate: false,
      };
    }
    
    // If profile shows active trial, use that
    if (profileTrialActive && profileTrialEndsAt) {
      const trialEnd = new Date(profileTrialEndsAt);
      const now = new Date();
      if (trialEnd > now) {
        return {
          access: {
            full: false,
            trial: true,
            canUseApp: true,
            canExportData: false,
            canEditPreferences: false,
          },
          trial: {
            active: true,
            endsAt: profileTrialEndsAt,
            type: profileTrialType as 'none' | 'local' | 'storekit',
          },
          subscriptionStatus: 'none',
          hasHadLocalTrial: true,
          discountEligibleImmediate: false,
        };
      }
    }
    
    // SECOND: Check API response (if edge function is deployed and returned data)
    const apiStatus = sessionStatusQuery.data;
    if (apiStatus?.access.full || apiStatus?.access.trial) {
      return apiStatus;
    }
    
    // THIRD: Return default (fail open for canUseApp to prevent paywall loops)
    return DEFAULT_SESSION_STATUS;
  }, [sessionStatusQuery.data, profile]);

  // Refetch on app resume to get fresh subscription status
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && session?.user?.id) {
        queryClient.invalidateQueries({ queryKey: ['sessionStatus', session.user.id] });
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [session?.user?.id, queryClient]);

  const refetch = useCallback(() => {
    if (session?.user?.id) {
      return queryClient.invalidateQueries({ queryKey: ['sessionStatus', session.user.id] });
    }
  }, [session?.user?.id, queryClient]);

  const startTrial = useCallback(async (): Promise<SessionStatus> => {
    if (!session?.access_token || !supabaseUrl) {
      throw new Error('Not authenticated');
    }
    
    const result = await startLocalTrial(supabaseUrl, session.access_token);
    
    // Invalidate both session status and profile caches to ensure UI updates
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sessionStatus', session.user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['profile', session.user?.id] }),
    ]);
    
    return result;
  }, [session?.access_token, session?.user?.id, supabaseUrl, queryClient]);

  // Combined loading state - wait for profile to load (most important)
  // Don't wait for sessionStatusQuery since edge function might not be deployed
  const isLoading = isProfileLoading;

  // While loading, return safe defaults that allow app access
  if (isLoading) {
    return {
      data: DEFAULT_SESSION_STATUS,
      isLoading: true,
      isError: false,
      error: null,
      refetch,
      startTrial,
      canUseApp: true, // Allow access while loading
      isTrial: false,
      isSubscribed: false,
      canExportData: false,
      canEditPreferences: false,
      trialEndsAt: null,
      hasHadLocalTrial: false,
      discountEligibleImmediate: true,
    };
  }

  return {
    data: effectiveStatus,
    isLoading: false,
    isError: sessionStatusQuery.isError,
    error: sessionStatusQuery.error,
    refetch,
    startTrial,
    // Convenience accessors - use effectiveStatus which prioritizes profile data
    canUseApp: effectiveStatus.access.canUseApp,
    isTrial: effectiveStatus.access.trial,
    isSubscribed: effectiveStatus.access.full,
    canExportData: effectiveStatus.access.canExportData,
    canEditPreferences: effectiveStatus.access.canEditPreferences,
    trialEndsAt: effectiveStatus.trial.endsAt,
    hasHadLocalTrial: effectiveStatus.hasHadLocalTrial,
    discountEligibleImmediate: effectiveStatus.discountEligibleImmediate,
  };
}

/**
 * Format time remaining for trial badge
 */
export function formatTrialTimeRemaining(endsAt: string | null): string {
  if (!endsAt) return '';
  
  const now = new Date();
  const end = new Date(endsAt);
  const diffMs = end.getTime() - now.getTime();
  
  if (diffMs <= 0) return 'Expired';
  
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;
  
  if (diffDays > 0) {
    return `${diffDays}d ${remainingHours}h left`;
  } else if (diffHours > 0) {
    return `${diffHours}h left`;
  } else {
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    return `${diffMinutes}m left`;
  }
}

