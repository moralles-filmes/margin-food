-- ============================================================
-- Migration: Seed default turnos for all companies
--
-- Problema: empresas criadas após a piloto (Royal Parma, REN SUSHI, etc.)
-- nasceram sem turnos. Como create_inventory_atomic exige turno_id e a UI
-- bloqueia o botão "Criar" enquanto não há turno selecionado, qualquer
-- empresa não-piloto fica impedida de criar inventários.
--
-- Causa: 20260328111500_add_default_turnos.sql só semeou para a primeira
-- empresa (LIMIT 1) e onboard_new_company() nunca semeou turnos.
--
-- Fix:
--   A) Backfill idempotente: insere os 4 turnos default para toda empresa
--      ativa que ainda não tenha turnos ativos.
--   B) Atualiza onboard_new_company() para semear turnos automaticamente
--      em toda nova empresa criada.
-- ============================================================

-- ─── A. BACKFILL DE EMPRESAS EXISTENTES ───
DO $$
DECLARE
  v_company RECORD;
  v_inserted_count int;
BEGIN
  FOR v_company IN
    SELECT id, nome
    FROM public.companies
    WHERE ativo = true
      AND id <> '00000000-0000-0000-0000-000000000001'::uuid
      AND id NOT IN (
        SELECT DISTINCT company_id
        FROM public.turnos
        WHERE ativo = true AND company_id IS NOT NULL
      )
  LOOP
    INSERT INTO public.turnos (company_id, nome, hora_inicio, hora_fim, ativo)
    SELECT v_company.id, t.nome, t.hora_inicio, t.hora_fim, true
    FROM (VALUES
      ('Manhã', '07:00:00'::time, '15:00:00'::time),
      ('Tarde', '15:00:00'::time, '23:00:00'::time),
      ('Noite', '23:00:00'::time, '07:00:00'::time),
      ('Geral', '00:00:00'::time, '23:59:59'::time)
    ) AS t(nome, hora_inicio, hora_fim)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.turnos
      WHERE company_id = v_company.id AND nome = t.nome
    );

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    RAISE NOTICE 'Empresa % (%): % turnos default semeados',
      v_company.nome, v_company.id, v_inserted_count;
  END LOOP;
END $$;

-- ─── B. ATUALIZA onboard_new_company() PARA SEMEAR TURNOS ───
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

  -- Seed default turnos for the new company
  -- (sem turnos, o módulo de Inventário fica inutilizável para a nova empresa)
  INSERT INTO public.turnos (company_id, nome, hora_inicio, hora_fim, ativo)
  VALUES
    (v_new_company_id, 'Manhã', '07:00:00'::time, '15:00:00'::time, true),
    (v_new_company_id, 'Tarde', '15:00:00'::time, '23:00:00'::time, true),
    (v_new_company_id, 'Noite', '23:00:00'::time, '07:00:00'::time, true),
    (v_new_company_id, 'Geral', '00:00:00'::time, '23:59:59'::time, true);

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

GRANT EXECUTE ON FUNCTION public.onboard_new_company(text, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
