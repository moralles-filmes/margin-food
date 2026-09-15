import { getCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST" },
    });
  }

  // Auth: only the scheduler (or operator) with CRON_SECRET can trigger.
  // Without this guard, anyone could POST and trigger cleanup_old_audit_logs.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured: CRON_SECRET not set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
    if (!supabaseUrl || !serviceKey) throw new Error("Service client not configured");
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => null);
    const action = body?.action;
    if (!["refresh_all", "refresh_mvs", "cleanup"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, any> = {};
    let success = true;

    if (action === "refresh_all" || action === "refresh_mvs") {
      const { data, error } = await sb.rpc("refresh_materialized_views");
      results.mvs = error ? { error: error.message } : data;
      if (error) success = false;
    }

    if (action === "refresh_all" || action === "cleanup") {
      const { data, error } = await sb.rpc("cleanup_old_audit_logs", { p_months: 24 });
      results.cleanup = error ? { error: error.message } : { deleted: data };
      if (error) success = false;
    }

    // Log job execution
    const { error: logError } = await sb.from("audit_logs").insert({
      source: "edge",
      module: "system",
      entity: "scheduled-jobs",
      action: "JOB_RUN",
      metadata: { action, results },
      success,
    });
    if (logError) {
      console.error("scheduled-jobs audit error:", logError);
      results.audit = { error: logError.message };
      success = false;
    }

    return new Response(JSON.stringify({ ok: success, results }), {
      status: success ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("scheduled-jobs error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
