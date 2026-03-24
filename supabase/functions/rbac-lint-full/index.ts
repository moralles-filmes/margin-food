import { createClient } from 'npm:@supabase/supabase-js@2';

const DEPLOY_VERSION = 'rbac-lint-full-v1';
const PERMISSION_KEY = 'system:global:manage';
const EXECUTED_SQL = 'select public.rbac_sql_lint_report_admin($1) as report';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const buildDebug = (actorUserId: string | null) => ({
    version: DEPLOY_VERSION,
    mode: 'full',
    executed_sql: EXECUTED_SQL,
    actor_user_id: actorUserId,
  });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ status: 'FAIL', error: 'Missing Authorization header', debug: buildDebug(null) }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return json({ status: 'FAIL', error: 'Unauthorized', step: 'auth.getUser', debug: buildDebug(null) }, 401);
    }

    const actorUserId = user.id;

    const { data: hasPerm, error: permErr } = await userClient.rpc('admin_has_permission', {
      p_user_id: actorUserId,
      p_permission: PERMISSION_KEY,
    });

    if (permErr || hasPerm !== true) {
      return json({
        status: 'FAIL',
        error: 'Forbidden: missing system:global:manage',
        step: 'permission_check',
        debug: buildDebug(actorUserId),
      }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: reportData, error: rpcErr } = await adminClient.rpc('rbac_sql_lint_report_admin', {
      p_actor_user_id: actorUserId,
    });

    if (rpcErr) {
      const isTimeout = rpcErr.message?.includes('statement timeout') || rpcErr.message?.includes('canceling statement');
      return json({
        status: 'FAIL',
        error: rpcErr.message,
        step: 'rbac_sql_lint_report_admin',
        ...(isTimeout ? { hint: 'Full mode timeout; use CI para execução completa.' } : {}),
        debug: buildDebug(actorUserId),
      }, 500);
    }

    const report = (reportData ?? {}) as Record<string, unknown>;
    const status = report.status === 'PASS' ? 'PASS' : 'FAIL';

    return json({ status, report, debug: buildDebug(actorUserId) }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ status: 'FAIL', error: msg, step: 'general_catch', debug: buildDebug(null) }, 500);
  }
});
