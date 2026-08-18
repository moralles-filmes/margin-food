-- Resolve o limite de aprovação por empresa, com fallback para o valor global
-- antigo e depois para R$ 2.500 (o default histórico embutido nas RPCs).
CREATE OR REPLACE FUNCTION public.fin_get_limite_aprovacao(p_company_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(c.value), '')::numeric
       FROM public.fin_config c
      WHERE c.company_id = p_company_id
        AND c.key = 'limite_aprovacao_contas_pagar'),
    (SELECT NULLIF(btrim(a.value), '')::numeric
       FROM public.app_config a
      WHERE a.key = 'limite_aprovacao_contas_pagar'),
    2500
  );
$$;

COMMENT ON FUNCTION public.fin_get_limite_aprovacao(uuid) IS
  'Limite acima do qual uma conta a pagar nasce AGUARDANDO_APROVACAO. Configurável em fin_config.';

CREATE OR REPLACE FUNCTION public._guarded_create_conta_pagar(
  p_descricao text,
  p_valor numeric,
  p_fornecedor text DEFAULT NULL::text,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_data_vencimento date DEFAULT CURRENT_DATE,
  p_data_competencia date DEFAULT NULL::date,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_forma_pagamento text DEFAULT 'boleto'::text,
  p_observacoes text DEFAULT NULL::text,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
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

  -- A conta bancária continua opcional na criação: só vira obrigatória na baixa.
  IF p_conta_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM fin_contas WHERE id = p_conta_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_threshold := public.fin_get_limite_aprovacao(v_company_id);

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
    jsonb_build_object('descricao', v_desc, 'valor', p_valor, 'status', v_status,
      'limite_aprovacao', v_threshold),
    v_user_id, v_company_id);

  RETURN jsonb_build_object('id', v_id, 'status', v_status, 'created_at', v_created_at,
    'limite_aprovacao', v_threshold);
END;
$function$;

CREATE OR REPLACE FUNCTION public._guarded_update_conta_pagar(
  p_id uuid,
  p_descricao text,
  p_valor numeric,
  p_fornecedor text DEFAULT NULL::text,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_data_vencimento date DEFAULT NULL::date,
  p_data_competencia date DEFAULT NULL::date,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_forma_pagamento text DEFAULT NULL::text,
  p_observacoes text DEFAULT NULL::text,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL::jsonb,
  p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
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

  IF p_conta_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM fin_contas WHERE id = p_conta_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_desc := strip_html(p_descricao);
  v_forn := strip_html(p_fornecedor);
  v_obs  := strip_html(p_observacoes);

  v_threshold := public.fin_get_limite_aprovacao(v_company_id);

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

  RETURN jsonb_build_object('id', p_id, 'status', v_status, 'updated_at', now(),
    'limite_aprovacao', v_threshold);
END;
$function$;

-- Leitura/escrita do limite pela UI. A tabela é chave/valor genérica; a RPC
-- valida o valor e concentra a checagem de permissão num só lugar.
CREATE OR REPLACE FUNCTION public.fin_set_limite_aprovacao(p_valor numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_uid uuid;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:pagar:approve', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:pagar:approve necessário';
  END IF;

  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: limite deve ser zero ou positivo';
  END IF;

  INSERT INTO public.fin_config (company_id, key, value, updated_by)
  VALUES (v_company, 'limite_aprovacao_contas_pagar', p_valor::text, v_uid)
  ON CONFLICT (company_id, key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by;

  INSERT INTO public.fin_audit_logs (entidade, acao, user_id, company_id, depois)
  VALUES ('config', 'limite_aprovacao', v_uid, v_company,
    jsonb_build_object('limite_aprovacao_contas_pagar', p_valor));

  RETURN jsonb_build_object('status', 'ok', 'valor', p_valor);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fin_get_limite_aprovacao_atual()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.fin_get_limite_aprovacao(public.get_current_company_id());
$$;
