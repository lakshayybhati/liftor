import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { getProductionConfig, logProductionMetric } from '@/utils/production-config';

interface AuthState {
  supabase: SupabaseClient;
  session: Session | null;
  isAuthLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ success: boolean; error?: string; needsEmailConfirmation?: boolean }>;
  resendConfirmationEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  googleSignIn: () => Promise<{ success: boolean; error?: string }>;
  sendPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  requestOtp: (params: { identifier: string; method?: 'email' | 'phone'; mode?: 'login' | 'signup' | 'reset' }) => Promise<{ success: boolean; error?: string; cooldownSeconds?: number }>;
  verifyOtp: (params: { identifier: string; code: string; method?: 'email' | 'phone'; mode?: 'login' | 'signup' | 'reset' }) => Promise<{ success: boolean; error?: string }>;
}

function getSupabaseCredentials() {
  // Use centralized production configuration
  const config = getProductionConfig();
  
  const url = config.supabaseUrl;
  const key = config.supabaseAnonKey;
  
  // Check for placeholder values that indicate missing configuration
  const isPlaceholder = (val: string) => 
    !val || 
    val.includes('your-supabase') || 
    val.includes('your-anon-key') ||
    val.includes('your_') ||
    val.length < 20;
  
  const hasValidUrl = url && !isPlaceholder(url);
  const hasValidKey = key && !isPlaceholder(key);
  
  if (!hasValidUrl || !hasValidKey) {
    console.error('[Auth] CRITICAL: Missing or invalid Supabase credentials.');
    console.error('[Auth] URL valid:', hasValidUrl, 'Key valid:', hasValidKey);
    console.error('[Auth] URL:', url ? `${url.substring(0, 20)}...` : 'none');
    console.error('[Auth] Key length:', key.length);
    console.error('[Auth] Configuration errors:', config.errors);
    console.error('[Auth] Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in EAS Secrets');
    
    // Log to production metrics
    if (config.isProduction) {
      logProductionMetric('error', 'supabase_credentials_invalid', { 
        hasValidUrl, 
        hasValidKey,
        errors: config.errors 
      });
    }
  }
  
  return { url, key, isValid: hasValidUrl && hasValidKey };
}

function createSupabase() {
  const { url, key, isValid } = getSupabaseCredentials();
  
  if (!isValid) {
    console.error('[Auth] Creating Supabase client with invalid credentials - app will not function properly');
    // Return a client anyway to prevent crashes, but it won't work
    return createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-key', {
      auth: {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  
  return createClient(url, key, {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Avoid auto URL parsing; we handle deep links ourselves
      detectSessionInUrl: false,
    },
  });
}

export const [AuthProvider, useAuth] = createContextHook<AuthState>(() => {
  const [supabase] = useState<SupabaseClient>(() => createSupabase());
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(true);
  const qc = useQueryClient();
  const prevUidRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        console.log('[Auth] Fetching initial session');
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[Auth] getSession error', error);
          logProductionMetric('error', 'session_fetch_failed', { error: error.message });
        }
        if (mounted) {
          const session = data.session ?? null;
          setSession(session);
          
          // If we have a session, ensure profile exists (non-blocking)
          if (session?.user?.id) {
            console.log('[Auth] Session restored for user:', session.user.id.substring(0, 8) + '...');
            // Make profile creation non-blocking to prevent auth initialization timeout
            ensureProfileExists(session.user.id, session.user.email, session.user.user_metadata?.name)
              .catch(error => console.warn('[Auth] Profile ensure failed during init:', error));
          }
        }
      } catch (e) {
        console.error('[Auth] init error', e);
        logProductionMetric('error', 'session_init_failed', { error: String(e) });
      } finally {
        if (mounted) {
          setIsAuthLoading(false);
          setIsBootstrapping(false);
        }
      }
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      console.log('[Auth] onAuthStateChange', _event);
      setSession(newSession);
      
      // Ensure profile exists when signing in (non-blocking)
      if (_event === 'SIGNED_IN' && newSession?.user?.id) {
        console.log('[Auth] User signed in, ensuring profile exists');
        // Make profile creation non-blocking to prevent auth state issues
        ensureProfileExists(newSession.user.id, newSession.user.email, newSession.user.user_metadata?.name)
          .catch(error => console.warn('[Auth] Profile ensure failed after sign-in:', error));
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  // Central deep-link listener to exchange code for session and navigate
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      try {
        if (!url) return;
        const parsed = Linking.parse(url);
        // Extract authorization code from query params
        const rawCode = (parsed?.queryParams as any)?.code ?? null;
        const rawType = (parsed?.queryParams as any)?.type ?? null; // e.g., 'recovery'
        let code: string | null = typeof rawCode === 'string' ? rawCode : null;
        let type: string | null = typeof rawType === 'string' ? rawType : null;
        if (!code) {
          // Fallback parse via URL API for robustness
          try {
            const urlObj = new URL(url);
            code = urlObj.searchParams.get('code');
            type = type || urlObj.searchParams.get('type');
          } catch {}
        }
        if (!code) return;

        console.log('[Auth] Deep link received, exchanging code for session');
        const { error } = await supabase.auth.exchangeCodeForSession(code as string);
        if (error) {
          console.error('[Auth] exchangeCodeForSession error', error);
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (type === 'recovery') {
            router.replace('/auth/reset-password');
          } else {
            router.replace('/home');
          }
        } else {
          router.replace('/auth/login');
        }
      } catch (e) {
        console.error('[Auth] Deep link handling exception', e);
      }
    };

    // Listen for incoming URLs
    const sub = Linking.addEventListener('url', (event) => handleUrl(event.url));
    // Handle the initial URL as well (web redirect or cold start)
    (async () => {
      const initial = await Linking.getInitialURL();
      if (initial) await handleUrl(initial);
    })();

    return () => {
      sub.remove();
    };
  }, [supabase]);

  // When the authenticated user changes, aggressively clear client caches so no stale data leaks
  useEffect(() => {
    const currentUid = session?.user?.id ?? null;
    if (prevUidRef.current !== currentUid) {
      // Clear React Query cache and any user-scoped ephemeral state other hooks might rely on
      try {
        qc.clear();
      } catch {}
      prevUidRef.current = currentUid;
    }
  }, [session?.user?.id, qc]);

  // Centralized profile creation with retry logic
  async function ensureProfileExists(uid: string, email?: string, name?: string, retries = 3): Promise<boolean> {
    try {
      console.log('[Auth] Ensuring profile exists for user:', uid.substring(0, 8) + '...');
      
      // First, check if profile exists
      const { data: existing, error: fetchErr } = await supabase
        .from('profiles')
        .select('id, name, onboarding_complete')
        .eq('id', uid)
        .maybeSingle();
      
      if (fetchErr) {
        console.error('[Auth] Profile fetch error:', fetchErr);
        logProductionMetric('error', 'profile_fetch_failed', { error: fetchErr.message, uid });
        
        // If RLS blocks select but insert is allowed, attempt upsert of own row
        const isPermissionDenied = /42501|permission denied/i.test((fetchErr as any)?.code || fetchErr.message || '');
        if (isPermissionDenied) {
          try {
            console.log('[Auth] Attempting to upsert own profile due to RLS select denial');
            const { error: upErrFallback } = await supabase
              .from('profiles')
              .upsert({ 
                id: uid, 
                email: email || 'user@example.com', 
                name: name || email || 'User',
                onboarding_complete: false
              }, { onConflict: 'id' });
            if (!upErrFallback) {
              console.log('[Auth] ✅ Profile upserted after RLS denial');
              return true;
            }
            console.warn('[Auth] Upsert after RLS denial failed:', upErrFallback);
          } catch (e) {
            console.warn('[Auth] Upsert attempt after RLS denial threw:', e);
          }
        }
        
        // If this is an auth error, retry after a delay
        if (retries > 0 && (fetchErr.message?.includes('JWT') || fetchErr.message?.includes('auth'))) {
          console.log('[Auth] Retrying profile fetch after auth error...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          return ensureProfileExists(uid, email, name, retries - 1);
        }
        return false;
      }
      
      if (!existing) {
        console.log('[Auth] Creating new profile for user');
        const { error: upErr } = await supabase
          .from('profiles')
          .upsert({ 
            id: uid, 
            email: email || 'user@example.com', 
            name: name || email || 'User',
            onboarding_complete: false
          }, { onConflict: 'id' });
        
        if (upErr) {
          console.error('[Auth] Profile creation error:', upErr);
          logProductionMetric('error', 'profile_create_failed', { error: upErr.message, uid });
          
          // Retry on transient errors
          if (retries > 0) {
            console.log('[Auth] Retrying profile creation...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            return ensureProfileExists(uid, email, name, retries - 1);
          }
          return false;
        }
        
        console.log('[Auth] ✅ Profile created successfully');
        logProductionMetric('data', 'profile_created', { uid });
        return true;
      } else {
        console.log('[Auth] ✅ Profile exists');
        
        // Backfill name if missing
        if (!existing.name || (typeof existing.name === 'string' && existing.name.trim().length === 0)) {
          console.log('[Auth] Backfilling empty profile name');
          const { error: upErr2 } = await supabase
            .from('profiles')
            .update({ name: name || email || 'User' })
            .eq('id', uid);
          if (upErr2) {
            console.warn('[Auth] Backfill name error:', upErr2);
          }
        }
        return true;
      }
    } catch (e) {
      console.error('[Auth] ensureProfileExists exception:', e);
      logProductionMetric('error', 'profile_ensure_exception', { error: String(e), uid });
      
      // Retry on unexpected errors
      if (retries > 0) {
        console.log('[Auth] Retrying after exception...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return ensureProfileExists(uid, email, name, retries - 1);
      }
      return false;
    }
  }

  async function seedProfileIfMissing() {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;
      const uemail = userRes?.user?.email ?? undefined;
      const uname = (userRes?.user?.user_metadata as any)?.name ?? undefined;
      if (!uid) return;
      
      await ensureProfileExists(uid, uemail, uname);
    } catch (e) {
      console.error('[Auth] seedProfileIfMissing exception', e);
    }
  }

  const requestOtp = useCallback(async (params: { identifier: string; method?: 'email' | 'phone'; mode?: 'login' | 'signup' | 'reset' }) => {
    const { identifier, method = 'email' } = params;
    try {
      setIsAuthLoading(true);
      try { await supabase.auth.signOut(); } catch {}
      if (!identifier) return { success: false, error: 'Enter your email or phone.' };

      if (method === 'phone') {
        const { error } = await supabase.auth.signInWithOtp({ phone: identifier });
        if (error) {
          const msg = error.message || 'Failed to send code.';
          const isRate = /rate/i.test(msg) || (error as any).status === 429;
          return { success: false, error: msg, cooldownSeconds: isRate ? 60 : undefined };
        }
        return { success: true };
      }

      const redirectTo = Linking.createURL('/auth/callback');
      const shouldCreateUser = params.mode === 'signup' ? true : true; // allow auto-create by default
      const { error } = await supabase.auth.signInWithOtp({
        email: identifier,
        options: { shouldCreateUser, emailRedirectTo: redirectTo },
      });
      if (error) {
        const msg = error.message || 'Failed to send code.';
        const isRate = /rate/i.test(msg) || (error as any).status === 429;
        return { success: false, error: msg, cooldownSeconds: isRate ? 60 : undefined };
      }
      return { success: true };
    } catch (e: any) {
      const msg = e?.message || 'Unable to send code. Try again.';
      return { success: false, error: msg };
    } finally {
      setIsAuthLoading(false);
    }
  }, [supabase]);

  const verifyOtp = useCallback(async (params: { identifier: string; code: string; method?: 'email' | 'phone'; mode?: 'login' | 'signup' | 'reset' }) => {
    const { identifier, code, method = 'email' } = params;
    try {
      setIsAuthLoading(true);
      if (!identifier || !code) return { success: false, error: 'Enter the 6-digit code.' };

      if (method === 'phone') {
        const { error } = await supabase.auth.verifyOtp({ phone: identifier, token: code, type: 'sms' });
        if (error) return { success: false, error: error.message };
        await seedProfileIfMissing();
        return { success: true };
      }

      const { error } = await supabase.auth.verifyOtp({ email: identifier, token: code, type: 'email' });
      if (error) return { success: false, error: error.message };
      await seedProfileIfMissing();
      return { success: true };
    } catch (e: any) {
      const msg = e?.message || 'Verification failed. Try again.';
      return { success: false, error: msg };
    } finally {
      setIsAuthLoading(false);
    }
  }, [supabase]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setIsAuthLoading(true);
      // Clear any existing session before attempting new sign-in to avoid leaks
      try { await supabase.auth.signOut(); } catch {}
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('[Auth] signIn error', error);
        logProductionMetric('error', 'signin_failed', { error: error.message });
        return { success: false, error: error.message };
      }
      const uid = data?.user?.id ?? null;
      const uemail = data?.user?.email ?? email;
      const uname = (data?.user?.user_metadata as any)?.name ?? undefined;
      
      if (uid) {
        console.log('[Auth] Sign in successful, ensuring profile exists');
        try {
          // Add timeout protection for profile creation (5 seconds max)
          const profilePromise = ensureProfileExists(uid, uemail, uname);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Profile creation timeout')), 5000)
          );

          const profileCreated = await Promise.race([profilePromise, timeoutPromise]);
          if (!profileCreated) {
            console.warn('[Auth] Profile creation/verification failed but allowing sign in to continue');
          }
        } catch (profileError) {
          console.warn('[Auth] Profile operation failed but allowing sign in to continue:', profileError);
        }
      }
      
      logProductionMetric('auth', 'signin_success', { uid });
      return { success: true };
    } catch (e) {
      console.error('[Auth] signIn exception', e);
      logProductionMetric('error', 'signin_exception', { error: String(e) });
      return { success: false, error: 'Unexpected error. Please try again.' };
    } finally {
      setIsAuthLoading(false);
    }
  }, [supabase]);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    try {
      setIsAuthLoading(true);
      console.log('[Auth] signUp start', { email });
      // Clear any existing session before attempting sign-up
      try { await supabase.auth.signOut(); } catch {}
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: (name ?? '').trim() || undefined } },
      });
      if (error) {
        console.error('[Auth] signUp error', error);
        logProductionMetric('error', 'signup_failed', { error: error.message });
        return { success: false, error: error.message };
      }
      const createdUserId = data.user?.id ?? null;
      const createdEmail = data.user?.email ?? email;
      const createdName = (name ?? '').trim();
      console.log('[Auth] signUp success', { createdUserId });

      if (createdUserId && data.session) {
        console.log('[Auth] Active session after signup, ensuring profile exists');
        try {
          // Add timeout protection for profile creation (5 seconds max)
          const profilePromise = ensureProfileExists(createdUserId, createdEmail, createdName || createdEmail);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Profile creation timeout')), 5000)
          );

          await Promise.race([profilePromise, timeoutPromise]);
        } catch (profileError) {
          console.warn('[Auth] Profile operation failed but allowing signup to continue:', profileError);
        }
      } else {
        console.log('[Auth] No active session after signUp (email confirmation likely). Profile will be created on first sign in.');
      }

      const needsEmailConfirmation = !data.session;
      logProductionMetric('auth', 'signup_success', { uid: createdUserId, needsConfirmation: needsEmailConfirmation });
      return { success: true, needsEmailConfirmation };
    } catch (e) {
      console.error('[Auth] signUp exception', e);
      logProductionMetric('error', 'signup_exception', { error: String(e) });
      return { success: false, error: 'Unexpected error. Please try again.' };
    } finally {
      setIsAuthLoading(false);
    }
  }, [supabase]);

  const googleSignIn = useCallback(async () => {
    try {
      setIsAuthLoading(true);
      // Clear any existing session before OAuth
      try { await supabase.auth.signOut(); } catch {}
      // Unified redirect URI for both native and web
      const redirectTo = Linking.createURL('/auth/callback');

      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        });
        if (error) {
          console.error('[Auth] googleSignIn web error', error);
          logProductionMetric('error', 'google_signin_web_failed', { error: error.message });
          return { success: false, error: error.message };
        }
        return { success: true };
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) {
        console.error('[Auth] googleSignIn error', error);
        logProductionMetric('error', 'google_signin_failed', { error: error.message });
        return { success: false, error: error.message };
      }

      const authUrl = data?.url;
      if (!authUrl) {
        return { success: false, error: 'Auth URL not returned.' };
      }

      // Open session and rely on the deep-link listener to complete the code exchange
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
      if (result.type !== 'success') {
        logProductionMetric('auth', 'google_signin_cancelled', {});
        return { success: false, error: 'Authentication was cancelled.' };
      }

      // Ensure profile exists after OAuth
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes?.user?.id ?? null;
        const uemail = userRes?.user?.email ?? undefined;
        const uname = (userRes?.user?.user_metadata as any)?.name ?? undefined;
        if (uid) {
          console.log('[Auth] Google sign in successful, ensuring profile exists');
          try {
            // Add timeout protection for profile creation (5 seconds max)
            const profilePromise = ensureProfileExists(uid, uemail, uname);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Profile creation timeout')), 5000)
            );

            await Promise.race([profilePromise, timeoutPromise]);
          } catch (profileError) {
            console.warn('[Auth] Profile operation failed but allowing Google sign in to continue:', profileError);
          }
        }
      } catch (e) {
        console.error('[Auth] Profile creation after Google sign in failed', e);
        logProductionMetric('error', 'google_signin_profile_failed', { error: String(e) });
      }

      logProductionMetric('auth', 'google_signin_success', {});
      return { success: true };
    } catch (e) {
      console.error('[Auth] googleSignIn exception', e);
      logProductionMetric('error', 'google_signin_exception', { error: String(e) });
      return { success: false, error: 'Unexpected error. Please try again.' };
    } finally {
      setIsAuthLoading(false);
    }
  }, [supabase]);

  const resendConfirmationEmail = useCallback(async (email: string) => {
    try {
      console.log('[Auth] resendConfirmationEmail', email);
      if (!email) return { success: false, error: 'Enter your email first.' };
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) {
        console.error('[Auth] resend error', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e) {
      console.error('[Auth] resend exception', e);
      return { success: false, error: 'Failed to send email. Try again.' };
    }
  }, [supabase]);

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      if (!email) return { success: false, error: 'Enter your email first.' };
      // Send user back to in-app reset screen after email link
      const redirectTo = Linking.createURL('/auth/reset-password');
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        console.error('[Auth] reset password error', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e) {
      console.error('[Auth] reset password exception', e);
      return { success: false, error: 'Failed to send reset email. Try again.' };
    }
  }, [supabase]);

  const signOut = useCallback(async () => {
    try {
      setIsAuthLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) console.error('[Auth] signOut error', error);
    } catch (e) {
      console.error('[Auth] signOut exception', e);
    } finally {
      setIsAuthLoading(false);
    }
  }, [supabase]);

  const value = useMemo<AuthState>(() => ({
    supabase,
    session,
    isAuthLoading: isAuthLoading || isBootstrapping,
    signIn,
    signUp,
    resendConfirmationEmail,
    signOut,
    googleSignIn,
    sendPasswordReset,
    requestOtp,
    verifyOtp,
  }), [supabase, session, isAuthLoading, isBootstrapping, signIn, signUp, resendConfirmationEmail, signOut, googleSignIn, sendPasswordReset, requestOtp, verifyOtp]);

  return value;
});