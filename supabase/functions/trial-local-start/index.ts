// deno-lint-ignore-file no-explicit-any
// @ts-ignore - Remote import is resolved by Deno at runtime/deploy
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

/**
 * /trial/local/start - Start a one-time 3-day local trial
 * 
 * Preconditions:
 * - User must be authenticated
 * - has_had_local_trial must be false
 * - trial_active must be false
 * 
 * Actions:
 * - Sets trial_type = 'local'
 * - Sets trial_active = true
 * - Sets trial_started_at = now()
 * - Sets trial_ends_at = now() + 3 days
 * - Sets has_had_local_trial = true
 * - Sets discount_eligible_immediate = false
 * 
 * Returns: Updated session status payload
 */

const TRIAL_DURATION_DAYS = 3;

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
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

    // Fetch current profile to check preconditions
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(`
        has_had_local_trial,
        trial_active,
        subscription_active
      `)
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('[trial-local-start] Profile fetch error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profile' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check preconditions
    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Already has active subscription - no need for trial
    if (profile.subscription_active) {
      return new Response(
        JSON.stringify({ 
          error: 'Already subscribed',
          code: 'ALREADY_SUBSCRIBED',
          message: 'You already have an active subscription.'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Already used local trial
    if (profile.has_had_local_trial) {
      return new Response(
        JSON.stringify({ 
          error: 'Trial already used',
          code: 'TRIAL_ALREADY_USED',
          message: 'You have already used your free trial. Subscribe to continue.'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Already has active trial
    if (profile.trial_active) {
      return new Response(
        JSON.stringify({ 
          error: 'Trial already active',
          code: 'TRIAL_ALREADY_ACTIVE',
          message: 'You already have an active trial.'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // All preconditions passed - start the trial
    const now = new Date();
    const endsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        trial_type: 'local',
        trial_active: true,
        trial_started_at: now.toISOString(),
        trial_ends_at: endsAt.toISOString(),
        has_had_local_trial: true,
        discount_eligible_immediate: false,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('[trial-local-start] Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to start trial' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[trial-local-start] Trial started for user:', userId, 'ends at:', endsAt.toISOString());

    // Return the new session status
    const response = {
      success: true,
      access: {
        full: false,
        trial: true,
        canUseApp: true,
        canExportData: false,
        canEditPreferences: false,
      },
      trial: {
        active: true,
        endsAt: endsAt.toISOString(),
        type: 'local',
      },
      subscriptionStatus: 'none',
      hasHadLocalTrial: true,
      discountEligibleImmediate: false,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (e) {
    console.error('[trial-local-start] Unhandled error:', e);
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});


