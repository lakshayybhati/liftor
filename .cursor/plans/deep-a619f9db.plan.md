<!-- a619f9db-792c-4e5b-a37e-b216a287e9f9 f7d1ef56-bee7-4ee2-bcfa-177b6e3dba31 -->
# Production-ready Manual & Snap Food (DeepSeek + Gemini)

### Scope

- Server: One Edge Function `macros` that handles both manual (text→DeepSeek) and snap (image→Gemini), validates via Zod, computes Asia/Kolkata day key, supports backdating, idempotent inserts, preview-only mode, and RLS-backed writes.
- Storage: Private bucket `food_snaps` with dated path and UUID filenames; signed URLs used server-side for analysis; client caches signed URLs briefly for rendering.
- Client: Replace direct LLM calls with Supabase function calls; upload images to Storage; preview then insert (with Idempotency-Key); optimistic updates with retry queue and undo; derived totals via selectors; offline-capable; delete by id across any day.

### 1) Supabase setup

- Apply/patch `public.food_extras` (use SQL editor). Ensure columns/constraints to support idempotency, auditing, and portion normalization:
```sql
-- Base (create if missing)
create table if not exists public.food_extras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at_utc timestamptz not null default now(),
  day_key_local date not null,
  name text not null,
  calories integer not null check (calories >= 0),
  protein numeric not null check (protein >= 0),
  carbs numeric not null check (carbs >= 0),
  fat numeric not null check (fat >= 0),
  portion text null,
  confidence numeric null check (confidence between 0 and 1),
  notes text null,
  image_path text null
);

-- DDL patch: source/audit/portion_weight_g + idempotency
alter table public.food_extras
  add column if not exists source text check (source in ('manual','snap')) default 'manual' not null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists portion_weight_g numeric null,
  add column if not exists idempotency_key text;

-- Idempotency: one logical insert per user+key
create unique index if not exists food_extras_user_idem_uniq
  on public.food_extras (user_id, idempotency_key);

-- Indexes for reads
create index if not exists food_extras_user_day_idx
  on public.food_extras (user_id, day_key_local desc);
create index if not exists food_extras_user_day_source_idx
  on public.food_extras (user_id, day_key_local desc, source);

-- RLS
alter table public.food_extras enable row level security;
create policy if not exists "read own" on public.food_extras for select using (auth.uid() = user_id);
create policy if not exists "insert own" on public.food_extras for insert with check (auth.uid() = user_id);
create policy if not exists "update own" on public.food_extras for update using (auth.uid() = user_id);
create policy if not exists "delete own" on public.food_extras for delete using (auth.uid() = user_id);
```

- Create private bucket `food_snaps`.
- Edge env vars: `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `TZ_LOCAL=Asia/Kolkata`.
- (Optional) Add a scheduled job/process for image lifecycle (purge originals after N days; keep thumbnails) if costs rise.

### 2) Edge Function: `supabase/functions/macros/index.ts`

- Single endpoint with discriminator `kind: "text" | "image"`.
- Validate input/output using Zod. Include backdating via `occurred_at_local` and strict error taxonomy.
```ts
// Input
const InBase = z.object({
  notes: z.string().optional(),
  previewOnly: z.boolean().optional().default(true),
  // ISO8601 without offset (treated in TZ_LOCAL) or with offset; server normalizes
  occurred_at_local: z.string().optional(),
});
const InText = InBase.extend({ kind: z.literal('text'), name: z.string().min(2), portion: z.string().min(1) });
const InImage = InBase.extend({ kind: z.literal('image'), image_path: z.string().min(3) });
const InReq = z.union([InText, InImage]);

// Output (macros)
const MacroItem = z.object({ name: z.string(), quantity: z.string(), calories: z.number(), protein_g: z.number(), carbs_g: z.number(), fat_g: z.number() });
const MacroResp = z.object({
  items: z.array(MacroItem).min(1),
  totals: z.object({ kcal: z.number(), protein_g: z.number(), carbs_g: z.number(), fat_g: z.number() }),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional().default(''),
});

// Error taxonomy
type ErrorCode = 'BAD_INPUT' | 'RATE_LIMITED' | 'MODEL_TIMEOUT' | 'PARSE_FAILED' | 'STORAGE_ERROR' | 'UNAUTHORIZED' | 'CONFLICT' | 'INTERNAL';
function err(code: ErrorCode, message: string, status = 400) {
  return new Response(JSON.stringify({ code, message }), { status, headers: { 'Content-Type': 'application/json' } });
}

// Day key in TZ_LOCAL
function dayKeyLocal(date: Date, tz = Deno.env.get('TZ_LOCAL') || 'Asia/Kolkata') {
  const s = date.toLocaleString('en-CA', { timeZone: tz, hour12: false });
  return s.slice(0, 10); // YYYY-MM-DD
}

// Parse occurred_at_local → UTC
function normalizeWhen(occurred_at_local?: string) {
  const now = new Date();
  if (!occurred_at_local) return { atUtc: now, dayKey: dayKeyLocal(now) };
  // If string has offset, Date will honor it; else treat as TZ_LOCAL clock time
  const tz = Deno.env.get('TZ_LOCAL') || 'Asia/Kolkata';
  const hasOffset = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(occurred_at_local);
  if (hasOffset) {
    const d = new Date(occurred_at_local);
    return { atUtc: d, dayKey: dayKeyLocal(d) };
  }
  // Interpret as local wall clock in TZ_LOCAL
  const d = new Date(occurred_at_local.replace(' ', 'T'));
  // Convert pretend-local to TZ_LOCAL by adjusting using Intl format
  const parts = new Date(d.toLocaleString('en-US', { timeZone: tz }));
  return { atUtc: parts, dayKey: dayKeyLocal(parts) };
}

// Idempotency (required for writes)
function requireIdempotencyKey(req: Request) {
  const k = req.headers.get('Idempotency-Key');
  if (!k) throw new Response(JSON.stringify({ code: 'BAD_INPUT', message: 'Missing Idempotency-Key' }), { status: 400 });
  return k;
}
```

- Logic:
  - Auth via `Authorization` header; require valid user.
  - Rate limiting: per-user/day basic cap for inserts; previews can be separately limited later.
  - `kind="text"`: call DeepSeek chat completions (JSON mode if available), parse text and validate with Zod. `portion_weight_g`: best-effort grams extraction from `items[0].quantity` (regex for `g`), else null.
  - `kind="image"`: create signed URL for `image_path`, fetch, call Gemini with `response_mime_type: application/json` and explicit schema; validate with Zod; extract `portion_weight_g` similarly if present.
  - Compute `occurred_at_utc`/`day_key_local` using `normalizeWhen`.
  - If `previewOnly=true`: return `MacroResp` only.
  - Else (insert):
    - Read `Idempotency-Key` header; set `source` = 'manual' | 'snap'.
    - Build row with: `user_id`, `occurred_at_utc`, `day_key_local`, `name` (joined), `calories`, `protein`, `carbs`, `fat`, `portion` (first quantity), `portion_weight_g`, `confidence`, `notes`, `image_path` (image only), `source`, `idempotency_key`.
    - Upsert with conflict on `(user_id,idempotency_key)` to prevent duplicates; if duplicate, fetch and return existing row.
    - Standardize errors using taxonomy.
- Timeouts (15s), retries (2) for 5xx/timeouts with jitter; map timeouts to `MODEL_TIMEOUT`, 429/limit to `RATE_LIMITED`.

### 3) (Optional) Edge Function: delete by id

- `supabase/functions/food-extras-delete/index.ts` or direct client delete: accept `{ id }` only; rely on RLS. No date assumption.

### 4) Client changes (Expo)

- Remove all client-side LLM calls in `app/snap-food.tsx`.
- Image pipeline:
  - After capture: compress (~1280px, JPEG ~0.75), strip EXIF.
  - Upload to Storage path `food_snaps/${uid}/${YYYY}/${MM}/${DD}/${uuid}.jpg` with `contentType: 'image/jpeg'`.
  - Preview: call `macros` with `{ kind: 'image', image_path, notes, occurred_at_local?, previewOnly: true }`.
  - Confirm: call again with `previewOnly: false` and header `Idempotency-Key: <uuid>`; store returned row.
- Manual pipeline:
  - Preview: call `macros` with `{ kind: 'text', name, portion, notes, occurred_at_local?, previewOnly: true }`.
  - Confirm: same payload with `previewOnly: false` + `Idempotency-Key` header.
- Store (`hooks/useUserStore.ts`):
  - Replace direct inserts; accept server row for extras; generate temp optimistic items (`temp-<uuid>`) and swap on success.
  - Derived totals only: remove stored totals fields; add selectors that sum per render.
  - Delete: call delete by `id` only (no “today” assumption); update local state accordingly.
  - Offline queue: enqueue preview/insert/delete ops with backoff retry; mark items `syncing/failed`; undo within 10s (drop local if pending; enqueue delete if committed).
  - Signed URL caching: batch sign when listing snaps; cache in-memory with short TTL to cut round-trips.
  - Circuit breaker: after repeated failures, show banner and route users to Manual; reset after cooldown.
  - Sentry: capture function errors (include taxonomy code), latency, and retries.
- Screens:
  - `app/snap-food.tsx`: replace analysis and add two-step preview/confirm; show confidence; if <0.6 show editable warning; auto-fallback to manual if camera denied.
  - `app/food-entries.tsx`, `app/food-snaps.tsx`: use selectors; delete by id; render images via cached signed URLs.
  - `app/plan.tsx`: compute totals via selectors; remove reliance on stored totals.

### 5) API contracts

- Preview (no DB write):
```http
POST /functions/v1/macros
Authorization: Bearer <access_token>
Content-Type: application/json

{ "kind": "text", "name": "paneer tikka", "portion": "150 g", "notes": "grilled", "occurred_at_local": "2025-10-23T13:05", "previewOnly": true }
```


```http

{ "kind": "image", "image_path": "food_snaps/<uid>/2025/10/23/<uuid>.jpg", "notes": "thali", "occurred_at_local": "2025-10-23T13:05", "previewOnly": true }

````
- Insert (DB write, idempotent):
```http
POST /functions/v1/macros
Authorization: Bearer <access_token>
Idempotency-Key: <uuid>
Content-Type: application/json

{ "kind": "text", "name": "paneer tikka", "portion": "150 g", "notes": "grilled", "occurred_at_local": "2025-10-23T13:05", "previewOnly": false }
````

- Success (preview): `MacroResp` JSON.
- Success (insert): inserted row including `id`, `occurred_at_utc`, `day_key_local`, `name`, `calories/protein/carbs/fat`, `portion`, `portion_weight_g`, `confidence`, `notes`, `image_path`, `source`.
- Errors: `{ code: ErrorCode, message: string }` with appropriate HTTP status.

### 6) Testing

- Unit: Zod (in/out), grams parsing, `normalizeWhen` incl. DST edges, selector totals, offline queue reducers.
- Integration: Manual (DeepSeek) preview→insert (idempotent), Image (Gemini) preview→insert, RLS visibility, delete any day by id.
- E2E (Detox): camera denied→manual; offline insert queued→sync; delete past day; undo; low-confidence banner.
- Load: k6 script hammering preview-only (mix manual/snap); verify retries, timeouts, and circuit breaker behavior.

### 7) Telemetry, flags, lifecycle

- Nutrition DB mapping (optional): attempt map macro items to canonical foods (USDA/IFCT) and store `food_id` alongside free-text.
- Cost/usage telemetry: provider, latency, success/fail, token/cost estimates; alerts on spikes.
- Feature flags: gradual rollout per platform; kill-switch per provider.
- Image lifecycle policy: retain originals; consider purge after N days with thumbnail retention.

### 8) Rollout

- Feature flag new flow; fall back to legacy if Edge down.
- Migrate existing rows to populate `day_key_local`, `source`, and `image_path` (null for manual), and backfill `occurred_at_utc` if needed.

### Green-light checklist

- Edge `macros` handles both kinds, validates with Zod, computes `day_key_local` (IST), supports preview/insert with idempotency, returns canonical JSON/error taxonomy.
- Client: no third-party LLMs; images→private Storage; preview shows confidence; confirm inserts with `Idempotency-Key`.
- Store: derived totals; offline queue + undo; delete by id across any day.
- Resilience: rate limits, retries, circuit breaker banners; Sentry wired.

### To-dos

- [ ] Apply new food_extras schema, RLS, and backfill day_key_local (IST).
- [ ] Create private bucket food_snaps and set policies.
- [ ] Implement macros Edge Function with Zod, DeepSeek, Gemini, preview/insert.
- [ ] Implement optional delete Edge Function or use RLS delete.
- [ ] Upload image to Storage; call macros preview/insert for snaps.
- [ ] Call macros preview/insert for manual entry.
- [ ] Replace stored totals with selectors; compute per render.
- [ ] Add optimistic queue, retries, and undo flow in store.
- [ ] Refactor snap-food screen to new preview/confirm UX.
- [ ] Update food-entries/food-snaps to use selectors and signed URLs.
- [ ] Remove direct Supabase insert from addExtraFood; consume server row.
- [ ] Add timeouts, retry x2, and circuit breaker UI.
- [ ] Integrate Sentry for client error capture.
- [ ] Document env vars, API contracts, and runbooks.