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
}

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
let SUPABASE_URL = extra.EXPO_PUBLIC_SUPABASE_URL
  ?? process.env.EXPO_PUBLIC_SUPABASE_URL
  ?? process.env.EXPO_PUBLIC_URL
  ?? process.env.URL
  ?? '';
let SUPABASE_ANON_KEY = extra.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ?? process.env.EXPO_PUBLIC_ANON_KEY
  ?? process.env.ANON_KEY
  ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // CRITICAL: In production, the app cannot function without proper Supabase credentials
  // Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment
  console.error('[Auth] CRITICAL: Missing Supabase credentials. App will not function properly.');
  throw new Error('Missing required environment variables: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

function createSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing Supabase credentials. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
        }
        if (mounted) setSession(data.session ?? null);
      } catch (e) {
        console.error('[Auth] init error', e);
      } finally {
        if (mounted) setIsAuthLoading(false);
      }
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      console.log('[Auth] onAuthStateChange', _event);
      setSession(newSession);
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
        let code: string | null = typeof rawCode === 'string' ? rawCode : null;
        if (!code) {
          // Fallback parse via URL API for robustness
          try {
            const urlObj = new URL(url);
            code = urlObj.searchParams.get('code');
          } catch {}
        }
        if (!code) return;

        console.log('[Auth] Deep link received, exchanging code for session');
        const { error } = await supabase.auth.exchangeCodeForSession({ code });
        if (error) {
          console.error('[Auth] exchangeCodeForSession error', error);
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.replace('/home');
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

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setIsAuthLoading(true);
      // Clear any existing session before attempting new sign-in to avoid leaks
      try { await supabase.auth.signOut(); } catch {}
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('[Auth] signIn error', error);
        return { success: false, error: error.message };
      }
      const uid = data?.user?.id ?? null;
      const uemail = data?.user?.email ?? email;
      const uname = (data?.user?.user_metadata as any)?.name ?? undefined;
      if (uid) {
        try {
          const { data: existing, error: fetchErr } = await supabase
            .from('profiles')
            .select('id, name')
            .eq('id', uid)
            .maybeSingle();
          if (fetchErr) {
            console.log('[Auth] profiles fetch error (non-fatal)', fetchErr);
          }
          if (!existing) {
            console.log('[Auth] Seeding missing profile on sign in');
            const { error: upErr } = await supabase
              .from('profiles')
              .upsert({ id: uid, email: uemail, name: uname || uemail }, { onConflict: 'id' });
            if (upErr) console.log('[Auth] Seed profile error', upErr);
          } else if (!existing.name || (typeof existing.name === 'string' && existing.name.trim().length === 0)) {
            console.log('[Auth] Backfilling empty profile name from metadata/email');
            const { error: upErr2 } = await supabase
              .from('profiles')
              .update({ name: uname || uemail })
              .eq('id', uid);
            if (upErr2) console.log('[Auth] Backfill name error', upErr2);
          }
        } catch (e) {
          console.log('[Auth] Seed profile exception', e);
        }
      }
      return { success: true };
    } catch (e) {
      console.error('[Auth] signIn exception', e);
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
        return { success: false, error: error.message };
      }
      const createdUserId = data.user?.id ?? null;
      const createdEmail = data.user?.email ?? email;
      const createdName = (name ?? '').trim();
      console.log('[Auth] signUp success', { createdUserId });

      if (createdUserId && data.session) {
        try {
          console.log('[Auth] Upserting initial profile row');
          const { error: upsertErr } = await supabase
            .from('profiles')
            .upsert(
              {
                id: createdUserId,
                email: createdEmail,
                name: createdName || createdEmail,
                onboarding_complete: false,
              },
              { onConflict: 'id' }
            );
          if (upsertErr) console.error('[Auth] profile upsert after signUp error', upsertErr);
        } catch (inner) {
          console.error('[Auth] profile upsert exception', inner);
        }
      } else {
        console.log('[Auth] No active session after signUp (email confirmation likely). Relying on DB trigger to create profile.');
      }

      const needsEmailConfirmation = !data.session;
      return { success: true, needsEmailConfirmation };
    } catch (e) {
      console.error('[Auth] signUp exception', e);
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
      // Use explicit URIs for production
      const nativeRedirectTo = 'liftor://authcallback';
      const webRedirectTo = 'https://liftor.app/authcallback';

      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: webRedirectTo },
        });
        if (error) {
          console.error('[Auth] googleSignIn web error', error);
          return { success: false, error: error.message };
        }
        return { success: true };
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: nativeRedirectTo, skipBrowserRedirect: true },
      });
      if (error) {
        console.error('[Auth] googleSignIn error', error);
        return { success: false, error: error.message };
      }

      const authUrl = data?.url;
      if (!authUrl) {
        return { success: false, error: 'Auth URL not returned.' };
      }

      // Open session and rely on the deep-link listener to complete the code exchange
      const result = await WebBrowser.openAuthSessionAsync(authUrl, nativeRedirectTo);
      if (result.type !== 'success') {
        return { success: false, error: 'Authentication was cancelled.' };
      }

      // Seed profile if missing (mirrors signIn logic)
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes?.user?.id ?? null;
        const uemail = userRes?.user?.email ?? undefined;
        const uname = (userRes?.user?.user_metadata as any)?.name ?? undefined;
        if (uid) {
          const { data: existing, error: fetchErr } = await supabase
            .from('profiles')
            .select('id, name')
            .eq('id', uid)
            .maybeSingle();
          if (fetchErr) console.log('[Auth] profiles fetch error (non-fatal)', fetchErr);
          if (!existing) {
            const { error: upErr } = await supabase
              .from('profiles')
              .upsert({ id: uid, email: uemail, name: uname || uemail }, { onConflict: 'id' });
            if (upErr) console.log('[Auth] Seed profile error', upErr);
          } else if (!existing.name || (typeof existing.name === 'string' && existing.name.trim().length === 0)) {
            const { error: upErr2 } = await supabase
              .from('profiles')
              .update({ name: uname || (uemail as string | undefined) })
              .eq('id', uid);
            if (upErr2) console.log('[Auth] Backfill name error', upErr2);
          }
        }
      } catch (e) {
        console.log('[Auth] Seed profile exception (google)', e);
      }

      return { success: true };
    } catch (e) {
      console.error('[Auth] googleSignIn exception', e);
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
      const redirectTo = Linking.createURL('/auth/login');
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
    isAuthLoading,
    signIn,
    signUp,
    resendConfirmationEmail,
    signOut,
    googleSignIn,
    sendPasswordReset,
  }), [supabase, session, isAuthLoading, signIn, signUp, resendConfirmationEmail, signOut, googleSignIn, sendPasswordReset]);

  return value;
});