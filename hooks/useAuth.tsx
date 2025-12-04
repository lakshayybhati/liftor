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

  // Utility: demote noisy network errors to warnings during development
  function logAuthError(label: string, error: any) {
    const msg = String((error && (error.message || error)) || '');
    const isNetwork =
      /network request failed/i.test(msg) ||
      /AuthRetryableFetchError/i.test(msg) ||
      /TypeError: Network request failed/i.test(msg);
    // Avoid red error overlay spam for transient network issues in dev
    if (__DEV__ && isNetwork) {
      console.warn(`[Auth] ${label}`, error);
    } else {
      console.error(`[Auth] ${label}`, error);
    }
  }
  // Expose globally within this module
  (global as any).__AUTH_LOG_ERROR__ = logAuthError;
  
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
          (global as any).__AUTH_LOG_ERROR__?.('getSession error', error);
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
        (global as any).__AUTH_LOG_ERROR__?.('init error', e);
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
        // Do not navigate here; let app/index.tsx handle redirects to avoid remount loops
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
          (global as any).__AUTH_LOG_ERROR__?.('exchangeCodeForSession error', error);
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (type === 'recovery') {
            router.replace('/auth/reset-password');
          } else {
            router.replace('/');
          }
        } else {
          router.replace('/auth/login');
        }
      } catch (e) {
        (global as any).__AUTH_LOG_ERROR__?.('Deep link handling exception', e);
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
          (global as any).__AUTH_LOG_ERROR__?.('Profile fetch error', fetchErr);
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
            (global as any).__AUTH_LOG_ERROR__?.('Upsert after RLS denial failed', upErrFallback);
            
            // Detect stale session: user no longer exists in auth.users (FK violation 23503)
            const isFkViolation = (upErrFallback as any)?.code === '23503' || /foreign key constraint/i.test(upErrFallback.message || '');
            if (isFkViolation) {
              console.warn('[Auth] User does not exist in auth.users (stale session). Signing out.');
              try { await supabase.auth.signOut(); } catch {}
              return false;
            }
          } catch (e) {
            (global as any).__AUTH_LOG_ERROR__?.('Upsert attempt after RLS denial threw', e);
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
          (global as any).__AUTH_LOG_ERROR__?.('Profile creation error', upErr);
          logProductionMetric('error', 'profile_create_failed', { error: upErr.message, uid });
          
          // Detect stale session: user no longer exists in auth.users (FK violation 23503)
          const isFkViolation = (upErr as any)?.code === '23503' || /foreign key constraint/i.test(upErr.message || '');
          if (isFkViolation) {
            console.warn('[Auth] User does not exist in auth.users (stale session). Signing out.');
            try { await supabase.auth.signOut(); } catch {}
            return false;
          }
          
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
            (global as any).__AUTH_LOG_ERROR__?.('Backfill name error', upErr2);
          }
        }
        return true;
      }
    } catch (e) {
      (global as any).__AUTH_LOG_ERROR__?.('ensureProfileExists exception', e);
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
    const { identifier, method = 'email', mode = 'login' } = params;
    try {
      setIsAuthLoading(true);
      console.log('[Auth] requestOtp start', { identifier, method, mode });
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
      // For signup mode, we allow user creation; for login/reset, we don't create new users
      const shouldCreateUser = mode === 'signup';
      const { error } = await supabase.auth.signInWithOtp({
        email: identifier,
        options: { shouldCreateUser, emailRedirectTo: redirectTo },
      });
      if (error) {
        console.error('[Auth] requestOtp error', error);
        const errorMsg = error.message?.toLowerCase() || '';
        const isRate = /rate/i.test(errorMsg) || (error as any).status === 429;
        
        // Handle specific error cases
        if (errorMsg.includes('user not found') || errorMsg.includes('no user found')) {
          return { success: false, error: 'No account found with this email. Please sign up first.' };
        }
        if (isRate) {
          return { success: false, error: 'Too many requests. Please wait a moment.', cooldownSeconds: 60 };
        }
        return { success: false, error: error.message || 'Failed to send code.' };
      }
      console.log('[Auth] requestOtp success');
      return { success: true };
    } catch (e: any) {
      console.error('[Auth] requestOtp exception', e);
      const msg = e?.message || 'Unable to send code. Try again.';
      return { success: false, error: msg };
    } finally {
      setIsAuthLoading(false);
    }
  }, [supabase]);

  const verifyOtp = useCallback(async (params: { identifier: string; code: string; method?: 'email' | 'phone'; mode?: 'login' | 'signup' | 'reset' }) => {
    const { identifier, code, method = 'email', mode = 'login' } = params;
    try {
      setIsAuthLoading(true);
      console.log('[Auth] verifyOtp start', { identifier, method, mode });
      if (!identifier || !code) return { success: false, error: 'Enter the 6-digit code.' };

      if (method === 'phone') {
        const { error } = await supabase.auth.verifyOtp({ phone: identifier, token: code, type: 'sms' });
        if (error) {
          console.error('[Auth] verifyOtp phone error', error);
          return { success: false, error: getOtpErrorMessage(error) };
        }
        await seedProfileIfMissing();
        return { success: true };
      }

      const { error } = await supabase.auth.verifyOtp({ email: identifier, token: code, type: 'email' });
      if (error) {
        console.error('[Auth] verifyOtp email error', error);
        return { success: false, error: getOtpErrorMessage(error) };
      }
      console.log('[Auth] verifyOtp success');
      await seedProfileIfMissing();
      return { success: true };
    } catch (e: any) {
      console.error('[Auth] verifyOtp exception', e);
      const msg = e?.message || 'Verification failed. Try again.';
      return { success: false, error: msg };
    } finally {
      setIsAuthLoading(false);
    }
  }, [supabase]);
  
  // Helper function to get user-friendly OTP error messages
  function getOtpErrorMessage(error: any): string {
    const msg = error?.message?.toLowerCase() || '';
    if (msg.includes('invalid') || msg.includes('incorrect')) {
      return 'Invalid code. Please check and try again.';
    }
    if (msg.includes('expired')) {
      return 'Code has expired. Please request a new one.';
    }
    if (msg.includes('rate') || msg.includes('too many')) {
      return 'Too many attempts. Please wait a moment.';
    }
    return error?.message || 'Verification failed. Try again.';
  }

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setIsAuthLoading(true);
      console.log('[Auth] signIn start', { email });
      // Clear any existing session before attempting new sign-in to avoid leaks
      try { await supabase.auth.signOut(); } catch {}
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        console.error('[Auth] signIn error', error);
        logProductionMetric('error', 'signin_failed', { error: error.message });
        
        // Handle specific error cases with user-friendly messages
        const errorMsg = error.message?.toLowerCase() || '';
        if (errorMsg.includes('invalid login credentials') || 
            errorMsg.includes('invalid credentials') ||
            errorMsg.includes('wrong password')) {
          return { success: false, error: 'Invalid email or password. Please check your credentials and try again.' };
        }
        if (errorMsg.includes('email not confirmed') || 
            errorMsg.includes('not confirmed')) {
          return { success: false, error: 'Email not confirmed. Please check your inbox for the confirmation link.' };
        }
        if (errorMsg.includes('user not found') || 
            errorMsg.includes('no user found')) {
          return { success: false, error: 'No account found with this email. Please sign up first.' };
        }
        if (errorMsg.includes('rate') || errorMsg.includes('too many')) {
          return { success: false, error: 'Too many login attempts. Please wait a moment and try again.' };
        }
        if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
          return { success: false, error: 'Network error. Please check your connection and try again.' };
        }
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
      (global as any).__AUTH_LOG_ERROR__?.('signIn exception', e);
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
        
        // Handle specific error cases with user-friendly messages
        const errorMsg = error.message?.toLowerCase() || '';
        if (errorMsg.includes('user already registered') || 
            errorMsg.includes('already exists') ||
            errorMsg.includes('duplicate') ||
            error.message?.includes('User already registered')) {
          return { success: false, error: 'An account with this email already exists. Please sign in instead.' };
        }
        if (errorMsg.includes('password') && errorMsg.includes('weak')) {
          return { success: false, error: 'Password is too weak. Please use a stronger password.' };
        }
        if (errorMsg.includes('rate') || errorMsg.includes('too many')) {
          return { success: false, error: 'Too many attempts. Please wait a moment and try again.' };
        }
        return { success: false, error: error.message };
      }
      
      // CRITICAL: Supabase returns a "fake success" for existing users when email confirmation is enabled
      // The user object will have an empty identities array if the email already exists
      // This is to prevent email enumeration attacks
      const userIdentities = data.user?.identities ?? [];
      if (data.user && userIdentities.length === 0) {
        console.warn('[Auth] signUp detected existing user (empty identities array)');
        logProductionMetric('auth', 'signup_existing_user_detected', { email });
        return { 
          success: false, 
          error: 'An account with this email already exists. Please sign in instead.' 
        };
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
      (global as any).__AUTH_LOG_ERROR__?.('signUp exception', e);
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
      (global as any).__AUTH_LOG_ERROR__?.('googleSignIn exception', e);
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
      (global as any).__AUTH_LOG_ERROR__?.('resend exception', e);
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
      (global as any).__AUTH_LOG_ERROR__?.('reset password exception', e);
      return { success: false, error: 'Failed to send reset email. Try again.' };
    }
  }, [supabase]);

  const signOut = useCallback(async () => {
    try {
      setIsAuthLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) console.error('[Auth] signOut error', error);
    } catch (e) {
      (global as any).__AUTH_LOG_ERROR__?.('signOut exception', e);
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