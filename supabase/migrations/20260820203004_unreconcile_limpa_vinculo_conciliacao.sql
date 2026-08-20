-- Desconciliar um lançamento (unreconcile_lancamento) só desmarcava
-- conciliado/conciliado_em/conciliado_por, deixando o vínculo antigo em
-- fin_conciliacao_vinculos (external_id -> lancamento_id) intacto. Como o FITID
-- do banco não é estável entre downloads (PagBank/Santander — ver migration
-- 20260820183751), reimportar o extrato depois de desconciliar gera um FITID
-- novo que não bate com o vínculo velho, e o lançamento (agora com ALGUM
-- vínculo, mesmo obsoleto) fica excluído das sugestões de match no cliente
-- (lancamentosVinculados). Pior: quando o lançamento é espelho_cp/espelho_cr,
-- o guarda de duplicata por conteúdo de reconcile_import_lancamento só olha
-- origem='conciliacao' e não pega esse caso. Resultado: a linha do extrato
-- aparece como "nova" e nasce um SEGUNDO lançamento para o mesmo pagamento.
--
-- Mesmo princípio já aplicado ao estorno de CP (ver CLAUDE.md): ao desconciliar,
-- limpa o(s) vínculo(s) desse lançamento para que ele volte a ficar disponível
-- para reconhecimento (por conteúdo ou escolha manual) na próxima conciliação.

CREATE OR REPLACE FUNCTION public.unreconcile_lancamento(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_lanc record;
  v_vinculos_removidos int;
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

  DELETE FROM public.fin_conciliacao_vinculos
  WHERE lancamento_id = p_id AND company_id = v_company_id;
  GET DIAGNOSTICS v_vinculos_removidos = ROW_COUNT;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, antes)
  VALUES ('lancamentos', p_id, 'unreconcile', v_uid, v_company_id,
    jsonb_build_object('conciliado_em', v_lanc.conciliado_em, 'origem', v_lanc.origem,
      'vinculos_removidos', v_vinculos_removidos));

  RETURN jsonb_build_object('status', 'ok', 'deleted', false);
END;
$function$;
