<!-- fca05a75-cbdc-4c7a-b786-69a849636e9a e2419cec-2dc9-4918-b018-a140cb1aafca -->
# Fix Server-Side Base Plan Generation System

## Analysis Summary

After a deep dive into the codebase, I identified the following issues in the plan generation flow from onboarding through server-side generation:

### Critical Issues Found

1. **Jobs stuck in "processing" state** - The queue processor returns "no_jobs" even when jobs exist, suggesting lock/state management issues
2. **Heartbeat race condition** - Lock extension doesn't verify worker_id ownership
3. **Code duplication** - Server has separate implementations of nutrition calculations, prompt building, and plan fixing that can diverge from client-side code
4. **Missing supplement guide** - Server lacks the detailed `COMMON_SUPPLEMENTS_GUIDE` from client
5. **Unreachable cleanup code** - Lines 1216-1217 in `process-plan-queue/index.ts` never execute
6. **Production test broken** - Uses deprecated `generateWeeklyBasePlan()` function

### Files to Modify

**Primary:**

- `supabase/functions/process-plan-queue/index.ts` - Fix heartbeat, cleanup, timeouts
- `supabase/migrations/20251130_plan_generation_jobs.sql` - Fix `claim_next_plan_job` to handle stuck jobs better
- `utils/server-plan-generation.ts` - Improve stuck job detection

**Secondary:**

- `app/plan-building.tsx` - Better error state handling
- `utils/production-test.ts` - Update to use server-side generation

---

## Implementation Plan

### Phase 1: Fix Job Claiming and Stuck Detection

**1.1 Update `claim_next_plan_job` function in migrations**

The function should:

- Reclaim jobs stuck in "processing" with expired locks
- Add better logging for debugging
```sql
-- In claim_next_plan_job: change the WHERE clause
WHERE status = 'pending'
   OR (status = 'processing' AND locked_until < NOW())
```


**1.2 Fix heartbeat to verify worker ownership**

In `process-plan-queue/index.ts`, line ~1083:

```typescript
await serviceClient
  .from("plan_generation_jobs")
  .update({ locked_until: new Date(...) })
  .eq("id", jobId)
  .eq("status", "processing")
  .eq("worker_id", workerId);  // ADD THIS
```

**1.3 Move cleanup code before return statements**

Lines 1216-1217 are unreachable. Move them into the try block before the return.

---

### Phase 2: Sync Server and Client Code

**2.1 Add supplement guide to server**

Extract `formatSupplementGuide()` and `COMMON_SUPPLEMENTS_GUIDE` logic to server prompt builder.

**2.2 Ensure nutrition calculations match**

Compare and align:

- `getCalorieTarget()` - Server vs `utils/basePlanPromptBuilder.ts`
- `getProteinTarget()` - Server vs client
- `calculateTDEE()` - Server vs client

Current server uses `1.1` multiplier for MUSCLE_GAIN, client uses `1.15`. Need to align.

---

### Phase 3: Improve Error Recovery

**3.1 Better stuck job detection on client**

In `utils/server-plan-generation.ts`, update `isJobStuck()`:

```typescript
export function isJobStuck(job: ServerPlanJob): boolean {
  if (job.status !== 'processing') return false;
  const lockedUntil = job.locked_until ? new Date(job.locked_until).getTime() : 0;
  // Job is stuck if lock has expired
  if (lockedUntil && lockedUntil < Date.now()) return true;
  // Also check if processing for too long regardless of lock
  const startedAt = job.started_at ? new Date(job.started_at).getTime() : 0;
  if (startedAt && Date.now() - startedAt > 5 * 60 * 1000) return true;
  return false;
}
```

**3.2 Add exponential backoff with jitter for DeepSeek API**

Replace linear delay with exponential backoff:

```typescript
const backoff = (2 ** attempt) * 1000 + Math.random() * 1000;
await delay(backoff);
```

---

### Phase 4: UI/UX Improvements

**4.1 Better error messages in plan-building.tsx**

Show specific error messages based on error_code from server:

- `RATE_LIMITED`: "Our AI service is busy. Your plan will be ready soon."
- `AI_TIMEOUT`: "This is taking longer than expected. We're still working on it."
- `VALIDATION_FAILED`: "We encountered an issue. Retrying..."

**4.2 Add auto-retry for recoverable errors**

If job fails with `AI_TIMEOUT` or `RATE_LIMITED`, automatically trigger retry instead of showing error.

---

### Phase 5: Production Readiness

**5.1 Fix production test file**

Update `utils/production-test.ts` to test server-side generation:

```typescript
// Replace generateWeeklyBasePlan with ser'ver-side test
const result = await createAndTriggerServerPlanJob(testUser);
// Poll for completion
const status = await waitForJobCompletion(result.jobId);
```

**5.2 Add cron job for queue processing**

Create a scheduled function or document the need for external cron to periodically trigger `process-plan-queue`.

---

## Key Code Changes Summary

| File | Change |

|------|--------|

| `process-plan-queue/index.ts` | Fix heartbeat worker_id check, move cleanup code, add exponential backoff |

| `20251130_plan_generation_jobs.sql` | Already has correct `claim_next_plan_job` logic |

| `server-plan-generation.ts` | Improve `isJobStuck()` to check locked_until |

| `plan-building.tsx` | Better error messages, auto-retry for recoverable errors |

| `production-test.ts` | Update to use server-side APIs |

## Testing Checklist

- [ ] Create job and verify it appears in DB with "pending" status
- [ ] Trigger queue processing and verify job moves to "processing"
- [ ] Verify plan generates and job completes
- [ ] Test stuck job recovery (kill Edge Function mid-process)
- [ ] Test retry on AI timeout
- [ ] Verify dietary restrictions are respected (vegetarian/eggitarian)
- [ ] Verify nutrition targets match exactly

### To-dos

- [ ] Fix heartbeat in process-plan-queue to verify worker_id ownership
- [ ] Move unreachable cleanup code before return statements
- [ ] Replace linear retry delay with exponential backoff + jitter
- [ ] Update isJobStuck() to check locked_until field
- [ ] Align nutrition calculation multipliers between server and client
- [ ] Add specific error messages and auto-retry for recoverable errors
- [ ] Update production-test.ts to use server-side generation APIs