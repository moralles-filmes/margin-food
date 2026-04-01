-- Fix: RPCs de onboarding usavam admin_actions_log (não existe).
-- A tabela correta é audit_logs.

-- ─── 1. FIX onboard_new_company ───
CREATE OR REPLACE FUNCTION public.onboard_new_company(
  p_company_name  text,
  p_cnpj          text DEFAULT NULL,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_uid uuid;
  v_new_company_id uuid;
  v_result jsonb;
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

  IF p_cnpj IS NOT NULL AND trim(p_cnpj) <> '' THEN
    IF EXISTS (SELECT 1 FROM companies WHERE cnpj = trim(p_cnpj)) THEN
      RAISE EXCEPTION '409: CNPJ já cadastrado';
    END IF;
  END IF;

  INSERT INTO companies (nome, cnpj, ativo)
  VALUES (trim(p_company_name), NULLIF(trim(p_cnpj), ''), true)
  RETURNING id INTO v_new_company_id;

  IF p_admin_user_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_user_id) THEN
      RAISE EXCEPTION '404: Usuário admin não encontrado';
    END IF;

    UPDATE profiles SET company_id = v_new_company_id WHERE id = p_admin_user_id;

    INSERT INTO user_roles (user_id, role)
    VALUES (p_admin_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  INSERT INTO job_roles (nome, descricao)
  VALUES
    ('Gerente Geral', 'Responsável geral pela operação'),
    ('Chef de Cozinha', 'Responsável pela cozinha e fichas técnicas'),
    ('Estoquista', 'Responsável pelo controle de estoque'),
    ('Comprador', 'Responsável pelas compras e fornecedores'),
    ('Financeiro', 'Responsável pelo módulo financeiro'),
    ('Operador', 'Operação geral do dia a dia')
  ON CONFLICT (nome) DO NOTHING;

  -- Audit log na tabela correta
  INSERT INTO audit_logs (actor_user_id, company_id, action, module, entity, entity_id, metadata)
  VALUES (
    v_caller_uid,
    v_new_company_id,
    'COMPANY_CREATED',
    'admin',
    'companies',
    v_new_company_id,
    jsonb_build_object(
      'company_name', trim(p_company_name),
      'cnpj', p_cnpj,
      'admin_user_id', p_admin_user_id
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'company_id', v_new_company_id,
    'company_name', trim(p_company_name)
  );

  RETURN v_result;
END;
$$;

-- ─── 2. FIX update_company ───
CREATE OR REPLACE FUNCTION public.update_company(
  p_company_id uuid,
  p_nome       text DEFAULT NULL,
  p_cnpj       text DEFAULT NULL,
  p_ativo      boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_uid uuid;
  v_old record;
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

  IF p_cnpj IS NOT NULL AND trim(p_cnpj) <> '' AND trim(p_cnpj) <> COALESCE(v_old.cnpj, '') THEN
    IF EXISTS (SELECT 1 FROM companies WHERE cnpj = trim(p_cnpj) AND id <> p_company_id) THEN
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
$$;

NOTIFY pgrst, 'reload schema';
