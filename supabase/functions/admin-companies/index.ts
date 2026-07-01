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
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json({ error: 'Não autorizado' }, 401);
    const callerUserId = claimsData.claims.sub as string;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

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
    if (action === 'create-first-user') {
      const { company_id, email, password, nome } = body;

      if (!company_id) return json({ error: 'company_id é obrigatório' }, 400);
      if (!email || typeof email !== 'string') return json({ error: 'Email é obrigatório' }, 400);
      if (!password || typeof password !== 'string' || password.length < 12) {
        return json({ error: 'Senha obrigatória (mín. 12 caracteres)' }, 400);
      }

      // Verify company exists
      const { data: company } = await adminClient.from('companies').select('id, nome').eq('id', company_id).single();
      if (!company) return json({ error: 'Empresa não encontrada' }, 404);

      const trimmedEmail = email.trim().toLowerCase();

      // Create auth user
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: trimmedEmail,
        password,
        email_confirm: true,
        user_metadata: { nome: nome || '', company_id },
      });
      if (authError) return json({ error: `Erro ao criar usuário: ${authError.message}` }, 400);
      const authUser = authData.user;

      // Upsert profile with the TARGET company_id (not the caller's)
      const { error: profileError } = await adminClient
        .from('profiles')
        .upsert({
          id: authUser.id,
          email: trimmedEmail,
          nome: nome || '',
          company_id,
        }, { onConflict: 'id' });

      if (profileError) {
        console.error('Profile upsert error:', profileError);
      }

      // Assign admin role
      await adminClient.from('user_roles').upsert(
        { user_id: authUser.id, role: 'admin' },
        { onConflict: 'user_id,role' }
      );

      // Audit
      const { data: callerProfile } = await adminClient.from('profiles').select('company_id').eq('id', callerUserId).single();
      await adminClient.from('audit_logs').insert({
        actor_user_id: callerUserId,
        company_id: callerProfile?.company_id || company_id,
        action: 'COMPANY_ADMIN_CREATED',
        module: 'admin',
        entity: 'profiles',
        entity_id: authUser.id,
        metadata: { nome, target_company_id: company_id, target_company_name: company.nome, target_email: trimmedEmail },
      });

      return json({
        success: true,
        user_id: authUser.id,
        email: trimmedEmail,
        company_id,
        company_name: company.nome,
      });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    console.error('admin-companies error:', err);
    return json({ error: 'Erro interno' }, 500);
  }
});
