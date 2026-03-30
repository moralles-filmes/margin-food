-- Migration: Financial CRUD Hardening
-- Adds guarded RPCs for Update and Delete of Contas a Pagar and Contas a Receber

-- 1. Contas a Pagar: Update
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
  r record;
BEGIN
  -- tenant + auth
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- permission check
  IF NOT has_permission('financeiro:pagar:edit') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:pagar:edit';
  END IF;

  -- fetch old data + locking + status check
  SELECT jsonb_build_object('descricao', descricao, 'valor', valor, 'status', status), status, updated_at
  INTO v_old_data, v_status, v_updated_at
  FROM fin_contas_pagar
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;
  
  -- Prevent edit if already paid/cancelled unless user is admin (simplified: block all for now)
  IF v_status IN ('PAGO', 'CANCELADO') THEN
    RAISE EXCEPTION 'Não é permitido editar uma conta com status %', v_status;
  END IF;

  -- Optimistic locking
  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'O registro foi alterado por outro usuário. Recarregue a página.';
  END IF;

  -- sanitize
  v_desc := strip_html(p_descricao);
  v_forn := strip_html(p_fornecedor);
  v_obs  := strip_html(p_observacoes);

  -- logic for status re-eval if valor changed
  SELECT value::numeric INTO v_threshold FROM app_config WHERE key = 'limite_aprovacao_contas_pagar';
  v_threshold := COALESCE(v_threshold, 2500);

  IF p_valor > v_threshold THEN
    v_status := 'AGUARDANDO_APROVACAO';
  ELSE
    v_status := 'APROVADO';
  END IF;

  -- update
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

  -- rateios: replace old ones
  DELETE FROM fin_lancamento_rateios WHERE lancamento_id = p_id AND company_id = v_company_id;
  
  IF jsonb_array_length(p_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(p_rateios) AS x(
      categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric
    ) LOOP
      INSERT INTO fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
      ) VALUES (
        p_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id
      );
    END LOOP;
  END IF;

  -- audit
  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('contas_pagar', p_id::text, 'editar', v_old_data, 
    jsonb_build_object('descricao', v_desc, 'valor', p_valor, 'status', v_status),
    v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'status', v_status, 'updated_at', now());
END;
$$;

-- 2. Contas a Pagar: Delete
CREATE OR REPLACE FUNCTION public._guarded_delete_conta_pagar(
  p_id uuid
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
  v_old_data jsonb;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  
  IF NOT has_permission('financeiro:pagar:delete') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:pagar:delete';
  END IF;

  SELECT status, jsonb_build_object('descricao', descricao, 'valor', valor) INTO v_status, v_old_data
  FROM fin_contas_pagar WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;
  
  IF v_status IN ('PAGO', 'CANCELADO') THEN
    RAISE EXCEPTION 'Não é permitido excluir uma conta com status %', v_status;
  END IF;

  -- Delete rateios first
  DELETE FROM fin_lancamento_rateios WHERE lancamento_id = p_id AND company_id = v_company_id;
  -- Delete account
  DELETE FROM fin_contas_pagar WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, user_id, company_id)
  VALUES ('contas_pagar', p_id::text, 'excluir', v_old_data, v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;

-- 3. Contas a Receber: Update
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
  
  IF jsonb_array_length(p_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(p_rateios) AS x(
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
  VALUES ('contas_receber', p_id::text, 'editar', v_old_data, 
    jsonb_build_object('descricao', v_desc, 'valor', p_valor),
    v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'updated_at', now());
END;
$$;

-- 4. Contas a Receber: Delete
CREATE OR REPLACE FUNCTION public._guarded_delete_conta_receber(
  p_id uuid
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
  v_old_data jsonb;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  
  IF NOT has_permission('financeiro:receber:delete') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:receber:delete';
  END IF;

  SELECT status, jsonb_build_object('descricao', descricao, 'valor', valor) INTO v_status, v_old_data
  FROM fin_contas_receber WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;
  
  IF v_status IN ('RECEBIDO', 'CANCELADO') THEN
    RAISE EXCEPTION 'Não é permitido excluir uma conta com status %', v_status;
  END IF;

  DELETE FROM fin_lancamento_rateios WHERE lancamento_id = p_id AND company_id = v_company_id;
  DELETE FROM fin_contas_receber WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, user_id, company_id)
  VALUES ('contas_receber', p_id::text, 'excluir', v_old_data, v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;
