CREATE OR REPLACE FUNCTION public.pay_conta_pagar(
  p_id uuid,
  p_expected_updated_at text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item RECORD;
  v_lanc_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;
  IF NOT public.has_permission(auth.uid(), 'finance:manage') THEN
    RAISE EXCEPTION 'Sem permissão para pagar contas.';
  END IF;

  -- Lock + optimistic concurrency
  SELECT * INTO v_item FROM fin_contas_pagar WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada.';
  END IF;
  IF v_item.updated_at::text != p_expected_updated_at THEN
    RAISE EXCEPTION 'Registro alterado por outro usuário. Recarregue.';
  END IF;
  IF v_item.status NOT IN ('APROVADO', 'AGUARDANDO_APROVACAO') THEN
    RAISE EXCEPTION 'Status inválido para pagamento: %', v_item.status;
  END IF;

  -- Create lancamento
  INSERT INTO fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id, forma_pagamento,
    status, created_by, referencia_modulo, referencia_id
  ) VALUES (
    'DESPESA', v_item.valor, v_item.data_vencimento,
    CURRENT_DATE::text, v_item.descricao,
    v_item.categoria_id, v_item.centro_custo_id, v_item.conta_id,
    v_item.forma_pagamento, 'REALIZADO', auth.uid(),
    'contas_pagar', p_id::text
  ) RETURNING id INTO v_lanc_id;

  -- Update CP
  UPDATE fin_contas_pagar SET
    status = 'PAGO',
    data_pagamento = CURRENT_DATE::text,
    valor_pago = v_item.valor,
    lancamento_id = v_lanc_id
  WHERE id = p_id;

  -- Audit
  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, user_id)
  VALUES ('contas_pagar', p_id::text, 'pagar', auth.uid());

  RETURN json_build_object('lancamento_id', v_lanc_id, 'status', 'PAGO');
END;
$$;