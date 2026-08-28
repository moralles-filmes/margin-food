-- Apresentação Sócios — Fase 3: Despesas.
-- Versão reconciliada com o histórico remoto após aplicação via MCP.
--
-- O helper interno abaixo é a única implementação das alocações efetivas do
-- DFC. O DFC público preserva a assinatura e o payload existentes, enquanto
-- as RPCs da apresentação agregam somente DESPESA no mesmo regime de caixa.

CREATE OR REPLACE FUNCTION public._fin_dfc_effective_allocations(
  p_company_id uuid,
  p_start date,
  p_end_inclusive date
)
RETURNS TABLE (
  allocation_id uuid,
  allocation_source text,
  lancamento_id uuid,
  categoria_id uuid,
  valor numeric,
  tipo text,
  effective_date date,
  descricao text,
  status text,
  origem text,
  entry_excluded_from_reports boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT
    allocation.id AS allocation_id,
    'allocation'::text AS allocation_source,
    ledger.id AS lancamento_id,
    allocation.categoria_id,
    allocation.valor,
    ledger.tipo,
    COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) AS effective_date,
    COALESCE(NULLIF(pg_catalog.btrim(ledger.descricao), ''), 'Lançamento sem descrição') AS descricao,
    ledger.status,
    ledger.origem,
    ledger.excluir_dos_relatorios AS entry_excluded_from_reports
  FROM public.fin_lancamento_rateios AS allocation
  JOIN public.fin_lancamentos AS ledger
    ON ledger.id = allocation.lancamento_id
   AND ledger.company_id = p_company_id
  WHERE allocation.company_id = p_company_id
    AND ledger.status IN ('REALIZADO', 'CONCILIADO')
    AND ledger.tipo <> 'TRANSFERENCIA'
    AND NOT (ledger.origem = 'conciliacao' AND ledger.conciliado IS NOT TRUE)
    AND (
      p_start IS NULL
      OR COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) >= p_start
    )
    AND (
      p_end_inclusive IS NULL
      OR COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) <= p_end_inclusive
    )

  UNION ALL

  SELECT
    ledger.id AS allocation_id,
    'entry'::text AS allocation_source,
    ledger.id AS lancamento_id,
    ledger.categoria_id,
    ledger.valor,
    ledger.tipo,
    COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) AS effective_date,
    COALESCE(NULLIF(pg_catalog.btrim(ledger.descricao), ''), 'Lançamento sem descrição') AS descricao,
    ledger.status,
    ledger.origem,
    ledger.excluir_dos_relatorios AS entry_excluded_from_reports
  FROM public.fin_lancamentos AS ledger
  WHERE ledger.company_id = p_company_id
    AND ledger.status IN ('REALIZADO', 'CONCILIADO')
    AND ledger.tipo <> 'TRANSFERENCIA'
    AND NOT (ledger.origem = 'conciliacao' AND ledger.conciliado IS NOT TRUE)
    AND (
      p_start IS NULL
      OR COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) >= p_start
    )
    AND (
      p_end_inclusive IS NULL
      OR COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) <= p_end_inclusive
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.fin_lancamento_rateios AS allocation
      WHERE allocation.lancamento_id = ledger.id
        AND allocation.company_id = p_company_id
    );
$function$;

REVOKE ALL ON FUNCTION public._fin_dfc_effective_allocations(uuid, date, date)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._fin_dfc_effective_allocations(uuid, date, date) IS
  'Helper interno do DFC: resolve data efetiva, elegibilidade e prevalência de rateio por tenant; sem EXECUTE para papéis da Data API.';

-- Refatoração estritamente equivalente: saldo inicial, permissões, categorias,
-- placeholders, ordenação e JSON público permanecem iguais à definição remota
-- inspecionada antes desta migration.
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

  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial
  FROM fin_contas WHERE company_id = v_company_id AND ativo = true;
  v_saldo_inicial := v_saldo_inicial + COALESCE((
    SELECT SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE -valor END)
    FROM fin_lancamentos
    WHERE company_id = v_company_id AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_inicio
  ), 0);

  WITH effective_values AS (
    SELECT allocation.categoria_id, allocation.valor, allocation.tipo
    FROM public._fin_dfc_effective_allocations(
      v_company_id,
      p_inicio,
      p_fim
    ) AS allocation
  ), por_categoria AS (
    SELECT CASE
      WHEN categoria_id IS NOT NULL THEN categoria_id::text
      WHEN tipo = 'RECEITA' THEN '00000000-0000-0000-0000-000000000101'
      ELSE '00000000-0000-0000-0000-000000000102'
    END cat_id, SUM(valor) total
    FROM effective_values GROUP BY 1
  ), categorias_resultado AS (
    SELECT c.id, c.nome, c.codigo, c.tipo, c.parent_id, c.ordem, c.ativo,
      c.grupo, c.linha_dre, c.centro_custo_padrao_id, c.system_key,
      c.excluir_dos_totais, c.updated_at
    FROM fin_categorias c WHERE c.company_id = v_company_id AND c.ativo = true
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000101'::uuid, 'Sem categoria — Receitas', 'S/C-R',
      'receita', NULL::uuid, 9980, true, NULL, NULL, NULL::uuid, NULL, false, now()
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000101')
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000102'::uuid, 'Sem categoria — Despesas', 'S/C-D',
      'despesa', NULL::uuid, 9981, true, NULL, NULL, NULL::uuid, NULL, false, now()
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000102')
  )
  SELECT jsonb_build_object(
    'saldo_inicial', v_saldo_inicial,
    'categorias', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.ordem, c.codigo) FROM categorias_resultado c), '[]'::jsonb),
    'valores_por_categoria', COALESCE((SELECT jsonb_object_agg(cat_id, total) FROM por_categoria), '{}'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_fin_dfc_summary(date, date) IS
  'DFC canônico por caixa; desde a Fase 3 da Apresentação Sócios consome o helper interno compartilhado sem alterar assinatura ou payload.';

CREATE OR REPLACE FUNCTION public.get_fin_presentation_expenses(
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
  v_rolling_start date;
  v_selected_year integer;
  v_selected_month integer;
  v_year_count integer;
  v_distinct_year_count integer;
  v_result jsonb;
BEGIN
  IF p_month IS NULL OR p_history_years IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22004',
      MESSAGE = 'PRESENTATION_EXPENSES_FILTER_REQUIRED';
  END IF;

  IF p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22007',
      MESSAGE = 'PRESENTATION_EXPENSES_MONTH_INVALID';
  END IF;

  v_selected_year := pg_catalog.substr(p_month, 1, 4)::integer;
  v_selected_month := pg_catalog.substr(p_month, 6, 2)::integer;
  IF v_selected_year < 1 OR v_selected_year > 9999 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22007',
      MESSAGE = 'PRESENTATION_EXPENSES_MONTH_INVALID';
  END IF;

  v_year_count := pg_catalog.cardinality(p_history_years);
  IF v_year_count IS NULL OR v_year_count < 1 OR v_year_count > 3 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PRESENTATION_EXPENSES_HISTORY_YEARS_LIMIT';
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
      MESSAGE = 'PRESENTATION_EXPENSES_HISTORY_YEAR_INVALID';
  END IF;

  SELECT pg_catalog.count(DISTINCT requested_year.year_value)::integer
  INTO v_distinct_year_count
  FROM pg_catalog.unnest(p_history_years) AS requested_year(year_value);

  IF v_distinct_year_count <> v_year_count THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PRESENTATION_EXPENSES_HISTORY_YEARS_DUPLICATED';
  END IF;

  v_current_start := pg_catalog.make_date(v_selected_year, v_selected_month, 1);
  v_current_end := (v_current_start + INTERVAL '1 month')::date;
  v_previous_start := (v_current_start - INTERVAL '1 month')::date;
  v_rolling_start := (v_current_start - INTERVAL '2 months')::date;

  v_company_id := public.assert_tenant();

  IF NOT (SELECT public.has_permission(auth.uid(), 'financeiro:relatorio-socios:view')) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;

  WITH RECURSIVE
  requested_years AS (
    SELECT requested_year.year_value
    FROM pg_catalog.unnest(p_history_years) AS requested_year(year_value)
    ORDER BY requested_year.year_value
  ),
  expense_allocations AS MATERIALIZED (
    SELECT allocation.*
    FROM public._fin_dfc_effective_allocations(
      v_company_id,
      NULL::date,
      NULL::date
    ) AS allocation
    WHERE allocation.tipo = 'DESPESA'
  ),
  coverage_bounds AS (
    SELECT
      pg_catalog.min(allocation.effective_date) AS min_date,
      pg_catalog.max(allocation.effective_date) AS max_date
    FROM expense_allocations AS allocation
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
      pg_catalog.count(allocation.allocation_id)::integer AS allocation_count,
      pg_catalog.count(DISTINCT allocation.lancamento_id)::integer AS quantity,
      pg_catalog.round(COALESCE(pg_catalog.sum(allocation.valor), 0::numeric), 2) AS total,
      pg_catalog.min(allocation.effective_date) AS first_entry_date,
      pg_catalog.max(allocation.effective_date) AS last_entry_date,
      bounds.min_date AS available_from,
      bounds.max_date AS available_through
    FROM period_definitions AS period
    CROSS JOIN coverage_bounds AS bounds
    LEFT JOIN expense_allocations AS allocation
      ON allocation.effective_date >= period.start_date
     AND allocation.effective_date < period.end_exclusive
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
        WHEN aggregate.allocation_count > 0 THEN 'available'::text
        WHEN aggregate.available_from IS NULL THEN 'unavailable'::text
        WHEN aggregate.start_date < pg_catalog.date_trunc('month', aggregate.available_from)::date
          OR aggregate.start_date > pg_catalog.date_trunc('month', aggregate.available_through)::date
          THEN 'unavailable'::text
        ELSE 'empty'::text
      END AS summary_state,
      CASE
        WHEN aggregate.allocation_count > 0 THEN pg_catalog.jsonb_build_object(
          'state', 'covered',
          'firstDate', aggregate.first_entry_date,
          'lastDate', aggregate.last_entry_date
        )
        WHEN aggregate.available_from IS NULL THEN pg_catalog.jsonb_build_object('state', 'no-history')
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
      period.summary_state,
      period.total,
      pg_catalog.jsonb_build_object(
        'state', period.summary_state,
        'month', period.period_month,
        'startDate', period.start_date,
        'endExclusive', period.end_exclusive,
        'total', period.total,
        'quantity', period.quantity,
        'coverage', period.coverage
      ) AS payload
    FROM period_classified AS period
  ),
  rolling_months AS (
    SELECT
      generated_month.month_start::date AS start_date,
      (generated_month.month_start + INTERVAL '1 month')::date AS end_exclusive
    FROM pg_catalog.generate_series(
      v_rolling_start::timestamp,
      v_current_start::timestamp,
      INTERVAL '1 month'
    ) AS generated_month(month_start)
  ),
  rolling_aggregates AS (
    SELECT
      month.start_date,
      month.end_exclusive,
      pg_catalog.count(allocation.allocation_id)::integer AS allocation_count,
      pg_catalog.count(DISTINCT allocation.lancamento_id)::integer AS quantity,
      pg_catalog.round(COALESCE(pg_catalog.sum(allocation.valor), 0::numeric), 2) AS total,
      bounds.min_date AS available_from,
      bounds.max_date AS available_through
    FROM rolling_months AS month
    CROSS JOIN coverage_bounds AS bounds
    LEFT JOIN expense_allocations AS allocation
      ON allocation.effective_date >= month.start_date
     AND allocation.effective_date < month.end_exclusive
    GROUP BY month.start_date, month.end_exclusive, bounds.min_date, bounds.max_date
  ),
  rolling_payload AS (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'yearMonth', pg_catalog.to_char(month.start_date, 'YYYY-MM'),
        'state', CASE
          WHEN month.allocation_count > 0 THEN 'available'
          WHEN month.available_from IS NULL THEN 'unavailable'
          WHEN month.start_date < pg_catalog.date_trunc('month', month.available_from)::date
            OR month.start_date > pg_catalog.date_trunc('month', month.available_through)::date
            THEN 'unavailable'
          ELSE 'empty'
        END,
        'total', month.total,
        'quantity', month.quantity
      )
      ORDER BY month.start_date
    ) AS items
    FROM rolling_aggregates AS month
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
      pg_catalog.count(allocation.allocation_id)::integer AS allocation_count,
      pg_catalog.count(DISTINCT allocation.lancamento_id)::integer AS quantity,
      pg_catalog.round(COALESCE(pg_catalog.sum(allocation.valor), 0::numeric), 2) AS total,
      bounds.min_date AS available_from,
      bounds.max_date AS available_through
    FROM history_months AS history
    CROSS JOIN coverage_bounds AS bounds
    LEFT JOIN expense_allocations AS allocation
      ON allocation.effective_date >= history.start_date
     AND allocation.effective_date < history.end_exclusive
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
          WHEN history.allocation_count > 0 THEN 'available'
          WHEN history.available_from IS NULL THEN 'unavailable'
          WHEN history.start_date < pg_catalog.date_trunc('month', history.available_from)::date
            OR history.start_date > pg_catalog.date_trunc('month', history.available_through)::date
            THEN 'unavailable'
          ELSE 'empty'
        END,
        'total', history.total,
        'quantity', history.quantity
      )
      ORDER BY history.year, history.month
    ) AS items
    FROM history_aggregates AS history
  ),
  current_allocations AS (
    SELECT allocation.*
    FROM expense_allocations AS allocation
    WHERE allocation.effective_date >= v_current_start
      AND allocation.effective_date < v_current_end
  ),
  category_definitions AS (
    SELECT
      category.id,
      category.parent_id,
      category.nome,
      category.codigo,
      COALESCE(category.ordem, 0) AS ordem,
      category.excluir_dos_totais
    FROM public.fin_categorias AS category
    WHERE category.company_id = v_company_id
      AND category.ativo = true
      AND pg_catalog.lower(category.tipo) = 'despesa'
  ),
  category_lineage AS (
    SELECT category.id AS descendant_id, category.id AS ancestor_id
    FROM category_definitions AS category
    UNION ALL
    SELECT lineage.descendant_id, parent.id AS ancestor_id
    FROM category_lineage AS lineage
    JOIN category_definitions AS current_category ON current_category.id = lineage.ancestor_id
    JOIN category_definitions AS parent ON parent.id = current_category.parent_id
  ),
  category_hierarchy AS (
    SELECT
      category.*,
      0 AS depth,
      ARRAY[category.id] AS category_path,
      ARRAY[
        pg_catalog.lpad(category.ordem::text, 10, '0')
          || ':' || COALESCE(category.codigo, '')
          || ':' || category.id::text
      ] AS sort_path
    FROM category_definitions AS category
    WHERE category.parent_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM category_definitions AS parent WHERE parent.id = category.parent_id
       )
    UNION ALL
    SELECT
      child.*,
      hierarchy.depth + 1,
      hierarchy.category_path || child.id,
      hierarchy.sort_path || (
        pg_catalog.lpad(child.ordem::text, 10, '0')
          || ':' || COALESCE(child.codigo, '')
          || ':' || child.id::text
      )
    FROM category_hierarchy AS hierarchy
    JOIN category_definitions AS child ON child.parent_id = hierarchy.id
    WHERE NOT child.id = ANY(hierarchy.category_path)
  ),
  category_direct AS (
    SELECT
      allocation.categoria_id,
      pg_catalog.round(pg_catalog.sum(allocation.valor), 2) AS direct_total,
      pg_catalog.count(allocation.allocation_id)::integer AS allocation_count
    FROM current_allocations AS allocation
    WHERE allocation.categoria_id IS NOT NULL
    GROUP BY allocation.categoria_id
  ),
  category_aggregates AS (
    SELECT
      lineage.ancestor_id AS category_id,
      pg_catalog.round(COALESCE(pg_catalog.sum(direct.direct_total), 0::numeric), 2) AS aggregate_total,
      COALESCE(pg_catalog.sum(direct.allocation_count), 0)::integer AS aggregate_count
    FROM category_lineage AS lineage
    LEFT JOIN category_direct AS direct ON direct.categoria_id = lineage.descendant_id
    GROUP BY lineage.ancestor_id
  ),
  uncategorized AS (
    SELECT
      pg_catalog.round(COALESCE(pg_catalog.sum(allocation.valor), 0::numeric), 2) AS total,
      pg_catalog.count(allocation.allocation_id)::integer AS allocation_count
    FROM current_allocations AS allocation
    WHERE allocation.categoria_id IS NULL
  ),
  tree_rows AS (
    SELECT
      pg_catalog.array_to_string(hierarchy.sort_path, '/') AS sort_key,
      pg_catalog.jsonb_build_object(
        'categoryId', hierarchy.id,
        'parentId', CASE
          WHEN hierarchy.parent_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM category_definitions AS parent WHERE parent.id = hierarchy.parent_id)
            THEN hierarchy.parent_id
          ELSE NULL::uuid
        END,
        'name', hierarchy.nome,
        'order', hierarchy.ordem,
        'operationalClass', CASE
          WHEN hierarchy.excluir_dos_totais IS TRUE THEN 'non-operational'
          ELSE 'operational'
        END,
        'directAmount', COALESCE(direct.direct_total, 0::numeric),
        'amount', aggregate.aggregate_total
      ) AS payload
    FROM category_hierarchy AS hierarchy
    JOIN category_aggregates AS aggregate
      ON aggregate.category_id = hierarchy.id
     AND aggregate.aggregate_count > 0
    LEFT JOIN category_direct AS direct ON direct.categoria_id = hierarchy.id

    UNION ALL

    SELECT
      '9999999999:Sem categoria — Despesas'::text,
      pg_catalog.jsonb_build_object(
        'categoryId', NULL::uuid,
        'parentId', NULL::uuid,
        'name', 'Sem categoria — Despesas',
        'order', 9981,
        'operationalClass', 'operational',
        'directAmount', uncategorized.total,
        'amount', uncategorized.total
      )
    FROM uncategorized
    WHERE uncategorized.allocation_count > 0
  ),
  tree_payload AS (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(tree.payload ORDER BY tree.sort_key),
      '[]'::jsonb
    ) AS items
    FROM tree_rows AS tree
  ),
  request_availability AS (
    SELECT CASE
      WHEN bounds.min_date IS NULL THEN 'unavailable'::text
      WHEN EXISTS (
        SELECT 1 FROM period_classified AS period WHERE period.allocation_count > 0
      ) OR EXISTS (
        SELECT 1 FROM history_aggregates AS history WHERE history.allocation_count > 0
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
      'report', 'DFC',
      'regime', 'caixa',
      'relations', pg_catalog.jsonb_build_array(
        'public.fin_lancamentos',
        'public.fin_lancamento_rateios'
      ),
      'dateField', 'COALESCE(data_pagamento, conciliado_em::date, data_competencia)',
      'label', 'Despesas financeiras — regime de caixa do DFC'
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
      END,
      'meaning', CASE
        WHEN current_period.summary_state <> 'available'
          OR previous_period.summary_state <> 'available' THEN 'unavailable'
        WHEN current_period.total > previous_period.total THEN 'increase'
        WHEN current_period.total < previous_period.total THEN 'reduction'
        ELSE 'unchanged'
      END,
      'favorability', CASE
        WHEN current_period.summary_state <> 'available'
          OR previous_period.summary_state <> 'available' THEN 'unavailable'
        WHEN current_period.total > previous_period.total THEN 'unfavorable'
        WHEN current_period.total < previous_period.total THEN 'favorable'
        ELSE 'neutral'
      END
    ),
    'rollingThreeMonths', rolling_payload.items,
    'history', history_payload.items,
    'tree', tree_payload.items
  )
  INTO v_result
  FROM coverage_bounds AS bounds
  CROSS JOIN requested_years_payload
  CROSS JOIN rolling_payload
  CROSS JOIN history_payload
  CROSS JOIN tree_payload
  CROSS JOIN request_availability
  CROSS JOIN period_payloads AS current_period
  CROSS JOIN period_payloads AS previous_period
  WHERE current_period.period_key = 'current'
    AND previous_period.period_key = 'previous';

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_presentation_expenses(text, integer[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_presentation_expenses(text, integer[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_fin_presentation_expenses(text, integer[]) IS
  'Apresentação Sócios Despesas v1.0: resumo, árvore DFC, janela móvel e histórico por caixa em uma chamada tenant-scoped.';

CREATE OR REPLACE FUNCTION public.get_fin_presentation_expense_details(
  p_month text,
  p_category_id uuid DEFAULT NULL,
  p_cursor jsonb DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_month_start date;
  v_month_end date;
  v_selected_year integer;
  v_selected_month integer;
  v_cursor_date date;
  v_cursor_ledger_id uuid;
  v_cursor_source text;
  v_cursor_allocation_id uuid;
  v_result jsonb;
BEGIN
  IF p_month IS NULL OR p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22007',
      MESSAGE = 'PRESENTATION_EXPENSE_DETAILS_MONTH_INVALID';
  END IF;

  v_selected_year := pg_catalog.substr(p_month, 1, 4)::integer;
  v_selected_month := pg_catalog.substr(p_month, 6, 2)::integer;
  IF v_selected_year < 1 OR v_selected_year > 9999 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22007',
      MESSAGE = 'PRESENTATION_EXPENSE_DETAILS_MONTH_INVALID';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PRESENTATION_EXPENSE_DETAILS_LIMIT_INVALID';
  END IF;

  IF p_cursor IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(p_cursor) <> 'object'
       OR p_cursor->>'state' <> 'available'
       OR p_cursor->>'effectiveDate' IS NULL
       OR p_cursor->>'ledgerId' IS NULL
       OR p_cursor->>'allocationSource' NOT IN ('allocation', 'entry')
       OR p_cursor->>'allocationId' IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'PRESENTATION_EXPENSE_DETAILS_CURSOR_INVALID';
    END IF;
    BEGIN
      v_cursor_date := (p_cursor->>'effectiveDate')::date;
      v_cursor_ledger_id := (p_cursor->>'ledgerId')::uuid;
      v_cursor_source := p_cursor->>'allocationSource';
      v_cursor_allocation_id := (p_cursor->>'allocationId')::uuid;
    EXCEPTION
      WHEN invalid_text_representation OR invalid_datetime_format THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'PRESENTATION_EXPENSE_DETAILS_CURSOR_INVALID';
    END;
  END IF;

  v_month_start := pg_catalog.make_date(v_selected_year, v_selected_month, 1);
  v_month_end := (v_month_start + INTERVAL '1 month')::date;
  v_company_id := public.assert_tenant();

  IF NOT (SELECT public.has_permission(auth.uid(), 'financeiro:relatorio-socios:view')) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.fin_categorias AS category
    WHERE category.id = p_category_id
      AND category.company_id = v_company_id
      AND category.ativo = true
      AND pg_catalog.lower(category.tipo) = 'despesa'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PRESENTATION_EXPENSE_CATEGORY_OUT_OF_SCOPE';
  END IF;

  WITH RECURSIVE
  selected_categories AS (
    SELECT category.id
    FROM public.fin_categorias AS category
    WHERE p_category_id IS NOT NULL
      AND category.id = p_category_id
      AND category.company_id = v_company_id
      AND category.ativo = true
      AND pg_catalog.lower(category.tipo) = 'despesa'
    UNION ALL
    SELECT child.id
    FROM public.fin_categorias AS child
    JOIN selected_categories AS parent ON child.parent_id = parent.id
    WHERE child.company_id = v_company_id
      AND child.ativo = true
      AND pg_catalog.lower(child.tipo) = 'despesa'
  ),
  filtered_rows AS MATERIALIZED (
    SELECT
      allocation.allocation_id,
      allocation.allocation_source,
      allocation.lancamento_id,
      allocation.categoria_id,
      allocation.valor,
      allocation.effective_date,
      allocation.descricao,
      allocation.status,
      allocation.origem,
      category.nome AS category_name,
      CASE
        WHEN category.excluir_dos_totais IS TRUE THEN 'non-operational'::text
        ELSE 'operational'::text
      END AS operational_class
    FROM public._fin_dfc_effective_allocations(
      v_company_id,
      v_month_start,
      (v_month_end - 1)
    ) AS allocation
    LEFT JOIN public.fin_categorias AS category
      ON category.id = allocation.categoria_id
     AND category.company_id = v_company_id
    WHERE allocation.tipo = 'DESPESA'
      AND (
        p_category_id IS NULL
        OR allocation.categoria_id IN (SELECT selected.id FROM selected_categories AS selected)
      )
      AND (
        p_cursor IS NULL
        OR (
          allocation.effective_date,
          allocation.lancamento_id,
          allocation.allocation_source,
          allocation.allocation_id
        ) < (
          v_cursor_date,
          v_cursor_ledger_id,
          v_cursor_source,
          v_cursor_allocation_id
        )
      )
    ORDER BY
      allocation.effective_date DESC,
      allocation.lancamento_id DESC,
      allocation.allocation_source DESC,
      allocation.allocation_id DESC
    LIMIT p_limit + 1
  ),
  page_rows AS (
    SELECT row.*
    FROM filtered_rows AS row
    ORDER BY
      row.effective_date DESC,
      row.lancamento_id DESC,
      row.allocation_source DESC,
      row.allocation_id DESC
    LIMIT p_limit
  ),
  page_last AS (
    SELECT row.*
    FROM page_rows AS row
    ORDER BY
      row.effective_date ASC,
      row.lancamento_id ASC,
      row.allocation_source ASC,
      row.allocation_id ASC
    LIMIT 1
  ),
  page_payload AS (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'allocationId', row.allocation_id,
          'allocationSource', row.allocation_source,
          'ledgerId', row.lancamento_id,
          'effectiveDate', row.effective_date,
          'description', row.descricao,
          'status', row.status,
          'origin', row.origem,
          'categoryId', row.categoria_id,
          'categoryName', COALESCE(row.category_name, 'Sem categoria — Despesas'),
          'operationalClass', row.operational_class,
          'amount', pg_catalog.round(row.valor, 2)
        )
        ORDER BY
          row.effective_date DESC,
          row.lancamento_id DESC,
          row.allocation_source DESC,
          row.allocation_id DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM page_rows AS row
  ),
  page_meta AS (
    SELECT (SELECT pg_catalog.count(*) FROM filtered_rows) > p_limit AS has_more
  )
  SELECT pg_catalog.jsonb_build_object(
    'contractVersion', '1.0',
    'source', pg_catalog.jsonb_build_object('report', 'DFC', 'regime', 'caixa'),
    'month', p_month,
    'categoryId', p_category_id,
    'limit', p_limit,
    'hasMore', meta.has_more,
    'nextCursor', CASE
      WHEN meta.has_more THEN (
        SELECT pg_catalog.jsonb_build_object(
          'state', 'available',
          'effectiveDate', last_row.effective_date,
          'ledgerId', last_row.lancamento_id,
          'allocationSource', last_row.allocation_source,
          'allocationId', last_row.allocation_id
        )
        FROM page_last AS last_row
      )
      ELSE pg_catalog.jsonb_build_object('state', 'end')
    END,
    'items', payload.items,
    'generatedAt', CURRENT_TIMESTAMP
  )
  INTO v_result
  FROM page_payload AS payload
  CROSS JOIN page_meta AS meta;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_presentation_expense_details(text, uuid, jsonb, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_presentation_expense_details(text, uuid, jsonb, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_fin_presentation_expense_details(text, uuid, jsonb, integer) IS
  'Drill-down paginado por cursor das alocações de despesa do DFC; categoria selecionada inclui descendentes e rateio prevalece.';

-- PL/pgSQL só resolve referências de coluna na primeira execução. Este bloco
-- força a validação do helper, do DFC refatorado e das duas RPCs novas durante
-- a migration, parando antes de retornar dados quando não há sessão tenant.
DO $validate_columns$
BEGIN
  PERFORM
    allocation.id,
    allocation.lancamento_id,
    allocation.categoria_id,
    allocation.valor,
    allocation.company_id
  FROM public.fin_lancamento_rateios AS allocation
  WHERE false;

  PERFORM
    ledger.id,
    ledger.company_id,
    ledger.tipo,
    ledger.valor,
    ledger.data_competencia,
    ledger.data_pagamento,
    ledger.conciliado_em,
    ledger.status,
    ledger.origem,
    ledger.conciliado,
    ledger.categoria_id,
    ledger.descricao,
    ledger.excluir_dos_relatorios
  FROM public.fin_lancamentos AS ledger
  WHERE false;

  PERFORM
    category.id,
    category.company_id,
    category.parent_id,
    category.nome,
    category.codigo,
    category.tipo,
    category.ordem,
    category.ativo,
    category.excluir_dos_totais
  FROM public.fin_categorias AS category
  WHERE false;

  PERFORM *
  FROM public._fin_dfc_effective_allocations(
    '00000000-0000-0000-0000-000000000001'::uuid,
    '2026-01-01'::date,
    '2026-01-31'::date
  )
  WHERE false;

  BEGIN
    PERFORM public.get_fin_dfc_summary('2026-01-01', '2026-01-31');
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  BEGIN
    PERFORM public.get_fin_presentation_expenses('2026-01', ARRAY[2026]);
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  BEGIN
    PERFORM public.get_fin_presentation_expense_details('2026-01', NULL, NULL, 25);
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END;
$validate_columns$;

NOTIFY pgrst, 'reload schema';
