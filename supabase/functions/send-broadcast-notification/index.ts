import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const ADMIN_SECRET = Deno.env.get('BROADCAST_ADMIN_SECRET');

serve(async (req) => {
  try {
    const headerSecret = req.headers.get('X-Admin-Secret');
    if (!ADMIN_SECRET || headerSecret !== ADMIN_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { title, body, data, sound = 'default', priority = 'high', userIds } = await req.json();

    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'Missing title or body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
      global: { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    });

    let query = supabase.from('push_tokens').select('token, user_id');
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      // deno-lint-ignore no-explicit-any
      query = (query as any).in('user_id', userIds);
    }

    const { data: tokens, error } = await query as any;
    if (error) throw error;

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No tokens found' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const messages = tokens.map((row: { token: string }) => ({
      to: row.token,
      sound,
      title,
      body,
      data: data || {},
      priority,
      channelId: 'default',
    }));

    const chunks: any[][] = [];
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100));
    }

    const results: unknown[] = [];
    for (const chunk of chunks) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(chunk),
      });
      const resJson = await response.json();
      results.push(resJson);
    }

    return new Response(JSON.stringify({ success: true, sent: messages.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = typeof err === 'string' ? err : (err as any)?.message || 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});


