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

    // ── Permission: only system:global:manage can create users ──
    const { data: hasPerm } = await adminClient.rpc('has_permission', { _user_id: callerUserId, _permission: 'system:global:manage' });
    if (hasPerm !== true) return json({ error: 'Sem permissão (system:global:manage)' }, 403);

    // ── Get caller's company_id (assert_tenant) ──
    const { data: callerProfile } = await adminClient.from('profiles').select('company_id').eq('id', callerUserId).single();
    if (!callerProfile?.company_id) return json({ error: 'Tenant do chamador não encontrado' }, 400);
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

    const trimmedEmail = email.trim().toLowerCase();

    // ── Create user in Supabase Auth ──
    let authUser: any;

    if (send_invite) {
      // Invite by email (magic link)
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(trimmedEmail, {
        data: { nome: nome || '' },
      });
      if (error) return json({ error: `Erro ao convidar: ${error.message}` }, 400);
      authUser = data.user;
    } else {
      // Create with password
      if (!password || typeof password !== 'string' || password.length < 12) {
        return json({ error: 'Senha obrigatória (mín. 12 caracteres) quando não usar convite' }, 400);
      }
      const { data, error } = await adminClient.auth.admin.createUser({
        email: trimmedEmail,
        password,
        email_confirm: true,
        user_metadata: { nome: nome || '' },
      });
      if (error) return json({ error: `Erro ao criar: ${error.message}` }, 400);
      authUser = data.user;
    }

    // ── Upsert profile with company_id ──
    const profilePayload: Record<string, any> = {
      id: authUser.id,
      email: trimmedEmail,
      company_id: companyId,
    };
    if (nome) profilePayload.nome = nome;

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' });

    if (profileError) {
      console.error('Profile upsert error:', profileError);
      // User was created in auth but profile failed — log but don't fail completely
    }

    // ── Assign default role 'operador' ──
    await adminClient.from('user_roles').upsert(
      { user_id: authUser.id, role: 'operador' },
      { onConflict: 'user_id' }
    );

    // ── Audit ──
    await adminClient.from('admin_actions_log').insert({
      actor_user_id: callerUserId,
      company_id: companyId,
      action: send_invite ? 'USER_INVITED' : 'USER_CREATED',
      target_user_id: authUser.id,
      target_email: trimmedEmail,
      details: { nome: nome || null, send_invite: !!send_invite },
    });

    return json({
      success: true,
      user_id: authUser.id,
      email: trimmedEmail,
      company_id: companyId,
    });
  } catch (err) {
    console.error('admin-create-user error:', err);
    return json({ error: 'Erro interno' }, 500);
  }
});
