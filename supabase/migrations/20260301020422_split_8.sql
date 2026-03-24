CREATE OR REPLACE FUNCTION public.receive_conta_receber(p_id uuid, p_expected_updated_at text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item record;
  v_lanc_id uuid;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:manage') THEN RAISE EXCEPTION 'Sem permissão para receber contas.'; END IF;

  SELECT * INTO v_item FROM public.fin_contas_receber WHERE id = p_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  IF v_item.updated_at::text != p_expected_updated_at THEN RAISE EXCEPTION 'Registro alterado por outro usuário. Recarregue.'; END IF;
  IF v_item.status != 'A_RECEBER' THEN RAISE EXCEPTION 'Status inválido para recebimento: %', v_item.status; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = v_item.conta_id AND company_id = v_company) THEN RAISE EXCEPTION 'Conta inválida.'; END IF;
  IF v_item.categoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fin_categorias WHERE id = v_item.categoria_id AND company_id = v_company) THEN RAISE EXCEPTION 'Categoria inválida.'; END IF;

  INSERT INTO public.fin_lancamentos (tipo, valor, data_competencia, data_pagamento, descricao, categoria_id, conta_id, forma_pagamento, status, created_by, referencia_modulo, referencia_id, company_id)
  VALUES ('RECEITA', v_item.valor, v_item.data_vencimento, CURRENT_DATE::text, v_item.descricao, v_item.categoria_id, v_item.conta_id, v_item.forma_pagamento, 'REALIZADO', auth.uid(), 'contas_receber', p_id::text, v_company)
  RETURNING id INTO v_lanc_id;

  UPDATE public.fin_contas_receber SET status = 'RECEBIDO', data_recebimento = CURRENT_DATE::text, valor_recebido = v_item.valor, lancamento_id = v_lanc_id
  WHERE id = p_id AND company_id = v_company;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id) VALUES ('contas_receber', p_id::text, 'receber', auth.uid());

  PERFORM public.log_audit('rpc', 'financeiro', 'fin_contas_receber', p_id, 'RECEIVE',
    jsonb_build_object('status_anterior', v_item.status, 'valor', v_item.valor),
    jsonb_build_object('lancamento_id', v_lanc_id, 'status', 'RECEBIDO'));

  RETURN json_build_object('lancamento_id', v_lanc_id, 'status', 'RECEBIDO');
END;
$$;

-- reconcile_import_lancamento: force auth.uid and set company_id; validate references