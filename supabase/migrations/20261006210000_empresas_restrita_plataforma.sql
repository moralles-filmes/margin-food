-- Configurações → Empresas é da plataforma (unidade Moralles).
--
-- Até aqui a chave `configuracoes:empresas:*` estava no catálogo dos papéis
-- admin/diretor/gerente_geral e aparecia na matriz de permissões de toda unidade,
-- mas nada no banco a aceitava: listar, criar, editar e desativar empresas exigia
-- `system:global:manage`. Era uma caixinha sem efeito oferecida a todo admin.
--
-- Regra nova:
--   * A chave só existe na unidade da plataforma (`platform_company_id()`, a
--     Moralles). Fora dela nunca é gravada como ALLOW, e nunca em
--     `role_permissions` (catálogo global dos papéis) — triggers barram.
--   * Só quem detém `system:global:manage` na Moralles concede ou remove a chave.
--     Os demais gestores da Moralles editam o usuário sem tocar nela: o banco
--     mantém o estado atual, venha o que vier da tela.
--   * A chave passa a valer de verdade, por ação, só com a Moralles como unidade
--     ativa: view lista, create cria empresa e o 1º Admin de empresa ainda sem
--     nenhum usuário, edit altera nome/CNPJ, delete desativa/reativa. O super
--     admin continua passando por `system:global:manage` (e segue sendo o único
--     que dá o 1º Admin a uma loja antiga que ficou sem gestor).
--   * Ninguém desativa a empresa da plataforma (trancaria o super admin fora).
--   * `p_admin_user_id` de onboard_new_company (atalho que pula as travas de
--     admin_upsert_company_membership) fica só para o super admin.
-- Auditoria Segurança: os eventos de acesso da unidade (`admin_actions_log`)
-- passam a ser legíveis por quem tem `configuracoes:auditoria-seguranca:view`.
--
-- Limpeza (conferida em 2026-10-06): 12 linhas de role_permissions (4 chaves ×
-- admin/diretor/gerente_geral) e 24 de user_permissions (16 ALLOW e 8 DENY, todas
-- fora da Moralles).

-- ─── Unidade da plataforma ─────────────────────────────────────────────────
-- Constante de propósito: a unidade que administra o sistema não muda, e derivá-la
-- de quem tem system:global:manage moveria a plataforma junto com a chave.
CREATE OR REPLACE FUNCTION public.platform_company_id()
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path = ''
AS $function$
 SELECT 'e6df6541-154e-4576-ad0c-86047bc57490'::uuid;
$function$;
REVOKE ALL ON FUNCTION public.platform_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_company_id() TO authenticated, service_role;

-- ─── Quem gerencia empresas ────────────────────────────────────────────────
-- p_action NULL = qualquer ação de Empresas (usado para listar: quem só cria ou só
-- desativa também precisa ver a lista).
CREATE OR REPLACE FUNCTION public.can_manage_companies(p_action text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
 SELECT auth.uid() IS NOT NULL AND (
   public.has_permission(auth.uid(),'system:global:manage')
   OR (public.get_current_company_id() = public.platform_company_id()
     AND CASE
       WHEN p_action IS NULL THEN public.has_any_permission(auth.uid(), ARRAY[
         'configuracoes:empresas:view','configuracoes:empresas:create',
         'configuracoes:empresas:edit','configuracoes:empresas:delete'])
       WHEN p_action IN ('view','create','edit','delete')
         THEN public.has_permission(auth.uid(),'configuracoes:empresas:'||p_action)
       ELSE false
     END));
$function$;
REVOKE ALL ON FUNCTION public.can_manage_companies(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_companies(text) TO authenticated, service_role;

-- ─── Limpeza + travas ──────────────────────────────────────────────────────
DELETE FROM public.role_permissions WHERE permission_key LIKE 'configuracoes:empresas:%';
DELETE FROM public.user_permissions WHERE permission_key LIKE 'configuracoes:empresas:%'
  AND (company_id IS DISTINCT FROM public.platform_company_id() OR effect = 'DENY');

CREATE OR REPLACE FUNCTION public.trg_user_permissions_empresas_plataforma()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
 IF NEW.permission_key LIKE 'configuracoes:empresas:%' AND NEW.effect = 'ALLOW'
   AND NEW.company_id IS DISTINCT FROM public.platform_company_id() THEN
   RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='EMPRESAS_SOMENTE_PLATAFORMA',
     DETAIL='configuracoes:empresas:* só pode ser concedida na unidade da plataforma.';
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_user_permissions_empresas_plataforma ON public.user_permissions;
CREATE TRIGGER trg_user_permissions_empresas_plataforma
 BEFORE INSERT OR UPDATE OF permission_key, effect, company_id ON public.user_permissions
 FOR EACH ROW EXECUTE FUNCTION public.trg_user_permissions_empresas_plataforma();

-- Papéis valem em toda unidade: a chave num papel a daria a todo admin de loja.
CREATE OR REPLACE FUNCTION public.trg_role_permissions_sem_empresas()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
 IF NEW.permission_key LIKE 'configuracoes:empresas:%' THEN
   RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='EMPRESAS_FORA_DOS_PAPEIS',
     DETAIL='configuracoes:empresas:* é concedida por usuário na unidade da plataforma, nunca por papel.';
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_role_permissions_sem_empresas ON public.role_permissions;
CREATE TRIGGER trg_role_permissions_sem_empresas
 BEFORE INSERT OR UPDATE OF permission_key ON public.role_permissions
 FOR EACH ROW EXECUTE FUNCTION public.trg_role_permissions_sem_empresas();

REVOKE ALL ON FUNCTION public.trg_user_permissions_empresas_plataforma() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_role_permissions_sem_empresas() FROM PUBLIC, anon, authenticated;

-- ─── admin_upsert_company_membership ────────────────────────────────────────
-- Base: 20261006200000. Mudanças: (1) o delegado de Empresas (create na
-- plataforma) entra no provisionamento restrito do super admin, mais estreito:
-- só o papel Admin, sem lista de chaves, nunca o próprio ator e só em unidade
-- sem NENHUM membership (empresa recém-criada) — loja antiga que ficou sem
-- gestor continua com o super admin, senão o delegado entraria nos dados dela
-- com uma identidade que ele controla; (2) filtro da chave de Empresas antes de
-- gravar as permissões, com o estado atual lido antes de qualquer limpeza;
-- (3) o log registra as chaves de Empresas resultantes na plataforma.
CREATE OR REPLACE FUNCTION public.admin_upsert_company_membership(p_actor_user_id uuid, p_company_id uuid, p_user_id uuid, p_role app_role DEFAULT NULL::app_role, p_permissions text[] DEFAULT NULL::text[], p_status text DEFAULT 'active'::text, p_job_role_id uuid DEFAULT NULL::uuid, p_sector text DEFAULT NULL::text, p_if_not_exists boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE v_actor_permissions text[]; v_id uuid; v_existed boolean; v_previous_status text;
 v_actor_global_here boolean; v_cross_company boolean := false; v_delegated boolean := false;
 v_empresas_atuais text[];
BEGIN
 v_actor_permissions:=public.get_company_permissions(p_actor_user_id,p_company_id);
 -- Avaliado na própria unidade, antes do fallback abaixo trocar o conjunto.
 v_actor_global_here:=COALESCE('system:global:manage'=ANY(v_actor_permissions),false);
 -- Provisionamento a partir de outra unidade: exige system:global:manage na
 -- unidade original do ator (ou a chave de criar empresas na unidade da
 -- plataforma) e só serve para dar o 1º gestor de usuários a uma unidade sem
 -- nenhum (checado sob lock abaixo), nunca para o próprio ator.
 IF NOT v_actor_permissions && ARRAY['configuracoes:usuarios:manage','users:manage','system:global:manage'] THEN
   SELECT public.get_company_permissions(p_actor_user_id,p.company_id) INTO v_actor_permissions
   FROM public.profiles p WHERE p.id=p_actor_user_id;
   IF NOT COALESCE('system:global:manage'=ANY(v_actor_permissions),false) THEN
     IF NOT COALESCE('configuracoes:empresas:create'=ANY(
         public.get_company_permissions(p_actor_user_id,public.platform_company_id())),false) THEN
       RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PERMISSION_DENIED';
     END IF;
     -- O delegado só cria o Admin; lista de chaves e outros papéis são da unidade.
     IF p_permissions IS NOT NULL THEN
       RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PERMISSION_DENIED';
     END IF;
     IF p_role IS DISTINCT FROM 'admin'::public.app_role THEN
       RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PRIVILEGE_ESCALATION_DENIED';
     END IF;
     v_delegated:=true;
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
   -- Delegado: só empresa sem ninguém (o reenvio que já deu certo voltou acima).
   IF v_delegated AND EXISTS(SELECT 1 FROM public.company_memberships WHERE company_id=p_company_id) THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_ALREADY_HAS_MEMBERS';
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
 -- Lido antes de qualquer limpeza: a readição abaixo apaga as permissões.
 v_empresas_atuais:=ARRAY(SELECT up.permission_key FROM public.user_permissions up
   WHERE up.user_id=p_user_id AND up.company_id=p_company_id AND up.effect='ALLOW'
     AND up.permission_key LIKE 'configuracoes:empresas:%');
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
   -- only the newly selected grants. A chave de Empresas só sai pelo super admin.
   DELETE FROM public.user_roles WHERE user_id=p_user_id AND company_id=p_company_id;
   DELETE FROM public.user_permissions WHERE user_id=p_user_id AND company_id=p_company_id
     AND (v_actor_global_here OR permission_key NOT LIKE 'configuracoes:empresas:%' OR effect<>'ALLOW');
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
 -- Exceção: o delegado de Empresas dando o papel Admin ao 1º gestor de uma
 -- unidade sem gestor (validado acima, sob lock, sem lista de chaves).
 IF NOT COALESCE('system:global:manage'=ANY(v_actor_permissions),false)
   AND NOT COALESCE('system:admin'=ANY(v_actor_permissions),false)
   AND NOT v_delegated
   AND (COALESCE(p_permissions,ARRAY[]::text[]) && ARRAY['system:admin']
     OR EXISTS(SELECT 1 FROM public.role_permissions WHERE role=p_role::text AND permission_key='system:admin')) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PRIVILEGE_ESCALATION_DENIED';
 END IF;
 -- Configurações → Empresas é da plataforma: fora dela a chave nunca é gravada;
 -- nela, só quem detém system:global:manage ali concede ou remove. Para os demais
 -- gestores o estado atual da pessoa é mantido, venha o que vier da tela.
 IF p_permissions IS NOT NULL THEN
   IF p_company_id IS DISTINCT FROM public.platform_company_id() THEN
     p_permissions:=ARRAY(SELECT k FROM unnest(p_permissions) k WHERE k NOT LIKE 'configuracoes:empresas:%');
   ELSIF NOT v_actor_global_here THEN
     p_permissions:=ARRAY(SELECT k FROM unnest(p_permissions) k WHERE k NOT LIKE 'configuracoes:empresas:%')
       || v_empresas_atuais;
   END IF;
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
     'cross_company',v_cross_company,'delegated',v_delegated,
     'empresas',CASE WHEN p_permissions IS NOT NULL AND p_company_id=public.platform_company_id()
       THEN to_jsonb(ARRAY(SELECT k FROM unnest(p_permissions) k WHERE k LIKE 'configuracoes:empresas:%' ORDER BY k)) END));
 RETURN jsonb_build_object('membership_id',v_id,'already_exists',false);
END;
$function$;

-- ─── reserve_company_invitation: mesma regra do provisionamento entre unidades ─
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
     -- Delegado de Empresas: só empresa sem ninguém (mesma regra do membership).
     IF NOT COALESCE('configuracoes:empresas:create'=ANY(
         public.get_company_permissions(p_actor_user_id,public.platform_company_id())),false) THEN
       RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PERMISSION_DENIED';
     END IF;
     IF EXISTS(SELECT 1 FROM public.company_memberships WHERE company_id=p_company_id) THEN
       RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPANY_ALREADY_HAS_MEMBERS';
     END IF;
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

-- ─── onboard_new_company: gate por Empresas → Criar ─────────────────────────
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

  IF NOT public.can_manage_companies('create') THEN
    RAISE EXCEPTION '403: Sem permissão (configuracoes:empresas:create)';
  END IF;

  -- Vincular um usuário existente direto como Admin pula as travas de
  -- admin_upsert_company_membership: só o super admin usa este atalho.
  IF p_admin_user_id IS NOT NULL AND NOT has_permission(v_caller_uid, 'system:global:manage') THEN
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

-- ─── list_companies: qualquer ação de Empresas lista ────────────────────────
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

  IF NOT public.can_manage_companies(NULL) THEN
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
      public._company_has_user_manager(c.id) AS tem_gestor,
      c.id = public.platform_company_id() AS plataforma
    FROM companies c
    WHERE c.id <> '00000000-0000-0000-0000-000000000001'::uuid
    ORDER BY c.created_at
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- ─── update_company: edit altera dados, delete desativa/reativa ─────────────
CREATE OR REPLACE FUNCTION public.update_company(p_company_id uuid, p_nome text DEFAULT NULL::text, p_cnpj text DEFAULT NULL::text, p_ativo boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid;
  v_old record;
  v_cnpj_digitos text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
  v_muda_dados boolean;
  v_muda_status boolean;
  v_constraint text;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '403: Não autenticado';
  END IF;

  -- Antes de ler a empresa: sem acesso a Empresas, nem a existência é revelada.
  IF NOT public.can_manage_companies(NULL) THEN
    RAISE EXCEPTION '403: Sem permissão';
  END IF;

  IF p_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION '400: Não é possível editar a empresa placeholder';
  END IF;

  SELECT * INTO v_old FROM companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Empresa não encontrada';
  END IF;

  v_muda_dados := (NULLIF(trim(p_nome), '') IS NOT NULL AND trim(p_nome) IS DISTINCT FROM v_old.nome)
    OR (p_cnpj IS NOT NULL AND NULLIF(trim(p_cnpj), '') IS DISTINCT FROM v_old.cnpj);
  v_muda_status := p_ativo IS NOT NULL AND p_ativo IS DISTINCT FROM v_old.ativo;

  -- Nada muda: não grava nem audita (quem só vê a lista não escreve nada).
  IF NOT v_muda_dados AND NOT v_muda_status THEN
    RETURN jsonb_build_object('success', true, 'noop', true);
  END IF;

  IF v_muda_dados AND NOT public.can_manage_companies('edit') THEN
    RAISE EXCEPTION '403: Sem permissão (configuracoes:empresas:edit)';
  END IF;
  IF v_muda_status AND NOT public.can_manage_companies('delete') THEN
    RAISE EXCEPTION '403: Sem permissão (configuracoes:empresas:delete)';
  END IF;

  -- Desativar a unidade da plataforma trancaria o super admin fora do sistema.
  IF v_muda_status AND p_ativo = false AND p_company_id = public.platform_company_id() THEN
    RAISE EXCEPTION '400: A empresa da plataforma não pode ser desativada';
  END IF;

  IF v_cnpj_digitos IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM companies WHERE regexp_replace(cnpj, '\D', '', 'g') = v_cnpj_digitos AND id <> p_company_id) THEN
      RAISE EXCEPTION '409: CNPJ já cadastrado em outra empresa';
    END IF;
  END IF;

  BEGIN
    UPDATE companies SET
      nome       = COALESCE(NULLIF(trim(p_nome), ''), v_old.nome),
      cnpj       = CASE WHEN p_cnpj IS NOT NULL THEN NULLIF(trim(p_cnpj), '') ELSE v_old.cnpj END,
      ativo      = COALESCE(p_ativo, v_old.ativo),
      updated_at = now()
    WHERE id = p_company_id;
  EXCEPTION WHEN unique_violation THEN
    -- Outra transação gravou o mesmo CNPJ entre a checagem acima e o UPDATE.
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'uq_companies_cnpj_digitos' THEN
      RAISE EXCEPTION '409: CNPJ já cadastrado em outra empresa';
    END IF;
    RAISE;
  END;

  INSERT INTO audit_logs (actor_user_id, company_id, action, module, entity, entity_id, metadata)
  VALUES (v_caller_uid, p_company_id, 'COMPANY_UPDATED', 'admin', 'companies', p_company_id, jsonb_build_object(
    'old_nome', v_old.nome, 'new_nome', COALESCE(NULLIF(trim(p_nome), ''), v_old.nome),
    'old_cnpj', v_old.cnpj, 'new_cnpj', CASE WHEN p_cnpj IS NOT NULL THEN NULLIF(trim(p_cnpj), '') ELSE v_old.cnpj END,
    'old_ativo', v_old.ativo, 'new_ativo', COALESCE(p_ativo, v_old.ativo)
  ));

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- ─── Auditoria Segurança: eventos de acesso da unidade ──────────────────────
-- A policy RESTRICTIVE multiunit_scope_boundary continua valendo por cima.
DROP POLICY IF EXISTS admin_actions_unit_security_read ON public.admin_actions_log;
CREATE POLICY admin_actions_unit_security_read ON public.admin_actions_log
 FOR SELECT TO authenticated
 USING (
   company_id = (SELECT public.get_current_company_id())
   AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
     'configuracoes:auditoria-seguranca:view','system:read','system:global:manage']))
 );
