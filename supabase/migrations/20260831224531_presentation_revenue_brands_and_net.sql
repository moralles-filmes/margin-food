-- Apresentação Sócios — Faturamento: detalhamento por marca e bruto x líquido.
--
-- get_fin_presentation_revenue passa a devolver, além do resumo bruto já
-- existente (financeiro_fechamento_caixa.faturamento_bruto):
--   * byBrand: faturamento bruto do mês selecionado quebrado por marca
--     cadastrada em financeiro_fechamento_marcas, reconciliando exatamente
--     com current.total (bucket "Sem detalhamento por marca" cobre
--     fechamentos legados sem linha em financeiro_fechamento_marca_valores).
--   * netRevenue: receita operacional líquida do livro razão (mesmo regime
--     de caixa e as mesmas exclusões de get_fin_presentation_socios) para o
--     mês selecionado e o mês anterior — comparável ao bruto acima.
--   * grossToNet: diferença absoluta e percentual entre bruto e líquido.
--
-- Assinatura da função não muda (CREATE OR REPLACE); nenhum dos campos já
-- existentes é alterado.

CREATE OR REPLACE FUNCTION public.get_fin_presentation_revenue(
  p_month text,
  p_history_years integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_current_start date;
  v_current_end date;
  v_previous_start date;
  v_selected_year integer;
  v_selected_month integer;
  v_year_count integer;
  v_distinct_year_count integer;
  v_result jsonb;
BEGIN
  IF p_month IS NULL OR p_history_years IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22004',
      MESSAGE = 'PRESENTATION_REVENUE_FILTER_REQUIRED';
  END IF;

  IF p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22007',
      MESSAGE = 'PRESENTATION_REVENUE_MONTH_INVALID';
  END IF;

  v_selected_year := pg_catalog.substr(p_month, 1, 4)::integer;
  v_selected_month := pg_catalog.substr(p_month, 6, 2)::integer;
  IF v_selected_year < 1 OR v_selected_year > 9999 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22007',
      MESSAGE = 'PRESENTATION_REVENUE_MONTH_INVALID';
  END IF;

  v_year_count := pg_catalog.cardinality(p_history_years);
  IF v_year_count IS NULL OR v_year_count < 1 OR v_year_count > 3 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PRESENTATION_REVENUE_HISTORY_YEARS_LIMIT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(p_history_years) AS requested_year(year_value)
    WHERE requested_year.year_value IS NULL
       OR requested_year.year_value < 1
       OR requested_year.year_value > 9999
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PRESENTATION_REVENUE_HISTORY_YEAR_INVALID';
  END IF;

  SELECT pg_catalog.count(DISTINCT requested_year.year_value)::integer
  INTO v_distinct_year_count
  FROM pg_catalog.unnest(p_history_years) AS requested_year(year_value);

  IF v_distinct_year_count <> v_year_count THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PRESENTATION_REVENUE_HISTORY_YEARS_DUPLICATED';
  END IF;

  v_current_start := pg_catalog.make_date(v_selected_year, v_selected_month, 1);
  v_current_end := (v_current_start + INTERVAL '1 month')::date;
  v_previous_start := (v_current_start - INTERVAL '1 month')::date;

  v_company_id := public.assert_tenant();

  IF NOT (SELECT public.has_permission(auth.uid(), 'financeiro:relatorio-socios:view')) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;

  WITH
  requested_years AS (
    SELECT requested_year.year_value
    FROM pg_catalog.unnest(p_history_years) AS requested_year(year_value)
    ORDER BY requested_year.year_value
  ),
  coverage_bounds AS (
    SELECT
      pg_catalog.min(closing.data) AS min_date,
      pg_catalog.max(closing.data) AS max_date
    FROM public.financeiro_fechamento_caixa AS closing
    WHERE closing.company_id = v_company_id
  ),
  period_definitions(period_key, period_month, start_date, end_exclusive, period_order) AS (
    VALUES
      ('current'::text, p_month, v_current_start, v_current_end, 1),
      (
        'previous'::text,
        pg_catalog.to_char(v_previous_start, 'YYYY-MM'),
        v_previous_start,
        v_current_start,
        2
      )
  ),
  period_aggregates AS (
    SELECT
      period.period_key,
      period.period_month,
      period.start_date,
      period.end_exclusive,
      period.period_order,
      pg_catalog.count(closing.id)::integer AS closing_count,
      pg_catalog.round(COALESCE(pg_catalog.sum(closing.faturamento_bruto), 0::numeric), 2) AS total,
      pg_catalog.min(closing.data) AS first_closing_date,
      pg_catalog.max(closing.data) AS last_closing_date,
      bounds.min_date AS available_from,
      bounds.max_date AS available_through
    FROM period_definitions AS period
    CROSS JOIN coverage_bounds AS bounds
    LEFT JOIN public.financeiro_fechamento_caixa AS closing
      ON closing.company_id = v_company_id
     AND closing.data >= period.start_date
     AND closing.data < period.end_exclusive
    GROUP BY
      period.period_key,
      period.period_month,
      period.start_date,
      period.end_exclusive,
      period.period_order,
      bounds.min_date,
      bounds.max_date
  ),
  period_classified AS (
    SELECT
      aggregate.*,
      CASE
        WHEN aggregate.closing_count > 0 THEN 'available'::text
        WHEN aggregate.available_from IS NULL THEN 'unavailable'::text
        WHEN aggregate.start_date < pg_catalog.date_trunc('month', aggregate.available_from)::date
          OR aggregate.start_date > pg_catalog.date_trunc('month', aggregate.available_through)::date
          THEN 'unavailable'::text
        ELSE 'empty'::text
      END AS summary_state,
      CASE
        WHEN aggregate.closing_count > 0 THEN pg_catalog.jsonb_build_object(
          'state', 'covered',
          'firstDate', aggregate.first_closing_date,
          'lastDate', aggregate.last_closing_date
        )
        WHEN aggregate.available_from IS NULL THEN pg_catalog.jsonb_build_object(
          'state', 'no-history'
        )
        WHEN aggregate.start_date < pg_catalog.date_trunc('month', aggregate.available_from)::date
          OR aggregate.start_date > pg_catalog.date_trunc('month', aggregate.available_through)::date
          THEN pg_catalog.jsonb_build_object(
            'state', 'outside-range',
            'availableFrom', aggregate.available_from,
            'availableThrough', aggregate.available_through
          )
        ELSE pg_catalog.jsonb_build_object(
          'state', 'gap',
          'availableFrom', aggregate.available_from,
          'availableThrough', aggregate.available_through
        )
      END AS coverage
    FROM period_aggregates AS aggregate
  ),
  period_payloads AS (
    SELECT
      period.period_key,
      period.period_order,
      period.summary_state,
      period.total,
      pg_catalog.jsonb_build_object(
        'state', period.summary_state,
        'month', period.period_month,
        'startDate', period.start_date,
        'endExclusive', period.end_exclusive,
        'total', period.total,
        'closingCount', period.closing_count,
        'coverage', period.coverage
      ) AS payload
    FROM period_classified AS period
  ),
  weekday_definitions(iso_weekday, label) AS (
    VALUES
      (1, 'Segunda-feira'::text),
      (2, 'Terça-feira'::text),
      (3, 'Quarta-feira'::text),
      (4, 'Quinta-feira'::text),
      (5, 'Sexta-feira'::text),
      (6, 'Sábado'::text),
      (7, 'Domingo'::text)
  ),
  weekday_aggregates AS (
    SELECT
      pg_catalog.date_part('isodow', closing.data)::integer AS iso_weekday,
      pg_catalog.count(closing.id)::integer AS occurrences,
      pg_catalog.round(pg_catalog.sum(closing.faturamento_bruto), 2) AS total
    FROM public.financeiro_fechamento_caixa AS closing
    WHERE closing.company_id = v_company_id
      AND closing.data >= v_current_start
      AND closing.data < v_current_end
    GROUP BY pg_catalog.date_part('isodow', closing.data)::integer
  ),
  weekday_payload AS (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'isoWeekday', weekday.iso_weekday,
        'label', weekday.label,
        'state', CASE WHEN COALESCE(aggregate.occurrences, 0) > 0 THEN 'available' ELSE 'empty' END,
        'total', COALESCE(aggregate.total, 0::numeric),
        'occurrences', COALESCE(aggregate.occurrences, 0),
        'average', CASE
          WHEN COALESCE(aggregate.occurrences, 0) > 0 THEN pg_catalog.jsonb_build_object(
            'state', 'available',
            'value', pg_catalog.round(aggregate.total / aggregate.occurrences, 2)
          )
          ELSE pg_catalog.jsonb_build_object(
            'state', 'unavailable',
            'reason', 'no-occurrences'
          )
        END
      )
      ORDER BY weekday.iso_weekday
    ) AS items
    FROM weekday_definitions AS weekday
    LEFT JOIN weekday_aggregates AS aggregate USING (iso_weekday)
  ),
  history_months AS (
    SELECT
      requested_year.year_value AS year,
      generated_month.month_value AS month,
      pg_catalog.make_date(requested_year.year_value, generated_month.month_value, 1) AS start_date,
      (pg_catalog.make_date(requested_year.year_value, generated_month.month_value, 1) + INTERVAL '1 month')::date AS end_exclusive
    FROM requested_years AS requested_year
    CROSS JOIN pg_catalog.generate_series(1, 12) AS generated_month(month_value)
  ),
  history_aggregates AS (
    SELECT
      history.year,
      history.month,
      history.start_date,
      history.end_exclusive,
      pg_catalog.count(closing.id)::integer AS closing_count,
      pg_catalog.round(COALESCE(pg_catalog.sum(closing.faturamento_bruto), 0::numeric), 2) AS total,
      bounds.min_date AS available_from,
      bounds.max_date AS available_through
    FROM history_months AS history
    CROSS JOIN coverage_bounds AS bounds
    LEFT JOIN public.financeiro_fechamento_caixa AS closing
      ON closing.company_id = v_company_id
     AND closing.data >= history.start_date
     AND closing.data < history.end_exclusive
    GROUP BY
      history.year,
      history.month,
      history.start_date,
      history.end_exclusive,
      bounds.min_date,
      bounds.max_date
  ),
  history_payload AS (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'year', history.year,
        'month', history.month,
        'yearMonth', pg_catalog.to_char(history.start_date, 'YYYY-MM'),
        'state', CASE
          WHEN history.closing_count > 0 THEN 'available'
          WHEN history.available_from IS NULL THEN 'unavailable'
          WHEN history.start_date < pg_catalog.date_trunc('month', history.available_from)::date
            OR history.start_date > pg_catalog.date_trunc('month', history.available_through)::date
            THEN 'unavailable'
          ELSE 'empty'
        END,
        'total', history.total,
        'closingCount', history.closing_count
      )
      ORDER BY history.year, history.month
    ) AS items
    FROM history_aggregates AS history
  ),
  request_availability AS (
    SELECT CASE
      WHEN bounds.min_date IS NULL THEN 'unavailable'::text
      WHEN EXISTS (
        SELECT 1 FROM period_classified AS period WHERE period.closing_count > 0
      ) OR EXISTS (
        SELECT 1 FROM history_aggregates AS history WHERE history.closing_count > 0
      ) THEN 'available'::text
      ELSE 'empty'::text
    END AS state
    FROM coverage_bounds AS bounds
  ),
  requested_years_payload AS (
    SELECT pg_catalog.jsonb_agg(requested_year.year_value ORDER BY requested_year.year_value) AS items
    FROM requested_years AS requested_year
  ),
  -- Detalhamento por marca do mês selecionado, reconciliado com o bruto.
  brand_closings AS (
    SELECT closing.id, closing.faturamento_bruto
    FROM public.financeiro_fechamento_caixa AS closing
    WHERE closing.company_id = v_company_id
      AND closing.data >= v_current_start
      AND closing.data < v_current_end
  ),
  brand_values AS (
    SELECT
      valor.marca_id,
      pg_catalog.round(pg_catalog.sum(valor.valor_bruto), 2) AS total,
      pg_catalog.count(DISTINCT valor.fechamento_id)::integer AS closing_count
    FROM public.financeiro_fechamento_marca_valores AS valor
    JOIN brand_closings AS closing ON closing.id = valor.fechamento_id
    WHERE valor.company_id = v_company_id
    GROUP BY valor.marca_id
  ),
  brand_definitions AS (
    SELECT marca.id, marca.nome, marca.ordem
    FROM public.financeiro_fechamento_marcas AS marca
    WHERE marca.company_id = v_company_id
  ),
  brand_rows AS (
    SELECT
      brand.id AS marca_id,
      brand.nome,
      brand.ordem,
      value.total,
      value.closing_count
    FROM brand_values AS value
    JOIN brand_definitions AS brand ON brand.id = value.marca_id
  ),
  -- Fechamentos do mês sem nenhuma linha de marca (legado) — cobre a
  -- diferença para o bruto total reconciliar exatamente.
  unassigned_closings AS (
    SELECT
      pg_catalog.round(COALESCE(pg_catalog.sum(closing.faturamento_bruto), 0::numeric), 2) AS total,
      pg_catalog.count(closing.id)::integer AS closing_count
    FROM brand_closings AS closing
    WHERE NOT EXISTS (
      SELECT 1 FROM public.financeiro_fechamento_marca_valores AS valor
      WHERE valor.company_id = v_company_id
        AND valor.fechamento_id = closing.id
    )
  ),
  by_brand_payload AS (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(item.payload ORDER BY item.sort_key),
      '[]'::jsonb
    ) AS items
    FROM (
      SELECT
        pg_catalog.lpad(row.ordem::text, 10, '0') || ':' || row.nome || ':' || row.marca_id::text AS sort_key,
        pg_catalog.jsonb_build_object(
          'marcaId', row.marca_id,
          'nome', row.nome,
          'total', row.total,
          'closingCount', row.closing_count
        ) AS payload
      FROM brand_rows AS row

      UNION ALL

      SELECT
        '9999999999:Sem detalhamento por marca'::text,
        pg_catalog.jsonb_build_object(
          'marcaId', NULL::uuid,
          'nome', 'Sem detalhamento por marca',
          'total', unassigned.total,
          'closingCount', unassigned.closing_count
        )
      FROM unassigned_closings AS unassigned
      WHERE unassigned.closing_count > 0
    ) AS item
  ),
  -- Receita operacional líquida (livro razão), mesma regra de
  -- get_fin_presentation_socios: caixa, exclui não operacional e excluído
  -- de relatório.
  net_ledger_entries AS (
    SELECT
      period.period_key,
      ledger.valor,
      ledger.categoria_id,
      ledger.excluir_dos_relatorios AS entry_excluded_from_reports
    FROM period_definitions AS period
    JOIN public.fin_lancamentos AS ledger
      ON ledger.company_id = v_company_id
     AND ledger.tipo = 'RECEITA'
     AND COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) >= period.start_date
     AND COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) < period.end_exclusive
    WHERE ledger.status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (ledger.origem = 'conciliacao' AND ledger.conciliado IS NOT TRUE)
  ),
  net_classified_entries AS (
    SELECT
      entry.period_key,
      entry.valor,
      CASE
        WHEN category.excluir_dos_totais IS TRUE THEN 'nonOperational'
        WHEN entry.entry_excluded_from_reports IS TRUE THEN 'excluded'
        ELSE 'operational'
      END AS section
    FROM net_ledger_entries AS entry
    LEFT JOIN public.fin_categorias AS category
      ON category.id = entry.categoria_id
     AND category.company_id = v_company_id
  ),
  net_period_totals AS (
    SELECT
      period.period_key,
      pg_catalog.round(COALESCE(pg_catalog.sum(entry.valor) FILTER (
        WHERE entry.section = 'operational'
      ), 0::numeric), 2) AS net_total
    FROM period_definitions AS period
    LEFT JOIN net_classified_entries AS entry ON entry.period_key = period.period_key
    GROUP BY period.period_key
  ),
  net_revenue_payload AS (
    SELECT
      pg_catalog.jsonb_build_object(
        'current', pg_catalog.jsonb_build_object(
          'month', p_month,
          'total', current_net.net_total
        ),
        'previous', pg_catalog.jsonb_build_object(
          'month', pg_catalog.to_char(v_previous_start, 'YYYY-MM'),
          'total', previous_net.net_total
        )
      ) AS payload,
      current_net.net_total AS current_net_total,
      previous_net.net_total AS previous_net_total
    FROM net_period_totals AS current_net
    CROSS JOIN net_period_totals AS previous_net
    WHERE current_net.period_key = 'current'
      AND previous_net.period_key = 'previous'
  ),
  gross_to_net_row AS (
    SELECT
      current_period.total AS current_gross,
      net.current_net_total AS current_net,
      previous_period.total AS previous_gross,
      net.previous_net_total AS previous_net
    FROM period_payloads AS current_period
    CROSS JOIN period_payloads AS previous_period
    CROSS JOIN net_revenue_payload AS net
    WHERE current_period.period_key = 'current'
      AND previous_period.period_key = 'previous'
  ),
  gross_to_net_payload AS (
    SELECT pg_catalog.jsonb_build_object(
      'current', pg_catalog.jsonb_build_object(
        'gross', row.current_gross,
        'net', row.current_net,
        'difference', pg_catalog.round(row.current_gross - row.current_net, 2),
        'differencePercent', CASE
          WHEN row.current_gross IS NULL OR row.current_gross <= 0 THEN pg_catalog.jsonb_build_object(
            'state', 'unavailable', 'reason', 'zero-baseline'
          )
          ELSE pg_catalog.jsonb_build_object(
            'state', 'available',
            'value', pg_catalog.round(((row.current_gross - row.current_net) / row.current_gross) * 100, 4)
          )
        END
      ),
      'previous', pg_catalog.jsonb_build_object(
        'gross', row.previous_gross,
        'net', row.previous_net,
        'difference', pg_catalog.round(row.previous_gross - row.previous_net, 2),
        'differencePercent', CASE
          WHEN row.previous_gross IS NULL OR row.previous_gross <= 0 THEN pg_catalog.jsonb_build_object(
            'state', 'unavailable', 'reason', 'zero-baseline'
          )
          ELSE pg_catalog.jsonb_build_object(
            'state', 'available',
            'value', pg_catalog.round(((row.previous_gross - row.previous_net) / row.previous_gross) * 100, 4)
          )
        END
      )
    ) AS payload
    FROM gross_to_net_row AS row
  )
  SELECT pg_catalog.jsonb_build_object(
    'contractVersion', '1.0',
    'source', pg_catalog.jsonb_build_object(
      'relation', 'public.financeiro_fechamento_caixa',
      'valueField', 'faturamento_bruto',
      'dateField', 'data',
      'label', 'Faturamento bruto — Fechamento de Caixa'
    ),
    'availability', request_availability.state,
    'selectedMonth', p_month,
    'previousMonth', pg_catalog.to_char(v_previous_start, 'YYYY-MM'),
    'requestedYears', requested_years_payload.items,
    'generatedAt', CURRENT_TIMESTAMP,
    'coverage', CASE
      WHEN bounds.min_date IS NULL THEN pg_catalog.jsonb_build_object('state', 'no-history')
      ELSE pg_catalog.jsonb_build_object(
        'state', 'available',
        'minDate', bounds.min_date,
        'maxDate', bounds.max_date
      )
    END,
    'current', current_period.payload,
    'previous', previous_period.payload,
    'delta', pg_catalog.jsonb_build_object(
      'absolute', CASE
        WHEN current_period.summary_state <> 'available' THEN pg_catalog.jsonb_build_object(
          'state', 'unavailable', 'reason', 'current-period-absent'
        )
        WHEN previous_period.summary_state <> 'available' THEN pg_catalog.jsonb_build_object(
          'state', 'unavailable', 'reason', 'previous-period-absent'
        )
        ELSE pg_catalog.jsonb_build_object(
          'state', 'available',
          'value', pg_catalog.round(current_period.total - previous_period.total, 2)
        )
      END,
      'percentage', CASE
        WHEN current_period.summary_state <> 'available' THEN pg_catalog.jsonb_build_object(
          'state', 'unavailable', 'reason', 'current-period-absent'
        )
        WHEN previous_period.summary_state <> 'available' THEN pg_catalog.jsonb_build_object(
          'state', 'unavailable', 'reason', 'previous-period-absent'
        )
        WHEN previous_period.total = 0 THEN pg_catalog.jsonb_build_object(
          'state', 'unavailable', 'reason', 'zero-baseline'
        )
        ELSE pg_catalog.jsonb_build_object(
          'state', 'available',
          'value', pg_catalog.round(
            ((current_period.total - previous_period.total) / previous_period.total) * 100,
            4
          )
        )
      END
    ),
    'weekdays', weekday_payload.items,
    'history', history_payload.items,
    'byBrand', by_brand_payload.items,
    'netRevenue', net_revenue_payload.payload,
    'grossToNet', gross_to_net_payload.payload
  )
  INTO v_result
  FROM coverage_bounds AS bounds
  CROSS JOIN requested_years_payload
  CROSS JOIN weekday_payload
  CROSS JOIN history_payload
  CROSS JOIN request_availability
  CROSS JOIN by_brand_payload
  CROSS JOIN net_revenue_payload
  CROSS JOIN gross_to_net_payload
  CROSS JOIN period_payloads AS current_period
  CROSS JOIN period_payloads AS previous_period
  WHERE current_period.period_key = 'current'
    AND previous_period.period_key = 'previous';

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_presentation_revenue(text, integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_presentation_revenue(text, integer[])
  TO authenticated, service_role;

-- PL/pgSQL valida as referências de coluna na primeira execução. O bloco
-- resolve explicitamente as colunas novas e executa a função até a barreira
-- de tenant quando a migration roda sem uma sessão autenticada.
DO $validate_columns$
BEGIN
  PERFORM
    closing.id,
    closing.company_id,
    closing.data,
    closing.faturamento_bruto
  FROM public.financeiro_fechamento_caixa AS closing
  WHERE false;

  PERFORM
    marca.id,
    marca.company_id,
    marca.nome,
    marca.ordem
  FROM public.financeiro_fechamento_marcas AS marca
  WHERE false;

  PERFORM
    valor.company_id,
    valor.fechamento_id,
    valor.marca_id,
    valor.valor_bruto
  FROM public.financeiro_fechamento_marca_valores AS valor
  WHERE false;

  PERFORM
    ledger.id,
    ledger.company_id,
    ledger.tipo,
    ledger.valor,
    ledger.categoria_id,
    ledger.data_competencia,
    ledger.data_pagamento,
    ledger.conciliado_em,
    ledger.status,
    ledger.origem,
    ledger.conciliado,
    ledger.excluir_dos_relatorios
  FROM public.fin_lancamentos AS ledger
  WHERE false;

  PERFORM
    category.id,
    category.company_id,
    category.excluir_dos_totais
  FROM public.fin_categorias AS category
  WHERE false;

  BEGIN
    PERFORM public.get_fin_presentation_revenue('2026-01', ARRAY[2024, 2025, 2026]);
  EXCEPTION
    WHEN raise_exception THEN NULL;
  END;
END;
$validate_columns$;

COMMENT ON FUNCTION public.get_fin_presentation_revenue(text, integer[]) IS
  'Apresentação Sócios Faturamento v1.1: agrega financeiro_fechamento_caixa.faturamento_bruto por tenant, mês, dia da semana e até três anos distintos; inclui detalhamento por marca (byBrand, reconciliado com o bruto) e comparação bruto x receita operacional líquida do livro razão (netRevenue/grossToNet).';

NOTIFY pgrst, 'reload schema';
