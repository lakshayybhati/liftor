// deno-lint-ignore-file no-explicit-any
// @ts-ignore - Remote import is resolved by Deno at runtime/deploy
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

// Provide minimal Deno types so TypeScript can type-check in non-Deno editors
declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type RCEntitlement = {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string | null;
  purchase_date?: string | null;
};

type RCSubscriptionsEntry = {
  store?: string | null; // 'app_store' | 'play_store' | 'stripe' | etc.
  expires_date?: string | null;
  unsubscribe_detected_at?: string | null;
};

interface RCSubscriberResponse {
  subscriber?: {
    original_app_user_id?: string | null;
    entitlements?: Record<string, RCEntitlement>;
    subscriptions?: Record<string, RCSubscriptionsEntry>;
  };
}

function pickAppUserId(payload: any): string | null {
  return (
    payload?.app_user_id ??
    payload?.event?.app_user_id ??
    payload?.subscriber?.app_user_id ??
    payload?.subscriber?.original_app_user_id ??
    null
  );
}

function computeActiveEntitlements(entitlements: Record<string, RCEntitlement> | undefined | null): {
  activeIds: string[];
  maxExpiration: string | null;
} {
  if (!entitlements || Object.keys(entitlements).length === 0) return { activeIds: [], maxExpiration: null };
  const now = Date.now();
  const activeIds: string[] = [];
  let maxExp: number | null = null;

  for (const [key, ent] of Object.entries(entitlements)) {
    const exp = ent?.expires_date ? Date.parse(ent.expires_date) : null;
    const grace = ent?.grace_period_expires_date ? Date.parse(ent.grace_period_expires_date) : null;
    const isActive =
      exp === null || // lifetime/no expiration
      (typeof exp === 'number' && exp > now) ||
      (typeof grace === 'number' && grace > now);
    if (isActive) {
      activeIds.push(key);
      if (typeof exp === 'number') {
        if (maxExp === null || exp > maxExp) maxExp = exp;
      }
    }
  }

  return { activeIds, maxExpiration: maxExp ? new Date(maxExp).toISOString() : null };
}

function computePlatformAndRenew(subs: Record<string, RCSubscriptionsEntry> | undefined | null): {
  platform: string | null;
  willRenew: boolean | null;
} {
  if (!subs) return { platform: null, willRenew: null };
  // Choose any subscription entry to infer platform; also infer renew state if not unsubscribed
  let platform: string | null = null;
  let willRenew: boolean | null = null;
  const now = Date.now();

  for (const entry of Object.values(subs)) {
    if (!platform && entry.store) platform = entry.store;
    const exp = entry.expires_date ? Date.parse(entry.expires_date) : null;
    const active = exp === null || (typeof exp === 'number' && exp > now);
    if (active) {
      if (entry.unsubscribe_detected_at == null) {
        willRenew = true;
      } else {
        // unsubscribed from auto-renew
        willRenew = false;
      }
    }
  }
  return { platform, willRenew };
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') || '';
    const rcSecretKey = Deno.env.get('REVENUECAT_SECRET_API_KEY') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
    const resendFrom = Deno.env.get('RESEND_FROM') || 'Liftor <support@liftor.app>';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 });
    }

    // Simple bearer verification; configure the same secret in RevenueCat dashboard webhook settings
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const bodyText = await req.text();
    let payload: any = {};
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }

    // Idempotency: ignore duplicate events
    const eventId: string | null = payload?.event?.id ?? payload?.id ?? null;
    let eventFingerprint: string | null = eventId;
    if (!eventFingerprint) {
      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bodyText));
      const hashArr = Array.from(new Uint8Array(hashBuf));
      eventFingerprint = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    const appUserId = pickAppUserId(payload);
    if (!appUserId) {
      return new Response(JSON.stringify({ error: 'Missing app_user_id' }), { status: 400 });
    }

    // Fetch subscriber state from RevenueCat for ground truth
    if (!rcSecretKey) {
      return new Response(JSON.stringify({ error: 'Missing RC secret API key' }), { status: 500 });
    }

    const rcRes = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}` , {
      headers: { Authorization: `Bearer ${rcSecretKey}` },
    });

    if (!rcRes.ok) {
      const text = await rcRes.text();
      return new Response(JSON.stringify({ error: 'RC fetch failed', detail: text }), { status: 502 });
    }

    const rcJson = (await rcRes.json()) as RCSubscriberResponse;
    const entitlements = rcJson?.subscriber?.entitlements ?? {};
    const subs = rcJson?.subscriber?.subscriptions ?? {};
    const { activeIds, maxExpiration } = computeActiveEntitlements(entitlements);
    const { platform, willRenew } = computePlatformAndRenew(subs);
    const subscriptionActive = activeIds.length > 0;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // Fetch existing profile flags to detect cancellation state transitions
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('email,name,subscription_will_renew,subscription_active')
      .eq('id', appUserId)
      .maybeSingle();

    // Idempotency short-circuit: if event_key exists, return early
    if (eventFingerprint) {
      const { data: existing } = await supabase
        .from('rc_webhook_events')
        .select('event_key')
        .eq('event_key', eventFingerprint)
        .maybeSingle();
      if (existing?.event_key) {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
      }
      // Insert marker
      await supabase
        .from('rc_webhook_events')
        .insert({ event_key: eventFingerprint })
        .then(() => {})
        .catch(() => {});
    }
    const { error } = await supabase
      .from('profiles')
      .update({
        rc_app_user_id: appUserId,
        rc_customer_id: rcJson?.subscriber?.original_app_user_id ?? appUserId,
        rc_entitlements: activeIds,
        subscription_active: subscriptionActive,
        subscription_platform: platform,
        subscription_will_renew: willRenew,
        subscription_expiration_at: maxExpiration,
        last_rc_event: payload,
      })
      .eq('id', appUserId);

    if (error) {
      return new Response(JSON.stringify({ error: 'Supabase update failed', detail: error.message }), { status: 500 });
    }

    // If user turned off auto-renew (or became inactive), send a positive farewell email once
    const turnedOffAutoRenew = (existingProfile?.subscription_will_renew ?? null) !== false && willRenew === false;
    const becameInactive = existingProfile?.subscription_active === true && subscriptionActive === false;
    const shouldSendCancelEmail = !!(resendApiKey && (turnedOffAutoRenew || becameInactive));

    if (shouldSendCancelEmail && existingProfile?.email) {
      try {
        const to = existingProfile.email;
        const name = existingProfile.name || 'Athlete';
        const subject = "We believe in you — see you soon";
        const text = `Hey ${name},\n\nOur journey was filled with feedback and lessons. We hope you achieve your goals — we’re constantly improving. If there’s anything we can do better, just reply and tell us.\n\nIf you need any help, we’re here for you. You can resubscribe anytime.\n\nYours truly,\nLiftor`;
        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height:1.6; color:#0b0b0b">
            <h2>You’ve got this.</h2>
            <p>Hey ${name},</p>
            <p>Our journey was filled with feedback and lessons. We hope you achieve your goals — we’re constantly improving. If there’s anything we can do better, just reply and tell us.</p>
            <p>If you need any help, we’re here for you. You can resubscribe anytime.</p>
            <p style="margin-top:24px">— Yours truly, <strong>Liftor</strong></p>
          </div>`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({ from: resendFrom, to, subject, text, html }),
        }).then(() => {}).catch(() => {});
      } catch {
        // best-effort only
      }
    }

    return new Response(
      JSON.stringify({ ok: true, app_user_id: appUserId, active_entitlements: activeIds, active: subscriptionActive }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Unhandled error', detail: String(e) }), { status: 500 });
  }
});


