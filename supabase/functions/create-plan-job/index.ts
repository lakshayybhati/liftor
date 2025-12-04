/**
 * Create Plan Job Edge Function
 * 
 * Creates a new plan generation job in the queue.
 * Returns immediately with job ID - does NOT wait for generation.
 * 
 * The actual plan generation happens in the process-plan-queue function.
 * 
 * Flow:
 * 1. Validate user authentication
 * 2. Check for existing pending/processing job (prevent duplicates)
 * 3. Create new job with user's profile snapshot
 * 4. Return job ID immediately
 */

// @ts-ignore - Remote imports resolved by Deno at runtime/deploy
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import { getWeekStartDate } from "../_shared/week.ts";

// Minimal Deno typing
declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type PlanStatus = 'pending' | 'generating' | 'generated' | 'active' | 'archived';

interface CreateJobRequest {
  profileSnapshot: Record<string, unknown>;
  // Redo-specific fields
  redo?: boolean;
  redoReason?: string;
  redoType?: 'workout' | 'nutrition' | 'both'; // What to redo
  sourcePlanId?: string;
  // Force regeneration (for 14-day cycle reset)
  forceRegenerate?: boolean;
}

interface CreateJobResponse {
  success: boolean;
  jobId?: string;
  status?: string;
  existingJobId?: string;
  existingPlanId?: string;
  existingPlanStatus?: string;
  error?: string;
  redoAllowed?: boolean;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
};

function errorResponse(message: string, status = 400): Response {
  console.error(`[create-plan-job] Error: ${message}`);
  return new Response(
    JSON.stringify({ success: false, error: message } as CreateJobResponse),
    {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  );
}

function successResponse(data: CreateJobResponse): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log(`[create-plan-job] Request received: ${req.method}`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    // Prefer SUPABASE_SERVICE_ROLE_KEY for consistency with other functions,
    // but fall back to SERVICE_ROLE_KEY for backward compatibility.
    const supabaseServiceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SERVICE_ROLE_KEY") ||
      "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse("Server not configured", 500);
    }

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Unauthorized", 401);
    }

    // Create client with user's auth to get their ID
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user?.id) {
      console.error("[create-plan-job] Auth error:", authError);
      return errorResponse("Unauthorized", 401);
    }

    const userId = userData.user.id;
    console.log(`[create-plan-job] User: ${userId.substring(0, 8)}...`);

    // Parse request body
    let body: CreateJobRequest;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    if (!body.profileSnapshot || typeof body.profileSnapshot !== "object") {
      return errorResponse("Missing or invalid profileSnapshot", 400);
    }

    // Validate profile snapshot has required fields
    const snapshot = body.profileSnapshot;
    if (!snapshot.goal || !snapshot.trainingDays) {
      return errorResponse("Profile snapshot missing required fields (goal, trainingDays)", 400);
    }

    // Extract redo parameters
    const isRedo = body.redo === true;
    const redoReason = typeof body.redoReason === "string" ? body.redoReason.trim().slice(0, 500) : null;
    const redoType = (body.redoType === "workout" || body.redoType === "nutrition" || body.redoType === "both")
      ? body.redoType
      : "both"; // Default to both if not specified
    const sourcePlanId = typeof body.sourcePlanId === "string" ? body.sourcePlanId : null;

    // Force regeneration bypasses the "plan_exists" check (used for 14-day cycle reset)
    const forceRegenerate = body.forceRegenerate === true;

    if (isRedo && !redoReason) {
      return errorResponse("Redo requests require a reason", 400);
    }

    // Create service role client for database operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check for existing pending/processing job
    const { data: existingJob, error: checkError } = await serviceClient
      .from("plan_generation_jobs")
      .select("id, status, created_at")
      .eq("user_id", userId)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (checkError) {
      console.error("[create-plan-job] Error checking existing jobs:", checkError);
      return errorResponse("Failed to check existing jobs", 500);
    }

    if (existingJob) {
      console.log(`[create-plan-job] User already has active job: ${existingJob.id}`);
      return successResponse({
        success: true,
        status: "existing",
        existingJobId: existingJob.id,
      });
    }

    // Determine current week cycle (Monday start, user's timezone-aware when available)
    const timezone = typeof snapshot.timezone === "string" ? (snapshot.timezone as string) : undefined;
    const cycleWeekStart = getWeekStartDate(new Date(), timezone);

    // Check for an existing plan in this cycle
    const { data: existingPlanData, error: planCheckError } = await serviceClient
      .from("weekly_base_plans")
      .select("id, status, generation_job_id, redo_used, days, redo_count_today, last_redo_date")
      .eq("user_id", userId)
      .eq("week_start_date", cycleWeekStart)
      .maybeSingle();

    if (planCheckError) {
      console.error("[create-plan-job] Error checking existing plan:", planCheckError);
      return errorResponse("Failed to check existing plans", 500);
    }

    // Track if we should create a new plan (used when archiving existing plan for forceRegenerate)
    let existingPlan = existingPlanData;

    if (existingPlan) {
      const planStatus = existingPlan.status as PlanStatus;
      const redoUsed = (existingPlan as any).redo_used === true;
      const planActivated = planStatus === "active" || planStatus === "archived";

      // REDO REQUEST HANDLING
      if (isRedo) {
        // Block redo if plan is already activated (user clicked "Start My Journey")
        if (planActivated) {
          console.log("[create-plan-job] Redo blocked: plan already activated.");
          return successResponse({
            success: false,
            status: "redo_blocked_activated",
            error: "Cannot redo an activated plan. Use day edits instead.",
            existingPlanId: existingPlan.id,
            existingPlanStatus: planStatus,
            redoAllowed: false,
          });
        }

        // PRODUCTION: Block redo if already used twice today
        // Get today's redo count from the plan
        const redoCountToday = (existingPlan as any).redo_count_today ?? 0;
        const lastRedoDate = (existingPlan as any).last_redo_date ?? null;
        const todayStr = new Date().toISOString().split('T')[0];

        // Reset count if it's a new day
        const effectiveRedoCount = (lastRedoDate === todayStr) ? redoCountToday : 0;

        if (effectiveRedoCount >= 2) {
          console.log("[create-plan-job] Redo blocked: daily limit reached (2 per day).");
          return successResponse({
            success: false,
            status: "redo_limit_reached",
            error: "You can only redo your plan twice per day. Please try again tomorrow.",
            existingPlanId: existingPlan.id,
            existingPlanStatus: planStatus,
            redoAllowed: false,
          });
        }
        console.log(`[create-plan-job] Redo allowed for plan: ${effectiveRedoCount}/2 used today`);

        // Block redo if plan is still generating
        if (planStatus === "pending" || planStatus === "generating") {
          console.log("[create-plan-job] Redo blocked: plan still generating.");
          return successResponse({
            success: false,
            status: "redo_blocked_generating",
            error: "Please wait for the current plan to finish generating.",
            existingPlanId: existingPlan.id,
            existingPlanStatus: planStatus,
            redoAllowed: false,
          });
        }

        // Plan is in 'generated' status and redo not used - allow redo
        console.log("[create-plan-job] Redo allowed for plan:", existingPlan.id);
        // Continue to create redo job below
      } else {
        // Normal (non-redo) request handling

        // If forceRegenerate is true, archive the existing plan and create a new one
        // This preserves plan history for "View All Plans" feature
        if (forceRegenerate) {
          console.log("[create-plan-job] Force regeneration requested - archiving existing plan and creating new one.");

          // Archive the existing plan if it was generated or active (preserve for history)
          if (planStatus === "generated" || planStatus === "active" || planActivated) {
            const now = new Date().toISOString();
            await serviceClient
              .from("weekly_base_plans")
              .update({
                status: "archived",
                is_locked: true,
                deactivated_at: now,
              })
              .eq("id", existingPlan.id);
            console.log("[create-plan-job] Archived previous plan:", existingPlan.id);
          }

          // Clear existingPlan reference so a new plan row will be created below
          existingPlan = null;
        } else {
          // Standard behavior: return existing plan if already generated/active
          if (planStatus === "generated" || planActivated) {
            console.log("[create-plan-job] Plan already exists for this cycle, skipping generation.");
            return successResponse({
              success: true,
              status: "plan_exists",
              existingPlanId: existingPlan.id,
              existingPlanStatus: planStatus,
              existingJobId: existingPlan.generation_job_id ?? undefined,
              redoAllowed: planStatus === "generated" && !redoUsed,
            });
          }

          if ((planStatus === "pending" || planStatus === "generating") && existingPlan.generation_job_id) {
            console.log("[create-plan-job] Plan generation already in progress, returning existing job.");
            return successResponse({
              success: true,
              status: "existing",
              existingJobId: existingPlan.generation_job_id,
              existingPlanId: existingPlan.id,
              existingPlanStatus: planStatus,
              redoAllowed: false,
            });
          }
        }
      }
    } else if (isRedo) {
      // Redo requested but no plan exists
      return errorResponse("No plan found to redo", 400);
    }

    // Create new job (with redo metadata if applicable)
    const jobInsertData: Record<string, unknown> = {
      user_id: userId,
      profile_snapshot: snapshot,
      status: "pending",
      cycle_week_start_date: cycleWeekStart,
      is_redo: isRedo,
    };

    if (isRedo) {
      jobInsertData.request_reason = redoReason;
      jobInsertData.redo_type = redoType; // 'workout' | 'nutrition' | 'both'
      jobInsertData.source_plan_id = sourcePlanId || existingPlan?.id;
      console.log(`[create-plan-job] Redo type: ${redoType}`);
    }

    const { data: newJob, error: insertError } = await serviceClient
      .from("plan_generation_jobs")
      .insert(jobInsertData)
      .select("id")
      .single();

    if (insertError || !newJob) {
      console.error("[create-plan-job] Error creating job:", insertError);
      return errorResponse("Failed to create job", 500);
    }

    console.log(`[create-plan-job] Created job: ${newJob.id}${isRedo ? " (redo)" : ""}`);

    // Ensure there's a placeholder weekly plan row for this cycle
    // For forceRegenerate, we create a NEW plan row (existing plan was archived above)
    let planId = existingPlan?.id;
    if (!planId) {
      const { data: newPlan, error: planInsertError } = await serviceClient
        .from("weekly_base_plans")
        .insert({
          user_id: userId,
          days: {},
          is_locked: false,
          status: "pending",
          week_start_date: cycleWeekStart,
          generation_job_id: newJob.id,
          redo_used: false,
        })
        .select("id")
        .single();

      if (planInsertError || !newPlan) {
        // Handle duplicate-week edge case gracefully by reusing the existing plan row
        const errorCode = (planInsertError as any)?.code || (planInsertError as any)?.message;
        const isUniqueWeekViolation =
          errorCode === "23505" &&
          String((planInsertError as any)?.message || "").includes("uniq_weekly_plan_per_user_week");

        if (isUniqueWeekViolation) {
          console.warn("[create-plan-job] Duplicate weekly plan for this cycle detected; reusing existing plan row");

          // Fetch the existing plan for this user/week and reuse it
          const { data: existingForWeek, error: existingForWeekError } = await serviceClient
            .from("weekly_base_plans")
            .select("id, status")
            .eq("user_id", userId)
            .eq("week_start_date", cycleWeekStart)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingForWeekError || !existingForWeek) {
            console.error("[create-plan-job] Failed to load existing weekly plan after duplicate error:", existingForWeekError);
            // Clean up job to avoid orphaned queue entries
            await serviceClient.from("plan_generation_jobs").delete().eq("id", newJob.id);
            return errorResponse("Failed to initialize plan record", 500);
          }

          planId = (existingForWeek as any).id as string;

          // Reset the existing plan row so it can be regenerated cleanly
          try {
            await serviceClient
              .from("weekly_base_plans")
              .update({
                status: "pending",
                is_locked: false,
                generation_job_id: newJob.id,
                week_start_date: cycleWeekStart,
                days: {}, // Clear days for regeneration
              })
              .eq("id", planId);
          } catch (planResetError) {
            console.error("[create-plan-job] Failed to reset existing weekly plan after duplicate error:", planResetError);
            await serviceClient.from("plan_generation_jobs").delete().eq("id", newJob.id);
            return errorResponse("Failed to initialize plan record", 500);
          }
        } else {
          console.error("[create-plan-job] Error creating placeholder plan:", planInsertError);
          // Clean up job to avoid orphaned queue entries
          await serviceClient.from("plan_generation_jobs").delete().eq("id", newJob.id);
          return errorResponse("Failed to initialize plan record", 500);
        }
      } else {
        planId = newPlan.id;
      }
    } else {
      // Update existing plan row
      const planUpdateData: Record<string, unknown> = {
        status: "pending",
        generation_job_id: newJob.id,
        week_start_date: cycleWeekStart,
        days: {}, // Clear days for regeneration
      };

      if (isRedo) {
        // PRODUCTION: Track redo usage with daily limit
        const todayStr = new Date().toISOString().split('T')[0];
        const existingLastRedoDate = (existingPlan as any)?.last_redo_date ?? null;
        const existingRedoCount = (existingPlan as any)?.redo_count_today ?? 0;

        // Reset count if it's a new day, otherwise increment
        const newRedoCount = (existingLastRedoDate === todayStr) ? existingRedoCount + 1 : 1;

        planUpdateData.redo_used = true;
        planUpdateData.redo_count_today = newRedoCount;
        planUpdateData.last_redo_date = todayStr;
        planUpdateData.redo_reason = redoReason;
      }
      // Note: forceRegenerate case is handled above by archiving the existing plan
      // and creating a new one, so it won't reach this update block

      await serviceClient
        .from("weekly_base_plans")
        .update(planUpdateData)
        .eq("id", planId);
    }

    await serviceClient
      .from("plan_generation_jobs")
      .update({ target_plan_id: planId })
      .eq("id", newJob.id);

    return successResponse({
      success: true,
      jobId: newJob.id,
      status: isRedo ? "redo_started" : "created",
      existingPlanId: planId,
      redoAllowed: false, // After redo starts, no more redos
    });
  } catch (error) {
    console.error("[create-plan-job] Unexpected error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500
    );
  }
});
