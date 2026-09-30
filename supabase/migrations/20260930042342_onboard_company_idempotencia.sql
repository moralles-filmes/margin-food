-- ─────────────────────────────────────────────────────────────────────────────
-- Criar empresa — idempotente e com CNPJ único no banco.
--
-- Antes, `onboard_new_company` conferia o CNPJ com check-then-insert (sem
-- índice) e, sem CNPJ, não conferia nada: duplo clique ou retry depois de a
-- resposta se perder criavam uma 2ª empresa com os turnos, os cargos, o vínculo
-- de admin e as categorias não operacionais.
--
--   · `uq_companies_cnpj_digitos`: CNPJ único pelos DÍGITOS — "12.345.678/0001-90"
--     e "12345678000190" são a mesma empresa. `update_company` passa a comparar
--     do mesmo jeito, para a colisão virar o 409 de sempre, não o erro cru do
--     índice.
--   · `companies.onboarding_request_id` é a chave DERIVADA do cadastro no
--     cliente (semente + nome + CNPJ). O índice único parcial é a garantia; o
--     SELECT prévio é só o caminho rápido. `unique_violation` da própria chave é
--     reenvio; conteúdo diferente com a mesma chave → REQUEST_ID_REUTILIZADO.
--     A empresa não pertence a um tenant (ela É o tenant); a semente aleatória
--     da tela torna a chave única globalmente.
--   · Assinatura nova com parâmetro DEFAULT NULL: DROP da antiga antes (senão
--     vira overload), EXECUTE para authenticated/service_role. O front em
--     produção chama com 2 parâmetros nomeados e continua resolvendo para esta
--     função.
--
-- Corpos copiados do banco vivo. GRANTs no mesmo arquivo.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.companies
  add column if not exists onboarding_request_id text;

alter table public.companies
  drop constraint if exists companies_onboarding_request_id_len;
alter table public.companies
  add constraint companies_onboarding_request_id_len
  check (onboarding_request_id is null or char_length(onboarding_request_id) between 1 and 200);

do $preflight$
begin
  if exists (
    select 1 from public.companies
    where nullif(regexp_replace(cnpj, '\D', '', 'g'), '') is not null
    group by regexp_replace(cnpj, '\D', '', 'g')
    having count(*) > 1
  ) then
    raise exception 'COMPANIES_CNPJ_DUPLICADO: resolva as empresas com o mesmo CNPJ antes do índice único';
  end if;
  if exists (
    select 1 from public.companies
    where onboarding_request_id is not null
    group by onboarding_request_id
    having count(*) > 1
  ) then
    raise exception 'COMPANIES_ONBOARDING_REQUEST_DUPLICADO: resolva as duplicatas antes do índice único';
  end if;
end
$preflight$;

create unique index if not exists uq_companies_cnpj_digitos
  on public.companies ((regexp_replace(cnpj, '\D', '', 'g')))
  where nullif(regexp_replace(cnpj, '\D', '', 'g'), '') is not null;

create unique index if not exists uq_companies_onboarding_request
  on public.companies (onboarding_request_id)
  where onboarding_request_id is not null;

drop function if exists public.onboard_new_company(text, text, uuid);

create function public.onboard_new_company(
  p_company_name          text,
  p_cnpj                  text default null::text,
  p_admin_user_id         uuid default null::uuid,
  p_onboarding_request_id text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
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

  INSERT INTO public.company_memberships(user_id, company_id) VALUES(v_caller_uid, v_new_company_id)
    ON CONFLICT(user_id, company_id) DO UPDATE SET status='active', updated_at=now();

  INSERT INTO user_roles (user_id, company_id, role)
  VALUES (v_caller_uid, v_new_company_id, 'admin')
  ON CONFLICT (user_id, company_id, role) DO NOTHING;

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

comment on function public.onboard_new_company(text, text, uuid, text) is
  'Cria empresa com turnos, cargos, vínculo de admin e categorias não operacionais. p_onboarding_request_id = chave derivada do cadastro; reenvio devolve a empresa existente (idempotente=true). CNPJ único pelos dígitos.';

-- Antes PUBLIC também executava; anon nunca passou do gate (auth.uid() nulo),
-- então só authenticated/service_role mantêm EXECUTE.
revoke all on function public.onboard_new_company(text, text, uuid, text) from public, anon;
grant execute on function public.onboard_new_company(text, text, uuid, text) to authenticated;
grant execute on function public.onboard_new_company(text, text, uuid, text) to service_role;

-- update_company: mesma assinatura, conferência de CNPJ pelos dígitos.
CREATE OR REPLACE FUNCTION public.update_company(p_company_id uuid, p_nome text DEFAULT NULL::text, p_cnpj text DEFAULT NULL::text, p_ativo boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid;
  v_old record;
  v_cnpj_digitos text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '403: Não autenticado';
  END IF;

  IF NOT has_permission(v_caller_uid, 'system:global:manage') THEN
    RAISE EXCEPTION '403: Sem permissão';
  END IF;

  IF p_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION '400: Não é possível editar a empresa placeholder';
  END IF;

  SELECT * INTO v_old FROM companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Empresa não encontrada';
  END IF;

  IF v_cnpj_digitos IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM companies WHERE regexp_replace(cnpj, '\D', '', 'g') = v_cnpj_digitos AND id <> p_company_id) THEN
      RAISE EXCEPTION '409: CNPJ já cadastrado em outra empresa';
    END IF;
  END IF;

  UPDATE companies SET
    nome       = COALESCE(NULLIF(trim(p_nome), ''), v_old.nome),
    cnpj       = CASE WHEN p_cnpj IS NOT NULL THEN NULLIF(trim(p_cnpj), '') ELSE v_old.cnpj END,
    ativo      = COALESCE(p_ativo, v_old.ativo),
    updated_at = now()
  WHERE id = p_company_id;

  INSERT INTO audit_logs (actor_user_id, company_id, action, module, entity, entity_id, metadata)
  VALUES (v_caller_uid, p_company_id, 'COMPANY_UPDATED', 'admin', 'companies', p_company_id, jsonb_build_object(
    'old_nome', v_old.nome, 'new_nome', COALESCE(NULLIF(trim(p_nome), ''), v_old.nome),
    'old_ativo', v_old.ativo, 'new_ativo', COALESCE(p_ativo, v_old.ativo)
  ));

  RETURN jsonb_build_object('success', true);
END;
$function$;

notify pgrst, 'reload schema';
