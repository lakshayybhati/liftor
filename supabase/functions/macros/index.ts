// deno-lint-ignore-file no-explicit-any
// Use esm.sh for zod to avoid deno.land fetch issues during graph creation
// @ts-ignore - Remote imports resolved by Deno at runtime/deploy
import { z } from "https://esm.sh/zod@3.23.8";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
// Base64 helper without external deps (Edge runtime supports btoa)

// Minimal Deno typing to make editors happy when not in Deno
declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

// ===== Input Schemas =====
const InBase = z.object({
  notes: z.string().optional(),
  previewOnly: z.boolean().optional().default(true),
  // ISO8601 (with or without offset). If no offset, treat as TZ_LOCAL clock time
  occurred_at_local: z.string().optional(),
});

const InText = InBase.extend({
  kind: z.literal("text"),
  name: z.string().min(2),
  portion: z.string().min(1),
});

const InImage = InBase.extend({
  kind: z.literal("image"),
  image_path: z.string().min(3), // Supabase Storage path
});

const InReq = z.union([InText, InImage]);

// ===== Output Schema (Macros) =====
const MacroItem = z.object({
  name: z.string(),
  quantity: z.string(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});

const MacroResp = z.object({
  items: z.array(MacroItem).min(1),
  totals: z.object({
    kcal: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
  }),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional().default(""),
});

type ErrorCode =
  | "BAD_INPUT"
  | "RATE_LIMITED"
  | "MODEL_TIMEOUT"
  | "PARSE_FAILED"
  | "STORAGE_ERROR"
  | "UNAUTHORIZED"
  | "CONFLICT"
  | "INTERNAL";

function errorResponse(code: ErrorCode, message: string, status = 400) {
  console.error(`[macros] Error: ${code} - ${message}`);
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function dayKeyLocal(date: Date, tz = Deno.env.get("TZ_LOCAL") || "Asia/Kolkata") {
  const s = date.toLocaleString("en-CA", { timeZone: tz, hour12: false });
  return s.slice(0, 10); // YYYY-MM-DD
}

function normalizeWhen(occurred_at_local?: string) {
  const now = new Date();
  if (!occurred_at_local) return { atUtc: now, dayKey: dayKeyLocal(now) };
  const tz = Deno.env.get("TZ_LOCAL") || "Asia/Kolkata";
  const hasOffset = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(occurred_at_local);
  if (hasOffset) {
    const d = new Date(occurred_at_local);
    return { atUtc: d, dayKey: dayKeyLocal(d) };
  }
  // Interpret as wall-clock in TZ_LOCAL
  const d = new Date(occurred_at_local.replace(" ", "T"));
  const parts = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  return { atUtc: parts, dayKey: dayKeyLocal(parts) };
}

function requireIdempotencyKey(req: Request) {
  const k = req.headers.get("Idempotency-Key");
  if (!k) throw errorResponse("BAD_INPUT", "Missing Idempotency-Key", 400);
  return k;
}

// ===== Providers =====
async function callDeepSeekForManual(input: {
  name: string;
  portion: string;
  notes?: string;
}): Promise<z.infer<typeof MacroResp>> {
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) throw errorResponse("INTERNAL", "Missing DEEPSEEK_API_KEY", 500);

  const payload = {
    model: "deepseek-chat",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a nutrition expert. Return ONLY JSON with fields: items[{name,quantity,calories,protein_g,carbs_g,fat_g}], totals{kcal,protein_g,carbs_g,fat_g}, confidence (0..1), notes."
      },
      {
        role: "user",
        content: `Food: ${input.name}\nPortion: ${input.portion}\nNotes: ${input.notes ?? ""}\nReturn valid JSON only.`,
      },
    ],
    temperature: 0.2,
  };

  const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    // deno-lint-ignore no-explicit-any
    signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(60000) : undefined,
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw errorResponse("INTERNAL", `DeepSeek failed: ${t || r.status}`, 502);
  }
  const j = await r.json().catch(() => ({}));
  const text = j?.choices?.[0]?.message?.content ?? "{}";
  try {
    return MacroResp.parse(JSON.parse(text));
  } catch (e) {
    console.error("[macros] DeepSeek parse error:", e);
    throw errorResponse("PARSE_FAILED", "DeepSeek JSON parse failed", 502);
  }
}

async function callGeminiForImage(signedUrl: string, notes?: string): Promise<z.infer<typeof MacroResp>> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw errorResponse("INTERNAL", "Missing GEMINI_API_KEY", 500);

  const imgResp = await fetch(signedUrl, {
    // deno-lint-ignore no-explicit-any
    signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(60000) : undefined,
  });
  if (!imgResp.ok) throw errorResponse("STORAGE_ERROR", "Signed URL fetch failed", 502);
  const buf = new Uint8Array(await imgResp.arrayBuffer());
  // Convert bytes → binary string → base64 (Edge runtime has btoa)
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  const base64 = btoa(binary);

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: base64 } },
          { text: `Analyze this food image and estimate nutrition. ${notes ?? ""}` },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      response_mime_type: "application/json",
      response_schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity: { type: "string" },
                calories: { type: "number" },
                protein_g: { type: "number" },
                carbs_g: { type: "number" },
                fat_g: { type: "number" },
              },
              required: ["name", "quantity", "calories", "protein_g", "carbs_g", "fat_g"],
            },
          },
          totals: {
            type: "object",
            properties: {
              kcal: { type: "number" },
              protein_g: { type: "number" },
              carbs_g: { type: "number" },
              fat_g: { type: "number" },
            },
            required: ["kcal", "protein_g", "carbs_g", "fat_g"],
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          notes: { type: "string" },
        },
        required: ["items", "totals", "confidence"],
      },
    },
  };

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    // deno-lint-ignore no-explicit-any
    signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(60000) : undefined,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw errorResponse("INTERNAL", `Gemini failed: ${t || r.status}` as string, 502);
  }
  const json = await r.json().catch(() => ({}));
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  try {
    return MacroResp.parse(JSON.parse(text));
  } catch (e) {
    console.error("[macros] Gemini parse error:", e);
    throw errorResponse("PARSE_FAILED", "Gemini JSON parse failed", 502);
  }
}

function gramsFromQuantity(q: string | undefined): number | null {
  if (!q) return null;
  const m = q.match(/(\d+(?:[\.,]\d+)?)\s*g/i);
  if (!m) return null;
  const val = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(val) ? val : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log(`[macros] Request received: ${req.method} ${req.url}`);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    
    if (!supabaseUrl || !supabaseAnon) {
      return errorResponse("INTERNAL", "Server not configured: Missing SUPABASE credentials", 500);
    }
    
    // Log available API keys for debugging
    console.log(`[macros] Environment check - DeepSeek: ${!!deepseekKey}, Gemini: ${!!geminiKey}`);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("UNAUTHORIZED", "Unauthorized", 401);

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    let input: z.infer<typeof InReq>;
    try {
      const body = await req.json();
      console.log(`[macros] Request body:`, JSON.stringify(body));
      input = InReq.parse(body);
      console.log(`[macros] Parsed input - kind: ${input.kind}, previewOnly: ${input.previewOnly}`);
    } catch (e) {
      console.error(`[macros] Input parse error:`, e);
      return errorResponse("BAD_INPUT", "Invalid request body", 400);
    }

    // Basic insert rate limiting per user/day (optional skip for previews)
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes?.user?.id ?? null;
    if (!uid) return errorResponse("UNAUTHORIZED", "Unauthorized", 401);

    // Compute macros
    let macros: z.infer<typeof MacroResp>;
    if (input.kind === "text") {
      console.log(`[macros] Processing text input: ${input.name}, ${input.portion}`);
      if (!Deno.env.get("DEEPSEEK_API_KEY")) {
        return errorResponse("INTERNAL", "DeepSeek API key not configured", 500);
      }
      macros = await callDeepSeekForManual({
        name: input.name,
        portion: input.portion,
        notes: input.notes,
      });
    } else {
      console.log(`[macros] Processing image input: ${input.image_path}`);
      if (!Deno.env.get("GEMINI_API_KEY")) {
        return errorResponse("INTERNAL", "Gemini API key not configured", 500);
      }
      const { data: signed, error } = await supabase.storage
        .from("food_snaps")
        .createSignedUrl(input.image_path, 60);
      if (error || !signed?.signedUrl) {
        console.error(`[macros] Storage error:`, error);
        return errorResponse("STORAGE_ERROR", error?.message || "Signing failed", 502);
      }
      console.log(`[macros] Got signed URL, calling Gemini...`);
      macros = await callGeminiForImage(signed.signedUrl, input.notes);
    }
    console.log(`[macros] Macros computed successfully`);

    if (input.previewOnly) {
      return new Response(JSON.stringify(macros), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Insert authoritative row
    const idemKey = requireIdempotencyKey(req);
    const { atUtc, dayKey } = normalizeWhen(input.occurred_at_local);

    const portionQty = macros.items[0]?.quantity ?? null;
    const portionWeightG = gramsFromQuantity(portionQty);
    // Optional nutrition mapping: try to map first item name to canonical food
    let mappedFoodId: string | null = null;
    try {
      const firstName = macros.items[0]?.name || '';
      if (firstName) {
        const { data: match } = await supabase
          .from('canonical_foods')
          .select('id,name,alt_names')
          .ilike('name', firstName)
          .maybeSingle();
        if (match?.id) mappedFoodId = match.id as string;
      }
    } catch {}

    const insert = {
      user_id: uid,
      occurred_at_utc: atUtc.toISOString(),
      day_key_local: dayKey,
      name: macros.items.map((i: { name: string }) => i.name).join(", "),
      calories: Math.round(macros.totals.kcal),
      protein: macros.totals.protein_g,
      carbs: macros.totals.carbs_g,
      fat: macros.totals.fat_g,
      portion: portionQty,
      portion_weight_g: portionWeightG,
      confidence: macros.confidence ?? null,
      notes: macros.notes ?? null,
      image_path: input.kind === "image" ? (input as any).image_path : null,
      source: input.kind === "image" ? "snap" : "manual",
      idempotency_key: idemKey,
      food_id: mappedFoodId,
    } as const;

    // Upsert by (user_id, idempotency_key)
    const { data: row, error: upErr } = await supabase
      .from("food_extras")
      .upsert(insert, { onConflict: "user_id,idempotency_key" })
      .select()
      .maybeSingle();

    if (upErr) {
      // If unique conflict, try to fetch existing row
      const isConflict = /duplicate key|unique/i.test(upErr.message || "");
      if (!isConflict) return errorResponse("INTERNAL", upErr.message, 500);
      const { data: existing, error: fetchErr } = await supabase
        .from("food_extras")
        .select("*")
        .eq("user_id", uid)
        .eq("idempotency_key", idemKey)
        .maybeSingle();
      if (fetchErr) return errorResponse("CONFLICT", fetchErr.message, 409);
      return new Response(JSON.stringify(existing), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(row), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error(`[macros] Unhandled error:`, e);
    if (e instanceof Response) return e;
    const msg = typeof e === "string" ? e : (e as any)?.message || String(e);
    return errorResponse("INTERNAL", msg, 500);
  }
});


