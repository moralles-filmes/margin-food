-- ============================================================================
-- Etapa 2 / B — get_fin_kpis alinhado às regras do DRE
-- ----------------------------------------------------------------------------
-- receita_total / despesa_total / margem / ticket_medio / receita_por_mes passam
-- a considerar lançamentos REALIZADO/CONCILIADO + CP/CR EM ABERTO, por competência
-- (CP/CR: COALESCE(data_competencia, data_vencimento)) — igual ao get_fin_dre_summary.
-- inadimplência, total_vencido, prazos médios e top_fornecedores são métricas de
-- contas a pagar/receber (gestão) e permanecem inalterados.
-- Duas sobrecargas alinhadas: (p_meses int) usada pelo KPIsSection e (p_start,p_end).
-- ============================================================================

-- ── Sobrecarga por número de meses (usada pelo KPIsSection) ─────────────────
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

-- ── Sobrecarga por intervalo de datas (consistência) ────────────────────────
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
