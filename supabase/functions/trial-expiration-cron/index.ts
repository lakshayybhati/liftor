// deno-lint-ignore-file no-explicit-any
// @ts-ignore - Remote import is resolved by Deno at runtime/deploy
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

/**
 * /trial-expiration-cron - Scheduled function to expire local trials
 * 
 * Should be called every 10-15 minutes via Supabase pg_cron or external scheduler.
 * 
 * Actions:
 * 1. Find users with trial_type = 'local', trial_active = true, trial_ends_at <= now()
 * 2. Set trial_active = false for those users
 * 3. Send push notification to expired users
 */

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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const cronSecret = Deno.env.get('CRON_SECRET') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify cron secret (optional security measure)
    const authHeader = req.headers.get('Authorization') || '';
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Allow requests without auth for internal Supabase cron
      const isInternalCron = req.headers.get('X-Supabase-Cron') === 'true';
      if (!isInternalCron) {
        console.log('[trial-expiration-cron] Unauthorized request');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const now = new Date().toISOString();

    // Find users with expired local trials
    const { data: expiredUsers, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('trial_type', 'local')
      .eq('trial_active', true)
      .lte('trial_ends_at', now);

    if (fetchError) {
      console.error('[trial-expiration-cron] Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch expired trials' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!expiredUsers || expiredUsers.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, expired: 0, message: 'No expired trials found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[trial-expiration-cron] Found ${expiredUsers.length} expired trials`);

    // Expire all trials in batch
    const userIds = expiredUsers.map(u => u.id);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ trial_active: false })
      .in('id', userIds);

    if (updateError) {
      console.error('[trial-expiration-cron] Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to expire trials' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Send notifications to expired users
    const notificationPromises = expiredUsers.map(async (user) => {
      try {
        // Get push tokens for this user
        const { data: tokens } = await supabase
          .from('push_tokens')
          .select('token')
          .eq('user_id', user.id);

        if (!tokens || tokens.length === 0) {
          console.log(`[trial-expiration-cron] No push tokens for user ${user.id}`);
          return;
        }

        // Create notification record
        await supabase.from('user_notifications').insert({
          user_id: user.id,
          title: 'Trial Ended',
          body: 'Your 3-day Liftor trial has ended. Subscribe to keep your AI coach active.',
          type: 'trial_expired',
          data: { screen: '/paywall' },
        });

        // Send push notification via Expo
        const expoPushUrl = 'https://exp.host/--/api/v2/push/send';
        const messages = tokens.map(t => ({
          to: t.token,
          title: 'Trial Ended',
          body: 'Your 3-day Liftor trial has ended. Subscribe to keep your AI coach active.',
          data: { screen: '/paywall', type: 'trial_expired' },
          sound: 'default',
          badge: 1,
        }));

        await fetch(expoPushUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messages),
        });

        console.log(`[trial-expiration-cron] Notification sent to user ${user.id}`);
      } catch (e) {
        console.error(`[trial-expiration-cron] Failed to notify user ${user.id}:`, e);
      }
    });

    await Promise.allSettled(notificationPromises);

    // Also send email notifications if Resend is configured
    const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
    const resendFrom = Deno.env.get('RESEND_FROM') || 'Liftor <support@liftor.app>';

    if (resendApiKey) {
      const emailPromises = expiredUsers.map(async (user) => {
        if (!user.email) return;
        
        try {
          const name = user.name || 'Athlete';
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: resendFrom,
              to: user.email,
              subject: 'Your Liftor trial has ended',
              text: `Hey ${name},\n\nYour 3-day Liftor trial has ended. We hope you enjoyed having an AI fitness coach!\n\nSubscribe now to keep your personalized plans, daily adjustments, and AI-powered coaching.\n\nYour fitness journey is just getting started.\n\n— Team Liftor`,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height:1.6; color:#0b0b0b; max-width: 500px;">
                  <h2>Your trial has ended</h2>
                  <p>Hey ${name},</p>
                  <p>Your 3-day Liftor trial has ended. We hope you enjoyed having an AI fitness coach!</p>
                  <p>Subscribe now to keep your personalized plans, daily adjustments, and AI-powered coaching.</p>
                  <p>Your fitness journey is just getting started.</p>
                  <p style="margin-top:24px">— Team <strong>Liftor</strong></p>
                </div>
              `,
            }),
          });
          console.log(`[trial-expiration-cron] Email sent to ${user.email}`);
        } catch (e) {
          console.error(`[trial-expiration-cron] Failed to email ${user.email}:`, e);
        }
      });

      await Promise.allSettled(emailPromises);
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        expired: expiredUsers.length,
        users: userIds,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    console.error('[trial-expiration-cron] Unhandled error:', e);
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});


