
CREATE OR REPLACE FUNCTION public._guarded_create_conta_receber(
  p_descricao text,
  p_cliente text DEFAULT NULL,
  p_valor numeric DEFAULT 0,
  p_data_vencimento date DEFAULT CURRENT_DATE,
  p_data_competencia date DEFAULT NULL,
  p_categoria_id uuid DEFAULT NULL,
  p_centro_custo_id uuid DEFAULT NULL,
  p_conta_id uuid DEFAULT NULL,
  p_forma_pagamento text DEFAULT 'pix',
  p_observacoes text DEFAULT NULL,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_id uuid;
  v_created_at timestamptz;
  v_desc text;
  v_cliente text;
  v_obs text;
  r record;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT has_permission('financeiro:receber:create') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:receber:create';
  END IF;

  v_desc := strip_html(p_descricao);
  v_cliente := strip_html(p_cliente);
  v_obs := strip_html(p_observacoes);

  IF length(trim(v_desc)) = 0 THEN
    RAISE EXCEPTION 'Descrição é obrigatória';
  END IF;
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  INSERT INTO fin_contas_receber (
    descricao, cliente, valor, data_vencimento, data_competencia,
    categoria_id, centro_custo_id, conta_id, supplier_id,
    forma_pagamento, observacoes, status,
    created_by, company_id,
    recorrente, recorrencia_config
  ) VALUES (
    v_desc, v_cliente, p_valor, p_data_vencimento, p_data_competencia,
    p_categoria_id, p_centro_custo_id, p_conta_id, p_supplier_id,
    p_forma_pagamento, v_obs, 'A_RECEBER',
    v_user_id, v_company_id,
    COALESCE((p_recorrencia IS NOT NULL), false),
    p_recorrencia
  )
  RETURNING id, created_at INTO v_id, v_created_at;

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

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
  VALUES ('contas_receber', v_id::text, 'criar',
    jsonb_build_object('descricao', v_desc, 'valor', p_valor, 'cliente', v_cliente),
    v_user_id, v_company_id);

  RETURN jsonb_build_object('id', v_id, 'created_at', v_created_at);
END;
$$;
