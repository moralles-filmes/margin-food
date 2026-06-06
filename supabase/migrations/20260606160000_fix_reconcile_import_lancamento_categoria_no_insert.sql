-- Fix: reconcile_import_lancamento gravava categoria via UPDATE pós-criação → erro "Justificativa obrigatória".
--
-- A versão anterior (20260605152939) inseria o lançamento com status='REALIZADO' SEM categoria_id e,
-- para rateio de 1 linha, fazia um segundo `UPDATE ... SET categoria_id`. Esse UPDATE dispara o trigger
-- `trg_validate_fin_lancamento_update` (BEFORE UPDATE): categoria_id é campo vigiado num lançamento
-- REALIZADO sem justificativa_edicao → RAISE EXCEPTION P0003 "Justificativa obrigatória ...".
-- Sintoma: Conciliação Bancária → "Processar"/"Criar" com categoria selecionada abortava com o erro.
--
-- Correção: extrair a categoria de rateio de 1 linha ANTES do INSERT (v_cat_id/v_cc_id) e gravar
-- categoria_id/centro_custo_id no PRÓPRIO INSERT — removendo o UPDATE pós-criação. Contrato documentado
-- no CLAUDE.md: "grava categoria_id no INSERT. NUNCA gravar categoria via UPDATE pós-criação".
-- Rateio múltiplo (>1) continua com categoria_id NULL no lançamento (split) → detalhe só em fin_lancamento_rateios.

CREATE OR REPLACE FUNCTION public.reconcile_import_lancamento(
  p_data date, p_descricao text, p_valor numeric, p_tipo text,
  p_conta_id uuid, p_user_id uuid, p_rateio_linhas jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lancamento_id uuid;
  v_idem_key text;
  v_company uuid;
  v_uid uuid;
  v_rateio_item jsonb;
  v_cat_id uuid;
  v_cc_id uuid;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_permission(v_uid, 'finance:manage') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- Idempotency key
  v_idem_key := md5(v_company::text || p_data::text || p_descricao || p_valor::text || p_tipo || p_conta_id::text);

  -- Check for existing
  SELECT id INTO v_lancamento_id
  FROM public.fin_lancamentos
  WHERE idempotency_key = v_idem_key AND company_id = v_company;

  IF v_lancamento_id IS NOT NULL THEN
    -- Already exists, just mark as conciliado (campos não vigiados pelo trigger de REALIZADO)
    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid
    WHERE id = v_lancamento_id;
    RETURN jsonb_build_object('status', 'duplicate', 'lancamento_id', v_lancamento_id);
  END IF;

  -- Extrair categoria/centro de custo de rateio de 1 linha ANTES do INSERT
  -- (grava no próprio INSERT → evita UPDATE pós-criação que dispara o trigger de lançamento REALIZADO)
  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) = 1 THEN
    v_cat_id := NULLIF(p_rateio_linhas->0->>'categoria_id', '')::uuid;
    v_cc_id  := NULLIF(p_rateio_linhas->0->>'centro_custo_id', '')::uuid;
  END IF;

  -- Insert new lancamento (categoria_id/centro_custo_id já no INSERT)
  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    conta_id, forma_pagamento, status,
    conciliado, conciliado_em, conciliado_por,
    created_by, idempotency_key, company_id, origem,
    categoria_id, centro_custo_id
  )
  VALUES (
    p_tipo::text, p_valor, p_data, p_data, p_descricao,
    p_conta_id, 'extrato', 'REALIZADO',
    true, now(), v_uid,
    v_uid, v_idem_key, v_company, 'conciliacao',
    v_cat_id, v_cc_id
  )
  RETURNING id INTO v_lancamento_id;

  -- Handle rateio (detalhamento em fin_lancamento_rateios)
  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) > 0 THEN
    FOR v_rateio_item IN SELECT * FROM jsonb_array_elements(p_rateio_linhas)
    LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id,
        valor, percentual, observacao, company_id
      )
      VALUES (
        v_lancamento_id,
        (v_rateio_item->>'categoria_id')::uuid,
        NULLIF(v_rateio_item->>'centro_custo_id', '')::uuid,
        (v_rateio_item->>'valor')::numeric,
        (v_rateio_item->>'percentual')::numeric,
        v_rateio_item->>'observacao',
        v_company
      );
    END LOOP;
  END IF;

  -- Audit: v_lancamento_id é uuid nativo — sem ::text (evita erro 42804)
  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('lancamentos', v_lancamento_id, 'reconcile_import', v_uid, v_company,
    jsonb_build_object('valor', p_valor, 'tipo', p_tipo, 'data', p_data, 'descricao', p_descricao));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb) TO authenticated;
