// deno-lint-ignore-file no-explicit-any
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!supabaseUrl || !supabaseAnon) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    const supabase = createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: authHeader } } });
    const { id } = await req.json().catch(() => ({}));
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

    const { error } = await supabase.from('food_extras').delete().eq('id', id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});




