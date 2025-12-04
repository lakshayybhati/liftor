<!-- c170cc53-400f-4a45-8184-a0895e3a0965 31747258-83a4-4d38-84fd-fdfa4c65df52 -->
# Server-Side Base Plan Generation Hardening Plan

## 1. Confirm current wiring & environment

- **Trace the user flow**: Onboarding / Program Settings → `createAndTriggerServerPlanJob` → Supabase Edge Functions (`create-plan-job`, `process-plan-queue`) → `plan_generation_jobs` → `weekly_base_plans` → `app/plan-building.tsx` polling via `utils/server-plan-generation.ts`.
- **Verify environment/secrets**: Ensure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `DEEPSEEK_API_KEY` are correctly set for the deployed Supabase functions, using the guidance already in `SERVER_PLAN_GENERATION.md` and the existing diagnostics helpers (`production-config`, `plan-generation-diagnostics`).
- **Reproduce the stuck-job case**: In a dev/staging environment, intentionally run the flow that currently hangs (from onboarding to `plan-building`) and inspect the corresponding `plan_generation_jobs` row (status, `retry_count`, `error_code`, `error_message`) to confirm whether jobs are getting stuck in `pending`, `processing`, or repeatedly flipping between states.

## 2. Align server generation logic with the desired base plan engine

- **Compare prompts & constraints**: Line up `supabase/functions/process-plan-queue/index.ts` Stage 1 and Stage 2 prompts with `utils/basePlanPromptBuilder.ts` and `services/planFixer.ts`, ensuring that:
- Nutrition (
- `total_kcal` and `protein_g`) and meal-count rules,
- dietary rules (Vegetarian / Eggitarian / Non-veg),
- avoid-exercise rules,
- supplement card structure,
- and day coverage (all 7 days with workout/nutrition/recovery/reason)
are identical to what the app expects.
- **Unify final enforcement rules**: Make sure the final enforcement in the server pipeline (post Stage 2) mirrors `planFixer` (force exact kcal/protein, ensure `reason` and `recovery.supplementCard` exist for each day) so that whatever passes on the server would also pass the client-side validators.
- **Add lightweight structural validation before saving**: Before inserting into `weekly_base_plans`, run a simple runtime schema check similar to `validateWeeklyPlan` (no heavy dependency, just key structure checks) so structurally bad plans are caught and surfaced as `VALIDATION_FAILED` instead of silently saved.

## 3. Make the job queue fully robust (no permanent pending/processing jobs)

- **Tighten `fail_plan_job` semantics**: Update `supabase/migrations/20251130_plan_generation_jobs.sql` so that `fail_plan_job` marks a job as `failed` once `retry_count` reaches `max_retries` (no off‑by‑one extra attempts), and ensure `retry_count` / `max_retries` semantics are clearly documented.
- **Use timeouts correctly in `process-plan-queue`**: Wire the `INTERNAL_TIMEOUT_MS` and `AbortController` in `supabase/functions/process-plan-queue/index.ts` so that long-running DeepSeek calls or pipeline attempts are explicitly aborted and mapped to `AI_TIMEOUT` (or similar), and always go through `fail_plan_job` in a `catch` or outer `finally` path.
- **Guarantee progress for stuck jobs**: Confirm `claim_next_plan_job`, `reset_stuck_plan_job`, `cancel_plan_job`, and `get_active_plan_job` work correctly together:
- When an Edge Function crashes or is killed mid-run, jobs should eventually be seen as stuck (`status = processing`, `started_at` old) and reset back to `pending` (or failed) by `reset_stuck_plan_job`.
- For jobs left in `pending` due to systematic issues (e.g., function misconfiguration), introduce either a small DB-side cleanup function (e.g., mark very old pending jobs as `failed` with an appropriate `error_code`) or a recovery pass inside `process-plan-queue` that detects unclaimable jobs.
- **Standardize error codes**: Normalize `error_code` values in `process-plan-queue` (e.g., `AI_TIMEOUT`, `AI_RATE_LIMIT`, `JSON_PARSE_ERROR`, `VALIDATION_FAILED`, `CONFIG_ERROR`, `UNEXPECTED_ERROR`) and ensure all failure paths set a useful `error_message` and `error_code` for the client to interpret.

## 4. Improve Plan Building screen behavior and UX

- **Use richer job status on the client**: In `app/plan-building.tsx`, when polling via `getJobStatus`, inspect `result.job.error_code` / `error_message` to map to more precise UI states (e.g. quota issue vs. config issue vs. generic error) instead of a single generic error message.
- **Guard against infinite waiting**: Add a client-side max-wait guard tied to the estimator (`plan-time-estimator.ts`) and/or a hard cap (e.g. 15 minutes):
- If a job remains `pending` or repeatedly flips between `pending`/`processing` beyond the cap, surface an error state, show a clear message, and offer a retry that also cleans up the stuck job via `cancelJob` or `resetStuckJob`.
- **Wire duration tracking into the estimator**: When a job completes or definitively fails, use the job timestamps (`created_at`, `completed_at` or tracked on the client) to call `recordGenerationTime` so future estimates in `PlanBuildingScreen` are based on real server runtimes instead of static assumptions.
- **Improve logging for debugging**: Keep the existing console logs, but augment them with consistent `jobId`, `status`, `retry_count`, and `error_code` fields so that reproducing a 1‑hour spinner from logs is straightforward.

## 5. Consolidate triggers from Onboarding and Program Settings

- **Centralize job creation & triggering**: Extract the shared logic from `app/onboarding.tsx` and `app/program-settings.tsx` that currently calls `createAndTriggerServerPlanJob` into a single helper (or small service), so both flows:
- write user settings to the store,
- start the server job,
- and navigate to `/plan-building` in a uniform way with identical error handling.
- **Ensure auth assumptions hold**: Confirm that when these flows run, `useAuth` always has a valid session and that the Supabase client used by `server-plan-generation.ts` shares the same session (it already uses AsyncStorage auth, but we should validate it in practice and add a clear error if auth is missing).
- **Clarify regeneration semantics**: In `app/program-settings.tsx`, make sure regeneration:
- respects the “once every 2 weeks” logic,
- cancels/marks any previous in-flight job as failed when the user explicitly regenerates,
- and clearly informs the user that the old active plan will be replaced once the new job is `completed`.

## 6. Clean up legacy client-side generation paths

- **Retire unused background client engine**: The background client generator in `services/backgroundPlanGeneration.ts` still references `generateBasePlan` from `services/basePlanEngine.ts` (which now throws). Confirm it is not used in any live flow; if unused, either:
- remove it entirely, or
- refactor it to be a thin wrapper around the server job system (so any future background concept still uses the Supabase queue).
- **Leave `basePlanEngine` as server-only for weekly plans**: Keep `services/basePlanEngine.ts` focused on daily plan generation and shared nutrition helpers; ensure that all weekly base plan generation in the app goes through the server (`server-plan-generation.ts` + Edge Functions) and there are no lingering client-only call sites.
- **Remove dead screens and references**: Since `app/generating-base-plan.tsx` has been deleted, double-check navigation (`_layout.tsx`) and any deep-links / notification payloads (e.g. in `process-plan-queue` push notifications) to ensure they all point to `/plan-building` / `/plan-preview` instead of the old screen.

## 7. Strengthen tests, diagnostics, and docs

- **Add a server-pipeline test harness**: Create a lightweight test script (similar to `utils/production-test.ts`) that:
- uses a couple of representative `User` fixtures,
- calls `createAndTriggerServerPlanJob`,
- polls with `getJobStatus` until `completed` or `failed`,
- and asserts that the resulting plans pass the same validators (`validateWeeklyPlan`) used in other test suites.
- **Extend existing test suites where sensible**: Where tests currently call `generateWeeklyBasePlan` (client API), ensure they either:
- are clearly marked as “offline pipeline tests” using the shared prompt builders and `planFixer`, or
- are updated to optionally exercise the server pipeline when running against a staging environment with network access.
- **Document operational playbook**: Update `SERVER_PLAN_GENERATION.md` and `PLAN_VERIFICATION_SYSTEM.md` to reflect the finalized, server-first architecture:
- job table / RPC behavior and retry limits,
- how to read `plan_generation_jobs` to debug a user’s stuck generation,
- how error codes surface back into the app,
- and a short “smoke test” checklist to run after deploying functions.

## 8. Rollout and monitoring

- **Deploy in a safe order**: Apply DB migrations / SQL changes first, then deploy updated Edge Functions, and finally ship the React Native app changes that depend on new error codes or behaviors.
- **Monitor early usage**: For the first sessions after rollout, use Supabase logs and in-app logging to watch for:
- excessive retries,
- specific error_code clusters (e.g. AI quota issues),
- or any remaining cases where jobs never leave `pending`.
- **Iterate on time estimates & UX**: Once real-world job durations are recorded via `recordGenerationTime`, tune the `plan-time-estimator` configuration (base times and complexity weights) so that the loading screen feels honest and reactive, reducing user anxiety during the multi-minute generation window.