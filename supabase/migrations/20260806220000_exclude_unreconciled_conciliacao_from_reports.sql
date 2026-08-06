-- ============================================================================
-- Extensão da regra "origem='conciliacao' AND conciliado != true fica fora dos
-- relatórios" (migrations 20260806200000 e 20260806210000, já aplicadas em
-- Livro Razão/DRE e Dashboard) para o restante dos sub-módulos de
-- Relatórios & Análise do Financeiro: Fluxo de Caixa, DFC, Orçamento, KPIs,
-- Relatório Sócios e Comparativo.
--
-- Critério usado em cada função: a exclusão entra APENAS nos agregados de
-- "Receita/Despesa do período" e "despesa por categoria" (equivalentes aos
-- cards de Receita/Despesa do Dashboard). Saldos acumulados/caixa
-- (v_saldo_acumulado em get_fin_cashflow, v_saldo_inicial em
-- get_fin_dfc_summary, v_saldo_base em get_fin_fluxo_projecao) NÃO são
-- tocados — mesmo princípio já documentado no CLAUDE.md para "Saldo em
-- Caixa": reflete dinheiro real movimentado, independente do lançamento
-- ainda estar pendente de recategorização. get_fin_fluxo_projecao não entra
-- nesta migration porque sua única leitura de fin_lancamentos
-- REALIZADO/CONCILIADO é exatamente esse saldo-base acumulado.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_fin_cashflow(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_result jsonb;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_saldo_acumulado numeric;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:relatorios:view', 'financeiro:fluxo:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Saldo acumulado = saldo_inicial contas ativas + movimentos realizados (por caixa) até p_fim
  v_saldo_acumulado := (
    SELECT COALESCE(SUM(saldo_inicial), 0) FROM fin_contas
    WHERE company_id = v_company_id AND ativo = true
  ) + COALESCE((
    SELECT SUM(CASE WHEN tipo = 'RECEITA' THEN valor WHEN tipo = 'DESPESA' THEN -valor ELSE 0 END)
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND COALESCE(data_pagamento, data_competencia) <= p_fim
  ), 0);

  WITH realizado AS (
    SELECT
      COALESCE(data_pagamento, conciliado_em::date, data_competencia) as data,
      SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END) as entradas,
      SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END) as saidas
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) BETWEEN p_inicio AND p_fim
    GROUP BY COALESCE(data_pagamento, conciliado_em::date, data_competencia)
  ),
  realizado_detalhes AS (
    SELECT
      COALESCE(data_pagamento, conciliado_em::date, data_competencia) as data,
      id,
      descricao,
      valor,
      tipo,
      COALESCE(origem, 'manual') as origem
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) BETWEEN p_inicio AND p_fim
  ),
  previsto_lanc AS (
    SELECT
      COALESCE(data_vencimento, data_competencia) as data,
      SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END) as prev_entradas,
      SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END) as prev_saidas
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status = 'PREVISTO'
      AND tipo != 'TRANSFERENCIA'
      AND COALESCE(data_vencimento, data_competencia) BETWEEN p_inicio AND p_fim
    GROUP BY COALESCE(data_vencimento, data_competencia)
  ),
  previsto_lanc_detalhes AS (
    SELECT
      COALESCE(data_vencimento, data_competencia) as data,
      id,
      descricao,
      valor,
      tipo,
      COALESCE(origem, 'manual') as origem
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status = 'PREVISTO'
      AND tipo != 'TRANSFERENCIA'
      AND COALESCE(data_vencimento, data_competencia) BETWEEN p_inicio AND p_fim
  ),
  pagar AS (
    SELECT data_vencimento as data, SUM(valor) as prev_saidas
    FROM fin_contas_pagar
    WHERE company_id = v_company_id
      AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND (
        data_vencimento BETWEEN p_inicio AND p_fim
        OR data_vencimento < v_today
      )
    GROUP BY data_vencimento
  ),
  pagar_detalhes AS (
    SELECT data_vencimento as data, id, descricao, valor,
      CASE WHEN data_vencimento < v_today THEN true ELSE false END as is_vencida
    FROM fin_contas_pagar
    WHERE company_id = v_company_id
      AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND (
        data_vencimento BETWEEN p_inicio AND p_fim
        OR data_vencimento < v_today
      )
  ),
  receber AS (
    SELECT data_vencimento as data, SUM(valor) as prev_entradas
    FROM fin_contas_receber
    WHERE company_id = v_company_id
      AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND (
        data_vencimento BETWEEN p_inicio AND p_fim
        OR data_vencimento < v_today
      )
    GROUP BY data_vencimento
  ),
  receber_detalhes AS (
    SELECT data_vencimento as data, id, descricao, valor,
      CASE WHEN data_vencimento < v_today THEN true ELSE false END as is_vencida
    FROM fin_contas_receber
    WHERE company_id = v_company_id
      AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND (
        data_vencimento BETWEEN p_inicio AND p_fim
        OR data_vencimento < v_today
      )
  ),
  all_dates AS (
    SELECT data FROM realizado
    UNION SELECT data FROM previsto_lanc
    UNION SELECT data FROM pagar
    UNION SELECT data FROM receber
  ),
  detail_rows AS (
    SELECT data, jsonb_agg(det ORDER BY det->>'descricao') as detalhes
    FROM (
      SELECT data, jsonb_build_object(
        'id', id, 'entidade_tipo', 'lancamento',
        'tipo', 'realizado', 'descricao', COALESCE(descricao,''), 'valor', valor,
        'natureza', CASE WHEN tipo = 'RECEITA' THEN 'entrada' ELSE 'saida' END,
        'origem', origem
      ) as det FROM realizado_detalhes
      UNION ALL
      SELECT data, jsonb_build_object(
        'id', id, 'entidade_tipo', 'lancamento',
        'tipo', 'previsto', 'descricao', COALESCE(descricao,''), 'valor', valor,
        'natureza', CASE WHEN tipo = 'RECEITA' THEN 'entrada' ELSE 'saida' END,
        'origem', origem
      ) FROM previsto_lanc_detalhes
      UNION ALL
      SELECT data, jsonb_build_object(
        'id', id, 'entidade_tipo', 'conta_pagar',
        'tipo', 'previsto', 'descricao', COALESCE(descricao,''), 'valor', valor,
        'natureza', 'saida',
        'origem', CASE WHEN is_vencida THEN 'conta_pagar_vencida' ELSE 'conta_pagar' END
      ) FROM pagar_detalhes
      UNION ALL
      SELECT data, jsonb_build_object(
        'id', id, 'entidade_tipo', 'conta_receber',
        'tipo', 'previsto', 'descricao', COALESCE(descricao,''), 'valor', valor,
        'natureza', 'entrada',
        'origem', CASE WHEN is_vencida THEN 'conta_receber_vencida' ELSE 'conta_receber' END
      ) FROM receber_detalhes
    ) sub
    GROUP BY data
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'dias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'data', d.data,
        'entradas', COALESCE(r.entradas, 0),
        'saidas', COALESCE(r.saidas, 0),
        'prev_entradas', COALESCE(pl.prev_entradas, 0) + COALESCE(rc.prev_entradas, 0),
        'prev_saidas', COALESCE(pl.prev_saidas, 0) + COALESCE(pg.prev_saidas, 0),
        'detalhes', COALESCE(dr.detalhes, '[]'::jsonb)
      ) ORDER BY d.data)
      FROM all_dates d
      LEFT JOIN realizado r ON r.data = d.data
      LEFT JOIN previsto_lanc pl ON pl.data = d.data
      LEFT JOIN pagar pg ON pg.data = d.data
      LEFT JOIN receber rc ON rc.data = d.data
      LEFT JOIN detail_rows dr ON dr.data = d.data
    ), '[]'::jsonb),
    'totais', jsonb_build_object(
      'entradas', COALESCE((SELECT SUM(entradas) FROM realizado), 0),
      'saidas', COALESCE((SELECT SUM(saidas) FROM realizado), 0),
      'prev_entradas', COALESCE((SELECT SUM(prev_entradas) FROM previsto_lanc), 0) + COALESCE((SELECT SUM(prev_entradas) FROM receber), 0),
      'prev_saidas', COALESCE((SELECT SUM(prev_saidas) FROM previsto_lanc), 0) + COALESCE((SELECT SUM(prev_saidas) FROM pagar), 0),
      'saldo_acumulado', v_saldo_acumulado
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_fin_dfc_summary(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_saldo_inicial numeric;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:fluxo:view', 'financeiro:relatorios:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Saldo inicial = sum of account balances + net movements (por caixa) before period
  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial
  FROM fin_contas WHERE company_id = v_company_id AND ativo = true;

  v_saldo_inicial := v_saldo_inicial + COALESCE((
    SELECT SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE -valor END)
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_inicio
  ), 0);

  WITH effective_values AS (
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_lancamentos l ON l.id = r.lancamento_id AND l.company_id = v_company_id
    WHERE l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    SELECT l.categoria_id, l.valor
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = l.id AND r.company_id = v_company_id
      )
  ),
  por_categoria AS (
    SELECT
      COALESCE(ev.categoria_id, '00000000-0000-0000-0000-000000000000')::text as cat_id,
      SUM(ev.valor) as total
    FROM effective_values ev
    GROUP BY ev.categoria_id
  )
  SELECT jsonb_build_object(
    'saldo_inicial', v_saldo_inicial,
    'categorias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'codigo', c.codigo, 'tipo', c.tipo,
        'parent_id', c.parent_id, 'ordem', c.ordem, 'ativo', c.ativo,
        'grupo', c.grupo, 'linha_dre', c.linha_dre,
        'centro_custo_padrao_id', c.centro_custo_padrao_id
      ) ORDER BY c.ordem, c.codigo)
      FROM fin_categorias c
      WHERE c.company_id = v_company_id AND c.ativo = true
    ), '[]'::jsonb),
    'valores_por_categoria', COALESCE((
      SELECT jsonb_object_agg(pc.cat_id, pc.total)
      FROM por_categoria pc
    ), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.orcamento_execucao_mensal(p_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_company_id UUID;
  v_inicio DATE;
  v_fim DATE;
  v_result JSONB;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:orcamento:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_inicio := (p_mes || '-01')::DATE;
  v_fim := (date_trunc('month', v_inicio) + interval '1 month - 1 day')::DATE;

  WITH lancamentos_despesa AS (
    SELECT id, categoria_id, valor
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo = 'DESPESA'
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND data_competencia >= v_inicio
      AND data_competencia <= v_fim
  ),
  rateios AS (
    SELECT r.lancamento_id, r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    INNER JOIN lancamentos_despesa ld ON ld.id = r.lancamento_id
    WHERE r.company_id = v_company_id
  ),
  lancamentos_com_rateio AS (
    SELECT DISTINCT lancamento_id FROM rateios
  ),
  valores_por_cat AS (
    SELECT ld.categoria_id, ld.valor
    FROM lancamentos_despesa ld
    LEFT JOIN lancamentos_com_rateio lcr ON lcr.lancamento_id = ld.id
    WHERE lcr.lancamento_id IS NULL AND ld.categoria_id IS NOT NULL
    UNION ALL
    SELECT r.categoria_id, r.valor
    FROM rateios r
    WHERE r.categoria_id IS NOT NULL
  ),
  realizado_por_cat AS (
    SELECT categoria_id, SUM(valor)::NUMERIC AS total_realizado
    FROM valores_por_cat
    GROUP BY categoria_id
  ),
  resultado AS (
    SELECT
      o.id,
      o.categoria_id,
      COALESCE(c.nome, 'Sem categoria') AS categoria_nome,
      COALESCE(c.tipo, 'despesa') AS categoria_tipo,
      o.valor_orcado::NUMERIC,
      COALESCE(r.total_realizado, 0)::NUMERIC AS valor_realizado,
      CASE WHEN o.valor_orcado > 0
        THEN ROUND((COALESCE(r.total_realizado, 0) / o.valor_orcado) * 100, 1)
        ELSE 0
      END AS pct_execucao,
      CASE
        WHEN o.valor_orcado > 0 AND COALESCE(r.total_realizado, 0) > o.valor_orcado THEN 'estourado'
        WHEN o.valor_orcado > 0 AND COALESCE(r.total_realizado, 0) > o.valor_orcado * 0.8 THEN 'alerta'
        ELSE 'ok'
      END AS status_execucao,
      GREATEST(COALESCE(r.total_realizado, 0) - o.valor_orcado, 0)::NUMERIC AS valor_excedido,
      o.updated_at
    FROM fin_orcamentos o
    LEFT JOIN fin_categorias c ON c.id = o.categoria_id AND c.company_id = v_company_id
    LEFT JOIN realizado_por_cat r ON r.categoria_id = o.categoria_id
    WHERE o.company_id = v_company_id
      AND o.mes_ano = p_mes
    ORDER BY COALESCE(r.total_realizado, 0) DESC
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'categoria_id', categoria_id,
      'categoriaNome', categoria_nome,
      'categoriaTipo', categoria_tipo,
      'valorOrcado', valor_orcado,
      'valorRealizado', valor_realizado,
      'pctExecucao', pct_execucao,
      'statusExecucao', status_execucao,
      'valorExcedido', valor_excedido,
      'updated_at', updated_at
    )
  ), '[]'::jsonb) INTO v_result FROM resultado;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_fin_kpis(p_meses integer DEFAULT 6)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  _result json;
  _receita numeric;
  _despesa numeric;
  _total_receitas int;
  _total_vencido numeric;
  _total_pendente numeric;
  _prazo_pgto numeric;
  _prazo_receb numeric;
  _receita_por_mes json;
  _top_fornecedores json;
  v_company uuid;
  v_hoje date;
  v_start date;
  v_end date;
BEGIN
  v_company := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:kpis:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_start := date_trunc('month', v_hoje - make_interval(months => p_meses - 1))::date;
  v_end := v_hoje;

  -- Receita/despesa/contagem por competência: lançamentos REALIZADO/CONCILIADO + CP/CR aberto
  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0),
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'RECEITA'), 0)
  INTO _receita, _despesa, _total_receitas
  FROM (
    SELECT tipo, valor FROM fin_lancamentos
      WHERE company_id = v_company AND tipo != 'TRANSFERENCIA'
        AND status IN ('REALIZADO', 'CONCILIADO')
        AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
        AND data_competencia BETWEEN v_start AND v_end
    UNION ALL
    SELECT 'DESPESA', valor FROM fin_contas_pagar
      WHERE company_id = v_company AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
        AND COALESCE(data_competencia, data_vencimento) BETWEEN v_start AND v_end
    UNION ALL
    SELECT 'RECEITA', valor FROM fin_contas_receber
      WHERE company_id = v_company AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
        AND COALESCE(data_competencia, data_vencimento) BETWEEN v_start AND v_end
  ) x;

  -- Inadimplência: vencido / pendente (apenas A_RECEBER) — inalterado
  SELECT
    COALESCE(SUM(CASE WHEN data_vencimento < v_hoje THEN valor ELSE 0 END), 0),
    COALESCE(SUM(valor), 0)
  INTO _total_vencido, _total_pendente
  FROM fin_contas_receber
  WHERE company_id = v_company AND status = 'A_RECEBER';

  -- Prazo médio pagamento — inalterado
  SELECT COALESCE(AVG(EXTRACT(DAY FROM (data_pagamento::timestamp - data_vencimento::timestamp))), 0)
  INTO _prazo_pgto
  FROM fin_contas_pagar
  WHERE company_id = v_company AND status = 'PAGO'
    AND data_pagamento IS NOT NULL AND data_vencimento >= v_start;

  -- Prazo médio recebimento — inalterado
  SELECT COALESCE(AVG(EXTRACT(DAY FROM (data_recebimento::timestamp - data_vencimento::timestamp))), 0)
  INTO _prazo_receb
  FROM fin_contas_receber
  WHERE company_id = v_company AND status = 'RECEBIDO'
    AND data_recebimento IS NOT NULL AND data_vencimento >= v_start;

  -- Receita vs Despesa mensal: por competência, lançamentos + CP/CR aberto
  SELECT json_agg(row_to_json(t) ORDER BY t.mes) INTO _receita_por_mes
  FROM (
    SELECT mes,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0) AS receita,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0) AS despesa
    FROM (
      SELECT tipo, valor, to_char(data_competencia, 'YYYY-MM') AS mes
        FROM fin_lancamentos
        WHERE company_id = v_company AND tipo != 'TRANSFERENCIA'
          AND status IN ('REALIZADO', 'CONCILIADO')
          AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
          AND data_competencia BETWEEN v_start AND v_end
      UNION ALL
      SELECT 'DESPESA', valor, to_char(COALESCE(data_competencia, data_vencimento), 'YYYY-MM')
        FROM fin_contas_pagar
        WHERE company_id = v_company AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
          AND COALESCE(data_competencia, data_vencimento) BETWEEN v_start AND v_end
      UNION ALL
      SELECT 'RECEITA', valor, to_char(COALESCE(data_competencia, data_vencimento), 'YYYY-MM')
        FROM fin_contas_receber
        WHERE company_id = v_company AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
          AND COALESCE(data_competencia, data_vencimento) BETWEEN v_start AND v_end
    ) y
    GROUP BY mes
  ) t;

  -- Top fornecedores (CP por vencimento) — inalterado
  SELECT json_agg(row_to_json(t)) INTO _top_fornecedores
  FROM (
    SELECT
      COALESCE(s.nome, TRIM(UPPER(cp.fornecedor)), 'N/A') AS nome,
      SUM(cp.valor) AS total
    FROM fin_contas_pagar cp
    LEFT JOIN suppliers s ON s.id = cp.supplier_id
    WHERE cp.company_id = v_company AND cp.status != 'CANCELADO'
      AND cp.data_vencimento >= v_start
    GROUP BY COALESCE(s.nome, TRIM(UPPER(cp.fornecedor)), 'N/A')
    ORDER BY total DESC
    LIMIT 8
  ) t;

  _result := json_build_object(
    'receita_total', _receita,
    'despesa_total', _despesa,
    'margem', CASE WHEN _receita > 0 THEN ((_receita - _despesa) / _receita) * 100 ELSE 0 END,
    'ticket_medio', CASE WHEN _total_receitas > 0 THEN _receita / _total_receitas ELSE 0 END,
    'inadimplencia', CASE WHEN _total_pendente > 0 THEN (_total_vencido / _total_pendente) * 100 ELSE 0 END,
    'total_vencido', _total_vencido,
    'prazo_medio_pagamento', _prazo_pgto,
    'prazo_medio_recebimento', _prazo_receb,
    'receita_por_mes', COALESCE(_receita_por_mes, '[]'::json),
    'top_fornecedores', COALESCE(_top_fornecedores, '[]'::json)
  );

  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_fin_kpis(p_start date, p_end date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  _result json;
  _receita numeric;
  _despesa numeric;
  _total_lanc int;
  _total_vencido numeric;
  _total_receber numeric;
  _prazo_pgto numeric;
  _prazo_receb numeric;
  _receita_por_mes json;
  _top_fornecedores json;
  v_company uuid;
  v_hoje date;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  -- Receita/despesa/contagem por competência: lançamentos REALIZADO/CONCILIADO + CP/CR aberto
  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0),
    COALESCE(COUNT(*), 0)
  INTO _receita, _despesa, _total_lanc
  FROM (
    SELECT tipo, valor FROM public.fin_lancamentos
      WHERE company_id = v_company AND tipo != 'TRANSFERENCIA'
        AND status IN ('REALIZADO', 'CONCILIADO')
        AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
        AND data_competencia >= p_start AND data_competencia <= p_end
    UNION ALL
    SELECT 'DESPESA', valor FROM public.fin_contas_pagar
      WHERE company_id = v_company AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
        AND COALESCE(data_competencia, data_vencimento) >= p_start
        AND COALESCE(data_competencia, data_vencimento) <= p_end
    UNION ALL
    SELECT 'RECEITA', valor FROM public.fin_contas_receber
      WHERE company_id = v_company AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
        AND COALESCE(data_competencia, data_vencimento) >= p_start
        AND COALESCE(data_competencia, data_vencimento) <= p_end
  ) x;

  SELECT
    COALESCE(SUM(CASE WHEN status = 'A_RECEBER' AND data_vencimento < v_hoje THEN valor ELSE 0 END), 0),
    COALESCE(SUM(valor), 0)
  INTO _total_vencido, _total_receber
  FROM public.fin_contas_receber
  WHERE company_id = v_company AND status != 'CANCELADO' AND data_vencimento >= p_start;

  SELECT COALESCE(AVG(EXTRACT(DAY FROM (data_pagamento::timestamp - data_vencimento::timestamp))), 0)
  INTO _prazo_pgto
  FROM public.fin_contas_pagar
  WHERE company_id = v_company AND status = 'PAGO'
    AND data_pagamento IS NOT NULL AND data_vencimento >= p_start;

  SELECT COALESCE(AVG(EXTRACT(DAY FROM (data_recebimento::timestamp - data_vencimento::timestamp))), 0)
  INTO _prazo_receb
  FROM public.fin_contas_receber
  WHERE company_id = v_company AND status = 'RECEBIDO'
    AND data_recebimento IS NOT NULL AND data_vencimento >= p_start;

  SELECT json_agg(row_to_json(t) ORDER BY t.mes) INTO _receita_por_mes
  FROM (
    SELECT mes,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0) AS receita,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0) AS despesa
    FROM (
      SELECT tipo, valor, to_char(data_competencia, 'YYYY-MM') AS mes
        FROM public.fin_lancamentos
        WHERE company_id = v_company AND tipo != 'TRANSFERENCIA'
          AND status IN ('REALIZADO', 'CONCILIADO')
          AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
          AND data_competencia >= p_start AND data_competencia <= p_end
      UNION ALL
      SELECT 'DESPESA', valor, to_char(COALESCE(data_competencia, data_vencimento), 'YYYY-MM')
        FROM public.fin_contas_pagar
        WHERE company_id = v_company AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
          AND COALESCE(data_competencia, data_vencimento) >= p_start
          AND COALESCE(data_competencia, data_vencimento) <= p_end
      UNION ALL
      SELECT 'RECEITA', valor, to_char(COALESCE(data_competencia, data_vencimento), 'YYYY-MM')
        FROM public.fin_contas_receber
        WHERE company_id = v_company AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
          AND COALESCE(data_competencia, data_vencimento) >= p_start
          AND COALESCE(data_competencia, data_vencimento) <= p_end
    ) y
    GROUP BY mes
  ) t;

  SELECT json_agg(row_to_json(t)) INTO _top_fornecedores
  FROM (
    SELECT COALESCE(fornecedor, 'N/A') AS nome, SUM(valor) AS total
    FROM public.fin_contas_pagar
    WHERE company_id = v_company AND status != 'CANCELADO' AND data_vencimento >= p_start
    GROUP BY COALESCE(fornecedor, 'N/A')
    ORDER BY total DESC
    LIMIT 8
  ) t;

  _result := json_build_object(
    'receita_total', _receita,
    'despesa_total', _despesa,
    'margem', CASE WHEN _receita > 0 THEN ((_receita - _despesa) / _receita) * 100 ELSE 0 END,
    'ticket_medio', CASE WHEN _total_lanc > 0 THEN _receita / _total_lanc ELSE 0 END,
    'total_lancamentos', _total_lanc,
    'inadimplencia', CASE WHEN _total_receber > 0 THEN (_total_vencido / _total_receber) * 100 ELSE 0 END,
    'total_vencido', _total_vencido,
    'prazo_medio_pagamento', _prazo_pgto,
    'prazo_medio_recebimento', _prazo_receb,
    'receita_por_mes', COALESCE(_receita_por_mes, '[]'::json),
    'top_fornecedores', COALESCE(_top_fornecedores, '[]'::json)
  );

  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_socios_resumo(p_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_company_id UUID;
  v_inicio DATE;
  v_fim DATE;
  v_receita NUMERIC := 0;
  v_despesa NUMERIC := 0;
  v_a_receber NUMERIC := 0;
  v_a_pagar NUMERIC := 0;
  v_top_despesas JSONB;
  v_top_receitas JSONB;
BEGIN
  -- Hardening: tenant via resolver canônico (substitui JOIN manual em profiles)
  v_company_id := public.assert_tenant();

  -- Hardening: checagem de permissão antes de qualquer query
  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:relatorio-socios:view',
    'finance:read',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Sem permissão (financeiro:relatorio-socios:view)';
  END IF;

  v_inicio := (p_mes || '-01')::DATE;
  v_fim := (date_trunc('month', v_inicio) + interval '1 month - 1 day')::DATE;

  SELECT
    COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END), 0)
  INTO v_receita, v_despesa
  FROM fin_lancamentos
  WHERE company_id = v_company_id
    AND status IN ('REALIZADO', 'CONCILIADO')
    AND tipo IN ('RECEITA', 'DESPESA')
    AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
    AND data_competencia >= v_inicio
    AND data_competencia <= v_fim;

  SELECT COALESCE(SUM(valor), 0) INTO v_a_receber
  FROM fin_contas_receber
  WHERE company_id = v_company_id
    AND status = 'A_RECEBER'
    AND data_vencimento >= v_inicio
    AND data_vencimento <= v_fim;

  SELECT COALESCE(SUM(valor), 0) INTO v_a_pagar
  FROM fin_contas_pagar
  WHERE company_id = v_company_id
    AND status IN ('APROVADO', 'AGUARDANDO_APROVACAO')
    AND data_vencimento >= v_inicio
    AND data_vencimento <= v_fim;

  WITH lancamentos_periodo AS (
    SELECT id, tipo, valor, categoria_id
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo = 'DESPESA'
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND data_competencia >= v_inicio
      AND data_competencia <= v_fim
  ),
  rateios_periodo AS (
    SELECT r.lancamento_id, r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    INNER JOIN lancamentos_periodo lp ON lp.id = r.lancamento_id
    WHERE r.company_id = v_company_id
  ),
  lancamentos_com_rateio AS (
    SELECT DISTINCT lancamento_id FROM rateios_periodo
  ),
  valores_por_cat AS (
    SELECT lp.categoria_id, lp.valor
    FROM lancamentos_periodo lp
    LEFT JOIN lancamentos_com_rateio lcr ON lcr.lancamento_id = lp.id
    WHERE lcr.lancamento_id IS NULL AND lp.categoria_id IS NOT NULL
    UNION ALL
    SELECT rp.categoria_id, rp.valor
    FROM rateios_periodo rp
    WHERE rp.categoria_id IS NOT NULL
  ),
  agrupado AS (
    SELECT
      COALESCE(c.nome, 'Sem categoria') AS nome,
      SUM(vpc.valor) AS total
    FROM valores_por_cat vpc
    LEFT JOIN fin_categorias c ON c.id = vpc.categoria_id AND c.company_id = v_company_id
    GROUP BY COALESCE(c.nome, 'Sem categoria')
    ORDER BY total DESC
    LIMIT 10
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', nome, 'valor', total)), '[]'::jsonb)
  INTO v_top_despesas
  FROM agrupado;

  WITH lancamentos_periodo AS (
    SELECT id, tipo, valor, categoria_id
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo = 'RECEITA'
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND data_competencia >= v_inicio
      AND data_competencia <= v_fim
  ),
  rateios_periodo AS (
    SELECT r.lancamento_id, r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    INNER JOIN lancamentos_periodo lp ON lp.id = r.lancamento_id
    WHERE r.company_id = v_company_id
  ),
  lancamentos_com_rateio AS (
    SELECT DISTINCT lancamento_id FROM rateios_periodo
  ),
  valores_por_cat AS (
    SELECT lp.categoria_id, lp.valor
    FROM lancamentos_periodo lp
    LEFT JOIN lancamentos_com_rateio lcr ON lcr.lancamento_id = lp.id
    WHERE lcr.lancamento_id IS NULL AND lp.categoria_id IS NOT NULL
    UNION ALL
    SELECT rp.categoria_id, rp.valor
    FROM rateios_periodo rp
    WHERE rp.categoria_id IS NOT NULL
  ),
  agrupado AS (
    SELECT
      COALESCE(c.nome, 'Sem categoria') AS nome,
      SUM(vpc.valor) AS total
    FROM valores_por_cat vpc
    LEFT JOIN fin_categorias c ON c.id = vpc.categoria_id AND c.company_id = v_company_id
    GROUP BY COALESCE(c.nome, 'Sem categoria')
    ORDER BY total DESC
    LIMIT 10
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', nome, 'valor', total)), '[]'::jsonb)
  INTO v_top_receitas
  FROM agrupado;

  RETURN jsonb_build_object(
    'receita', v_receita,
    'despesa', v_despesa,
    'resultado', v_receita - v_despesa,
    'aReceber', v_a_receber,
    'aPagar', v_a_pagar,
    'topDespesas', v_top_despesas,
    'topReceitas', v_top_receitas
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.comparativo_periodos(p_mes_a text, p_mes_b text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_inicio_a date;
  v_fim_a date;
  v_inicio_b date;
  v_fim_b date;
  v_pa jsonb;
  v_pb jsonb;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:comparativo:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_inicio_a := to_date(p_mes_a || '-01', 'YYYY-MM-DD');
  v_fim_a := (date_trunc('month', v_inicio_a) + interval '1 month' - interval '1 day')::date;
  v_inicio_b := to_date(p_mes_b || '-01', 'YYYY-MM-DD');
  v_fim_b := (date_trunc('month', v_inicio_b) + interval '1 month' - interval '1 day')::date;

  -- Period A
  WITH pa AS (
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END), 0) AS despesa,
      COUNT(*) AS total_lancamentos
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND tipo != 'TRANSFERENCIA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND data_competencia BETWEEN v_inicio_a AND v_fim_a
  )
  SELECT jsonb_build_object(
    'mes', p_mes_a,
    'receita', receita,
    'despesa', despesa,
    'resultado', receita - despesa,
    'margem', CASE WHEN receita > 0 THEN ((receita - despesa) / receita) * 100 ELSE 0 END,
    'total_lancamentos', total_lancamentos
  ) INTO v_pa FROM pa;

  -- Period B
  WITH pb AS (
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END), 0) AS despesa,
      COUNT(*) AS total_lancamentos
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND tipo != 'TRANSFERENCIA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND data_competencia BETWEEN v_inicio_b AND v_fim_b
  )
  SELECT jsonb_build_object(
    'mes', p_mes_b,
    'receita', receita,
    'despesa', despesa,
    'resultado', receita - despesa,
    'margem', CASE WHEN receita > 0 THEN ((receita - despesa) / receita) * 100 ELSE 0 END,
    'total_lancamentos', total_lancamentos
  ) INTO v_pb FROM pb;

  -- Build result
  v_result := jsonb_build_object(
    'periodo_a', v_pa,
    'periodo_b', v_pb,
    'variacoes', jsonb_build_object(
      'receita_pct', CASE WHEN (v_pb->>'receita')::numeric > 0 THEN (((v_pa->>'receita')::numeric - (v_pb->>'receita')::numeric) / (v_pb->>'receita')::numeric) * 100 ELSE 0 END,
      'despesa_pct', CASE WHEN (v_pb->>'despesa')::numeric > 0 THEN (((v_pa->>'despesa')::numeric - (v_pb->>'despesa')::numeric) / (v_pb->>'despesa')::numeric) * 100 ELSE 0 END,
      'resultado_pct', CASE WHEN ABS((v_pb->>'resultado')::numeric) > 0 THEN (((v_pa->>'resultado')::numeric - (v_pb->>'resultado')::numeric) / ABS((v_pb->>'resultado')::numeric)) * 100 ELSE 0 END,
      'margem_pp', (v_pa->>'margem')::numeric - (v_pb->>'margem')::numeric,
      'lancamentos_pct', CASE WHEN (v_pb->>'total_lancamentos')::numeric > 0 THEN (((v_pa->>'total_lancamentos')::numeric - (v_pb->>'total_lancamentos')::numeric) / (v_pb->>'total_lancamentos')::numeric) * 100 ELSE 0 END
    ),
    'grafico', jsonb_build_array(
      jsonb_build_object('indicador', 'Receita', 'periodo_a', (v_pa->>'receita')::numeric, 'periodo_b', (v_pb->>'receita')::numeric),
      jsonb_build_object('indicador', 'Despesa', 'periodo_a', (v_pa->>'despesa')::numeric, 'periodo_b', (v_pb->>'despesa')::numeric),
      jsonb_build_object('indicador', 'Resultado', 'periodo_a', (v_pa->>'resultado')::numeric, 'periodo_b', (v_pb->>'resultado')::numeric)
    ),
    'breakdown_categorias', COALESCE((
      WITH cat_a AS (
        SELECT
          COALESCE(c.nome, 'Sem categoria') AS categoria,
          SUM(COALESCE(r.valor, l.valor)) AS valor
        FROM fin_lancamentos l
        LEFT JOIN fin_lancamento_rateios r ON r.lancamento_id = l.id
        LEFT JOIN fin_categorias c ON c.id = COALESCE(r.categoria_id, l.categoria_id)
        WHERE l.company_id = v_company_id
          AND l.tipo = 'DESPESA'
          AND l.tipo != 'TRANSFERENCIA'
          AND l.status IN ('REALIZADO', 'CONCILIADO')
          AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
          AND l.data_competencia BETWEEN v_inicio_a AND v_fim_a
        GROUP BY COALESCE(c.nome, 'Sem categoria')
      ),
      cat_b AS (
        SELECT
          COALESCE(c.nome, 'Sem categoria') AS categoria,
          SUM(COALESCE(r.valor, l.valor)) AS valor
        FROM fin_lancamentos l
        LEFT JOIN fin_lancamento_rateios r ON r.lancamento_id = l.id
        LEFT JOIN fin_categorias c ON c.id = COALESCE(r.categoria_id, l.categoria_id)
        WHERE l.company_id = v_company_id
          AND l.tipo = 'DESPESA'
          AND l.tipo != 'TRANSFERENCIA'
          AND l.status IN ('REALIZADO', 'CONCILIADO')
          AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
          AND l.data_competencia BETWEEN v_inicio_b AND v_fim_b
        GROUP BY COALESCE(c.nome, 'Sem categoria')
      ),
      combined AS (
        SELECT
          COALESCE(a.categoria, b.categoria) AS categoria,
          COALESCE(a.valor, 0) AS valor_a,
          COALESCE(b.valor, 0) AS valor_b,
          CASE WHEN COALESCE(b.valor, 0) > 0 THEN ((COALESCE(a.valor, 0) - COALESCE(b.valor, 0)) / COALESCE(b.valor, 0)) * 100 ELSE 0 END AS variacao_pct
        FROM cat_a a
        FULL OUTER JOIN cat_b b ON a.categoria = b.categoria
      )
      SELECT jsonb_agg(jsonb_build_object(
        'categoria', categoria,
        'valor_a', valor_a,
        'valor_b', valor_b,
        'variacao_pct', variacao_pct
      ) ORDER BY ABS(COALESCE(valor_a, 0) - COALESCE(valor_b, 0)) DESC)
      FROM combined
      LIMIT 10
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;
