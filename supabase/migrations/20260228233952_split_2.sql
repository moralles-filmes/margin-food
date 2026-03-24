CREATE OR REPLACE FUNCTION public.reconcile_create_transfer(
  p_data date,
  p_valor numeric,
  p_descricao text,
  p_conta_origem_id uuid,
  p_conta_destino_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_saida_id uuid;
  v_entrada_id uuid;
  v_nome_origem text;
  v_nome_destino text;
BEGIN
  IF NOT public.has_permission(p_user_id, 'finance:manage') THEN
    RAISE EXCEPTION 'Permissão negada: finance:manage necessário';
  END IF;

  IF p_conta_origem_id = p_conta_destino_id THEN
    RAISE EXCEPTION 'Conta origem e destino devem ser diferentes';
  END IF;

  SELECT nome INTO v_nome_origem FROM public.fin_contas WHERE id = p_conta_origem_id;
  SELECT nome INTO v_nome_destino FROM public.fin_contas WHERE id = p_conta_destino_id;

  -- Create outgoing side
  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento,
    descricao, conta_id, conta_destino_id,
    status, forma_pagamento,
    conciliado, conciliado_em, conciliado_por, created_by
  )
  VALUES (
    'TRANSFERENCIA', p_valor, p_data, p_data,
    COALESCE(NULLIF(p_descricao, ''), 'Transferência para ' || COALESCE(v_nome_destino, '?')),
    p_conta_origem_id, p_conta_destino_id,
    'REALIZADO', 'TRANSFERENCIA',
    true, now(), p_user_id, p_user_id
  )
  RETURNING id INTO v_saida_id;

  -- Create incoming side linked to outgoing
  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento,
    descricao, conta_id, conta_destino_id, lancamento_pai_id,
    status, forma_pagamento,
    conciliado, conciliado_em, conciliado_por, created_by
  )
  VALUES (
    'TRANSFERENCIA', p_valor, p_data, p_data,
    'Transferência de ' || COALESCE(v_nome_origem, '?'),
    p_conta_destino_id, p_conta_origem_id, v_saida_id,
    'REALIZADO', 'TRANSFERENCIA',
    true, now(), p_user_id, p_user_id
  )
  RETURNING id INTO v_entrada_id;

  -- Audit
  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, depois)
  VALUES (
    'transferencia', v_saida_id, 'reconcile_transfer', p_user_id,
    jsonb_build_object(
      'saida_id', v_saida_id, 'entrada_id', v_entrada_id,
      'origem', p_conta_origem_id, 'destino', p_conta_destino_id,
      'valor', p_valor, 'data', p_data
    )
  );

  RETURN jsonb_build_object(
    'status', 'ok',
    'saida_id', v_saida_id,
    'entrada_id', v_entrada_id
  );
END;
$$;

-- 4) RPC: Batch reconcile existing lancamentos (mark as conciliado atomically)