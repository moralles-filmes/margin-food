-- ============================================================================
-- unreconcile_lancamento — revisão: nunca excluir automaticamente
--
-- A primeira versão (20260806180000) excluía o lançamento quando
-- origem='conciliacao', partindo da premissa de que ele só existia por causa
-- do import do extrato. Na prática isso quebra o fluxo real de correção: o
-- usuário importa o extrato, clica em conciliar sem selecionar a categoria,
-- e depois precisa desconciliar → editar a categoria → conciliar de novo.
-- Excluir na desconciliação destrói esse fluxo (o lançamento sumia e a linha
-- do extrato não volta sozinha sem reimportar o arquivo).
--
-- Nova regra: desconciliar SEMPRE apenas desmarca (conciliado/conciliado_em/
-- conciliado_por). A exclusão explícita, quando realmente for o caso, passa
-- a ser uma ação separada do usuário via _guarded_delete_lancamento (agora
-- também exposta na tela de Conciliação Bancária).
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

  UPDATE public.fin_lancamentos
  SET conciliado = false, conciliado_em = NULL, conciliado_por = NULL
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, antes)
  VALUES ('lancamentos', p_id, 'unreconcile', v_uid, v_company_id,
    jsonb_build_object('conciliado_em', v_lanc.conciliado_em, 'origem', v_lanc.origem));

  RETURN jsonb_build_object('status', 'ok', 'deleted', false);
END;
$$;
