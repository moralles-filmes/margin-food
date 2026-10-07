-- Reversão da migration 20261007193000_conciliacao_vincula_lancamento_manual
--
-- Volta reconcile_link_existing_lancamento à definição que estava em produção
-- antes dela (capturada com pg_get_functiondef em 2026-10-07).
--
-- ORDEM: reverter o frontend ANTES (ou junto). A tela nova manda p_mover_conta e p_valor_extrato;
-- com a assinatura antiga o PostgREST não encontra a função (PGRST202) e o
-- Processar da conciliação falha para toda linha vinculada a lançamento existente.
--
-- Grants: a função antiga estava sem ACL explícita (EXECUTE para PUBLIC). Aqui ela
-- volta só para authenticated/service_role — anon nunca conseguiu usá-la (AUTH_REQUIRED).
--
-- Dados: a reversão NÃO desfaz o que a função nova já gravou (previsto que virou
-- realizado, lançamento trazido de outra conta). Cada caso tem o estado anterior
-- em fin_audit_logs.antes — levante antes de decidir corrigir à mão:
--
--   select a.created_at, a.company_id, a.entidade_id as lancamento_id,
--          a.antes, a.depois
--   from public.fin_audit_logs a
--   where a.entidade = 'lancamentos' and a.acao = 'reconcile_link_existing'
--     and (a.depois->>'realizado' = 'true' or a.depois->>'conta_movida' = 'true')
--   order by a.created_at;

DROP FUNCTION IF EXISTS public.reconcile_link_existing_lancamento(uuid, uuid, text, text, date, boolean, numeric);

CREATE OR REPLACE FUNCTION public.reconcile_link_existing_lancamento(p_conta_id uuid, p_lancamento_id uuid, p_external_id text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_data_extrato date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_lanc record;
  v_conta_ajustada boolean := false;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.fin_contas WHERE id = p_conta_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária';
  END IF;

  SELECT * INTO v_lanc FROM public.fin_lancamentos
  WHERE id = p_lancamento_id AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: lançamento'; END IF;

  IF v_lanc.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: lançamento cancelado não pode ser conciliado';
  END IF;

  IF v_lanc.conta_id IS NOT NULL
     AND v_lanc.conta_id <> p_conta_id
     AND COALESCE(v_lanc.conta_destino_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_conta_id THEN
    RAISE EXCEPTION 'CONTA_DIVERGENTE: o lançamento pertence a outra conta bancária';
  END IF;

  IF v_lanc.tipo <> 'TRANSFERENCIA'
     AND NOT public.fin_entity_has_category(v_lanc.id, v_lanc.categoria_id, v_lanc.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'CATEGORY_REQUIRED: o lançamento está sem categoria — corrija antes de conciliar';
  END IF;

  IF v_lanc.conta_id IS NULL THEN
    UPDATE public.fin_lancamentos
    SET conta_id = p_conta_id,
        conciliado = true,
        conciliado_em = now(),
        conciliado_por = v_uid,
        justificativa_edicao = 'Conta bancária definida na conciliação do extrato',
        updated_at = now()
    WHERE id = p_lancamento_id AND company_id = v_company;
    v_conta_ajustada := true;
  ELSIF v_lanc.conciliado IS DISTINCT FROM true THEN
    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid, updated_at = now()
    WHERE id = p_lancamento_id AND company_id = v_company;
  END IF;

  IF NULLIF(btrim(p_external_id), '') IS NOT NULL AND p_tipo IN ('RECEITA', 'DESPESA') THEN
    PERFORM public.reconcile_bind_extrato(p_conta_id, p_external_id, p_tipo, p_lancamento_id);
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('lancamentos', p_lancamento_id, 'reconcile_link_existing', v_uid, v_company,
    jsonb_build_object('conta_id', p_conta_id, 'external_id', p_external_id,
      'origem_lancamento', v_lanc.origem, 'conta_ajustada', v_conta_ajustada,
      'data_extrato', p_data_extrato));

  RETURN jsonb_build_object(
    'status', 'ok',
    'lancamento_id', p_lancamento_id,
    'origem', v_lanc.origem,
    'conta_ajustada', v_conta_ajustada
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_link_existing_lancamento(uuid, uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_link_existing_lancamento(uuid, uuid, text, text, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
