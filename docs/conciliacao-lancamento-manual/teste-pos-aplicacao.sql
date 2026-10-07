-- Teste da migration 20261007193000_conciliacao_vincula_lancamento_manual — DEPOIS de aplicar
--
-- Mesmos cenários de teste-producao.sql, agora contra a função publicada
-- public.reconcile_link_existing_lancamento, mais a checagem de grants (C23).
-- Rodar no SQL Editor logo depois de aplicar a migration. Termina SEMPRE com
-- erro trazendo o relatório: a transação é desfeita, nada fica gravado.
--
-- Resultado esperado: ERROR "TESTE OK — N ok, 0 falha(s)". Qualquer "FALHA":
-- rodar reversao.sql (depois de reverter o frontend, se já publicado).
-- Gerado a partir de teste-producao.sql — mudar os cenários lá e regenerar.


-- Cria um lançamento de teste (só existe dentro desta transação).
CREATE OR REPLACE FUNCTION pg_temp.rlel_novo(
  p_company uuid, p_user uuid, p_conta uuid, p_cat uuid, p_status text, p_tipo text,
  p_origem text, p_referencia text, p_conciliado boolean, p_descricao text, p_data date
)
RETURNS uuid
LANGUAGE sql
AS $$
  INSERT INTO public.fin_lancamentos (
    company_id, tipo, status, valor, conta_id, categoria_id,
    data_competencia, data_pagamento, descricao, origem, referencia_modulo,
    conciliado, created_by
  ) VALUES (
    p_company, p_tipo, p_status, 12.34, p_conta, p_cat,
    p_data, CASE WHEN p_status = 'REALIZADO' THEN p_data END, p_descricao, p_origem, p_referencia,
    p_conciliado, p_user
  )
  RETURNING id;
$$;

DO $teste$
DECLARE
  v_company uuid;
  v_user uuid;
  v_user_sem_edicao uuid;
  v_conta_a uuid;
  v_conta_b uuid;
  v_conta_outra_empresa uuid;
  v_cat uuid;
  v_id uuid;
  v_c1 uuid;
  v_dia date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_comp date := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 2;
  v_assinatura text := 'public.reconcile_link_existing_lancamento(uuid,uuid,text,text,date,boolean,numeric)';
  r jsonb;
  l record;
  rel text := '';
  falhas int := 0;
  ok int := 0;
BEGIN
  -- Empresa com duas contas ativas, categoria de despesa e um membro ativo com
  -- conciliação + edição de lançamento na própria unidade.
  FOR v_company, v_user IN
    SELECT m.company_id, m.user_id
    FROM public.company_memberships m
    WHERE m.status = 'active'
      AND (SELECT count(*) FROM public.fin_contas c WHERE c.company_id = m.company_id AND c.ativo IS NOT FALSE) >= 2
      AND EXISTS (SELECT 1 FROM public.fin_categorias fc WHERE fc.company_id = m.company_id AND fc.tipo = 'despesa' AND fc.ativo IS NOT FALSE)
    ORDER BY m.company_id, m.user_id
  LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.headers', json_build_object('x-company-id', v_company)::text, true);
    BEGIN
      IF public.get_current_company_id() = v_company
         AND public.has_any_permission(v_user, ARRAY['financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage'])
         AND public.has_any_permission(v_user, ARRAY['financeiro:lancamentos:edit', 'finance:manage', 'system:global:manage']) THEN
        EXIT;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    v_company := NULL;
  END LOOP;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'TESTE NÃO RODOU: nenhuma empresa com 2 contas e usuário com conciliação + edição de lançamento';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', json_build_object('x-company-id', v_company)::text, true);

  SELECT c.id INTO v_conta_a FROM public.fin_contas c
  WHERE c.company_id = v_company AND c.ativo IS NOT FALSE ORDER BY c.created_at, c.id LIMIT 1;
  SELECT c.id INTO v_conta_b FROM public.fin_contas c
  WHERE c.company_id = v_company AND c.ativo IS NOT FALSE AND c.id <> v_conta_a ORDER BY c.created_at, c.id LIMIT 1;
  SELECT fc.id INTO v_cat FROM public.fin_categorias fc
  WHERE fc.company_id = v_company AND fc.tipo = 'despesa' AND fc.ativo IS NOT FALSE ORDER BY fc.nome, fc.id LIMIT 1;
  SELECT c.id INTO v_conta_outra_empresa FROM public.fin_contas c WHERE c.company_id <> v_company ORDER BY c.id LIMIT 1;

  rel := format(E'\nempresa %s · usuário %s · conta A %s · conta B %s', v_company, v_user, v_conta_a, v_conta_b);

  -- C1: nota lançada como PREVISTO na conta do extrato, linha OFX com FITID.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_a, v_cat, 'PREVISTO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C1', v_comp);
  v_c1 := v_id;
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, 'RLEL-TESTE-FIT-1', 'DESPESA', v_dia, false, 12.34);
    SELECT * INTO l FROM public.fin_lancamentos WHERE id = v_id;
    IF l.status = 'REALIZADO' AND l.data_pagamento = v_dia AND l.data_competencia = v_comp
       AND l.conciliado AND l.conta_id = v_conta_a AND (r->>'realizado')::boolean
       AND l.justificativa_edicao LIKE 'Pagamento confirmado pelo extrato%'
       AND EXISTS (SELECT 1 FROM public.fin_conciliacao_vinculos v
                   WHERE v.lancamento_id = v_id AND v.conta_id = v_conta_a AND v.external_id = 'RLEL-TESTE-FIT-1') THEN
      ok := ok + 1; rel := rel || E'\nOK    C1 previsto vira realizado com a data do extrato + FITID gravado';
    ELSE
      falhas := falhas + 1; rel := rel || E'\nFALHA C1 ' || r::text || ' ' || row_to_json(l)::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN falhas := falhas + 1; rel := rel || E'\nFALHA C1 erro: ' || SQLERRM;
  END;

  -- C2: reenvio da mesma linha (resposta perdida) não muda nada nem duplica vínculo.
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_c1, 'RLEL-TESTE-FIT-1', 'DESPESA', v_dia, false, 12.34);
    IF NOT (r->>'realizado')::boolean AND NOT (r->>'conta_movida')::boolean
       AND (SELECT count(*) FROM public.fin_conciliacao_vinculos v WHERE v.lancamento_id = v_c1) = 1 THEN
      ok := ok + 1; rel := rel || E'\nOK    C2 reenvio idempotente';
    ELSE
      falhas := falhas + 1; rel := rel || E'\nFALHA C2 ' || r::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN falhas := falhas + 1; rel := rel || E'\nFALHA C2 erro: ' || SQLERRM;
  END;

  -- C3: realizado sem conta recebe a conta do extrato.
  v_id := pg_temp.rlel_novo(v_company, v_user, NULL, v_cat, 'REALIZADO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C3', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia, false, 12.34);
    SELECT * INTO l FROM public.fin_lancamentos WHERE id = v_id;
    IF l.conta_id = v_conta_a AND l.conciliado AND l.status = 'REALIZADO' AND (r->>'conta_ajustada')::boolean
       AND l.data_pagamento = v_comp THEN
      ok := ok + 1; rel := rel || E'\nOK    C3 sem conta recebe a conta do extrato (data de pagamento preservada)';
    ELSE
      falhas := falhas + 1; rel := rel || E'\nFALHA C3 ' || r::text || ' ' || row_to_json(l)::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN falhas := falhas + 1; rel := rel || E'\nFALHA C3 erro: ' || SQLERRM;
  END;

  -- C4: outra conta sem confirmação continua recusado.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_b, v_cat, 'REALIZADO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C4', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, 'RLEL-TESTE-FIT-4', 'DESPESA', v_dia, false, 12.34);
    falhas := falhas + 1; rel := rel || E'\nFALHA C4 deveria recusar CONTA_DIVERGENTE: ' || r::text;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'CONTA_DIVERGENTE%' THEN ok := ok + 1; rel := rel || E'\nOK    C4 outra conta sem confirmação → CONTA_DIVERGENTE';
    ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C4 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- C5: o mesmo lançamento, agora com confirmação: muda de conta com justificativa.
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, 'RLEL-TESTE-FIT-5', 'DESPESA', v_dia, true, 12.34);
    SELECT * INTO l FROM public.fin_lancamentos WHERE id = v_id;
    IF l.conta_id = v_conta_a AND l.conciliado AND (r->>'conta_movida')::boolean
       AND l.justificativa_edicao LIKE 'Conta bancária corrigida na conciliação do extrato (antes:%'
       AND EXISTS (SELECT 1 FROM public.fin_conciliacao_vinculos v
                   WHERE v.lancamento_id = v_id AND v.conta_id = v_conta_a AND v.external_id = 'RLEL-TESTE-FIT-5') THEN
      ok := ok + 1; rel := rel || E'\nOK    C5 outra conta com confirmação muda de conta + FITID';
    ELSE
      falhas := falhas + 1; rel := rel || E'\nFALHA C5 ' || r::text || ' ' || row_to_json(l)::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN falhas := falhas + 1; rel := rel || E'\nFALHA C5 erro: ' || SQLERRM;
  END;

  -- C6: já conciliado no extrato da conta de origem não é trazido.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_b, v_cat, 'REALIZADO', 'DESPESA', 'manual', '', true, 'TESTE RLEL C6', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia, true, 12.34);
    falhas := falhas + 1; rel := rel || E'\nFALHA C6 deveria recusar JA_CONCILIADO_OUTRA_CONTA: ' || r::text;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'JA_CONCILIADO_OUTRA_CONTA%' THEN ok := ok + 1; rel := rel || E'\nOK    C6 conciliado na conta de origem → JA_CONCILIADO_OUTRA_CONTA';
    ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C6 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- C7: previsto que pertence a título de CP/CR é baixado pelo título.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_a, v_cat, 'PREVISTO', 'DESPESA', 'manual', 'contas_pagar', false, 'TESTE RLEL C7', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia, false, 12.34);
    falhas := falhas + 1; rel := rel || E'\nFALHA C7 deveria recusar LANCAMENTO_PREVISTO_VINCULADO: ' || r::text;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'LANCAMENTO_PREVISTO_VINCULADO%' THEN ok := ok + 1; rel := rel || E'\nOK    C7 previsto de título → LANCAMENTO_PREVISTO_VINCULADO';
    ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C7 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- C8: baixa de título em outra conta não muda de conta nem com confirmação.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_b, v_cat, 'REALIZADO', 'DESPESA', 'espelho_cp', '', false, 'TESTE RLEL C8', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia, true, 12.34);
    falhas := falhas + 1; rel := rel || E'\nFALHA C8 deveria recusar CONTA_DIVERGENTE: ' || r::text;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'CONTA_DIVERGENTE%' THEN ok := ok + 1; rel := rel || E'\nOK    C8 espelho de CP em outra conta → CONTA_DIVERGENTE';
    ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C8 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- C9: previsto sem a data da linha do extrato.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_a, v_cat, 'PREVISTO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C9', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', NULL, false, 12.34);
    falhas := falhas + 1; rel := rel || E'\nFALHA C9 deveria recusar LINHA_EXTRATO_OBRIGATORIA: ' || r::text;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'LINHA_EXTRATO_OBRIGATORIA%' THEN ok := ok + 1; rel := rel || E'\nOK    C9 previsto sem data → LINHA_EXTRATO_OBRIGATORIA';
    ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C9 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- C10: receita contra linha de despesa.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_a, v_cat, 'REALIZADO', 'RECEITA', 'manual', '', false, 'TESTE RLEL C10', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia, false, 12.34);
    falhas := falhas + 1; rel := rel || E'\nFALHA C10 deveria recusar TIPO_DIVERGENTE: ' || r::text;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'TIPO_DIVERGENTE%' THEN ok := ok + 1; rel := rel || E'\nOK    C10 tipo diferente → TIPO_DIVERGENTE';
    ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C10 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- C11: cancelado continua recusado.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_a, v_cat, 'CANCELADO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C11', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia, false, 12.34);
    falhas := falhas + 1; rel := rel || E'\nFALHA C11 deveria recusar STATUS_INVALIDO: ' || r::text;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'STATUS_INVALIDO%' THEN ok := ok + 1; rel := rel || E'\nOK    C11 cancelado → STATUS_INVALIDO';
    ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C11 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- C12: previsto em outra conta, com confirmação: realiza e muda de conta juntos.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_b, v_cat, 'PREVISTO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C12', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia, true, 12.34);
    SELECT * INTO l FROM public.fin_lancamentos WHERE id = v_id;
    IF l.status = 'REALIZADO' AND l.conta_id = v_conta_a AND l.data_pagamento = v_dia AND l.conciliado
       AND (r->>'realizado')::boolean AND (r->>'conta_movida')::boolean THEN
      ok := ok + 1; rel := rel || E'\nOK    C12 previsto de outra conta: realiza e muda de conta';
    ELSE
      falhas := falhas + 1; rel := rel || E'\nFALHA C12 ' || r::text || ' ' || row_to_json(l)::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN falhas := falhas + 1; rel := rel || E'\nFALHA C12 erro: ' || SQLERRM;
  END;

  -- C13: realizado da mesma conta, linha de CSV (sem FITID): só concilia.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_a, v_cat, 'REALIZADO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C13', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia, false, 12.34);
    SELECT * INTO l FROM public.fin_lancamentos WHERE id = v_id;
    IF l.conciliado AND l.conta_id = v_conta_a AND l.status = 'REALIZADO' AND l.data_pagamento = v_comp
       AND NOT (r->>'realizado')::boolean AND NOT (r->>'conta_movida')::boolean AND NOT (r->>'conta_ajustada')::boolean
       AND NOT EXISTS (SELECT 1 FROM public.fin_conciliacao_vinculos v WHERE v.lancamento_id = v_id) THEN
      ok := ok + 1; rel := rel || E'\nOK    C13 mesma conta sem FITID: só concilia';
    ELSE
      falhas := falhas + 1; rel := rel || E'\nFALHA C13 ' || r::text || ' ' || row_to_json(l)::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN falhas := falhas + 1; rel := rel || E'\nFALHA C13 erro: ' || SQLERRM;
  END;

  -- C14: conta bancária de outra empresa.
  IF v_conta_outra_empresa IS NULL THEN
    rel := rel || E'\nPULADO C14 nenhuma conta de outra empresa';
  ELSE
    v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_a, v_cat, 'REALIZADO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C14', v_comp);
    BEGIN
      r := public.reconcile_link_existing_lancamento(v_conta_outra_empresa, v_id, NULL, 'DESPESA', v_dia, true, 12.34);
      falhas := falhas + 1; rel := rel || E'\nFALHA C14 deveria recusar NOT_FOUND: ' || r::text;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'NOT_FOUND: conta bancária%' THEN ok := ok + 1; rel := rel || E'\nOK    C14 conta de outra empresa → NOT_FOUND';
      ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C14 erro inesperado: ' || SQLERRM; END IF;
    END;
  END IF;

  -- C15: lançamento manual com valor diferente do extrato.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_a, v_cat, 'REALIZADO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C15', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia, false, 12.00);
    falhas := falhas + 1; rel := rel || E'\nFALHA C15 deveria recusar VALOR_DIVERGENTE: ' || r::text;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'VALOR_DIVERGENTE%' THEN ok := ok + 1; rel := rel || E'\nOK    C15 manual com valor diferente → VALOR_DIVERGENTE';
    ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C15 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- C16: espelho de CP aceita valor diferente (a diferença já é lançamento de ajuste).
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_a, v_cat, 'REALIZADO', 'DESPESA', 'espelho_cp', '', true, 'TESTE RLEL C16', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, 'RLEL-TESTE-FIT-16', 'DESPESA', v_dia, false, 13.00);
    IF EXISTS (SELECT 1 FROM public.fin_conciliacao_vinculos v
               WHERE v.lancamento_id = v_id AND v.external_id = 'RLEL-TESTE-FIT-16') THEN
      ok := ok + 1; rel := rel || E'\nOK    C16 espelho de CP com diferença de valor é vinculado';
    ELSE
      falhas := falhas + 1; rel := rel || E'\nFALHA C16 ' || r::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN falhas := falhas + 1; rel := rel || E'\nFALHA C16 erro: ' || SQLERRM;
  END;

  -- C17: o lançamento do C1 já cobre o FITID 1; um 2º FITID da mesma conta é recusado.
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_c1, 'RLEL-TESTE-FIT-17', 'DESPESA', v_dia, false, 12.34);
    falhas := falhas + 1; rel := rel || E'\nFALHA C17 deveria recusar LANCAMENTO_JA_VINCULADO: ' || r::text;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'LANCAMENTO_JA_VINCULADO%' THEN ok := ok + 1; rel := rel || E'\nOK    C17 segundo FITID no mesmo lançamento → LANCAMENTO_JA_VINCULADO';
    ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C17 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- C18: previsto não vira realizado com data futura.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_a, v_cat, 'PREVISTO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C18', v_comp);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia + 1, false, 12.34);
    falhas := falhas + 1; rel := rel || E'\nFALHA C18 deveria recusar DATA_EXTRATO_FUTURA: ' || r::text;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'DATA_EXTRATO_FUTURA%' THEN ok := ok + 1; rel := rel || E'\nOK    C18 previsto com data futura → DATA_EXTRATO_FUTURA';
    ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C18 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- C19: previsto sem o tipo da linha do extrato.
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, NULL, v_dia, false, 12.34);
    falhas := falhas + 1; rel := rel || E'\nFALHA C19 deveria recusar LINHA_EXTRATO_OBRIGATORIA: ' || r::text;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'LINHA_EXTRATO_OBRIGATORIA%' THEN ok := ok + 1; rel := rel || E'\nOK    C19 previsto sem tipo → LINHA_EXTRATO_OBRIGATORIA';
    ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C19 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- C20: vinculado (sem estar conciliado) no extrato da conta de origem não é trazido.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_b, v_cat, 'REALIZADO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C20', v_comp);
  INSERT INTO public.fin_conciliacao_vinculos (company_id, conta_id, external_id, tipo, lancamento_id, created_by)
  VALUES (v_company, v_conta_b, 'RLEL-TESTE-FIT-20', 'DESPESA', v_id, v_user);
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia, true, 12.34);
    falhas := falhas + 1; rel := rel || E'\nFALHA C20 deveria recusar JA_CONCILIADO_OUTRA_CONTA: ' || r::text;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'JA_CONCILIADO_OUTRA_CONTA%' THEN ok := ok + 1; rel := rel || E'\nOK    C20 vinculado na conta de origem → JA_CONCILIADO_OUTRA_CONTA';
    ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C20 erro inesperado: ' || SQLERRM; END IF;
  END;

  -- C21: realizado sem data de pagamento: só concilia, não inventa data.
  v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_a, v_cat, 'REALIZADO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C21', v_comp);
  UPDATE public.fin_lancamentos SET data_pagamento = NULL WHERE id = v_id;
  BEGIN
    r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia, false, 12.34);
    SELECT * INTO l FROM public.fin_lancamentos WHERE id = v_id;
    IF l.conciliado AND l.data_pagamento IS NULL AND l.status = 'REALIZADO' THEN
      ok := ok + 1; rel := rel || E'\nOK    C21 realizado sem data de pagamento só é conciliado';
    ELSE
      falhas := falhas + 1; rel := rel || E'\nFALHA C21 ' || r::text || ' ' || row_to_json(l)::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN falhas := falhas + 1; rel := rel || E'\nFALHA C21 erro: ' || SQLERRM;
  END;

  -- C22: membro com conciliação mas sem edição de lançamento não traz de outra conta.
  SELECT m.user_id INTO v_user_sem_edicao
  FROM public.company_memberships m
  WHERE m.company_id = v_company AND m.status = 'active' AND m.user_id <> v_user
    AND public.has_any_permission(m.user_id, ARRAY['financeiro:conciliacao:reconcile', 'financeiro:conciliacao:manage', 'finance:manage', 'system:global:manage'])
    AND NOT public.has_any_permission(m.user_id, ARRAY['financeiro:lancamentos:edit', 'finance:manage', 'system:global:manage'])
  ORDER BY m.user_id LIMIT 1;
  IF v_user_sem_edicao IS NULL THEN
    rel := rel || E'\nPULADO C22 nenhum membro com conciliação e sem edição nesta empresa';
  ELSE
    v_id := pg_temp.rlel_novo(v_company, v_user, v_conta_b, v_cat, 'REALIZADO', 'DESPESA', 'manual', '', false, 'TESTE RLEL C22', v_comp);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_sem_edicao, 'role', 'authenticated')::text, true);
    BEGIN
      r := public.reconcile_link_existing_lancamento(v_conta_a, v_id, NULL, 'DESPESA', v_dia, true, 12.34);
      falhas := falhas + 1; rel := rel || E'\nFALHA C22 deveria recusar PERMISSION_DENIED: ' || r::text;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'PERMISSION_DENIED: financeiro:lancamentos:edit%' THEN ok := ok + 1; rel := rel || E'\nOK    C22 sem edição de lançamento → PERMISSION_DENIED';
      ELSE falhas := falhas + 1; rel := rel || E'\nFALHA C22 erro inesperado: ' || SQLERRM; END IF;
    END;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  END IF;

  -- C23: grants da função publicada (só depois de aplicar a migration).
  IF to_regprocedure(v_assinatura) IS NULL THEN
    rel := rel || E'\nPULADO C23 grants: migration ainda não aplicada';
  ELSIF NOT has_function_privilege('anon', v_assinatura, 'EXECUTE')
        AND has_function_privilege('authenticated', v_assinatura, 'EXECUTE')
        AND to_regprocedure('public.reconcile_link_existing_lancamento(uuid,uuid,text,text,date)') IS NULL THEN
    ok := ok + 1; rel := rel || E'\nOK    C23 anon sem EXECUTE, authenticated com EXECUTE, sem overload antigo';
  ELSE
    falhas := falhas + 1; rel := rel || E'\nFALHA C23 grants/overload da função publicada';
  END IF;

  -- Sempre termina em erro: desfaz tudo o que o teste gravou.
  RAISE EXCEPTION '% — % ok, % falha(s)%',
    CASE WHEN falhas = 0 THEN 'TESTE OK' ELSE 'TESTE COM FALHA' END, ok, falhas, rel;
END;
$teste$;
