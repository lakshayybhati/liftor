// deno-lint-ignore-file no-explicit-any
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

Deno.serve(async (_req: Request): Promise<Response> => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const keepDays = Number(Deno.env.get("RETENTION_DAYS") || 90);
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    // List objects in bucket older than keepDays, skip thumbnails
    // Note: Storage list API is limited; iterate per-year/month prefix if desired
    const now = Date.now();
    const cutoff = now - keepDays * 86400 * 1000;
    let removed = 0;
    const { data: list, error } = await (supabase as any).storage.from('food_snaps').list('', { limit: 1000, search: '' });
    if (error) throw error;
    const targets = (list || []).filter((o: any) => !o.name.includes('/thumbs/') && new Date(o.created_at || o.updated_at || now).getTime() < cutoff);
    for (const obj of targets) {
      try { await (supabase as any).storage.from('food_snaps').remove([obj.name]); removed++; } catch {}
    }
    return new Response(JSON.stringify({ ok: true, removed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});




