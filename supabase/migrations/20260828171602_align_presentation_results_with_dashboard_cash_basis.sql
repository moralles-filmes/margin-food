-- Alinha a Apresentação Sócios ao regime de caixa efetivo do Dashboard.
-- A data canônica é pagamento -> conciliação -> competência (fallback).
-- Mantém assinatura, tenant, RBAC, rateio e separação não operacional.
--
-- Definição-base originalmente criada na Fase 2.
--
-- Contrato de domínio: src/domain/financeiro/presentation/
-- Transporte: a RPC recebe os três intervalos já normalizados (início
-- inclusivo/fim exclusivo) e devolve somente agregados. A hierarquia é
-- representada por parentCategoryId/path e por valores direto/acumulado; a
-- Fase 3 poderá montar os nós aninhados sem baixar lançamentos ou rateios.
--
-- Nenhuma RPC de DRE/DFC ou materialized view é reutilizada/alterada.

CREATE OR REPLACE FUNCTION public.get_fin_presentation_socios(
  p_start date,
  p_end_exclusive date,
  p_previous_start date,
  p_previous_end_exclusive date,
  p_previous_year_start date,
  p_previous_year_end_exclusive date,
  p_granularity text DEFAULT 'month',
  p_ranking_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_result jsonb;
BEGIN
  IF p_start IS NULL
     OR p_end_exclusive IS NULL
     OR p_previous_start IS NULL
     OR p_previous_end_exclusive IS NULL
     OR p_previous_year_start IS NULL
     OR p_previous_year_end_exclusive IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22004',
      MESSAGE = 'PRESENTATION_PERIOD_REQUIRED';
  END IF;

  IF p_start >= p_end_exclusive
     OR p_previous_start >= p_previous_end_exclusive
     OR p_previous_year_start >= p_previous_year_end_exclusive THEN
    RAISE EXCEPTION USING
      ERRCODE = '22007',
      MESSAGE = 'PRESENTATION_PERIOD_INVALID';
  END IF;

  IF p_granularity IS NULL OR p_granularity NOT IN ('day', 'month', 'year') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PRESENTATION_GRANULARITY_INVALID';
  END IF;

  IF p_ranking_limit IS NULL OR p_ranking_limit < 1 OR p_ranking_limit > 50 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PRESENTATION_RANKING_LIMIT_INVALID';
  END IF;

  v_company_id := public.assert_tenant();

  IF NOT (SELECT public.has_permission(auth.uid(), 'financeiro:relatorio-socios:view')) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;

  WITH RECURSIVE
  requested_ranges(period_key, start_date, end_exclusive, period_order) AS (
    VALUES
      ('current'::text, p_start, p_end_exclusive, 1),
      ('previousPeriod'::text, p_previous_start, p_previous_end_exclusive, 2),
      ('previousYear'::text, p_previous_year_start, p_previous_year_end_exclusive, 3)
  ),
  categories AS (
    SELECT
      c.id,
      c.parent_id,
      c.nome,
      CASE
        WHEN lower(c.tipo) = 'receita' THEN 'RECEITA'::text
        WHEN lower(c.tipo) = 'despesa' THEN 'DESPESA'::text
        ELSE NULL::text
      END AS nature,
      c.excluir_dos_totais AS excluded_from_totals,
      COALESCE(c.ordem, 0) AS sort_order
    FROM public.fin_categorias c
    WHERE c.company_id = v_company_id
      AND lower(c.tipo) IN ('receita', 'despesa')
  ),
  category_paths AS (
    SELECT
      c.id,
      c.parent_id,
      c.nome,
      c.nature,
      c.excluded_from_totals,
      c.sort_order,
      ARRAY[c.id]::uuid[] AS path_ids,
      ARRAY[c.sort_order]::integer[] AS path_orders,
      ARRAY[c.nome]::text[] AS path_names,
      0 AS depth
    FROM categories c
    WHERE NOT EXISTS (
      SELECT 1
      FROM categories parent
      WHERE parent.id = c.parent_id
        AND parent.nature = c.nature
        AND parent.excluded_from_totals = c.excluded_from_totals
    )

    UNION ALL

    SELECT
      child.id,
      child.parent_id,
      child.nome,
      child.nature,
      child.excluded_from_totals,
      child.sort_order,
      parent.path_ids || child.id,
      parent.path_orders || child.sort_order,
      parent.path_names || child.nome,
      parent.depth + 1
    FROM category_paths parent
    JOIN categories child
      ON child.parent_id = parent.id
     AND child.nature = parent.nature
     AND child.excluded_from_totals = parent.excluded_from_totals
    WHERE NOT child.id = ANY(parent.path_ids)
  ),
  category_closure AS (
    SELECT
      c.id AS ancestor_id,
      c.id AS descendant_id,
      c.nature,
      c.excluded_from_totals,
      ARRAY[c.id]::uuid[] AS visited
    FROM categories c

    UNION ALL

    SELECT
      closure.ancestor_id,
      child.id,
      closure.nature,
      closure.excluded_from_totals,
      closure.visited || child.id
    FROM category_closure closure
    JOIN categories child
      ON child.parent_id = closure.descendant_id
     AND child.nature = closure.nature
     AND child.excluded_from_totals = closure.excluded_from_totals
    WHERE NOT child.id = ANY(closure.visited)
  ),
  ledger_entries AS (
    SELECT
      requested.period_key,
      requested.period_order,
      requested.start_date,
      requested.end_exclusive,
      ledger.id,
      ledger.tipo,
      ledger.valor,
      COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) AS effective_date,
      ledger.categoria_id,
      ledger.excluir_dos_relatorios AS entry_excluded_from_reports
    FROM requested_ranges requested
    JOIN public.fin_lancamentos ledger
      ON ledger.company_id = v_company_id
     AND COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) >= requested.start_date
     AND COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) < requested.end_exclusive
    WHERE ledger.status IN ('REALIZADO', 'CONCILIADO')
      AND ledger.tipo IN ('RECEITA', 'DESPESA')
      AND NOT (ledger.origem = 'conciliacao' AND ledger.conciliado IS NOT TRUE)
  ),
  resolved_amounts AS (
    -- A existência de rateio elimina integralmente o cabeçalho da composição.
    SELECT
      ledger.period_key,
      ledger.period_order,
      ledger.id AS entry_id,
      ledger.tipo AS nature,
      ledger.effective_date,
      rateio.categoria_id,
      rateio.valor AS amount,
      ledger.entry_excluded_from_reports,
      'allocation'::text AS source
    FROM ledger_entries ledger
    JOIN public.fin_lancamento_rateios rateio
      ON rateio.company_id = v_company_id
     AND rateio.lancamento_id = ledger.id

    UNION ALL

    SELECT
      ledger.period_key,
      ledger.period_order,
      ledger.id,
      ledger.tipo,
      ledger.effective_date,
      ledger.categoria_id,
      ledger.valor,
      ledger.entry_excluded_from_reports,
      'entry-category'::text
    FROM ledger_entries ledger
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.fin_lancamento_rateios rateio
      WHERE rateio.company_id = v_company_id
        AND rateio.lancamento_id = ledger.id
    )
  ),
  classified_amounts AS (
    SELECT
      resolved.period_key,
      resolved.period_order,
      resolved.entry_id,
      resolved.nature,
      resolved.effective_date,
      CASE WHEN category.nature = resolved.nature THEN category.id ELSE NULL END AS category_id,
      resolved.amount,
      resolved.source,
      CASE
        WHEN category.excluded_from_totals IS TRUE THEN 'nonOperational'::text
        WHEN resolved.entry_excluded_from_reports IS NOT TRUE THEN 'operational'::text
        ELSE 'excluded'::text
      END AS section
    FROM resolved_amounts resolved
    LEFT JOIN categories category ON category.id = resolved.categoria_id
  ),
  period_metrics AS (
    SELECT
      requested.period_key,
      round(COALESCE(SUM(amount.amount) FILTER (
        WHERE amount.section = 'operational' AND amount.nature = 'RECEITA'
      ), 0), 2) AS revenue,
      round(COALESCE(SUM(amount.amount) FILTER (
        WHERE amount.section = 'operational' AND amount.nature = 'DESPESA'
      ), 0), 2) AS expense
    FROM requested_ranges requested
    LEFT JOIN classified_amounts amount ON amount.period_key = requested.period_key
    GROUP BY requested.period_key
  ),
  non_operational_metrics AS (
    SELECT
      requested.period_key,
      round(COALESCE(SUM(amount.amount) FILTER (
        WHERE amount.section = 'nonOperational' AND amount.nature = 'RECEITA'
      ), 0), 2) AS revenue,
      round(COALESCE(SUM(amount.amount) FILTER (
        WHERE amount.section = 'nonOperational' AND amount.nature = 'DESPESA'
      ), 0), 2) AS expense
    FROM requested_ranges requested
    LEFT JOIN classified_amounts amount ON amount.period_key = requested.period_key
    GROUP BY requested.period_key
  ),
  open_item_rows AS (
    SELECT
      requested.period_key,
      'accountsPayableOpen'::text AS item_kind,
      payable.valor AS amount
    FROM requested_ranges requested
    JOIN public.fin_contas_pagar payable
      ON payable.company_id = v_company_id
     AND payable.data_vencimento >= requested.start_date
     AND payable.data_vencimento < requested.end_exclusive
    WHERE payable.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND payable.excluir_dos_relatorios IS NOT TRUE

    UNION ALL

    SELECT
      requested.period_key,
      'accountsReceivableOpen'::text,
      receivable.valor
    FROM requested_ranges requested
    JOIN public.fin_contas_receber receivable
      ON receivable.company_id = v_company_id
     AND receivable.data_vencimento >= requested.start_date
     AND receivable.data_vencimento < requested.end_exclusive
    WHERE receivable.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND receivable.excluir_dos_relatorios IS NOT TRUE
  ),
  open_item_metrics AS (
    SELECT
      requested.period_key,
      round(COALESCE(SUM(item.amount) FILTER (
        WHERE item.item_kind = 'accountsPayableOpen'
      ), 0), 2) AS payable_amount,
      COUNT(*) FILTER (WHERE item.item_kind = 'accountsPayableOpen')::bigint AS payable_count,
      round(COALESCE(SUM(item.amount) FILTER (
        WHERE item.item_kind = 'accountsReceivableOpen'
      ), 0), 2) AS receivable_amount,
      COUNT(*) FILTER (WHERE item.item_kind = 'accountsReceivableOpen')::bigint AS receivable_count
    FROM requested_ranges requested
    LEFT JOIN open_item_rows item ON item.period_key = requested.period_key
    GROUP BY requested.period_key
  ),
  series_buckets AS (
    SELECT
      requested.period_key,
      generated.bucket_anchor::date AS bucket_anchor,
      GREATEST(generated.bucket_anchor::date, requested.start_date) AS bucket_start,
      LEAST(
        CASE p_granularity
          WHEN 'day' THEN (generated.bucket_anchor + interval '1 day')::date
          WHEN 'month' THEN (generated.bucket_anchor + interval '1 month')::date
          ELSE (generated.bucket_anchor + interval '1 year')::date
        END,
        requested.end_exclusive
      ) AS bucket_end_exclusive
    FROM requested_ranges requested
    CROSS JOIN LATERAL pg_catalog.generate_series(
      pg_catalog.date_trunc(p_granularity, requested.start_date::timestamp),
      pg_catalog.date_trunc(p_granularity, (requested.end_exclusive - 1)::timestamp),
      CASE p_granularity
        WHEN 'day' THEN interval '1 day'
        WHEN 'month' THEN interval '1 month'
        ELSE interval '1 year'
      END
    ) AS generated(bucket_anchor)
  ),
  series_metrics AS (
    SELECT
      bucket.period_key,
      bucket.bucket_anchor,
      bucket.bucket_start,
      bucket.bucket_end_exclusive,
      round(COALESCE(SUM(amount.amount) FILTER (
        WHERE amount.nature = 'RECEITA'
      ), 0), 2) AS revenue,
      round(COALESCE(SUM(amount.amount) FILTER (
        WHERE amount.nature = 'DESPESA'
      ), 0), 2) AS expense
    FROM series_buckets bucket
    LEFT JOIN classified_amounts amount
      ON amount.period_key = bucket.period_key
     AND amount.section = 'operational'
     AND amount.effective_date >= bucket.bucket_start
     AND amount.effective_date < bucket.bucket_end_exclusive
    GROUP BY
      bucket.period_key,
      bucket.bucket_anchor,
      bucket.bucket_start,
      bucket.bucket_end_exclusive
  ),
  series_by_period AS (
    SELECT
      requested.period_key,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'key', CASE p_granularity
              WHEN 'day' THEN to_char(series.bucket_anchor, 'YYYY-MM-DD')
              WHEN 'month' THEN to_char(series.bucket_anchor, 'YYYY-MM')
              ELSE to_char(series.bucket_anchor, 'YYYY')
            END,
            'label', CASE p_granularity
              WHEN 'day' THEN to_char(series.bucket_anchor, 'YYYY-MM-DD')
              WHEN 'month' THEN to_char(series.bucket_anchor, 'YYYY-MM')
              ELSE to_char(series.bucket_anchor, 'YYYY')
            END,
            'start', series.bucket_start,
            'endExclusive', series.bucket_end_exclusive,
            'metrics', jsonb_build_object(
              'revenue', series.revenue,
              'expense', series.expense,
              'result', round(series.revenue - series.expense, 2),
              'marginPercent', CASE
                WHEN series.revenue = 0 THEN 0
                ELSE ((series.revenue - series.expense) / series.revenue) * 100
              END
            )
          )
          ORDER BY series.bucket_anchor
        ) FILTER (WHERE series.period_key IS NOT NULL),
        '[]'::jsonb
      ) AS points
    FROM requested_ranges requested
    LEFT JOIN series_metrics series ON series.period_key = requested.period_key
    GROUP BY requested.period_key
  ),
  category_direct_amounts AS (
    SELECT
      amount.period_key,
      amount.nature,
      amount.section,
      amount.category_id,
      round(SUM(amount.amount), 2) AS direct_amount
    FROM classified_amounts amount
    WHERE amount.section IN ('operational', 'nonOperational')
    GROUP BY amount.period_key, amount.nature, amount.section, amount.category_id
  ),
  category_section_totals AS (
    SELECT
      direct.period_key,
      direct.nature,
      direct.section,
      round(SUM(direct.direct_amount), 2) AS section_total
    FROM category_direct_amounts direct
    GROUP BY direct.period_key, direct.nature, direct.section
  ),
  category_rollups AS (
    SELECT
      direct.period_key,
      direct.nature,
      direct.section,
      closure.ancestor_id AS category_id,
      round(SUM(direct.direct_amount), 2) AS amount
    FROM category_direct_amounts direct
    JOIN category_closure closure
      ON closure.descendant_id = direct.category_id
     AND closure.nature = direct.nature
     AND closure.excluded_from_totals = (direct.section = 'nonOperational')
    WHERE direct.category_id IS NOT NULL
    GROUP BY direct.period_key, direct.nature, direct.section, closure.ancestor_id
  ),
  composition_items AS (
    SELECT
      rollup.period_key,
      rollup.nature,
      rollup.section,
      path.id AS category_id,
      path.parent_id AS parent_category_id,
      path.nome AS name,
      path.sort_order,
      path.depth,
      path.path_ids,
      path.path_orders,
      path.path_names,
      COALESCE(direct.direct_amount, 0::numeric) AS direct_amount,
      rollup.amount,
      CASE
        WHEN total.section_total = 0 THEN 0
        ELSE (rollup.amount / total.section_total) * 100
      END AS share_percent
    FROM category_rollups rollup
    JOIN category_paths path
      ON path.id = rollup.category_id
     AND path.nature = rollup.nature
     AND path.excluded_from_totals = (rollup.section = 'nonOperational')
    LEFT JOIN category_direct_amounts direct
      ON direct.period_key = rollup.period_key
     AND direct.nature = rollup.nature
     AND direct.section = rollup.section
     AND direct.category_id = rollup.category_id
    JOIN category_section_totals total
      ON total.period_key = rollup.period_key
     AND total.nature = rollup.nature
     AND total.section = rollup.section
    WHERE rollup.amount <> 0

    UNION ALL

    SELECT
      direct.period_key,
      direct.nature,
      direct.section,
      NULL::uuid,
      NULL::uuid,
      CASE direct.nature
        WHEN 'RECEITA' THEN 'Sem categoria — Receitas'
        ELSE 'Sem categoria — Despesas'
      END,
      2147483647,
      0,
      ARRAY[]::uuid[],
      ARRAY[2147483647]::integer[],
      ARRAY[CASE direct.nature
        WHEN 'RECEITA' THEN 'Sem categoria — Receitas'
        ELSE 'Sem categoria — Despesas'
      END]::text[],
      direct.direct_amount,
      direct.direct_amount,
      CASE
        WHEN total.section_total = 0 THEN 0
        ELSE (direct.direct_amount / total.section_total) * 100
      END
    FROM category_direct_amounts direct
    JOIN category_section_totals total
      ON total.period_key = direct.period_key
     AND total.nature = direct.nature
     AND total.section = direct.section
    WHERE direct.category_id IS NULL
      AND direct.direct_amount <> 0
  ),
  composition_by_period AS (
    SELECT
      requested.period_key,
      jsonb_build_object(
        'operational', jsonb_build_object(
          'revenue', COALESCE(jsonb_agg(
            jsonb_build_object(
              'categoryId', item.category_id,
              'parentCategoryId', item.parent_category_id,
              'name', item.name,
              'nature', item.nature,
              'order', item.sort_order,
              'depth', item.depth,
              'path', item.path_ids,
              'directAmount', item.direct_amount,
              'amount', item.amount,
              'sharePercent', item.share_percent
            ) ORDER BY item.path_orders, item.path_names
          ) FILTER (
            WHERE item.period_key IS NOT NULL
              AND item.section = 'operational'
              AND item.nature = 'RECEITA'
          ), '[]'::jsonb),
          'expense', COALESCE(jsonb_agg(
            jsonb_build_object(
              'categoryId', item.category_id,
              'parentCategoryId', item.parent_category_id,
              'name', item.name,
              'nature', item.nature,
              'order', item.sort_order,
              'depth', item.depth,
              'path', item.path_ids,
              'directAmount', item.direct_amount,
              'amount', item.amount,
              'sharePercent', item.share_percent
            ) ORDER BY item.path_orders, item.path_names
          ) FILTER (
            WHERE item.period_key IS NOT NULL
              AND item.section = 'operational'
              AND item.nature = 'DESPESA'
          ), '[]'::jsonb)
        ),
        'nonOperational', jsonb_build_object(
          'revenue', COALESCE(jsonb_agg(
            jsonb_build_object(
              'categoryId', item.category_id,
              'parentCategoryId', item.parent_category_id,
              'name', item.name,
              'nature', item.nature,
              'order', item.sort_order,
              'depth', item.depth,
              'path', item.path_ids,
              'directAmount', item.direct_amount,
              'amount', item.amount,
              'sharePercent', item.share_percent
            ) ORDER BY item.path_orders, item.path_names
          ) FILTER (
            WHERE item.period_key IS NOT NULL
              AND item.section = 'nonOperational'
              AND item.nature = 'RECEITA'
          ), '[]'::jsonb),
          'expense', COALESCE(jsonb_agg(
            jsonb_build_object(
              'categoryId', item.category_id,
              'parentCategoryId', item.parent_category_id,
              'name', item.name,
              'nature', item.nature,
              'order', item.sort_order,
              'depth', item.depth,
              'path', item.path_ids,
              'directAmount', item.direct_amount,
              'amount', item.amount,
              'sharePercent', item.share_percent
            ) ORDER BY item.path_orders, item.path_names
          ) FILTER (
            WHERE item.period_key IS NOT NULL
              AND item.section = 'nonOperational'
              AND item.nature = 'DESPESA'
          ), '[]'::jsonb)
        )
      ) AS composition
    FROM requested_ranges requested
    LEFT JOIN composition_items item ON item.period_key = requested.period_key
    GROUP BY requested.period_key
  ),
  ranking_base AS (
    SELECT
      direct.period_key,
      direct.nature,
      direct.category_id,
      COALESCE(
        category.nome,
        CASE direct.nature
          WHEN 'RECEITA' THEN 'Sem categoria — Receitas'
          ELSE 'Sem categoria — Despesas'
        END
      ) AS label,
      direct.direct_amount AS amount,
      CASE
        WHEN total.section_total = 0 THEN 0
        ELSE (direct.direct_amount / total.section_total) * 100
      END AS share_percent,
      row_number() OVER (
        PARTITION BY direct.period_key, direct.nature
        ORDER BY direct.direct_amount DESC,
                 COALESCE(category.nome, '') ASC,
                 direct.category_id::text ASC NULLS LAST
      ) AS rank
    FROM category_direct_amounts direct
    LEFT JOIN categories category ON category.id = direct.category_id
    JOIN category_section_totals total
      ON total.period_key = direct.period_key
     AND total.nature = direct.nature
     AND total.section = direct.section
    WHERE direct.section = 'operational'
      AND direct.direct_amount <> 0
  ),
  rankings_by_period AS (
    SELECT
      requested.period_key,
      jsonb_build_object(
        'topRevenueCategories', COALESCE(jsonb_agg(
          jsonb_build_object(
            'rank', ranking.rank,
            'categoryId', ranking.category_id,
            'label', ranking.label,
            'amount', ranking.amount,
            'sharePercent', ranking.share_percent
          ) ORDER BY ranking.rank
        ) FILTER (
          WHERE ranking.period_key IS NOT NULL
            AND ranking.nature = 'RECEITA'
            AND ranking.rank <= p_ranking_limit
        ), '[]'::jsonb),
        'topExpenseCategories', COALESCE(jsonb_agg(
          jsonb_build_object(
            'rank', ranking.rank,
            'categoryId', ranking.category_id,
            'label', ranking.label,
            'amount', ranking.amount,
            'sharePercent', ranking.share_percent
          ) ORDER BY ranking.rank
        ) FILTER (
          WHERE ranking.period_key IS NOT NULL
            AND ranking.nature = 'DESPESA'
            AND ranking.rank <= p_ranking_limit
        ), '[]'::jsonb)
      ) AS rankings
    FROM requested_ranges requested
    LEFT JOIN ranking_base ranking ON ranking.period_key = requested.period_key
    GROUP BY requested.period_key
  ),
  snapshot_by_period AS (
    SELECT
      requested.period_key,
      jsonb_build_object(
        'range', jsonb_build_object(
          'start', requested.start_date,
          'endExclusive', requested.end_exclusive
        ),
        'metrics', jsonb_build_object(
          'managerialResult', jsonb_build_object(
            'revenue', metrics.revenue,
            'expense', metrics.expense,
            'result', round(metrics.revenue - metrics.expense, 2),
            'marginPercent', CASE
              WHEN metrics.revenue = 0 THEN 0
              ELSE ((metrics.revenue - metrics.expense) / metrics.revenue) * 100
            END
          ),
          'openItems', jsonb_build_object(
            'accountsPayableOpen', jsonb_build_object(
              'amount', open_items.payable_amount,
              'count', open_items.payable_count
            ),
            'accountsReceivableOpen', jsonb_build_object(
              'amount', open_items.receivable_amount,
              'count', open_items.receivable_count
            )
          )
        ),
        'timeSeries', jsonb_build_object(
          'granularity', p_granularity,
          'points', series.points
        ),
        'categoryComposition', composition.composition,
        'rankings', rankings.rankings,
        'nonOperationalTotals', jsonb_build_object(
          'revenue', non_operational.revenue,
          'expense', non_operational.expense,
          'result', round(non_operational.revenue - non_operational.expense, 2)
        )
      ) AS snapshot
    FROM requested_ranges requested
    JOIN period_metrics metrics ON metrics.period_key = requested.period_key
    JOIN non_operational_metrics non_operational
      ON non_operational.period_key = requested.period_key
    JOIN open_item_metrics open_items ON open_items.period_key = requested.period_key
    JOIN series_by_period series ON series.period_key = requested.period_key
    JOIN composition_by_period composition ON composition.period_key = requested.period_key
    JOIN rankings_by_period rankings ON rankings.period_key = requested.period_key
  ),
  available_dates AS (
    SELECT COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) AS available_date
    FROM public.fin_lancamentos ledger
    WHERE ledger.company_id = v_company_id
      AND ledger.status IN ('REALIZADO', 'CONCILIADO')
      AND ledger.tipo IN ('RECEITA', 'DESPESA')
      AND NOT (ledger.origem = 'conciliacao' AND ledger.conciliado IS NOT TRUE)
      AND (
        ledger.excluir_dos_relatorios IS NOT TRUE
        OR EXISTS (
          SELECT 1
          FROM public.fin_lancamento_rateios rateio
          JOIN public.fin_categorias category
            ON category.id = rateio.categoria_id
           AND category.company_id = v_company_id
           AND category.excluir_dos_totais IS TRUE
          WHERE rateio.company_id = v_company_id
            AND rateio.lancamento_id = ledger.id
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.fin_lancamento_rateios rateio
            WHERE rateio.company_id = v_company_id
              AND rateio.lancamento_id = ledger.id
          )
          AND EXISTS (
            SELECT 1
            FROM public.fin_categorias category
            WHERE category.company_id = v_company_id
              AND category.id = ledger.categoria_id
              AND category.excluir_dos_totais IS TRUE
          )
        )
      )

    UNION ALL

    SELECT payable.data_vencimento
    FROM public.fin_contas_pagar payable
    WHERE payable.company_id = v_company_id
      AND payable.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND payable.excluir_dos_relatorios IS NOT TRUE

    UNION ALL

    SELECT receivable.data_vencimento
    FROM public.fin_contas_receber receivable
    WHERE receivable.company_id = v_company_id
      AND receivable.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND receivable.excluir_dos_relatorios IS NOT TRUE
  ),
  available_bounds AS (
    SELECT MIN(available_date) AS min_date, MAX(available_date) AS max_date
    FROM available_dates
  ),
  category_definitions AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', category.id,
        'parentId', category.parent_id,
        'name', category.nome,
        'nature', category.nature,
        'excludedFromTotals', category.excluded_from_totals,
        'order', category.sort_order,
        'depth', path.depth,
        'path', path.path_ids
      ) ORDER BY path.path_orders NULLS LAST, path.path_names NULLS LAST,
                 category.sort_order, category.nome, category.id
    ), '[]'::jsonb) AS definitions
    FROM categories category
    LEFT JOIN category_paths path ON path.id = category.id
  )
  SELECT jsonb_build_object(
    'contractVersion', '1.0',
    'generatedAt', CURRENT_TIMESTAMP,
    'availableBounds', CASE
      WHEN bounds.min_date IS NULL THEN NULL::jsonb
      ELSE jsonb_build_object('minDate', bounds.min_date, 'maxDate', bounds.max_date)
    END,
    'categoryDefinitions', definitions.definitions,
    'current', (SELECT snapshot FROM snapshot_by_period WHERE period_key = 'current'),
    'previousPeriod', (SELECT snapshot FROM snapshot_by_period WHERE period_key = 'previousPeriod'),
    'previousYear', (SELECT snapshot FROM snapshot_by_period WHERE period_key = 'previousYear')
  )
  INTO v_result
  FROM available_bounds bounds
  CROSS JOIN category_definitions definitions;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_presentation_socios(
  date, date, date, date, date, date, text, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_fin_presentation_socios(
  date, date, date, date, date, date, text, integer
) TO authenticated, service_role;

-- PL/pgSQL valida referências de colunas apenas na primeira execução. Este
-- bloco faz a resolução durante a própria migration, sem depender de usuário
-- autenticado nem acessar linhas.
DO $validate_columns$
BEGIN
  PERFORM
    ledger.id,
    ledger.company_id,
    ledger.tipo,
    ledger.valor,
    ledger.data_competencia,
    ledger.data_pagamento,
    ledger.conciliado_em,
    ledger.categoria_id,
    ledger.status,
    ledger.origem,
    ledger.conciliado,
    ledger.excluir_dos_relatorios,
    rateio.lancamento_id,
    rateio.categoria_id,
    rateio.valor,
    rateio.company_id,
    category.parent_id,
    category.nome,
    category.tipo,
    category.ordem,
    category.excluir_dos_totais,
    payable.data_vencimento,
    payable.status,
    payable.excluir_dos_relatorios,
    receivable.data_vencimento,
    receivable.status,
    receivable.excluir_dos_relatorios
  FROM public.fin_lancamentos ledger
  LEFT JOIN public.fin_lancamento_rateios rateio ON false
  LEFT JOIN public.fin_categorias category ON false
  LEFT JOIN public.fin_contas_pagar payable ON false
  LEFT JOIN public.fin_contas_receber receivable ON false
  WHERE false;
END;
$validate_columns$;

COMMENT ON FUNCTION public.get_fin_presentation_socios(
  date, date, date, date, date, date, text, integer
) IS 'Backend canônico da Apresentação Sócios v1.1; intervalos com fim exclusivo, regime de caixa pela data efetiva (pagamento, conciliação, competência como fallback), rateio prevalente, não operacionais separados e CP/CR apenas indicadores.';

-- Mantém o drill-down dos cards de Resultados no mesmo regime do resumo.
CREATE OR REPLACE FUNCTION public.get_fin_presentation_detail_series(
  p_start date,
  p_end_exclusive date,
  p_granularity text DEFAULT 'month',
  p_nature text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_group text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_group text := NULLIF(pg_catalog.lower(pg_catalog.btrim(p_group)), '');
  v_result jsonb;
BEGIN
  IF p_start IS NULL OR p_end_exclusive IS NULL OR p_start >= p_end_exclusive THEN
    RAISE EXCEPTION USING ERRCODE = '22007', MESSAGE = 'PRESENTATION_PERIOD_INVALID';
  END IF;
  IF p_granularity IS NULL OR p_granularity NOT IN ('day', 'month', 'year') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_GRANULARITY_INVALID';
  END IF;
  IF p_nature IS NOT NULL AND p_nature NOT IN ('RECEITA', 'DESPESA') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_NATURE_INVALID';
  END IF;
  IF v_group IS NOT NULL AND pg_catalog.length(v_group) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_GROUP_INVALID';
  END IF;

  v_company_id := public.assert_tenant();
  IF NOT (SELECT public.has_permission(auth.uid(), 'financeiro:relatorio-socios:view')) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.fin_categorias category
    WHERE category.id = p_category_id
      AND category.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRESENTATION_CATEGORY_OUT_OF_SCOPE';
  END IF;

  WITH RECURSIVE
  categories AS (
    SELECT
      category.id,
      category.parent_id,
      category.nome,
      CASE
        WHEN pg_catalog.lower(category.tipo) = 'receita' THEN 'RECEITA'::text
        WHEN pg_catalog.lower(category.tipo) = 'despesa' THEN 'DESPESA'::text
        ELSE NULL::text
      END AS nature,
      category.excluir_dos_totais,
      NULLIF(pg_catalog.lower(pg_catalog.btrim(category.grupo)), '') AS own_group
    FROM public.fin_categorias category
    WHERE category.company_id = v_company_id
  ),
  category_tree AS (
    SELECT
      category.id,
      category.parent_id,
      category.nome,
      category.nature,
      category.excluir_dos_totais,
      category.own_group AS effective_group,
      ARRAY[category.id]::uuid[] AS visited
    FROM categories category
    WHERE NOT EXISTS (
      SELECT 1 FROM categories parent WHERE parent.id = category.parent_id
    )

    UNION ALL

    SELECT
      child.id,
      child.parent_id,
      child.nome,
      child.nature,
      child.excluir_dos_totais,
      COALESCE(child.own_group, parent.effective_group),
      parent.visited || child.id
    FROM category_tree parent
    JOIN categories child ON child.parent_id = parent.id
    WHERE NOT child.id = ANY(parent.visited)
  ),
  category_scope AS (
    SELECT category.id, ARRAY[category.id]::uuid[] AS visited
    FROM categories category
    WHERE category.id = p_category_id

    UNION ALL

    SELECT child.id, scope.visited || child.id
    FROM category_scope scope
    JOIN categories child ON child.parent_id = scope.id
    WHERE NOT child.id = ANY(scope.visited)
  ),
  ledger_entries AS (
    SELECT
      ledger.id,
      ledger.tipo,
      ledger.valor,
      COALESCE(
        ledger.data_pagamento,
        ledger.conciliado_em::date,
        ledger.data_competencia
      ) AS data_competencia,
      ledger.categoria_id,
      ledger.excluir_dos_relatorios
    FROM public.fin_lancamentos ledger
    WHERE ledger.company_id = v_company_id
      AND COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) >= p_start
      AND COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) < p_end_exclusive
      AND ledger.status IN ('REALIZADO', 'CONCILIADO')
      AND ledger.tipo IN ('RECEITA', 'DESPESA')
      AND NOT (ledger.origem = 'conciliacao' AND ledger.conciliado IS NOT TRUE)
  ),
  resolved_amounts AS (
    SELECT
      ledger.id AS entry_id,
      ledger.tipo AS nature,
      ledger.data_competencia,
      allocation.categoria_id,
      allocation.valor AS amount,
      ledger.excluir_dos_relatorios
    FROM ledger_entries ledger
    JOIN public.fin_lancamento_rateios allocation
      ON allocation.company_id = v_company_id
     AND allocation.lancamento_id = ledger.id

    UNION ALL

    SELECT
      ledger.id,
      ledger.tipo,
      ledger.data_competencia,
      ledger.categoria_id,
      ledger.valor,
      ledger.excluir_dos_relatorios
    FROM ledger_entries ledger
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.fin_lancamento_rateios allocation
      WHERE allocation.company_id = v_company_id
        AND allocation.lancamento_id = ledger.id
    )
  ),
  classified_amounts AS (
    SELECT
      resolved.entry_id,
      resolved.nature,
      resolved.data_competencia,
      resolved.categoria_id,
      resolved.amount,
      category.effective_group,
      CASE
        WHEN category.excluir_dos_totais IS TRUE THEN 'nonOperational'::text
        WHEN resolved.excluir_dos_relatorios IS NOT TRUE THEN 'operational'::text
        ELSE 'excluded'::text
      END AS section
    FROM resolved_amounts resolved
    LEFT JOIN category_tree category
      ON category.id = resolved.categoria_id
     AND category.nature = resolved.nature
  ),
  buckets AS (
    SELECT
      generated.bucket_anchor::date AS bucket_anchor,
      GREATEST(generated.bucket_anchor::date, p_start) AS bucket_start,
      LEAST(
        CASE p_granularity
          WHEN 'day' THEN (generated.bucket_anchor + interval '1 day')::date
          WHEN 'month' THEN (generated.bucket_anchor + interval '1 month')::date
          ELSE (generated.bucket_anchor + interval '1 year')::date
        END,
        p_end_exclusive
      ) AS bucket_end_exclusive
    FROM pg_catalog.generate_series(
      pg_catalog.date_trunc(p_granularity, p_start::timestamp),
      pg_catalog.date_trunc(p_granularity, (p_end_exclusive - 1)::timestamp),
      CASE p_granularity
        WHEN 'day' THEN interval '1 day'
        WHEN 'month' THEN interval '1 month'
        ELSE interval '1 year'
      END
    ) AS generated(bucket_anchor)
  ),
  bucket_metrics AS (
    SELECT
      bucket.bucket_anchor,
      bucket.bucket_start,
      bucket.bucket_end_exclusive,
      pg_catalog.round(COALESCE(SUM(amount.amount) FILTER (
        WHERE amount.section = 'operational'
          AND amount.nature = 'RECEITA'
      ), 0), 2) AS revenue,
      pg_catalog.round(COALESCE(SUM(amount.amount) FILTER (
        WHERE amount.section = 'operational'
          AND (p_nature IS NULL OR amount.nature = p_nature)
          AND (v_group IS NULL OR amount.effective_group = v_group)
          AND (
            p_category_id IS NULL
            OR amount.categoria_id IN (SELECT scope.id FROM category_scope scope)
          )
      ), 0), 2) AS amount
    FROM buckets bucket
    LEFT JOIN classified_amounts amount
      ON amount.data_competencia >= bucket.bucket_start
     AND amount.data_competencia < bucket.bucket_end_exclusive
    GROUP BY bucket.bucket_anchor, bucket.bucket_start, bucket.bucket_end_exclusive
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'key', CASE p_granularity
          WHEN 'day' THEN pg_catalog.to_char(metric.bucket_anchor, 'YYYY-MM-DD')
          WHEN 'month' THEN pg_catalog.to_char(metric.bucket_anchor, 'YYYY-MM')
          ELSE pg_catalog.to_char(metric.bucket_anchor, 'YYYY')
        END,
        'start', metric.bucket_start,
        'endExclusive', metric.bucket_end_exclusive,
        'amount', metric.amount,
        'revenue', metric.revenue,
        'revenueSharePercent', CASE
          WHEN metric.revenue = 0 THEN NULL
          ELSE (metric.amount / metric.revenue) * 100
        END
      )
      ORDER BY metric.bucket_anchor
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM bucket_metrics metric;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_fin_presentation_detail_rows(
  p_start date,
  p_end_exclusive date,
  p_kind text DEFAULT 'ledger',
  p_nature text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_group text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_group text := NULLIF(pg_catalog.lower(pg_catalog.btrim(p_group)), '');
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;
  v_offset integer;
  v_result jsonb;
BEGIN
  IF p_start IS NULL OR p_end_exclusive IS NULL OR p_start >= p_end_exclusive THEN
    RAISE EXCEPTION USING ERRCODE = '22007', MESSAGE = 'PRESENTATION_PERIOD_INVALID';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('ledger', 'payables', 'receivables') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_DETAIL_KIND_INVALID';
  END IF;
  IF p_nature IS NOT NULL AND p_nature NOT IN ('RECEITA', 'DESPESA') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_NATURE_INVALID';
  END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_PAGE_INVALID';
  END IF;
  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_PAGE_SIZE_INVALID';
  END IF;
  IF v_group IS NOT NULL AND pg_catalog.length(v_group) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_GROUP_INVALID';
  END IF;
  IF p_kind <> 'ledger' AND (p_nature IS NOT NULL OR v_group IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_DETAIL_FILTER_INVALID';
  END IF;

  v_company_id := public.assert_tenant();
  IF NOT (SELECT public.has_permission(auth.uid(), 'financeiro:relatorio-socios:view')) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.fin_categorias category
    WHERE category.id = p_category_id
      AND category.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRESENTATION_CATEGORY_OUT_OF_SCOPE';
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  IF p_kind = 'ledger' THEN
    WITH RECURSIVE
    categories AS (
      SELECT
        category.id,
        category.parent_id,
        category.nome,
        CASE
          WHEN pg_catalog.lower(category.tipo) = 'receita' THEN 'RECEITA'::text
          WHEN pg_catalog.lower(category.tipo) = 'despesa' THEN 'DESPESA'::text
          ELSE NULL::text
        END AS nature,
        category.excluir_dos_totais,
        NULLIF(pg_catalog.lower(pg_catalog.btrim(category.grupo)), '') AS own_group
      FROM public.fin_categorias category
      WHERE category.company_id = v_company_id
    ),
    category_tree AS (
      SELECT
        category.id,
        category.parent_id,
        category.nome,
        category.nature,
        category.excluir_dos_totais,
        category.own_group AS effective_group,
        ARRAY[category.id]::uuid[] AS visited
      FROM categories category
      WHERE NOT EXISTS (SELECT 1 FROM categories parent WHERE parent.id = category.parent_id)

      UNION ALL

      SELECT
        child.id,
        child.parent_id,
        child.nome,
        child.nature,
        child.excluir_dos_totais,
        COALESCE(child.own_group, parent.effective_group),
        parent.visited || child.id
      FROM category_tree parent
      JOIN categories child ON child.parent_id = parent.id
      WHERE NOT child.id = ANY(parent.visited)
    ),
    category_scope AS (
      SELECT category.id, ARRAY[category.id]::uuid[] AS visited
      FROM categories category
      WHERE category.id = p_category_id

      UNION ALL

      SELECT child.id, scope.visited || child.id
      FROM category_scope scope
      JOIN categories child ON child.parent_id = scope.id
      WHERE NOT child.id = ANY(scope.visited)
    ),
    ledger_entries AS (
      SELECT
        ledger.id,
        ledger.tipo,
        ledger.valor,
        COALESCE(
          ledger.data_pagamento,
          ledger.conciliado_em::date,
          ledger.data_competencia
        ) AS data_competencia,
        COALESCE(NULLIF(ledger.descricao, ''), 'Lançamento sem descrição') AS descricao,
        ledger.status,
        ledger.origem,
        ledger.categoria_id,
        ledger.excluir_dos_relatorios
      FROM public.fin_lancamentos ledger
      WHERE ledger.company_id = v_company_id
        AND COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) >= p_start
        AND COALESCE(ledger.data_pagamento, ledger.conciliado_em::date, ledger.data_competencia) < p_end_exclusive
        AND ledger.status IN ('REALIZADO', 'CONCILIADO')
        AND ledger.tipo IN ('RECEITA', 'DESPESA')
        AND NOT (ledger.origem = 'conciliacao' AND ledger.conciliado IS NOT TRUE)
    ),
    resolved_amounts AS (
      SELECT
        ledger.id,
        ledger.tipo,
        ledger.valor,
        ledger.data_competencia,
        ledger.descricao,
        ledger.status,
        ledger.origem,
        allocation.categoria_id,
        allocation.valor AS classified_amount,
        ledger.excluir_dos_relatorios
      FROM ledger_entries ledger
      JOIN public.fin_lancamento_rateios allocation
        ON allocation.company_id = v_company_id
       AND allocation.lancamento_id = ledger.id

      UNION ALL

      SELECT
        ledger.id,
        ledger.tipo,
        ledger.valor,
        ledger.data_competencia,
        ledger.descricao,
        ledger.status,
        ledger.origem,
        ledger.categoria_id,
        ledger.valor,
        ledger.excluir_dos_relatorios
      FROM ledger_entries ledger
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.fin_lancamento_rateios allocation
        WHERE allocation.company_id = v_company_id
          AND allocation.lancamento_id = ledger.id
      )
    ),
    filtered_amounts AS (
      SELECT resolved.*, category.nome AS category_name
      FROM resolved_amounts resolved
      LEFT JOIN category_tree category
        ON category.id = resolved.categoria_id
       AND category.nature = resolved.tipo
      WHERE CASE
        WHEN category.excluir_dos_totais IS TRUE THEN false
        WHEN resolved.excluir_dos_relatorios IS NOT TRUE THEN true
        ELSE false
      END
        AND (p_nature IS NULL OR resolved.tipo = p_nature)
        AND (v_group IS NULL OR category.effective_group = v_group)
        AND (
          p_category_id IS NULL
          OR resolved.categoria_id IN (SELECT scope.id FROM category_scope scope)
        )
    ),
    grouped_rows AS (
      SELECT
        amount.id,
        amount.data_competencia,
        amount.descricao,
        amount.status,
        amount.tipo,
        amount.valor,
        amount.origem,
        pg_catalog.round(SUM(amount.classified_amount), 2) AS classified_amount,
        pg_catalog.string_agg(
          DISTINCT COALESCE(
            amount.category_name,
            CASE amount.tipo
              WHEN 'RECEITA' THEN 'Sem categoria — Receitas'
              ELSE 'Sem categoria — Despesas'
            END
          ),
          ', '
        ) AS category_name
      FROM filtered_amounts amount
      GROUP BY
        amount.id,
        amount.data_competencia,
        amount.descricao,
        amount.status,
        amount.tipo,
        amount.valor,
        amount.origem
    ),
    limited_rows AS (
      SELECT grouped.*
      FROM grouped_rows grouped
      ORDER BY grouped.data_competencia DESC, grouped.id DESC
      LIMIT p_page_size + 1
      OFFSET v_offset
    ),
    visible_rows AS (
      SELECT limited.*
      FROM limited_rows limited
      ORDER BY limited.data_competencia DESC, limited.id DESC
      LIMIT p_page_size
    )
    SELECT jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'hasMore', (SELECT COUNT(*) > p_page_size FROM limited_rows),
      'items', COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', row.id,
          'kind', 'ledger',
          'description', row.descricao,
          'nature', row.tipo,
          'status', row.status,
          'effectiveDate', row.data_competencia,
          'amount', row.valor,
          'classifiedAmount', row.classified_amount,
          'categoryName', row.category_name,
          'origin', row.origem
        )
        ORDER BY row.data_competencia DESC, row.id DESC
      ) FILTER (WHERE row.id IS NOT NULL), '[]'::jsonb)
    )
    INTO v_result
    FROM visible_rows row;
  ELSIF p_kind = 'payables' THEN
    WITH category_scope AS (
      WITH RECURSIVE scope AS (
        SELECT category.id, ARRAY[category.id]::uuid[] AS visited
        FROM public.fin_categorias category
        WHERE category.id = p_category_id
          AND category.company_id = v_company_id

        UNION ALL

        SELECT child.id, scope.visited || child.id
        FROM scope
        JOIN public.fin_categorias child
          ON child.parent_id = scope.id
         AND child.company_id = v_company_id
        WHERE NOT child.id = ANY(scope.visited)
      )
      SELECT scope.id FROM scope
    ),
    limited_rows AS (
      SELECT
        payable.id,
        payable.descricao,
        payable.fornecedor AS counterparty,
        payable.status,
        payable.data_vencimento,
        payable.valor,
        category.nome AS category_name
      FROM public.fin_contas_pagar payable
      LEFT JOIN public.fin_categorias category
        ON category.id = payable.categoria_id
       AND category.company_id = v_company_id
      WHERE payable.company_id = v_company_id
        AND payable.data_vencimento >= p_start
        AND payable.data_vencimento < p_end_exclusive
        AND payable.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
        AND payable.excluir_dos_relatorios IS NOT TRUE
        AND (
          p_category_id IS NULL
          OR payable.categoria_id IN (SELECT scope.id FROM category_scope scope)
        )
      ORDER BY payable.data_vencimento ASC, payable.id ASC
      LIMIT p_page_size + 1
      OFFSET v_offset
    ),
    visible_rows AS (
      SELECT limited.*
      FROM limited_rows limited
      ORDER BY limited.data_vencimento ASC, limited.id ASC
      LIMIT p_page_size
    )
    SELECT jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'hasMore', (SELECT COUNT(*) > p_page_size FROM limited_rows),
      'items', COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', row.id,
          'kind', 'payable',
          'description', row.descricao,
          'counterparty', row.counterparty,
          'status', row.status,
          'dueDate', row.data_vencimento,
          'amount', row.valor,
          'categoryName', row.category_name,
          'daysOverdue', GREATEST(v_today - row.data_vencimento, 0),
          'dueInDays', GREATEST(row.data_vencimento - v_today, 0)
        )
        ORDER BY row.data_vencimento ASC, row.id ASC
      ) FILTER (WHERE row.id IS NOT NULL), '[]'::jsonb)
    )
    INTO v_result
    FROM visible_rows row;
  ELSE
    WITH category_scope AS (
      WITH RECURSIVE scope AS (
        SELECT category.id, ARRAY[category.id]::uuid[] AS visited
        FROM public.fin_categorias category
        WHERE category.id = p_category_id
          AND category.company_id = v_company_id

        UNION ALL

        SELECT child.id, scope.visited || child.id
        FROM scope
        JOIN public.fin_categorias child
          ON child.parent_id = scope.id
         AND child.company_id = v_company_id
        WHERE NOT child.id = ANY(scope.visited)
      )
      SELECT scope.id FROM scope
    ),
    limited_rows AS (
      SELECT
        receivable.id,
        receivable.descricao,
        receivable.cliente AS counterparty,
        receivable.status,
        receivable.data_vencimento,
        receivable.valor,
        category.nome AS category_name
      FROM public.fin_contas_receber receivable
      LEFT JOIN public.fin_categorias category
        ON category.id = receivable.categoria_id
       AND category.company_id = v_company_id
      WHERE receivable.company_id = v_company_id
        AND receivable.data_vencimento >= p_start
        AND receivable.data_vencimento < p_end_exclusive
        AND receivable.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
        AND receivable.excluir_dos_relatorios IS NOT TRUE
        AND (
          p_category_id IS NULL
          OR receivable.categoria_id IN (SELECT scope.id FROM category_scope scope)
        )
      ORDER BY receivable.data_vencimento ASC, receivable.id ASC
      LIMIT p_page_size + 1
      OFFSET v_offset
    ),
    visible_rows AS (
      SELECT limited.*
      FROM limited_rows limited
      ORDER BY limited.data_vencimento ASC, limited.id ASC
      LIMIT p_page_size
    )
    SELECT jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'hasMore', (SELECT COUNT(*) > p_page_size FROM limited_rows),
      'items', COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', row.id,
          'kind', 'receivable',
          'description', row.descricao,
          'counterparty', row.counterparty,
          'status', row.status,
          'dueDate', row.data_vencimento,
          'amount', row.valor,
          'categoryName', row.category_name,
          'daysOverdue', GREATEST(v_today - row.data_vencimento, 0),
          'dueInDays', GREATEST(row.data_vencimento - v_today, 0)
        )
        ORDER BY row.data_vencimento ASC, row.id ASC
      ) FILTER (WHERE row.id IS NOT NULL), '[]'::jsonb)
    )
    INTO v_result
    FROM visible_rows row;
  END IF;

  RETURN COALESCE(
    v_result,
    jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'hasMore', false,
      'items', '[]'::jsonb
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_presentation_detail_series(
  date, date, text, text, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_presentation_detail_series(
  date, date, text, text, uuid, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_fin_presentation_detail_rows(
  date, date, text, text, uuid, text, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_presentation_detail_rows(
  date, date, text, text, uuid, text, integer, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_fin_presentation_detail_series(
  date, date, text, text, uuid, text
) IS 'Série tenant-scoped para drill-down da Apresentação Sócios no regime de caixa do Dashboard, com data efetiva, categoria descendente e grupo semântico herdado.';

COMMENT ON FUNCTION public.get_fin_presentation_detail_rows(
  date, date, text, text, uuid, text, integer, integer
) IS 'Página estável e tenant-scoped de lançamentos ou títulos em aberto da Apresentação Sócios; lançamentos usam a data efetiva do regime de caixa do Dashboard.';
