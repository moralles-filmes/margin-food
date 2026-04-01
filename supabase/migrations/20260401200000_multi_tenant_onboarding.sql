-- ============================================================
-- MULTI-TENANT ONBOARDING
-- 1. Remove dangerous fallback from get_current_company_id()
-- 2. Create onboard_new_company() seed RPC
-- 3. Update RLS on companies table for super-admin management
-- ============================================================

-- ─── 1. HARDEN get_current_company_id() — remove fallback ───
-- With multiple tenants, the fallback that returns "first active company"
-- would leak data across tenants. Now returns NULL if profile has no company.

CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid uuid;
  v_co uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT company_id INTO v_co FROM profiles WHERE id = v_uid;

  -- Block placeholder UUID
  IF v_co = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RETURN NULL;
  END IF;

  RETURN v_co;
END;
$$;

-- ─── 2. ONBOARD NEW COMPANY RPC ───
-- Creates company + first admin user + assigns admin role + audit log.
-- Can only be called by super-admins (system:global:manage).

CREATE OR REPLACE FUNCTION public.onboard_new_company(
  p_company_name  text,
  p_cnpj          text DEFAULT NULL,
  p_admin_user_id uuid DEFAULT NULL  -- if provided, assigns this existing user as admin
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
  -- Auth check
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '403: Não autenticado';
  END IF;

  -- Permission check
  IF NOT has_permission(v_caller_uid, 'system:global:manage') THEN
    RAISE EXCEPTION '403: Sem permissão (system:global:manage)';
  END IF;

  -- Validate input
  IF p_company_name IS NULL OR trim(p_company_name) = '' THEN
    RAISE EXCEPTION '400: Nome da empresa é obrigatório';
  END IF;

  -- Check for duplicate CNPJ
  IF p_cnpj IS NOT NULL AND trim(p_cnpj) <> '' THEN
    IF EXISTS (SELECT 1 FROM companies WHERE cnpj = trim(p_cnpj)) THEN
      RAISE EXCEPTION '409: CNPJ já cadastrado';
    END IF;
  END IF;

  -- Create company
  INSERT INTO companies (nome, cnpj, ativo)
  VALUES (trim(p_company_name), NULLIF(trim(p_cnpj), ''), true)
  RETURNING id INTO v_new_company_id;

  -- If admin user provided, move their profile to new company + assign admin role
  IF p_admin_user_id IS NOT NULL THEN
    -- Verify user exists
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_user_id) THEN
      RAISE EXCEPTION '404: Usuário admin não encontrado';
    END IF;

    -- Update profile company_id (bypass trigger with service role)
    UPDATE profiles SET company_id = v_new_company_id WHERE id = p_admin_user_id;

    -- Assign admin role (upsert)
    INSERT INTO user_roles (user_id, role)
    VALUES (p_admin_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- Seed default job roles (shared across companies — table has unique nome)
  INSERT INTO job_roles (nome, descricao)
  VALUES
    ('Gerente Geral', 'Responsável geral pela operação'),
    ('Chef de Cozinha', 'Responsável pela cozinha e fichas técnicas'),
    ('Estoquista', 'Responsável pelo controle de estoque'),
    ('Comprador', 'Responsável pelas compras e fornecedores'),
    ('Financeiro', 'Responsável pelo módulo financeiro'),
    ('Operador', 'Operação geral do dia a dia')
  ON CONFLICT (nome) DO NOTHING;

  -- Audit log
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
    'company_name', trim(p_company_name)
  );

  RETURN v_result;
END;
$$;

-- ─── 3. UPDATE COMPANY RPC ───
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

  -- Block editing placeholder
  IF p_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION '400: Não é possível editar a empresa placeholder';
  END IF;

  SELECT * INTO v_old FROM companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Empresa não encontrada';
  END IF;

  -- Check CNPJ uniqueness if changing
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

  -- Audit
  INSERT INTO admin_actions_log (actor_user_id, company_id, action, details)
  VALUES (v_caller_uid, p_company_id, 'COMPANY_UPDATED', jsonb_build_object(
    'old_nome', v_old.nome, 'new_nome', COALESCE(NULLIF(trim(p_nome), ''), v_old.nome),
    'old_ativo', v_old.ativo, 'new_ativo', COALESCE(p_ativo, v_old.ativo)
  ));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 4. LIST COMPANIES RPC (super-admin sees all) ───
CREATE OR REPLACE FUNCTION public.list_companies()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
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
      (SELECT count(*) FROM profiles p WHERE p.company_id = c.id) AS total_usuarios
    FROM companies c
    WHERE c.id <> '00000000-0000-0000-0000-000000000001'::uuid
    ORDER BY c.created_at
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ─── 5. GRANT EXECUTE ───
GRANT EXECUTE ON FUNCTION public.onboard_new_company(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_company(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_companies() TO authenticated;

NOTIFY pgrst, 'reload schema';
