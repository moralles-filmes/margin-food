-- Corrige get_fin_kpis(integer): "Top Fornecedores" referenciava s.nome, mas a
-- coluna real de suppliers é s.name (nunca existiu s.nome nessa tabela).
-- Bug introduzido na criação original da função (20260315054300) e carregado
-- adiante em todo CREATE OR REPLACE subsequente (20260610130100, 20260806220000).
-- PL/pgSQL só valida a coluna na 1a execução da query, então o erro só aparecia
-- em runtime (42703 column s.nome does not exist -> 400 no PostgREST), nunca no
-- CREATE FUNCTION/db push. Submódulo KPIs do Financeiro ficou quebrado desde então.
CREATE OR REPLACE FUNCTION public.get_fin_kpis(p_meses integer DEFAULT 6)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- Top fornecedores (CP por vencimento) — s.name (nunca existiu s.nome em suppliers)
  SELECT json_agg(row_to_json(t)) INTO _top_fornecedores
  FROM (
    SELECT
      COALESCE(s.name, TRIM(UPPER(cp.fornecedor)), 'N/A') AS nome,
      SUM(cp.valor) AS total
    FROM fin_contas_pagar cp
    LEFT JOIN suppliers s ON s.id = cp.supplier_id
    WHERE cp.company_id = v_company AND cp.status != 'CANCELADO'
      AND cp.data_vencimento >= v_start
    GROUP BY COALESCE(s.name, TRIM(UPPER(cp.fornecedor)), 'N/A')
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
