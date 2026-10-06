import { withRequestCors } from '../_shared/request-cors.ts';
import { addCompanyUser, CompanyUserInputError, describeMembershipError, normalizeIdentityEmail } from "../_shared/company-users.ts";
import { companyHeaders } from "../_shared/company-scope.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = getCorsHeaders();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(withRequestCors(async (req) => {
  const corsHeaders = getCorsHeaders(req);
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

    // ── Permission: system:global:manage ──
    const { data: hasPerm } = await adminClient.rpc('has_permission', { _user_id: callerUserId, _permission: 'system:global:manage' });
    if (hasPerm !== true) return json({ error: 'Sem permissão (system:global:manage)' }, 403);

    // ── Parse body ──
    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Body JSON inválido' }, 400);
    }

    const { action } = body;

    // ── ACTION: create-first-user ──
    // Creates the first admin user for a company that was created via the onboard_new_company RPC.
    // This is separate from admin-create-user because it needs to assign the user to a specific company.
    // O banco só aceita para unidade sem gestor de usuários e nunca para o próprio ator:
    // acesso do super admin a uma unidade é sempre concedido pela própria unidade.
    if (action === 'create-first-user') {
      const { company_id, email, password, nome } = body;

      if (!company_id) return json({ error: 'company_id é obrigatório' }, 400);
      if (!email || typeof email !== 'string') return json({ error: 'Email é obrigatório' }, 400);
      const callerEmail = typeof claimsData.claims.email === 'string' ? claimsData.claims.email.toLowerCase() : null;
      if (callerEmail && normalizeIdentityEmail(email) === callerEmail) {
        return json({ error: describeMembershipError('SELF_PROVISIONING_DENIED') }, 403);
      }

      // Verify company exists
      const { data: company } = await adminClient.from('companies').select('id, nome, ativo').eq('id', company_id).single();
      if (!company) return json({ error: 'Empresa não encontrada' }, 404);
      if (!company.ativo) return json({ error: describeMembershipError('COMPANY_INACTIVE') }, 400);

      const result = await addCompanyUser(adminClient, {
        actorUserId: callerUserId, companyId: company_id, email, password, nome: nome || '', role: 'admin',
      });

      return json({
        success: true,
        user_id: result.userId,
        email: result.email,
        company_id,
        company_name: company.nome,
      });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    console.error('admin-companies error:', err);
    if (err instanceof CompanyUserInputError) return json({ error: err.message }, 400);
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? '';
    const denied = describeMembershipError(message);
    if (denied) return json({ error: denied }, 403);
    return json({ error: 'Erro interno' }, 500);
  }
}));
