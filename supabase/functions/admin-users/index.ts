import { getCorsHeaders } from '../_shared/cors.ts';
import { companyHeaders, requireRequestCompany } from '../_shared/company-scope.ts';
import { addCompanyUser, describeMembershipError, normalizeIdentityEmail } from '../_shared/company-users.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const VALID_ROLES = ['admin','operador','viewer','sem_role'];
Deno.serve(async req => {
  const cors = getCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type':'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error:'Não autorizado' },401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const authClient = createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { ...companyHeaders(req), Authorization:authHeader } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error:'Não autorizado' },401);
    const companyId = await requireRequestCompany(authClient);
    const { data: permissions, error: permissionsError } = await authClient.rpc('get_effective_permissions', { _user_id:user.id });
    if (permissionsError) throw permissionsError;
    const has = (...keys: string[]) => (permissions as string[]).some(key => keys.includes(key));
    const globalManager = has('system:global:manage');
    const body = await req.json();
    const { action } = body;
    const canManage = globalManager || has('configuracoes:usuarios:manage','users:manage','system:admin');
    if (action === 'list' ? !(canManage || has('configuracoes:usuarios:view')) : !canManage) return json({ error:'Sem permissão para gerenciar usuários desta unidade.' },403);
    const admin = createClient(url,(Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!, { global: { headers: { 'x-company-id':companyId } } });
    const audit = async (name: string, targetId?: string, details: unknown = {}) => {
      const { error } = await admin.from('admin_actions_log').insert({ company_id:companyId,actor_user_id:user.id,
        target_user_id:targetId ?? null,action:name,details });
      if (error) throw error;
    };
    const member = async (targetId: string) => {
      const { data, error } = await admin.from('company_memberships').select('*, profiles(id,nome,email,avatar_url,created_at)')
        .eq('user_id',targetId).eq('company_id',companyId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('404: Usuário não encontrado nesta unidade.');
      return data;
    };
    const saveMembership = async (targetId: string, data: Record<string,unknown>, previous?: Record<string,unknown>) => {
      const { error } = await admin.rpc('admin_upsert_company_membership', {
        p_actor_user_id:user.id,p_company_id:companyId,p_user_id:targetId,
        p_role:data.role ?? null,p_permissions:data.permissions ?? null,
        p_status:data.status ?? previous?.status ?? 'active',
        p_job_role_id:data.job_role_id === undefined ? previous?.job_role_id ?? null : data.job_role_id || null,
        p_sector:data.sector === undefined ? previous?.sector ?? null : data.sector || null,
      });
      if (error) throw error;
    };
    // Account identity controls are not granted by adding its e-mail to a store.
    const assertIdentityControl = async (targetId: string) => {
      if (globalManager) return;
      const { data: original, error: originalError } = await admin.from('profiles').select('company_id').eq('id',targetId).single();
      const { count, error } = await admin.from('company_memberships').select('id',{ count:'exact',head:true }).eq('user_id',targetId);
      if (error || originalError) throw error ?? originalError;
      if (count !== 1 || original.company_id !== companyId) throw new Error('403: A identidade possui acessos compartilhados. Somente a administração global pode alterar e-mail ou senha.');
    };
    // Quem detém system:global:manage nesta unidade (ALLOW direto ou papel que a
    // carregue — mesma regra do banco) só é alterado por quem também detém. O banco
    // barra status/papel/permissões; aqui barra também senha/e-mail.
    const globalRoles = async () => {
      const { data, error } = await admin.from('role_permissions').select('role').eq('permission_key','system:global:manage');
      if (error) throw error;
      return new Set((data ?? []).map((r: { role: string }) => r.role));
    };
    const isProtected = async (targetId: string) => {
      const [{ count, error }, { data: targetRoles, error: rolesError }, roles] = await Promise.all([
        admin.from('user_permissions').select('id',{ count:'exact',head:true })
          .eq('user_id',targetId).eq('company_id',companyId).eq('permission_key','system:global:manage').eq('effect','ALLOW'),
        admin.from('user_roles').select('role').eq('user_id',targetId).eq('company_id',companyId),
        globalRoles(),
      ]);
      if (error || rolesError) throw error ?? rolesError;
      return (count ?? 0) > 0 || (targetRoles ?? []).some((r: { role: string }) => roles.has(r.role));
    };
    const allRows = async (query: any) => {
      const rows: any[] = [];
      for (let offset=0;;offset+=500) {
        const { data, error } = await query.range(offset,offset+499);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length<500) return rows;
      }
    };
    if (action === 'list') {
      const members = await allRows(admin.from('company_memberships').select('*, profiles(id,nome,email,created_at)')
        .eq('company_id',companyId).neq('status','revoked').order('id'));
      const [roles,overrides,jobs,protectedRoles] = await Promise.all([
        allRows(admin.from('user_roles').select('id,user_id,role').eq('company_id',companyId).order('id')),
        allRows(admin.from('user_permissions').select('id,user_id,permission_key,effect').eq('company_id',companyId).order('id')),
        allRows(admin.from('job_roles').select('id,nome').eq('company_id',companyId).order('id')),
        globalRoles(),
      ]);
      return json({ users:(members ?? []).map(m => ({ ...m.profiles,id:m.user_id,sector:m.sector,job_role_id:m.job_role_id,
        role:roles.find(r => r.user_id===m.user_id)?.role ?? 'sem_role',
        job_role_name:jobs.find(j => j.id===m.job_role_id)?.nome ?? null,
        disabled:m.status!=='active',permissions:overrides.filter(p => p.user_id===m.user_id).map(p => ({ key:p.permission_key,effect:p.effect })) ?? [],
        protegido:overrides.some(p => p.user_id===m.user_id && p.permission_key==='system:global:manage' && p.effect==='ALLOW')
          || roles.some(r => r.user_id===m.user_id && protectedRoles.has(r.role)),
      })) });
    }
    if (action === 'create') {
      if (!body.nome || !VALID_ROLES.includes(body.role)) return json({ error:'Nome e role válidos são obrigatórios.' },400);
      const result = await addCompanyUser(admin,{ actorUserId:user.id,companyId,email:body.email,password:body.password,nome:body.nome,
        role:body.role,permissions:body.permissions,jobRoleId:body.job_role_id,sector:body.sector });
      return json({ success:true,linked:!result.identityCreated,already_exists:result.membership?.already_exists,
        user:{ id:result.userId,email:result.email,nome:body.nome,role:body.role } });
    }
    if (['edit-user','update-role','disable','enable','delete','reset-password'].includes(action)) {
      const targetId = body.userId;
      if (!targetId) return json({ error:'userId obrigatório' },400);
      const previous = await member(targetId);
      if (!globalManager && await isProtected(targetId)) return json({ error:describeMembershipError('PROTECTED_MEMBERSHIP') },403);
      if (action === 'edit-user' || action === 'update-role') {
        if (body.role !== undefined && !VALID_ROLES.includes(body.role)) return json({ error:'Role inválido.' },400);
        const changeEmail = body.email !== undefined && normalizeIdentityEmail(body.email)!==previous.profiles.email;
        const changeName = body.nome !== undefined && body.nome!==previous.profiles.nome;
        if (changeEmail || changeName) await assertIdentityControl(targetId);
        await saveMembership(targetId,body,previous);
        if (changeEmail || changeName) {
          const { error } = await admin.auth.admin.updateUserById(targetId,{
            ...(changeEmail ? { email:normalizeIdentityEmail(body.email) } : {}),
            ...(changeName ? { user_metadata:{ nome:body.nome } } : {}),
          });
          if (error) throw error;
          const { error: profileError } = await admin.from('profiles').update({
            ...(changeEmail ? { email:normalizeIdentityEmail(body.email) } : {}),...(changeName ? { nome:body.nome } : {}),
          }).eq('id',targetId);
          if (profileError) throw profileError;
        }
        return json({ success:true });
      }
      if (action === 'reset-password') {
        await assertIdentityControl(targetId);
        if (typeof body.newPassword!=='string' || body.newPassword.length<12) return json({ error:'Senha deve ter no mínimo 12 caracteres.' },400);
        const { error } = await admin.auth.admin.updateUserById(targetId,{ password:body.newPassword });
        if (error) throw error;
        await audit('IDENTITY_PASSWORD_RESET',targetId);
        return json({ success:true });
      }
      if (targetId===user.id) return json({ error:'Não é possível remover seu próprio acesso.' },400);
      if (action==='delete' && (typeof body.motivo!=='string' || body.motivo.trim().length<3)) return json({ error:'Informe o motivo da remoção de acesso.' },400);
      await saveMembership(targetId,{ status:action==='enable'?'active':action==='delete'?'revoked':'inactive' },previous);
      if (action==='delete') await audit('MEMBERSHIP_REVOKED',targetId,{ motivo:body.motivo });
      return json({ success:true });
    }
    if (action==='create-job-role') {
      if (!body.nome?.trim()) return json({ error:'Nome do cargo obrigatório.' },400);
      const { error } = await admin.from('job_roles').insert({ company_id:companyId,nome:body.nome.trim(),descricao:body.descricao||null,created_by:user.id });
      if (error) throw error;
      await audit('JOB_ROLE_CREATED');return json({ success:true });
    }
    if (action==='toggle-job-role') {
      const { error } = await admin.from('job_roles').update({ is_active:body.is_active }).eq('id',body.jobRoleId).eq('company_id',companyId);
      if (error) throw error;
      await audit('JOB_ROLE_UPDATED');return json({ success:true });
    }
    return json({ error:'Ação inválida.' },400);
  } catch (error) {
    console.error('[admin-users]',error);
    const message = error instanceof Error ? error.message : (error as {message?:string})?.message ?? 'Erro interno';
    const denied = describeMembershipError(message);
    if (denied) return json({ error:denied },403);
    return json({ error:message },message.includes('403:') || message.includes('PERMISSION_DENIED') || message.includes('COMPANY_ACCESS_DENIED') ? 403 : message.includes('404:') ? 404 : 400);
  }
});
