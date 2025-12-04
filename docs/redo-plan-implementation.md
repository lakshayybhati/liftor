## Redo Plan Flow — Implementation Guide

> **Status: IMPLEMENTED** ✅
> 
> This feature has been fully implemented. See details below.

### 1. Goal & Scope
- Allow a user to regenerate their weekly base plan when they are unhappy with the current one.
- Capture structured feedback (50-word summary) and feed it into the existing server-side generation pipeline.
- Reuse existing background queue infrastructure so server-side jobs continue to run even if the app is closed.
- **CONSTRAINT:** Each plan can only be redone ONCE before the user clicks "Start My Journey".
- **CONSTRAINT:** Once a plan is activated (user clicks "Start My Journey"), no more redos are allowed.

### 2. Implementation Summary

#### Files Modified:
- `supabase/migrations/20251203_redo_plan_support.sql` - Database migration for redo columns
- `supabase/functions/create-plan-job/index.ts` - Handles redo requests with validation
- `supabase/functions/process-plan-queue/index.ts` - Includes redo context in AI prompts
- `app/plan-preview.tsx` - Redo button and modal UI
- `app/plan-building.tsx` - Shows redo reason during regeneration
- `utils/server-plan-generation.ts` - Extended API for redo options
- `types/user.ts` - Added redo tracking fields to WeeklyBasePlan

### 3. High-Level Flow
1. User taps the `🔄` (RefreshCw) icon in the top-right of plan-preview screen.
2. A modal collects:
   - Text input (limit 50 words) with live word counter.
   - Warning that redo can only be used once.
3. After submitting, the app:
   - Validates the input.
   - Calls `createAndTriggerServerPlanJob(user, { redo: true, redoReason, redoType, sourcePlanId })`.
   - Navigates to `/plan-building` with the feedback reason for display.
4. Supabase Edge Function (`create-plan-job`):
   - Validates redo eligibility (plan not activated, redo not already used).
   - Marks `redo_used = true` on the plan.
   - Creates a new job with `is_redo = true`, `request_reason`, `redo_type`, and `source_plan_id`.
5. `process-plan-queue` (using the new split-first architecture):
   - For redo requests, uses `generateRedoPlan` which:
     - Extracts workout/nutrition from previous plan
     - Runs targeted AI calls based on `redo_type` ('workout', 'nutrition', or 'both')
     - Regenerates reasons to reflect changes
   - Persists regenerated plan to the same row.
6. Client receives the regenerated plan and displays it in plan-preview.

### 3.1 New Pipeline Architecture Note
The main plan generation now uses a **split-first architecture**:
- Stage 0: Generate workout split (foundation)
- Stage 1: Generate base nutrition
- Stage 2: Parallel per-day builders (workouts, nutrition adjustments, supplements)
- Stage 3: Parallel verification
- Stage 4: Reasoning

Redo requests still use the simpler `generateRedoPlan` flow for targeted edits.

### 4. Redo Eligibility Rules
- ✅ Plan status is `generated` (not yet activated)
- ✅ `redo_used` is `false` (hasn't been redone before)
- ❌ Plan is `active` or `archived` → Redo blocked
- ❌ Plan is `pending` or `generating` → Redo blocked (wait for completion)
- ❌ `redo_used` is `true` → Redo already used

### 5. Database Schema (Migration: 20251203_redo_plan_support.sql)

```sql
-- weekly_base_plans
ALTER TABLE public.weekly_base_plans
  ADD COLUMN IF NOT EXISTS redo_used BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS redo_reason TEXT,
  ADD COLUMN IF NOT EXISTS original_plan_id UUID REFERENCES public.weekly_base_plans(id);

-- plan_generation_jobs
ALTER TABLE public.plan_generation_jobs
  ADD COLUMN IF NOT EXISTS request_reason TEXT,
  ADD COLUMN IF NOT EXISTS source_plan_id UUID REFERENCES public.weekly_base_plans(id),
  ADD COLUMN IF NOT EXISTS is_redo BOOLEAN NOT NULL DEFAULT FALSE;
```

### 6. Client API

```typescript
// utils/server-plan-generation.ts
export interface RedoOptions {
  redo?: boolean;
  redoReason?: string;
  sourcePlanId?: string;
  forceRegenerate?: boolean; // For 14-day cycle regeneration
}

export async function createAndTriggerServerPlanJob(
  user: User, 
  options?: RedoOptions
): Promise<CreateJobResult>
```

### 6.1 Force Regeneration (14-Day Cycle)

When the 14-day regeneration window passes and user triggers regeneration from Program Settings:

```typescript
// app/program-settings.tsx
const result = await createAndTriggerServerPlanJob(updatedUser, { forceRegenerate: true });
```

This will:
1. Reset the existing plan row (clear days, status → pending)
2. Reset `redo_used` to `false` (fresh redo opportunity)
3. Create a new generation job
4. NOT create a new plan row (reuses existing to respect unique constraint)

### 7. Testing Checklist
- [x] Redo button appears only for `generated` plans with `redo_used = false`
- [x] Modal enforces 50-word limit with live counter
- [x] Submit disabled until text entered
- [x] Server validates redo eligibility and returns appropriate error codes
- [x] Plan-building screen shows redo reason
- [x] Regenerated plan replaces original in store
- [x] Normal plan generation unaffected by redo changes

### 8. Rollout Checklist
- [x] Database migration: `20251203_redo_plan_support.sql`
- [x] Edge functions updated: `create-plan-job`, `process-plan-queue`
- [x] Client UI: plan-preview modal, plan-building reason display
- [x] Types updated: `WeeklyBasePlan.redoUsed`, `redoReason`, `originalPlanId`
- [ ] Deploy to production
- [ ] Monitor logs for `redo_started` events
- [ ] Gather user feedback

