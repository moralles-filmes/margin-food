import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const VALID_ROLES = ['admin', 'operador', 'viewer', 'sem_role'];

// Permission keys for this edge function
const PERM_USERS_VIEW = 'configuracoes:usuarios:view';
const PERM_USERS_MANAGE = 'configuracoes:usuarios:manage';

// Legacy permission aliases that also grant access
const LEGACY_VIEW = ['users:manage', 'system:admin'];
const LEGACY_MANAGE = ['users:manage', 'system:admin'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: 'Server config error' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    // JWT validation (signing-keys compatible): prefer getClaims(), fallback to getUser()
    let callerUserId: string | null = null;

    try {
      const getClaimsFn = (authClient.auth as any).getClaims;
      if (typeof getClaimsFn === 'function') {
        const { data: claimsData, error: claimsError } = await getClaimsFn.call(authClient.auth, token);
        if (!claimsError && claimsData?.claims?.sub) {
          callerUserId = claimsData.claims.sub as string;
        }
      }
    } catch {
      // ignore and fallback below
    }

    if (!callerUserId) {
      const { data: tokenUserData, error: tokenAuthError } = await authClient.auth.getUser(token);
      if (!tokenAuthError && tokenUserData?.user?.id) {
        callerUserId = tokenUserData.user.id;
      }
    }

    if (!callerUserId) {
      const { data: sessionUserData, error: sessionAuthError } = await authClient.auth.getUser();
      if (!sessionAuthError && sessionUserData?.user?.id) {
        callerUserId = sessionUserData.user.id;
      }
    }

    if (!callerUserId) return json({ error: 'Usuário não autenticado' }, 403);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Resolve caller tenant/company for tenant-safe writes
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('company_id')
      .eq('id', callerUserId)
      .single();

    if (!callerProfile?.company_id) {
      return json({ error: 'Tenant do usuário não encontrado' }, 400);
    }

    const callerCompanyId = callerProfile.company_id;

    // ─── Permission check helper ───
    const checkPermission = async (requiredPerm: string, legacyAliases: string[]): Promise<boolean> => {
      // Super-admin bypass: system:global:manage grants everything
      const { data: isSuperAdmin } = await adminClient.rpc('has_permission', { _user_id: callerUserId, _permission: 'system:global:manage' });
      if (isSuperAdmin === true) return true;

      // Check new granular permission
      const { data: hasPerm } = await adminClient.rpc('has_permission', { _user_id: callerUserId, _permission: requiredPerm });
      if (hasPerm === true) return true;

      // Check legacy aliases
      for (const alias of legacyAliases) {
        const { data: hasAlias } = await adminClient.rpc('has_permission', { _user_id: callerUserId, _permission: alias });
        if (hasAlias === true) return true;
      }

      // Check admin role (isMaster)
      const { data: callerRoles } = await adminClient.from('user_roles').select('role').eq('user_id', callerUserId);
      return (callerRoles || []).some((r: any) => r.role === 'admin');
    };

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Body inválido. Envie JSON com a ação.' }, 400);
    }
    const { action } = body;
    if (!action || typeof action !== 'string') {
      return json({ error: 'Ação obrigatória' }, 400);
    }

    // ─── Route permission checks ───
    // Read-only actions need VIEW, mutating actions need MANAGE
    const readActions = ['list'];
    const manageActions = ['create', 'edit-user', 'update-role', 'reset-password', 'disable', 'enable', 'delete', 'create-job-role', 'toggle-job-role'];

    if (readActions.includes(action)) {
      const allowed = await checkPermission(PERM_USERS_VIEW, LEGACY_VIEW);
      if (!allowed) return json({ error: `Sem permissão de visualização (${PERM_USERS_VIEW})` }, 403);
    } else if (manageActions.includes(action)) {
      const allowed = await checkPermission(PERM_USERS_MANAGE, LEGACY_MANAGE);
      if (!allowed) return json({ error: `Sem permissão de gerenciamento (${PERM_USERS_MANAGE})` }, 403);
    } else {
      return json({ error: `Ação inválida: ${action}` }, 400);
    }

    // Helper: audit log - robust version
    const audit = async (acao: string, registro_id: string, opts: { campo?: string; valor_anterior?: string; valor_novo?: string } = {}) => {
      try {
        await adminClient.from('audit_log').insert({
          user_id: callerUserId, acao, tabela: 'auth.users', registro_id,
          campo: opts.campo || null, valor_anterior: opts.valor_anterior || null, valor_novo: opts.valor_novo || null,
        });
      } catch (e) {
        console.warn('Audit log failed (ignoring):', e);
        // Try fallback to plural table name if singular fails
        try {
          await adminClient.from('audit_logs').insert({
            actor_user_id: callerUserId, 
            action: acao, 
            entity: 'auth.users', 
            entity_id: registro_id,
            module: 'configuracoes',
            severity: 'info'
          });
        } catch { /* silence */ }
      }
    };

    // Helper: save user permissions with DENY for unchecked ones
    const saveUserPermissions = async (userId: string, selectedPermissions: string[], userRole?: string) => {
      const debug: any = { selectedCount: selectedPermissions.length };
      try {
        const { error: delError } = await adminClient.from('user_permissions').delete().eq('user_id', userId);
        if (delError) debug.deleteError = delError.message;

        // Fetch all permissions with pagination (bypass 1000 limit)
        let allKeys: string[] = [];
        let from = 0;
        const step = 1000;
        while (true) {
          const { data: chunk, error: chunkErr } = await adminClient.from('permissions').select('key').range(from, from + step - 1);
          if (chunkErr || !chunk || chunk.length === 0) break;
          allKeys.push(...chunk.map((p: any) => p.key));
          if (chunk.length < step) break;
          from += step;
        }
        debug.dbPermsCount = allKeys.length;

        // Fetch role permissions with pagination
        let roleGranted = new Set<string>();
        from = 0;
        while (true) {
          const { data: chunk, error: chunkErr } = await adminClient
            .from('role_permissions')
            .select('permission_key')
            .eq('role', userRole || 'sem_role')
            .range(from, from + step - 1);
          if (chunkErr || !chunk || chunk.length === 0) break;
          chunk.forEach((rp: any) => roleGranted.add(rp.permission_key));
          if (chunk.length < step) break;
          from += step;
        }
        debug.roleCount = roleGranted.size;

        const selectedSet = new Set(selectedPermissions);
        const rows: { user_id: string; permission_key: string; effect: string; granted_by: string }[] = [];

        const allConsideredKeys = new Set([...allKeys, ...Array.from(roleGranted)]);
        for (const key of allConsideredKeys) {
          if (selectedSet.has(key) && !roleGranted.has(key)) {
            rows.push({ user_id: userId, permission_key: key, effect: 'ALLOW', granted_by: callerUserId });
          } else if (!selectedSet.has(key) && roleGranted.has(key)) {
            rows.push({ user_id: userId, permission_key: key, effect: 'DENY', granted_by: callerUserId });
          }
        }
        
        debug.rowsToInsert = rows.length;

        if (rows.length > 0) {
          const { error: insError } = await adminClient.from('user_permissions').insert(rows);
          if (insError) debug.insertError = insError.message;
        }
        return debug;
      } catch (e: any) {
        debug.exception = e.message;
        return debug;
      }
    };

    // ─── LIST (Optimized) ───
    if (action === 'list') {
      // 1. Filtrar perfis pertencentes APENAS à mesma company do caller (inquilino isolado)
      const { data: profiles, error: profErr } = await adminClient
        .from('profiles')
        .select('id, nome, email, sector, job_role_id, created_at')
        .eq('company_id', callerCompanyId)
        .limit(1000);
      if (profErr) return json({ error: profErr.message }, 500);

      const profileIds = (profiles || []).map((p: any) => p.id);

      // 2. Buscar roles apenas para esses IDs (evitamos baixar a tabela global)
      const { data: roles } = await adminClient
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', profileIds.length > 0 ? profileIds : ['00000000-0000-0000-0000-000000000000']);

      // 3. Buscar cargos (job_roles) apenas da empresa atual
      const { data: jobRoles } = await adminClient
        .from('job_roles')
        .select('id, nome')
        .eq('company_id', callerCompanyId);

      // 4. Buscar permissões apenas para os perfis mapeados (sem loop global infinito)
      let userPerms: any[] = [];
      if (profileIds.length > 0) {
        const { data: perms } = await adminClient
          .from('user_permissions')
          .select('user_id, permission_key, effect')
          .in('user_id', profileIds);
        userPerms = perms || [];
      }
      
      const jobRoleMap = new Map<string, string>();
      (jobRoles || []).forEach((j: any) => jobRoleMap.set(j.id, j.nome));

      const users = (profiles || [])
        .filter((p: any) => !p.nome?.startsWith('[EXCLUÍDO]'))
        .map((p: any) => ({
          ...p,
          role: roles?.find((r: any) => r.user_id === p.id)?.role || 'sem_role',
          job_role_name: p.job_role_id ? jobRoleMap.get(p.job_role_id) || null : null,
          disabled: false,
          permissions: (userPerms || []).filter((up: any) => up.user_id === p.id).map((up: any) => ({ key: up.permission_key, effect: up.effect })),
        }));
      return json({ users });
    }

    // ─── CREATE ───
    if (action === 'create') {
      const { email, password, nome, role, sector, job_role_id, permissions } = body;
      if (!email || !password || !nome || !role) return json({ error: 'Campos obrigatórios: email, password, nome, role' }, 400);
      if (!VALID_ROLES.includes(role)) return json({ error: 'Role inválido. Use admin ou operador.' }, 400);

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nome }
      });
      if (createError) return json({ error: createError.message }, 400);

      await adminClient.from('user_roles').insert({ user_id: newUser.user.id, role });

      const profileUpdate: Record<string, any> = {
        company_id: callerCompanyId,
        nome,
        email,
      };
      if (job_role_id) profileUpdate.job_role_id = job_role_id;
      await adminClient.from('profiles').update(profileUpdate).eq('id', newUser.user.id);

      if (Array.isArray(permissions) && permissions.length > 0) {
        await saveUserPermissions(newUser.user.id, permissions, role);
      }

      await audit('user.created', newUser.user.id, { valor_novo: JSON.stringify({ email, nome, role, sector: sector || null, job_role_id: job_role_id || null, permissions_count: permissions?.length || 0 }) });
      return json({ success: true, user: { id: newUser.user.id, email, nome, role, sector: sector || null } });
    }

    // ─── EDIT USER ───
    if (action === 'edit-user') {
      const { userId, nome, email, role, sector, job_role_id, permissions } = body;
      if (!userId) return json({ error: 'userId obrigatório' }, 400);

      const { data: oldProfile } = await adminClient.from('profiles').select('nome, email, sector, job_role_id').eq('id', userId).single();
      const { data: oldRoleRow } = await adminClient.from('user_roles').select('role').eq('user_id', userId).single();
      const before = { nome: oldProfile?.nome, email: oldProfile?.email, role: oldRoleRow?.role, sector: oldProfile?.sector };

      const profileUpdate: Record<string, any> = {};
      if (nome !== undefined && nome !== before.nome) profileUpdate.nome = nome;
      if (email !== undefined && email !== before.email) profileUpdate.email = email;

      if (role !== undefined && role !== before.role) {
        if (!VALID_ROLES.includes(role)) return json({ error: 'Role inválido. Use admin ou operador.' }, 400);
        await adminClient.from('user_roles').delete().eq('user_id', userId);
        await adminClient.from('user_roles').insert({ user_id: userId, role });
      }

      if (job_role_id !== undefined) {
        profileUpdate.job_role_id = job_role_id || null;
      }

      if (Object.keys(profileUpdate).length > 0) {
        await adminClient.from('profiles').update(profileUpdate).eq('id', userId);
      }

      if (email && email !== before.email) {
        await adminClient.auth.admin.updateUserById(userId, { email });
      }
      if (nome && nome !== before.nome) {
        await adminClient.auth.admin.updateUserById(userId, { user_metadata: { nome } });
      }

      if (permissions && Array.isArray(permissions)) {
        await saveUserPermissions(userId, permissions, role || before.role);
      }

      const after = { nome: nome || before.nome, email: email || before.email, role: role || before.role, sector: profileUpdate.sector !== undefined ? profileUpdate.sector : before.sector };
      await audit('user.edited', userId, { valor_anterior: JSON.stringify(before), valor_novo: JSON.stringify(after) });

      return json({ success: true });
    }

    // ─── UPDATE ROLE (legacy) ───
    if (action === 'update-role') {
      const { userId, role, sector } = body;
      if (!userId || !role) return json({ error: 'userId e role são obrigatórios' }, 400);
      if (!VALID_ROLES.includes(role)) return json({ error: 'Role inválido. Use admin ou operador.' }, 400);

      const { data: oldRole } = await adminClient.from('user_roles').select('role').eq('user_id', userId).single();
      await adminClient.from('user_roles').delete().eq('user_id', userId);
      await adminClient.from('user_roles').insert({ user_id: userId, role });
      await audit('role.changed', userId, { campo: 'role', valor_anterior: oldRole?.role || '', valor_novo: JSON.stringify({ role }) });
      return json({ success: true });
    }

    // ─── RESET PASSWORD ───
    if (action === 'reset-password') {
      const { userId, newPassword } = body;
      if (!userId || !newPassword) return json({ error: 'userId e newPassword obrigatórios' }, 400);
      if (newPassword.length < 12) return json({ error: 'Senha deve ter no mínimo 12 caracteres' }, 400);
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
      if (error) return json({ error: error.message }, 500);
      await audit('password.reset', userId);
      return json({ success: true });
    }

    // ─── DISABLE ───
    if (action === 'disable') {
      const { userId } = body;
      if (!userId) return json({ error: 'userId obrigatório' }, 400);
      const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876600h' });
      if (error) return json({ error: error.message }, 500);
      await audit('user.disabled', userId);
      return json({ success: true });
    }

    // ─── ENABLE ───
    if (action === 'enable') {
      const { userId } = body;
      if (!userId) return json({ error: 'userId obrigatório' }, 400);
      const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' });
      if (error) return json({ error: error.message }, 500);
      await audit('user.enabled', userId);
      return json({ success: true });
    }

    // ─── DELETE ───
    if (action === 'delete') {
      const { userId, motivo } = body;
      if (!userId) return json({ error: 'userId obrigatório' }, 400);
      if (!motivo || motivo.trim().length < 3) return json({ error: 'Motivo da exclusão é obrigatório (mín. 3 caracteres)' }, 400);
      if (userId === callerUserId) return json({ error: 'Não é possível excluir a si mesmo' }, 400);

      // Busca dados antes de deletar (para o log de auditoria)
      const { data: profile } = await adminClient.from('profiles').select('nome, email').eq('id', userId).single();
      const { data: roleRow } = await adminClient.from('user_roles').select('role').eq('user_id', userId).single();

      // Grava auditoria ANTES de deletar para garantir captura dos dados
      await audit('user.deleted', userId, {
        valor_anterior: JSON.stringify({ nome: profile?.nome, email: profile?.email, role: roleRow?.role }),
        valor_novo: JSON.stringify({ motivo }),
      });

      // Hard delete do auth user — CASCADE remove profiles, user_roles e user_permissions automaticamente
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteError) return json({ error: deleteError.message }, 500);

      return json({ success: true });
    }

    // ─── CREATE JOB ROLE ───
    if (action === 'create-job-role') {
      const { nome, descricao } = body;
      if (!nome || !nome.trim()) return json({ error: 'Nome do cargo é obrigatório' }, 400);
      const { error } = await adminClient.from('job_roles').insert({
        nome: nome.trim(),
        descricao: descricao || null,
        created_by: callerUserId,
        company_id: callerCompanyId,
      });
      if (error) return json({ error: error.message }, 400);
      await audit('job_role.created', 'job_roles', { valor_novo: JSON.stringify({ nome }) });
      return json({ success: true });
    }

    // ─── TOGGLE JOB ROLE ───
    if (action === 'toggle-job-role') {
      const { jobRoleId, is_active } = body;
      if (!jobRoleId) return json({ error: 'jobRoleId obrigatório' }, 400);
      const { error } = await adminClient.from('job_roles').update({ is_active }).eq('id', jobRoleId).eq('company_id', callerCompanyId);
      if (error) return json({ error: error.message }, 500);
      await audit('job_role.toggled', jobRoleId, { valor_novo: JSON.stringify({ is_active }) });
      return json({ success: true });
    }

    return json({ error: 'Ação inválida' }, 400);
  } catch (err: any) {
    console.error('admin-users error:', err);
    return json({ error: err.message || 'Erro interno' }, 500);
  }
});
