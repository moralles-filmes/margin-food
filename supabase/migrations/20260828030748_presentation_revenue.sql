-- Apresentação Sócios — Fase 2: Faturamento.
-- Versão reconciliada com o histórico remoto após aplicação via MCP.
--
-- A única fonte financeira desta função é
-- public.financeiro_fechamento_caixa.faturamento_bruto. O detalhamento por
-- marcas não participa da agregação e as RPCs de DRE/DFC permanecem intactas.

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
    'history', history_payload.items
  )
  INTO v_result
  FROM coverage_bounds AS bounds
  CROSS JOIN requested_years_payload
  CROSS JOIN weekday_payload
  CROSS JOIN history_payload
  CROSS JOIN request_availability
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
-- resolve explicitamente as colunas e executa a função até a barreira de
-- tenant quando a migration roda sem uma sessão autenticada.
DO $validate_columns$
BEGIN
  PERFORM
    closing.id,
    closing.company_id,
    closing.data,
    closing.faturamento_bruto
  FROM public.financeiro_fechamento_caixa AS closing
  WHERE false;

  BEGIN
    PERFORM public.get_fin_presentation_revenue('2026-01', ARRAY[2024, 2025, 2026]);
  EXCEPTION
    WHEN raise_exception THEN NULL;
  END;
END;
$validate_columns$;

COMMENT ON FUNCTION public.get_fin_presentation_revenue(text, integer[]) IS
  'Apresentação Sócios Faturamento v1.0: agrega somente financeiro_fechamento_caixa.faturamento_bruto por tenant, mês, dia da semana e até três anos distintos.';

NOTIFY pgrst, 'reload schema';
