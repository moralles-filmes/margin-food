-- Fase 8 — drill-down tenant-scoped da Apresentação Sócios.
--
-- As duas RPCs são aditivas. A série resolve a composição por competência e
-- classificação semântica; a listagem retorna apenas uma página de linhas.
-- Nenhuma delas recebe company_id: o tenant vem exclusivamente de
-- assert_tenant(), e category_id é validado antes de participar das consultas.

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
      ledger.data_competencia,
      ledger.categoria_id,
      ledger.excluir_dos_relatorios
    FROM public.fin_lancamentos ledger
    WHERE ledger.company_id = v_company_id
      AND ledger.data_competencia >= p_start
      AND ledger.data_competencia < p_end_exclusive
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
        ledger.data_competencia,
        COALESCE(NULLIF(ledger.descricao, ''), 'Lançamento sem descrição') AS descricao,
        ledger.status,
        ledger.origem,
        ledger.categoria_id,
        ledger.excluir_dos_relatorios
      FROM public.fin_lancamentos ledger
      WHERE ledger.company_id = v_company_id
        AND ledger.data_competencia >= p_start
        AND ledger.data_competencia < p_end_exclusive
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
) IS 'Série tenant-scoped para drill-down da Apresentação Sócios, com categoria descendente e grupo semântico herdado.';

COMMENT ON FUNCTION public.get_fin_presentation_detail_rows(
  date, date, text, text, uuid, text, integer, integer
) IS 'Página estável e tenant-scoped de lançamentos ou títulos em aberto da Apresentação Sócios.';

-- Força resolução das colunas no deploy; PL/pgSQL só compila consultas internas
-- na primeira execução real.
DO $migration_check$
BEGIN
  PERFORM pg_catalog.pg_get_functiondef(
    'public.get_fin_presentation_detail_series(date,date,text,text,uuid,text)'::regprocedure
  );
  PERFORM pg_catalog.pg_get_functiondef(
    'public.get_fin_presentation_detail_rows(date,date,text,text,uuid,text,integer,integer)'::regprocedure
  );
  PERFORM
    category.id,
    category.parent_id,
    category.nome,
    category.tipo,
    category.grupo,
    category.excluir_dos_totais,
    category.company_id
  FROM public.fin_categorias category
  WHERE false;
  PERFORM
    ledger.id,
    ledger.tipo,
    ledger.valor,
    ledger.data_competencia,
    ledger.categoria_id,
    ledger.descricao,
    ledger.status,
    ledger.origem,
    ledger.conciliado,
    ledger.excluir_dos_relatorios,
    ledger.company_id
  FROM public.fin_lancamentos ledger
  WHERE false;
  PERFORM
    allocation.lancamento_id,
    allocation.categoria_id,
    allocation.valor,
    allocation.company_id
  FROM public.fin_lancamento_rateios allocation
  WHERE false;
  PERFORM
    payable.id,
    payable.descricao,
    payable.fornecedor,
    payable.status,
    payable.data_vencimento,
    payable.valor,
    payable.categoria_id,
    payable.excluir_dos_relatorios,
    payable.company_id
  FROM public.fin_contas_pagar payable
  WHERE false;
  PERFORM
    receivable.id,
    receivable.descricao,
    receivable.cliente,
    receivable.status,
    receivable.data_vencimento,
    receivable.valor,
    receivable.categoria_id,
    receivable.excluir_dos_relatorios,
    receivable.company_id
  FROM public.fin_contas_receber receivable
  WHERE false;
END;
$migration_check$;
