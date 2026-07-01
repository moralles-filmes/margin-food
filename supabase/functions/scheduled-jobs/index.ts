import { getCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

let corsHeaders = getCorsHeaders();

Deno.serve(async (req) => {
  corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    const sb = createClient(supabaseUrl, serviceKey);

    const { action } = await req.json().catch(() => ({ action: "refresh_all" }));

    const results: Record<string, any> = {};

    if (action === "refresh_all" || action === "refresh_mvs") {
      const { data, error } = await sb.rpc("refresh_materialized_views");
      results.mvs = error ? { error: error.message } : data;
    }

    if (action === "refresh_all" || action === "cleanup") {
      const { data, error } = await sb.rpc("cleanup_old_audit_logs", { p_months: 24 });
      results.cleanup = error ? { error: error.message } : { deleted: data };
    }

    // Log job execution
    await sb.from("audit_logs").insert({
      source: "edge",
      module: "system",
      entity: "scheduled-jobs",
      action: "JOB_RUN",
      metadata: { action, results },
      success: true,
    });

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
