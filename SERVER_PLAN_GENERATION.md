# Server-Side Plan Generation System

This document describes the server-side plan generation system that allows plans to be generated even when the app is closed.

## Overview

The system uses a **job queue pattern** with Supabase Edge Functions:

1. **User submits request** → Edge Function creates a job in the database
2. **Queue processor** → Separate Edge Function processes pending jobs
3. **On completion** → Plan is saved and push notification is sent

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│    App      │────▶│ create-plan-job  │────▶│ plan_generation_jobs│
│  (Client)   │     │  (Edge Function) │     │     (Database)      │
└─────────────┘     └──────────────────┘     └─────────────────────┘
                                                       │
                                                       ▼
┌─────────────┐     ┌───────────────────┐    ┌─────────────────────┐
│ Push Notif  │◀────│process-plan-queue │◀───│    Cron/Manual      │
│   (User)    │     │ (Edge Function)   │    │     Trigger         │
└─────────────┘     └───────────────────┘    └─────────────────────┘
```

## Components

### 1. Database Migration

**File:** `supabase/migrations/20251130_plan_generation_jobs.sql`

Creates the `plan_generation_jobs` table with:
- Job status tracking (pending, processing, completed, failed)
- Profile snapshot (user data at time of request)
- Retry logic (3 retries by default)
- Worker locking (prevents duplicate processing)

**Helper Functions:**
- `claim_next_plan_job(worker_id)` - Atomically claim the next pending job
- `complete_plan_job(job_id, plan_id)` - Mark a job as completed
- `fail_plan_job(job_id, error)` - Mark a job as failed (with retry)
- `get_active_plan_job(user_id)` - Get user's current pending/processing job

### 2. Edge Functions

#### `create-plan-job`

**Location:** `supabase/functions/create-plan-job/index.ts`

**Purpose:** Creates a new job in the queue.

**Input:**
```json
{
  "profileSnapshot": {
    "goal": "MUSCLE_GAIN",
    "trainingDays": 4,
    "equipment": ["Dumbbells", "Gym"],
    ...
  }
}
```

**Output:**
```json
{
  "success": true,
  "jobId": "uuid",
  "status": "created"
}
```

Or if job already exists:
```json
{
  "success": true,
  "status": "existing",
  "existingJobId": "uuid"
}
```

#### `process-plan-queue`

**Location:** `supabase/functions/process-plan-queue/index.ts`

**Purpose:** Processes pending jobs from the queue.

**Invocation:** 
- Manually via `supabase functions invoke`
- Via cron job (scheduled)
- From the client after creating a job

**Flow:**
1. Claim next pending job
2. Generate plan using DeepSeek AI
3. Save plan to `weekly_base_plans` table
4. Send push notification
5. Mark job as completed

### 3. Client Utility

**File:** `utils/server-plan-generation.ts`

TypeScript utilities for interacting with the server-side system:

```typescript
import {
  createServerPlanJob,
  getJobStatus,
  getActiveJob,
  waitForJobCompletion,
  triggerQueueProcessing,
  isServerGenerationAvailable,
} from '@/utils/server-plan-generation';

// Create a job
const result = await createServerPlanJob(user);
if (result.success) {
  console.log('Job created:', result.jobId);
}

// Check status
const status = await getJobStatus(jobId);
if (status.job?.status === 'completed') {
  console.log('Plan ready:', status.plan);
}

// Wait for completion with progress updates
const finalResult = await waitForJobCompletion(jobId, (job) => {
  console.log('Status:', job.status, 'Retries:', job.retry_count);
});
```

## Deployment

### 1. Apply the Migration

```bash
cd supabase
supabase db push
```

Or manually in the Supabase dashboard:
1. Go to SQL Editor
2. Copy contents of `migrations/20251130_plan_generation_jobs.sql`
3. Run the SQL

### 2. Deploy Edge Functions

```bash
# Deploy create-plan-job
supabase functions deploy create-plan-job

# Deploy process-plan-queue
supabase functions deploy process-plan-queue
```

### 3. Set Required Secrets

The `process-plan-queue` function needs the DeepSeek API key:

```bash
supabase secrets set DEEPSEEK_API_KEY=your-api-key
```

### 4. (Optional) Set Up Cron Job

For automatic queue processing, set up a cron job in Supabase:

```sql
-- Process queue every 2 minutes
SELECT cron.schedule(
  'process-plan-queue',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-plan-queue',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

## Usage Patterns

### Pattern 1: Client-First with Server Fallback

The existing client-side generation remains the primary method. Server-side is used as a fallback when the user wants to close the app:

```typescript
// In generating-base-plan.tsx

// Show option to user: "Generate in background?"
// If yes:
const job = await createAndTriggerServerPlanJob(user);
// User can now close app, notification will arrive when done
```

### Pattern 2: Always Server-Side

For a simpler UX, always use server-side generation:

```typescript
// On onboarding complete
const job = await createServerPlanJob(user);
await triggerQueueProcessing();
router.replace('/waiting-for-plan'); // Show status screen
```

### Pattern 3: Check for Pending Jobs on App Open

```typescript
// In _layout.tsx or home screen
const activeJob = await getActiveJob();
if (activeJob) {
  // Show "Your plan is being generated..." UI
  // Or navigate to status screen
}
```

## Error Handling

The system handles errors with automatic retries:

| Error Type | Behavior |
|------------|----------|
| AI Rate Limit | Retry after delay (up to 3 times) |
| AI Timeout | Retry immediately (up to 3 times) |
| Validation Error | Mark as failed, notify user |
| Network Error | Retry after delay |

After 3 failed retries, the job is marked as `failed` and a push notification is sent to the user.

## Monitoring

### Check Job Status

```sql
-- Pending jobs
SELECT * FROM plan_generation_jobs WHERE status = 'pending' ORDER BY created_at;

-- Failed jobs
SELECT * FROM plan_generation_jobs WHERE status = 'failed' ORDER BY completed_at DESC;

-- Jobs per user
SELECT user_id, status, COUNT(*) 
FROM plan_generation_jobs 
GROUP BY user_id, status;
```

### View Function Logs

In Supabase Dashboard:
1. Go to Functions
2. Click on `create-plan-job` or `process-plan-queue`
3. View logs

## Important Notes

### Existing Functionality Preserved

This system is **additive** - it doesn't modify or break the existing client-side plan generation:

- `generating-base-plan.tsx` continues to work exactly as before
- `basePlanEngine.ts` is unchanged
- The server system is an optional enhancement

### When to Use Server-Side

✅ Good use cases:
- User wants to close the app during generation
- Implementing scheduled plan regeneration
- Heavy load on client devices

❌ Not needed for:
- Normal plan generation (client-side works fine)
- Users who keep the app open
- Quick regeneration with minor changes

### Rate Limits

Be mindful of DeepSeek API rate limits:
- Basic plan: ~60 requests/minute
- The queue system processes one job at a time
- For high volume, consider upgrading DeepSeek plan

### Cost Considerations

Each plan generation costs:
- DeepSeek API: ~$0.01-0.02 per plan
- Supabase Edge Function: Free tier covers most usage
- Database: Minimal (few KB per job)





