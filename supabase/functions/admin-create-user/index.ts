import { addCompanyUser } from "../_shared/company-users.ts";
import { companyHeaders, requestCompanyProfile } from "../_shared/company-scope.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

let corsHeaders = getCorsHeaders();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: 'Server config error' }, 500);

    // ── Auth: verify caller JWT ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { ...companyHeaders(req), Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json({ error: 'Não autorizado' }, 401);
    const callerUserId = claimsData.claims.sub as string;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: companyHeaders(req) } });

    // ── Permission: only system:global:manage can create users ──
    const { data: hasPerm } = await adminClient.rpc('has_permission', { _user_id: callerUserId, _permission: 'system:global:manage' });
    if (hasPerm !== true) return json({ error: 'Sem permissão (system:global:manage)' }, 403);

    // ── Get caller's company_id (assert_tenant) ──
    const { data: callerProfile } = await requestCompanyProfile(authClient);
    if (!callerProfile?.company_id) return json({ error: 'COMPANY_ACCESS_DENIED' }, 403);
    const companyId = callerProfile.company_id;

    // ── Parse body ──
    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Body JSON inválido' }, 400);
    }

    const { email, password, nome, send_invite } = body;
    if (!email || typeof email !== 'string') return json({ error: 'Email é obrigatório' }, 400);

    const result = await addCompanyUser(adminClient, {
      actorUserId: callerUserId, companyId, email, password, nome: nome || '', role: 'operador', sendInvite: !!send_invite,
    });

    return json({
      success: true,
      user_id: result.userId,
      email: result.email,
      company_id: companyId,
    });
  } catch (err) {
    console.error('admin-create-user error:', err);
    return json({ error: 'Erro interno' }, 500);
  }
});
