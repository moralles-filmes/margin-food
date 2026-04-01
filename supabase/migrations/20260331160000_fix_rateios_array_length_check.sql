-- Fix: "cannot get array length of a scalar" when p_rateios is passed as
-- a JSON string via PostgREST instead of a native jsonb array.
-- Adds jsonb_typeof() guard before jsonb_array_length() in all 3 RPCs.

-- 1. _guarded_create_conta_pagar
CREATE OR REPLACE FUNCTION public._guarded_create_conta_pagar(
  p_descricao text,
  p_valor numeric,
  p_fornecedor text DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_data_vencimento date DEFAULT CURRENT_DATE,
  p_data_competencia date DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_centro_custo_id uuid DEFAULT NULL,
  p_conta_id uuid DEFAULT NULL,
  p_forma_pagamento text DEFAULT 'boleto',
  p_observacoes text DEFAULT NULL,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_status text;
  v_threshold numeric;
  v_id uuid;
  v_created_at timestamptz;
  v_desc text;
  v_forn text;
  v_obs text;
  v_rateios jsonb;
  r record;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT has_permission(v_user_id, 'financeiro:pagar:create') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:pagar:create';
  END IF;

  v_desc := strip_html(p_descricao);
  v_forn := strip_html(p_fornecedor);
  v_obs  := strip_html(p_observacoes);

  IF length(trim(v_desc)) = 0 THEN
    RAISE EXCEPTION 'Descrição é obrigatória';
  END IF;
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  SELECT value::numeric INTO v_threshold
  FROM app_config WHERE key = 'limite_aprovacao_contas_pagar';
  v_threshold := COALESCE(v_threshold, 2500);

  IF p_valor > v_threshold THEN
    v_status := 'AGUARDANDO_APROVACAO';
  ELSE
    v_status := 'APROVADO';
  END IF;

  INSERT INTO fin_contas_pagar (
    descricao, valor, fornecedor, supplier_id,
    data_vencimento, data_competencia,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, observacoes, status,
    created_by, company_id,
    recorrente, recorrencia_config
  ) VALUES (
    v_desc, p_valor, v_forn, p_supplier_id,
    p_data_vencimento, p_data_competencia,
    p_categoria_id, p_centro_custo_id, p_conta_id,
    p_forma_pagamento, v_obs, v_status,
    v_user_id, v_company_id,
    COALESCE((p_recorrencia IS NOT NULL), false),
    p_recorrencia
  )
  RETURNING id, created_at INTO v_id, v_created_at;

  -- rateios (guard against scalar/string values)
  v_rateios := CASE
    WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios
    ELSE '[]'::jsonb
  END;

  IF jsonb_array_length(v_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(
      categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric
    ) LOOP
      INSERT INTO fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
      ) VALUES (
        v_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id
      );
    END LOOP;
  END IF;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
  VALUES ('contas_pagar', v_id, 'criar',
    jsonb_build_object('descricao', v_desc, 'valor', p_valor, 'status', v_status),
    v_user_id, v_company_id);

  RETURN jsonb_build_object('id', v_id, 'status', v_status, 'created_at', v_created_at);
END;
$$;

-- 2. _guarded_update_conta_pagar
CREATE OR REPLACE FUNCTION public._guarded_update_conta_pagar(
  p_id uuid,
  p_descricao text,
  p_valor numeric,
  p_fornecedor text DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_data_vencimento date DEFAULT NULL,
  p_data_competencia date DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_centro_custo_id uuid DEFAULT NULL,
  p_conta_id uuid DEFAULT NULL,
  p_forma_pagamento text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
  v_status text;
  v_threshold numeric;
  v_desc text;
  v_forn text;
  v_obs text;
  v_updated_at timestamptz;
  v_rateios jsonb;
  r record;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT has_permission('financeiro:pagar:edit') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:pagar:edit';
  END IF;

  SELECT jsonb_build_object('descricao', descricao, 'valor', valor, 'status', status), status, updated_at
  INTO v_old_data, v_status, v_updated_at
  FROM fin_contas_pagar
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;

  IF v_status IN ('PAGO', 'CANCELADO') THEN
    RAISE EXCEPTION 'Não é permitido editar uma conta com status %', v_status;
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'O registro foi alterado por outro usuário. Recarregue a página.';
  END IF;

  v_desc := strip_html(p_descricao);
  v_forn := strip_html(p_fornecedor);
  v_obs  := strip_html(p_observacoes);

  SELECT value::numeric INTO v_threshold FROM app_config WHERE key = 'limite_aprovacao_contas_pagar';
  v_threshold := COALESCE(v_threshold, 2500);

  IF p_valor > v_threshold THEN
    v_status := 'AGUARDANDO_APROVACAO';
  ELSE
    v_status := 'APROVADO';
  END IF;

  UPDATE fin_contas_pagar SET
    descricao = v_desc,
    valor = p_valor,
    fornecedor = v_forn,
    supplier_id = p_supplier_id,
    data_vencimento = p_data_vencimento,
    data_competencia = p_data_competencia,
    categoria_id = p_categoria_id,
    centro_custo_id = p_centro_custo_id,
    conta_id = p_conta_id,
    forma_pagamento = p_forma_pagamento,
    observacoes = v_obs,
    status = v_status,
    recorrente = COALESCE((p_recorrencia IS NOT NULL), false),
    recorrencia_config = p_recorrencia,
    updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  DELETE FROM fin_lancamento_rateios WHERE lancamento_id = p_id AND company_id = v_company_id;

  -- rateios (guard against scalar/string values)
  v_rateios := CASE
    WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios
    ELSE '[]'::jsonb
  END;

  IF jsonb_array_length(v_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(
      categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric
    ) LOOP
      INSERT INTO fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
      ) VALUES (
        p_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id
      );
    END LOOP;
  END IF;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('contas_pagar', p_id, 'editar', v_old_data,
    jsonb_build_object('descricao', v_desc, 'valor', p_valor, 'status', v_status),
    v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'status', v_status, 'updated_at', now());
END;
$$;

-- 3. _guarded_update_conta_receber
CREATE OR REPLACE FUNCTION public._guarded_update_conta_receber(
  p_id uuid,
  p_descricao text,
  p_cliente text DEFAULT NULL,
  p_valor numeric DEFAULT 0,
  p_data_vencimento date DEFAULT NULL,
  p_data_competencia date DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_centro_custo_id uuid DEFAULT NULL,
  p_conta_id uuid DEFAULT NULL,
  p_forma_pagamento text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
  v_status text;
  v_desc text;
  v_cli text;
  v_obs text;
  v_updated_at timestamptz;
  v_rateios jsonb;
  r record;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT has_permission('financeiro:receber:edit') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:receber:edit';
  END IF;

  SELECT jsonb_build_object('descricao', descricao, 'valor', valor, 'status', status), status, updated_at
  INTO v_old_data, v_status, v_updated_at
  FROM fin_contas_receber
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;

  IF v_status IN ('RECEBIDO', 'CANCELADO') THEN
    RAISE EXCEPTION 'Não é permitido editar uma conta com status %', v_status;
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'O registro foi alterado por outro usuário. Recarregue a página.';
  END IF;

  v_desc := strip_html(p_descricao);
  v_cli  := strip_html(p_cliente);
  v_obs  := strip_html(p_observacoes);

  UPDATE fin_contas_receber SET
    descricao = v_desc,
    cliente = v_cli,
    valor = p_valor,
    data_vencimento = p_data_vencimento,
    data_competencia = p_data_competencia,
    categoria_id = p_categoria_id,
    centro_custo_id = p_centro_custo_id,
    conta_id = p_conta_id,
    supplier_id = p_supplier_id,
    forma_pagamento = p_forma_pagamento,
    observacoes = v_obs,
    recorrente = COALESCE((p_recorrencia IS NOT NULL), false),
    recorrencia_config = p_recorrencia,
    updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  DELETE FROM fin_lancamento_rateios WHERE lancamento_id = p_id AND company_id = v_company_id;

  -- rateios (guard against scalar/string values)
  v_rateios := CASE
    WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios
    ELSE '[]'::jsonb
  END;

  IF jsonb_array_length(v_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(
      categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric
    ) LOOP
      INSERT INTO fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
      ) VALUES (
        p_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id
      );
    END LOOP;
  END IF;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('contas_receber', p_id, 'editar', v_old_data,
    jsonb_build_object('descricao', v_desc, 'valor', p_valor),
    v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'updated_at', now());
END;
$$;
