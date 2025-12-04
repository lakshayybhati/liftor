// deno-lint-ignore-file no-explicit-any
// @ts-ignore - Remote import is resolved by Deno at runtime/deploy
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

/**
 * /session/status - Single source of truth for access state
 * 
 * Called on app launch and resume to determine user's access level.
 * All access decisions are made server-side using server time.
 * 
 * Response format:
 * {
 *   access: {
 *     full: boolean,        // Has active subscription
 *     trial: boolean,       // Has active trial
 *     canUseApp: boolean,   // Can access core features (full OR trial)
 *     canExportData: boolean,      // Subscription-only
 *     canEditPreferences: boolean  // Subscription-only
 *   },
 *   trial: {
 *     active: boolean,
 *     endsAt: string | null,
 *     type: 'none' | 'local' | 'storekit'
 *   },
 *   subscriptionStatus: 'none' | 'active' | 'expired',
 *   hasHadLocalTrial: boolean,
 *   discountEligibleImmediate: boolean
 * }
 */

interface SessionStatusResponse {
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

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Extract JWT from Authorization header
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Create client with user's token to get their identity
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Verify the user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Use service role client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Fetch user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(`
        subscription_active,
        subscription_expiration_at,
        trial_type,
        trial_active,
        trial_started_at,
        trial_ends_at,
        has_had_local_trial,
        discount_eligible_immediate,
        discount_used_at
      `)
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('[session-status] Profile fetch error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profile' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Handle case where profile doesn't exist yet
    if (!profile) {
      const defaultResponse: SessionStatusResponse = {
        access: {
          full: false,
          trial: false,
          canUseApp: false,
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
      return new Response(JSON.stringify(defaultResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const now = new Date();

    // Compute subscription status from profile (synced by RevenueCat webhook)
    const hasSubscription = profile.subscription_active === true;
    let subscriptionStatus: 'none' | 'active' | 'expired' = 'none';
    
    if (hasSubscription) {
      subscriptionStatus = 'active';
    } else if (profile.subscription_expiration_at) {
      // Had subscription but it expired
      const expDate = new Date(profile.subscription_expiration_at);
      if (expDate < now) {
        subscriptionStatus = 'expired';
      }
    }

    // Compute local trial status using SERVER time
    let trialActive = false;
    let trialType: 'none' | 'local' | 'storekit' = (profile.trial_type as any) || 'none';
    let trialEndsAt: string | null = profile.trial_ends_at || null;

    if (profile.trial_type === 'local' && profile.trial_ends_at) {
      const trialEnd = new Date(profile.trial_ends_at);
      trialActive = now < trialEnd;
      
      // If trial just expired, update the database
      if (!trialActive && profile.trial_active) {
        console.log('[session-status] Local trial expired for user:', userId);
        await supabaseAdmin
          .from('profiles')
          .update({ trial_active: false })
          .eq('id', userId);
      }
    } else if (profile.trial_active) {
      // Handle storekit or other trial types
      trialActive = profile.trial_active;
    }

    // Compute access flags
    const canUseApp = hasSubscription || trialActive;
    const canExportData = hasSubscription; // Subscription-only
    const canEditPreferences = hasSubscription; // Subscription-only

    const response: SessionStatusResponse = {
      access: {
        full: hasSubscription,
        trial: trialActive && !hasSubscription,
        canUseApp,
        canExportData,
        canEditPreferences,
      },
      trial: {
        active: trialActive,
        endsAt: trialActive ? trialEndsAt : null,
        type: trialType,
      },
      subscriptionStatus,
      hasHadLocalTrial: profile.has_had_local_trial ?? false,
      discountEligibleImmediate: profile.discount_eligible_immediate ?? true,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (e) {
    console.error('[session-status] Unhandled error:', e);
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});


