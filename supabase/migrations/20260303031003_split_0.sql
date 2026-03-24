CREATE OR REPLACE FUNCTION public.gerar_parcela_recorrente(p_lancamento_pai_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_pai record;
  v_config jsonb;
  v_freq text;
  v_max_parcelas int;
  v_geradas int;
  v_num int;
  v_nova_data date;
  v_base_date date;
  v_new_id uuid;
BEGIN
  -- Auth + tenant
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  v_company_id := assert_tenant();

  -- Permission check
  IF NOT has_any_permission(v_user_id, ARRAY['financeiro:lancamentos:create', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:lancamentos:create necessário';
  END IF;

  -- Lock parent row to prevent concurrent generation
  SELECT * INTO v_pai
  FROM fin_lancamentos
  WHERE id = p_lancamento_pai_id
    AND company_id = v_company_id
    AND recorrente = true
    AND lancamento_pai_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Lançamento pai não encontrado ou não é recorrente';
  END IF;

  v_config := COALESCE(v_pai.recorrencia_config, '{}'::jsonb);
  v_freq := COALESCE(v_config->>'frequencia', 'mensal');
  v_max_parcelas := COALESCE((v_config->>'parcelas')::int, 0);
  v_geradas := COALESCE((v_config->>'parcelas_geradas')::int, 0);

  -- Check if all parcels already generated
  IF v_max_parcelas > 0 AND v_geradas >= v_max_parcelas THEN
    RETURN jsonb_build_object('status', 'noop', 'message', 'Todas as parcelas já foram geradas');
  END IF;

  v_num := v_geradas + 1;
  v_base_date := v_pai.data_competencia;

  -- Calculate new date
  IF v_freq = 'mensal' THEN
    v_nova_data := v_base_date + (v_num || ' months')::interval;
  ELSIF v_freq = 'semanal' THEN
    v_nova_data := v_base_date + (v_num * 7 || ' days')::interval;
  ELSIF v_freq = 'quinzenal' THEN
    v_nova_data := v_base_date + (v_num * 15 || ' days')::interval;
  ELSE
    v_nova_data := v_base_date + (v_num || ' months')::interval;
  END IF;

  -- Idempotency key to prevent duplicates
  INSERT INTO fin_lancamentos (
    descricao, tipo, valor, categoria_id, centro_custo_id, conta_id,
    forma_pagamento, recorrente, lancamento_pai_id, parcela_atual,
    parcela_total, data_competencia, status, created_by, company_id,
    idempotency_key
  )
  VALUES (
    CASE WHEN v_max_parcelas > 0
      THEN v_pai.descricao || ' (' || v_num || '/' || v_max_parcelas || ')'
      ELSE v_pai.descricao || ' (parcela ' || v_num || ')'
    END,
    v_pai.tipo, v_pai.valor, v_pai.categoria_id, v_pai.centro_custo_id,
    v_pai.conta_id, v_pai.forma_pagamento, false, v_pai.id,
    v_num, CASE WHEN v_max_parcelas > 0 THEN v_max_parcelas ELSE NULL END,
    v_nova_data, 'PREVISTO', v_user_id, v_company_id,
    'recorrencia:' || v_pai.id || ':' || v_num
  )
  ON CONFLICT (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_new_id;

  -- If insert was a noop (duplicate), return early
  IF v_new_id IS NULL THEN
    RETURN jsonb_build_object('status', 'noop', 'message', 'Parcela já existia (idempotente)');
  END IF;

  -- Update parent config atomically
  UPDATE fin_lancamentos
  SET recorrencia_config = jsonb_set(
    COALESCE(recorrencia_config, '{}'::jsonb),
    '{parcelas_geradas}',
    to_jsonb(v_num)
  )
  WHERE id = v_pai.id AND company_id = v_company_id;

  -- Audit
  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('lancamentos', v_new_id, 'gerar_parcela', v_user_id, v_company_id,
    jsonb_build_object('pai_id', v_pai.id, 'parcela_num', v_num, 'data', v_nova_data));

  RETURN jsonb_build_object('status', 'ok', 'parcela_id', v_new_id, 'parcela_num', v_num);
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_parcela_recorrente(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerar_parcela_recorrente(uuid) TO authenticated;

-- =====================================================
-- H4: DRE server-side RPC
-- =====================================================