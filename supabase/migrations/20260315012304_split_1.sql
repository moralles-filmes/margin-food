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
  r record;
BEGIN
  -- tenant + auth
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- permission check
  IF NOT has_permission('financeiro:pagar:create') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:pagar:create';
  END IF;

  -- sanitize
  v_desc := strip_html(p_descricao);
  v_forn := strip_html(p_fornecedor);
  v_obs  := strip_html(p_observacoes);

  IF length(trim(v_desc)) = 0 THEN
    RAISE EXCEPTION 'Descrição é obrigatória';
  END IF;
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  -- dynamic threshold from app_config
  SELECT value::numeric INTO v_threshold
  FROM app_config
  WHERE key = 'limite_aprovacao_contas_pagar';

  IF v_threshold IS NULL THEN
    v_threshold := 2500;
  END IF;

  IF p_valor > v_threshold THEN
    v_status := 'AGUARDANDO_APROVACAO';
  ELSE
    v_status := 'APROVADO';
  END IF;

  -- insert
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

  -- rateios
  IF jsonb_array_length(p_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(p_rateios) AS x(
      categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric
    ) LOOP
      INSERT INTO fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
      ) VALUES (
        v_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id
      );
    END LOOP;
  END IF;

  -- audit
  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
  VALUES ('contas_pagar', v_id::text, 'criar',
    jsonb_build_object('descricao', v_desc, 'valor', p_valor, 'status', v_status),
    v_user_id, v_company_id);

  RETURN jsonb_build_object('id', v_id, 'status', v_status, 'created_at', v_created_at);
END;
$$;

-- RPC: guarded approve conta a pagar (atomic with optimistic locking)