-- Super admin sem acesso implícito às unidades.
--
-- `system:global:manage` administra a plataforma (cadastro de empresas), mas não
-- dá acesso aos dados de nenhuma unidade: o banco já exige membership ativo em
-- toda leitura. O que restava eram três atalhos para o super admin se colocar
-- dentro de uma unidade sem que ela pedisse:
--   1. `onboard_new_company` criava membership admin para quem criou a empresa;
--   2. `admin_upsert_company_membership`/`reserve_company_invitation` aceitavam
--      provisionamento entre unidades para qualquer usuário — inclusive o próprio
--      ator ("Criar Admin" com o próprio e-mail);
--   3. `rpc_set_user_company` (sem uso no app) fazia o mesmo com papel operador.
--
-- Regra nova:
--   * Provisionar a partir de outra unidade só serve para dar o 1º gestor de
--     usuários a uma unidade que não tem nenhum, e nunca para o próprio ator.
--     Com gestor na unidade, quem dá acesso (inclusive ao super admin) é ela.
--     O 1º gestor recebe o papel pedido, nunca a chave da plataforma.
--   * Membership de quem detém `system:global:manage` NAQUELA unidade (hoje só o
--     dono do sistema, na Moralles) só é alterado por quem também detém a chave
--     ali. Nas demais unidades o super admin é um membro comum: qualquer admin
--     da unidade pode desativá-lo ou removê-lo.
--   * A chave da plataforma não sai pela edição de usuário — só por
--     `admin_set_super_admin` (dupla confirmação) —, para o dono não se trancar.
--   * `role_permissions` (catálogo global dos papéis) deixa de ser gravável pelo
--     cliente: alterá-lo mudava o que os admins de TODAS as unidades podem fazer,
--     e bastava para uma unidade com gestor parecer sem gestor.
-- Memberships já existentes não são tocados.

-- ─── Helper: a unidade tem alguém ativo que gerencia usuários? ──────────────
-- "Gestor" é quem passa no gate de admin_upsert_company_membership; contar quem
-- não consegue agir (ex.: só system:admin) travaria a unidade sem recuperação.
CREATE OR REPLACE FUNCTION public._company_has_user_manager(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
 SELECT EXISTS(
   SELECT 1 FROM public.company_memberships m
   WHERE m.company_id = p_company_id AND m.status = 'active'
     AND public.get_company_permissions(m.user_id, p_company_id)
         && ARRAY['configuracoes:usuarios:manage','users:manage','system:global:manage']);
$function$;

REVOKE ALL ON FUNCTION public._company_has_user_manager(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._company_has_user_manager(uuid) TO service_role;

-- ─── role_permissions: catálogo global, muda só por migration ───────────────
-- O app só lê (matriz de permissões); sync_permissions_from_registry e as
-- migrations rodam como owner e não dependem desta policy.
DROP POLICY IF EXISTS role_templates_manage ON public.role_permissions;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.role_permissions FROM anon, authenticated;

-- ─── admin_upsert_company_membership ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_upsert_company_membership(p_actor_user_id uuid, p_company_id uuid, p_user_id uuid, p_role app_role DEFAULT NULL::app_role, p_permissions text[] DEFAULT NULL::text[], p_status text DEFAULT 'active'::text, p_job_role_id uuid DEFAULT NULL::uuid, p_sector text DEFAULT NULL::text, p_if_not_exists boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE v_actor_permissions text[]; v_id uuid; v_existed boolean; v_previous_status text;
 v_actor_global_here boolean; v_cross_company boolean := false;
BEGIN
 v_actor_permissions:=public.get_company_permissions(p_actor_user_id,p_company_id);
 -- Avaliado na própria unidade, antes do fallback abaixo trocar o conjunto.
 v_actor_global_here:=COALESCE('system:global:manage'=ANY(v_actor_permissions),false);
 -- Provisionamento a partir de outra unidade: exige system:global:manage na
 -- unidade original do ator e só serve para dar o 1º gestor de usuários a uma
 -- unidade sem nenhum (checado sob lock abaixo), nunca para o próprio ator.
 IF NOT v_actor_permissions && ARRAY['configuracoes:usuarios:manage','users:manage','system:global:manage'] THEN
   SELECT public.get_company_permissions(p_actor_user_id,p.company_id) INTO v_actor_permissions
   FROM public.profiles p WHERE p.id=p_actor_user_id;
   IF NOT COALESCE('system:global:manage'=ANY(v_actor_permissions),false) THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PERMISSION_DENIED';
   END IF;
   IF p_user_id=p_actor_user_id THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SELF_PROVISIONING_DENIED';
   END IF;
   v_cross_company:=true;
 END IF;
 IF p_status NOT IN ('active','inactive','revoked') THEN RAISE EXCEPTION 'INVALID_MEMBERSHIP_STATUS'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=p_company_id AND ativo
   AND id<>'00000000-0000-0000-0000-000000000001'::uuid) THEN RAISE EXCEPTION 'COMPANY_INACTIVE'; END IF;
 IF p_job_role_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.job_roles WHERE id=p_job_role_id AND company_id=p_company_id) THEN
   RAISE EXCEPTION 'JOB_ROLE_COMPANY_MISMATCH';
 END IF;
 IF v_cross_company THEN
   -- Serializa o 1º gestor da unidade: dois provisionamentos simultâneos não
   -- podem ambos enxergar a unidade sem gestor.
   PERFORM pg_advisory_xact_lock(hashtextextended('company-bootstrap:'||p_company_id::text,0));
   IF public._company_has_user_manager(p_company_id) THEN
     -- Reenvio do mesmo "Criar Admin" que já deu certo: o alvo já é o gestor.
     SELECT m.id INTO v_id FROM public.company_memberships m
     WHERE m.user_id=p_user_id AND m.company_id=p_company_id AND m.status='active'
       AND public.get_company_permissions(p_user_id,p_company_id)
           && ARRAY['configuracoes:usuarios:manage','users:manage','system:global:manage'];
     IF v_id IS NOT NULL AND p_if_not_exists THEN
       RETURN jsonb_build_object('membership_id',v_id,'already_exists',true);
     END IF;
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_HAS_USER_MANAGER';
   END IF;
   -- O 1º gestor recebe o papel pedido, nunca a chave da plataforma.
   IF COALESCE(p_permissions,ARRAY[]::text[]) && ARRAY['system:global:manage']
     OR EXISTS(SELECT 1 FROM public.role_permissions WHERE role=p_role::text AND permission_key='system:global:manage') THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PRIVILEGE_ESCALATION_DENIED';
   END IF;
 END IF;
 -- Serialize retries/concurrent creation for the same identity and unit.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_company_id::text,0));
 SELECT id,status INTO v_id,v_previous_status FROM public.company_memberships WHERE user_id=p_user_id AND company_id=p_company_id FOR UPDATE;
 v_existed:=v_id IS NOT NULL;
 -- Reenvio é idempotente. No 1º gestor (entre unidades) o vínculo existente —
 -- inativo, ou ativo sem gestão — é refeito com o papel pedido.
 IF v_existed AND p_if_not_exists AND v_previous_status<>'revoked' AND NOT v_cross_company THEN
   RETURN jsonb_build_object('membership_id',v_id,'already_exists',true);
 END IF;
 -- Quem detém system:global:manage nesta unidade só é alterado (status, papel,
 -- permissões, cargo/setor) por quem também detém a chave aqui.
 IF v_existed AND NOT v_actor_global_here AND (
   EXISTS(SELECT 1 FROM public.user_permissions WHERE user_id=p_user_id AND company_id=p_company_id
     AND permission_key='system:global:manage' AND effect='ALLOW')
   OR EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.role_permissions rp ON rp.role=ur.role::text
     WHERE ur.user_id=p_user_id AND ur.company_id=p_company_id AND rp.permission_key='system:global:manage')) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PROTECTED_MEMBERSHIP';
 END IF;
 -- A chave da plataforma só sai por admin_set_super_admin (dupla confirmação):
 -- regravar as permissões sem ela deixaria a unidade sem administração do sistema.
 IF p_permissions IS NOT NULL AND NOT ('system:global:manage'=ANY(p_permissions))
   AND EXISTS(SELECT 1 FROM public.user_permissions WHERE user_id=p_user_id AND company_id=p_company_id
     AND permission_key='system:global:manage' AND effect='ALLOW') THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='GLOBAL_KEY_REMOVAL_DENIED';
 END IF;
 IF v_existed AND p_if_not_exists THEN
   -- Explicitly adding a removed user (or the unit's first manager) restores
   -- only the newly selected grants.
   DELETE FROM public.user_roles WHERE user_id=p_user_id AND company_id=p_company_id;
   DELETE FROM public.user_permissions WHERE user_id=p_user_id AND company_id=p_company_id;
 END IF;
 -- Só system:global:manage confere super-admin (no banco e, após a remoção da
 -- expansão legada, também na UI). system:admin é chave legada de módulo, faz
 -- parte do role admin e não pode bloquear a atribuição do perfil.
 IF NOT COALESCE('system:global:manage'=ANY(v_actor_permissions),false) AND
   (COALESCE(p_permissions,ARRAY[]::text[]) && ARRAY['system:global:manage']
     OR EXISTS(SELECT 1 FROM public.role_permissions WHERE role=p_role::text AND permission_key='system:global:manage')) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PRIVILEGE_ESCALATION_DENIED';
 END IF;
 -- Delegar system:admin (criar ou promover outro Admin) exige que o próprio
 -- ator já seja Admin na unidade, ou super-admin. Sem isso, qualquer ator com
 -- users:manage/configuracoes:usuarios:manage (o gate básico desta função)
 -- poderia criar Admins livremente — regressão silenciosa vs. 20260910003448.
 IF NOT COALESCE('system:global:manage'=ANY(v_actor_permissions),false)
   AND NOT COALESCE('system:admin'=ANY(v_actor_permissions),false)
   AND (COALESCE(p_permissions,ARRAY[]::text[]) && ARRAY['system:admin']
     OR EXISTS(SELECT 1 FROM public.role_permissions WHERE role=p_role::text AND permission_key='system:admin')) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PRIVILEGE_ESCALATION_DENIED';
 END IF;
 IF p_permissions IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(p_permissions) k WHERE NOT EXISTS(SELECT 1 FROM public.permissions WHERE key=k)) THEN
   RAISE EXCEPTION 'UNKNOWN_PERMISSION';
 END IF;
 INSERT INTO public.company_memberships(user_id,company_id,status,job_role_id,sector)
 VALUES(p_user_id,p_company_id,p_status,p_job_role_id,p_sector)
 ON CONFLICT(user_id,company_id) DO UPDATE SET status=EXCLUDED.status,job_role_id=EXCLUDED.job_role_id,
   sector=EXCLUDED.sector,updated_at=now() RETURNING id INTO v_id;
 IF p_role IS NOT NULL THEN
   DELETE FROM public.user_roles WHERE user_id=p_user_id AND company_id=p_company_id;
   INSERT INTO public.user_roles(user_id,company_id,role) VALUES(p_user_id,p_company_id,p_role);
 END IF;
 IF p_permissions IS NOT NULL THEN
   DELETE FROM public.user_permissions WHERE user_id=p_user_id AND company_id=p_company_id;
   INSERT INTO public.user_permissions(user_id,company_id,permission_key,effect,granted_by)
   SELECT p_user_id,p_company_id,p.key,
     CASE WHEN p.key=ANY(p_permissions) THEN 'ALLOW' ELSE 'DENY' END,p_actor_user_id
   FROM public.permissions p WHERE p.key=ANY(p_permissions) OR EXISTS(
     SELECT 1 FROM public.user_roles ur JOIN public.role_permissions rp ON rp.role=ur.role::text
     WHERE ur.user_id=p_user_id AND ur.company_id=p_company_id AND rp.permission_key=p.key);
 END IF;
 INSERT INTO public.admin_actions_log(actor_user_id,company_id,action,target_user_id,details)
 VALUES(p_actor_user_id,p_company_id,CASE WHEN v_existed THEN 'MEMBERSHIP_UPDATED' ELSE 'MEMBERSHIP_CREATED' END,p_user_id,
   jsonb_build_object('status',p_status,'role',p_role,'permissions_count',cardinality(p_permissions),
     'cross_company',v_cross_company));
 RETURN jsonb_build_object('membership_id',v_id,'already_exists',false);
END;
$function$;

-- ─── reserve_company_invitation: mesma regra do provisionamento entre unidades ─
-- A reserva vem antes da criação da identidade no Auth; sem a checagem aqui, a
-- identidade nasceria vinculada à unidade e só o membership seria recusado.
CREATE OR REPLACE FUNCTION public.reserve_company_invitation(p_actor_user_id uuid, p_company_id uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE v_permissions text[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=p_company_id AND ativo
   AND id<>'00000000-0000-0000-0000-000000000001'::uuid) THEN RAISE EXCEPTION 'COMPANY_INACTIVE'; END IF;
 v_permissions:=public.get_company_permissions(p_actor_user_id,p_company_id);
 IF NOT v_permissions && ARRAY['configuracoes:usuarios:manage','users:manage','system:global:manage'] THEN
   SELECT public.get_company_permissions(p_actor_user_id,company_id) INTO v_permissions FROM public.profiles WHERE id=p_actor_user_id;
   IF NOT COALESCE('system:global:manage'=ANY(v_permissions),false) THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PERMISSION_DENIED';
   END IF;
   IF public._company_has_user_manager(p_company_id) THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_HAS_USER_MANAGER';
   END IF;
 END IF;
 INSERT INTO multiunit_private.pending_identity_companies(email,company_id,expires_at)
 VALUES(lower(btrim(p_email)),p_company_id,now()+interval '5 minutes')
 ON CONFLICT(email) DO UPDATE SET company_id=EXCLUDED.company_id,expires_at=EXCLUDED.expires_at;
END;
$function$;

-- ─── onboard_new_company: quem cria a empresa não entra nela ────────────────
CREATE OR REPLACE FUNCTION public.onboard_new_company(p_company_name text, p_cnpj text DEFAULT NULL::text, p_admin_user_id uuid DEFAULT NULL::uuid, p_onboarding_request_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid;
  v_new_company_id uuid;
  v_result jsonb;
  v_key text := nullif(btrim(coalesce(p_onboarding_request_id, '')), '');
  v_cnpj_digitos text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
  v_existente record;
  v_constraint text;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '403: Não autenticado';
  END IF;

  IF NOT has_permission(v_caller_uid, 'system:global:manage') THEN
    RAISE EXCEPTION '403: Sem permissão (system:global:manage)';
  END IF;

  IF p_company_name IS NULL OR trim(p_company_name) = '' THEN
    RAISE EXCEPTION '400: Nome da empresa é obrigatório';
  END IF;

  -- Quem cria a empresa não ganha acesso a ela: o acesso do super admin é
  -- sempre concedido pela própria unidade.
  IF p_admin_user_id = v_caller_uid THEN
    RAISE EXCEPTION '403: SELF_PROVISIONING_DENIED';
  END IF;

  IF v_key IS NOT NULL AND char_length(v_key) > 200 THEN
    RAISE EXCEPTION '400: REQUEST_ID_INVALIDO';
  END IF;

  -- Reenvio: a mesma chave devolve a empresa já criada, se for o MESMO cadastro.
  IF v_key IS NOT NULL THEN
    SELECT c.id, c.nome, c.cnpj INTO v_existente
    FROM companies c WHERE c.onboarding_request_id = v_key;
    IF v_existente.id IS NOT NULL THEN
      IF v_existente.nome IS DISTINCT FROM trim(p_company_name)
         OR nullif(regexp_replace(coalesce(v_existente.cnpj, ''), '\D', '', 'g'), '') IS DISTINCT FROM v_cnpj_digitos THEN
        RAISE EXCEPTION '409: REQUEST_ID_REUTILIZADO';
      END IF;
      RETURN jsonb_build_object(
        'success', true,
        'company_id', v_existente.id,
        'company_name', v_existente.nome,
        'idempotente', true
      );
    END IF;
  END IF;

  IF v_cnpj_digitos IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM companies WHERE regexp_replace(cnpj, '\D', '', 'g') = v_cnpj_digitos) THEN
      RAISE EXCEPTION '409: CNPJ já cadastrado';
    END IF;
  END IF;

  BEGIN
    INSERT INTO companies (nome, cnpj, ativo, onboarding_request_id)
    VALUES (trim(p_company_name), NULLIF(trim(p_cnpj), ''), true, v_key)
    RETURNING id INTO v_new_company_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'uq_companies_cnpj_digitos' THEN
      RAISE EXCEPTION '409: CNPJ já cadastrado';
    END IF;
    IF v_constraint IS DISTINCT FROM 'uq_companies_onboarding_request' THEN
      RAISE;
    END IF;
    -- Outra transação criou o mesmo cadastro entre o caminho rápido e o INSERT.
    SELECT c.id, c.nome, c.cnpj INTO v_existente
    FROM companies c WHERE c.onboarding_request_id = v_key;
    IF v_existente.id IS NULL THEN
      RAISE;
    END IF;
    IF v_existente.nome IS DISTINCT FROM trim(p_company_name)
       OR nullif(regexp_replace(coalesce(v_existente.cnpj, ''), '\D', '', 'g'), '') IS DISTINCT FROM v_cnpj_digitos THEN
      RAISE EXCEPTION '409: REQUEST_ID_REUTILIZADO';
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'company_id', v_existente.id,
      'company_name', v_existente.nome,
      'idempotente', true
    );
  END;

  INSERT INTO public.turnos (company_id, nome, hora_inicio, hora_fim, ativo)
  VALUES
    (v_new_company_id, 'Manhã', '07:00:00'::time, '15:00:00'::time, true),
    (v_new_company_id, 'Tarde', '15:00:00'::time, '23:00:00'::time, true),
    (v_new_company_id, 'Noite', '23:00:00'::time, '07:00:00'::time, true),
    (v_new_company_id, 'Geral', '00:00:00'::time, '23:59:59'::time, true);

  -- Plano de contas fixo: raízes NÃO OPERACIONAIS sempre presentes, mesmo
  -- padrão de Ren Sushi/Moralles, desde a criação da empresa.
  PERFORM public.fin_get_categoria_desconto_baixa(v_new_company_id);
  PERFORM public.fin_get_categoria_desconto_concedido(v_new_company_id);

  IF p_admin_user_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_user_id) THEN
      RAISE EXCEPTION '404: Usuário admin não encontrado';
    END IF;

    INSERT INTO public.company_memberships(user_id,company_id) VALUES(p_admin_user_id,v_new_company_id) ON CONFLICT(user_id,company_id) DO UPDATE SET status='active',updated_at=now();

    INSERT INTO user_roles (user_id, company_id, role)
    VALUES (p_admin_user_id, v_new_company_id, 'admin')
    ON CONFLICT (user_id, company_id, role) DO NOTHING;
  END IF;

  INSERT INTO job_roles (company_id, nome, descricao)
  VALUES
    (v_new_company_id, 'Gerente Geral', 'Responsável geral pela operação'),
    (v_new_company_id, 'Chef de Cozinha', 'Responsável pela cozinha e fichas técnicas'),
    (v_new_company_id, 'Estoquista', 'Responsável pelo controle de estoque'),
    (v_new_company_id, 'Comprador', 'Responsável pelas compras e fornecedores'),
    (v_new_company_id, 'Financeiro', 'Responsável pelo módulo financeiro'),
    (v_new_company_id, 'Operador', 'Operação geral do dia a dia')
  ON CONFLICT (company_id, nome) DO NOTHING;

  INSERT INTO admin_actions_log (actor_user_id, company_id, action, details)
  VALUES (
    v_caller_uid,
    v_new_company_id,
    'COMPANY_CREATED',
    jsonb_build_object(
      'company_name', trim(p_company_name),
      'cnpj', p_cnpj,
      'admin_user_id', p_admin_user_id
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'company_id', v_new_company_id,
    'company_name', trim(p_company_name),
    'idempotente', false
  );

  RETURN v_result;
END;
$function$;

-- ─── list_companies: informa se a unidade já tem gestor de usuários ─────────
-- A tela de Empresas só oferece "Criar Admin" para unidade sem gestor; com
-- gestor, o acesso é concedido pela própria unidade.
CREATE OR REPLACE FUNCTION public.list_companies()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid;
  v_result jsonb;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '403: Não autenticado';
  END IF;

  IF NOT has_permission(v_caller_uid, 'system:global:manage') THEN
    RAISE EXCEPTION '403: Sem permissão';
  END IF;

  SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at)
  INTO v_result
  FROM (
    SELECT
      c.id,
      c.nome,
      c.cnpj,
      c.ativo,
      c.created_at,
      c.updated_at,
      (SELECT count(*) FROM public.company_memberships p WHERE p.company_id = c.id AND p.status='active') AS total_usuarios,
      public._company_has_user_manager(c.id) AS tem_gestor
    FROM companies c
    WHERE c.id <> '00000000-0000-0000-0000-000000000001'::uuid
    ORDER BY c.created_at
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- ─── rpc_set_user_company: atalho entre unidades, sem uso no app ────────────
DROP FUNCTION IF EXISTS public.rpc_set_user_company(uuid, uuid);
