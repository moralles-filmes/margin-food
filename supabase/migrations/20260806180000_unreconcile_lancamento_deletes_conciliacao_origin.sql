-- ============================================================================
-- unreconcile_lancamento
--
-- Bug: na tela de Conciliação Bancária, desmarcar o checkbox de um lançamento
-- conciliado fazia um UPDATE direto (client-side) que só zerava
-- conciliado/conciliado_em/conciliado_por. Para lançamentos com origem =
-- 'conciliacao' (criados por reconcile_import_lancamento, ou seja, que só
-- existem por causa do import do extrato) isso deixava um registro órfão em
-- fin_lancamentos, que continuava aparecendo em DRE/Livro Razão/saldo em caixa
-- mesmo depois de "desconciliado".
--
-- Esta RPC decide com base em fin_lancamentos.origem:
--   - origem = 'conciliacao' -> exclui o lançamento (não tem vida fora da
--     conciliação que o criou).
--   - qualquer outra origem (manual, espelho_cp, espelho_cr, transferencia)
--     -> mantém o comportamento anterior: apenas desmarca a conciliação.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.unreconcile_lancamento(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_lanc record;
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuário não autenticado';
  END IF;

  IF NOT public.has_any_permission(v_uid, ARRAY['financeiro:conciliacao:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:manage necessário';
  END IF;

  SELECT * INTO v_lanc
  FROM public.fin_lancamentos
  WHERE id = p_id AND company_id = v_company_id
  FOR UPDATE;

  IF v_lanc IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Lançamento não encontrado';
  END IF;

  IF v_lanc.conciliado IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'noop', 'deleted', false);
  END IF;

  IF v_lanc.origem = 'conciliacao' THEN
    DELETE FROM public.fin_lancamento_rateios
    WHERE lancamento_id = p_id AND company_id = v_company_id;

    DELETE FROM public.fin_lancamentos
    WHERE id = p_id AND company_id = v_company_id;

    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, antes)
    VALUES ('lancamentos', p_id, 'unreconcile_delete', v_uid, v_company_id,
      jsonb_build_object('descricao', v_lanc.descricao, 'valor', v_lanc.valor, 'tipo', v_lanc.tipo, 'origem', v_lanc.origem));

    RETURN jsonb_build_object('status', 'ok', 'deleted', true);
  END IF;

  UPDATE public.fin_lancamentos
  SET conciliado = false, conciliado_em = NULL, conciliado_por = NULL
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, antes)
  VALUES ('lancamentos', p_id, 'unreconcile', v_uid, v_company_id,
    jsonb_build_object('conciliado_em', v_lanc.conciliado_em, 'origem', v_lanc.origem));

  RETURN jsonb_build_object('status', 'ok', 'deleted', false);
END;
$$;

REVOKE ALL ON FUNCTION public.unreconcile_lancamento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unreconcile_lancamento(uuid) TO authenticated, service_role;
