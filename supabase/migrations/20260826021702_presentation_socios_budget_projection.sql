-- Fase 9 - metas, orçamento e projeção executiva da Apresentação Sócios.
--
-- Fontes canônicas reutilizadas:
--   * fin_orcamentos: orçamento monetário mensal por categoria;
--   * metas_cmv.meta_cmv_total: meta percentual mensal de CMV;
--   * fin_lancamentos/fin_lancamento_rateios: realizado por competência,
--     com as mesmas regras da RPC get_fin_presentation_socios.
--
-- Precedência hierárquica: no mesmo mês, o orçamento mais específico vence.
-- Conflitos legados pai/filho são sinalizados no payload e o pai é ignorado;
-- novos conflitos são bloqueados pelo trigger abaixo.

CREATE OR REPLACE FUNCTION public.fin_validate_orcamento_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_category_company_id uuid;
  v_category_excluded boolean;
  v_category_nature text;
BEGIN
  IF NEW.categoria_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23502', MESSAGE = 'ORCAMENTO_CATEGORIA_OBRIGATORIA';
  END IF;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23502', MESSAGE = 'ORCAMENTO_TENANT_OBRIGATORIO';
  END IF;
  IF NEW.valor_orcado IS NULL OR NEW.valor_orcado <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ORCAMENTO_VALOR_INVALIDO';
  END IF;
  IF NEW.mes_ano IS NULL
     OR NEW.mes_ano !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING ERRCODE = '22007', MESSAGE = 'ORCAMENTO_MES_INVALIDO';
  END IF;

  SELECT
    category.company_id,
    category.excluir_dos_totais,
    pg_catalog.lower(category.tipo)
  INTO v_category_company_id, v_category_excluded, v_category_nature
  FROM public.fin_categorias category
  WHERE category.id = NEW.categoria_id;

  IF NOT FOUND OR v_category_company_id <> NEW.company_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ORCAMENTO_CATEGORIA_FORA_DO_TENANT';
  END IF;
  IF v_category_excluded IS TRUE OR v_category_nature NOT IN ('receita', 'despesa') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ORCAMENTO_CATEGORIA_NAO_OPERACIONAL';
  END IF;

  -- Serializa pai/filho do mesmo tenant e mês para impedir que duas gravações
  -- concorrentes atravessem juntas a validação hierárquica.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.company_id::text || ':' || NEW.mes_ano, 0)
  );

  IF EXISTS (
    WITH RECURSIVE
    ancestors(id, visited) AS (
      SELECT category.parent_id, ARRAY[NEW.categoria_id]::uuid[]
      FROM public.fin_categorias category
      WHERE category.id = NEW.categoria_id
        AND category.company_id = NEW.company_id

      UNION ALL

      SELECT parent.parent_id, ancestor.visited || parent.id
      FROM ancestors ancestor
      JOIN public.fin_categorias parent
        ON parent.id = ancestor.id
       AND parent.company_id = NEW.company_id
      WHERE ancestor.id IS NOT NULL
        AND NOT parent.id = ANY(ancestor.visited)
    ),
    descendants(id, visited) AS (
      SELECT child.id, ARRAY[NEW.categoria_id, child.id]::uuid[]
      FROM public.fin_categorias child
      WHERE child.parent_id = NEW.categoria_id
        AND child.company_id = NEW.company_id

      UNION ALL

      SELECT child.id, descendant.visited || child.id
      FROM descendants descendant
      JOIN public.fin_categorias child
        ON child.parent_id = descendant.id
       AND child.company_id = NEW.company_id
      WHERE NOT child.id = ANY(descendant.visited)
    ),
    related_categories AS (
      SELECT ancestor.id FROM ancestors ancestor WHERE ancestor.id IS NOT NULL
      UNION
      SELECT descendant.id FROM descendants descendant
    )
    SELECT 1
    FROM public.fin_orcamentos budget
    WHERE budget.company_id = NEW.company_id
      AND budget.mes_ano = NEW.mes_ano
      AND budget.categoria_id <> NEW.categoria_id
      AND budget.categoria_id IN (
        SELECT related.id FROM related_categories related
      )
      AND (TG_OP = 'INSERT' OR budget.id <> NEW.id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ORCAMENTO_HIERARQUIA_CONFLITANTE';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fin_validate_orcamento_scope ON public.fin_orcamentos;
CREATE TRIGGER trg_fin_validate_orcamento_scope
BEFORE INSERT OR UPDATE OF company_id, categoria_id, mes_ano, valor_orcado
ON public.fin_orcamentos
FOR EACH ROW
EXECUTE FUNCTION public.fin_validate_orcamento_scope();

REVOKE ALL ON FUNCTION public.fin_validate_orcamento_scope() FROM PUBLIC, anon, authenticated;

-- A assinatura antiga não tinha optimistic locking. Ela precisa ser removida
-- antes da nova assinatura para não criar overload ambíguo no PostgREST.
DROP FUNCTION IF EXISTS public._guarded_upsert_orcamento(uuid, text, numeric);

CREATE OR REPLACE FUNCTION public._guarded_upsert_orcamento(
  p_categoria_id uuid,
  p_mes_ano text,
  p_valor numeric,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_existing public.fin_orcamentos%ROWTYPE;
  v_saved public.fin_orcamentos%ROWTYPE;
BEGIN
  v_company_id := public.assert_tenant();

  IF NOT (SELECT public.has_permission(auth.uid(), 'financeiro:orcamento:edit')) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERMISSION_DENIED: financeiro:orcamento:edit';
  END IF;

  IF p_categoria_id IS NULL
     OR p_mes_ano IS NULL
     OR p_mes_ano !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     OR p_valor IS NULL
     OR p_valor <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ORCAMENTO_PAYLOAD_INVALIDO';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.fin_categorias category
    WHERE category.id = p_categoria_id
      AND category.company_id = v_company_id
      AND category.excluir_dos_totais IS NOT TRUE
      AND pg_catalog.lower(category.tipo) IN ('receita', 'despesa')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ORCAMENTO_CATEGORIA_FORA_DO_TENANT';
  END IF;

  SELECT budget.*
  INTO v_existing
  FROM public.fin_orcamentos budget
  WHERE budget.company_id = v_company_id
    AND budget.mes_ano = p_mes_ano
    AND budget.categoria_id = p_categoria_id
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_updated_at IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'OPTIMISTIC_LOCK_REQUIRED';
    END IF;
    IF v_existing.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'OPTIMISTIC_LOCK_CONFLICT';
    END IF;

    UPDATE public.fin_orcamentos
    SET valor_orcado = p_valor,
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_existing.id
      AND company_id = v_company_id
      AND updated_at = p_expected_updated_at
    RETURNING * INTO v_saved;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'OPTIMISTIC_LOCK_CONFLICT';
    END IF;
  ELSE
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'OPTIMISTIC_LOCK_CONFLICT';
    END IF;

    INSERT INTO public.fin_orcamentos (
      company_id,
      categoria_id,
      mes_ano,
      valor_orcado,
      created_by
    )
    VALUES (
      v_company_id,
      p_categoria_id,
      p_mes_ano,
      p_valor,
      auth.uid()
    )
    RETURNING * INTO v_saved;
  END IF;

  INSERT INTO public.fin_audit_logs (
    acao,
    entidade,
    entidade_id,
    user_id,
    company_id,
    antes,
    depois
  )
  VALUES (
    CASE WHEN v_existing.id IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
    'fin_orcamentos',
    v_saved.id,
    auth.uid(),
    v_company_id,
    CASE WHEN v_existing.id IS NULL THEN NULL ELSE pg_catalog.to_jsonb(v_existing) END,
    pg_catalog.to_jsonb(v_saved)
  );

  RETURN jsonb_build_object(
    'id', v_saved.id,
    'updated_at', v_saved.updated_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_upsert_orcamento(
  uuid, text, numeric, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_upsert_orcamento(
  uuid, text, numeric, timestamptz
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_fin_presentation_plan(
  p_start date,
  p_end_exclusive date,
  p_granularity text DEFAULT 'month',
  p_category_nature text DEFAULT NULL,
  p_category_group text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
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
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;
  v_cutoff_exclusive date;
  v_sample_days integer;
  v_total_days integer;
  v_projection_state text;
  v_projection_factor numeric;
  v_group text := NULLIF(pg_catalog.lower(pg_catalog.btrim(p_category_group)), '');
  v_offset integer;
  v_result jsonb;
BEGIN
  IF p_start IS NULL OR p_end_exclusive IS NULL OR p_start >= p_end_exclusive THEN
    RAISE EXCEPTION USING ERRCODE = '22007', MESSAGE = 'PRESENTATION_PERIOD_INVALID';
  END IF;
  IF p_granularity IS NULL OR p_granularity NOT IN ('day', 'month', 'year') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_GRANULARITY_INVALID';
  END IF;
  IF p_category_nature IS NOT NULL AND p_category_nature NOT IN ('RECEITA', 'DESPESA') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_NATURE_INVALID';
  END IF;
  IF v_group IS NOT NULL AND pg_catalog.length(v_group) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_GROUP_INVALID';
  END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_PAGE_INVALID';
  END IF;
  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PRESENTATION_PAGE_SIZE_INVALID';
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
  v_total_days := p_end_exclusive - p_start;
  v_cutoff_exclusive := LEAST(p_end_exclusive, v_today + 1);
  v_sample_days := GREATEST(v_cutoff_exclusive - p_start, 0);

  IF v_today < p_start THEN
    v_projection_state := 'period-not-started';
    v_projection_factor := NULL;
  ELSIF v_today >= p_end_exclusive THEN
    v_projection_state := 'period-complete';
    v_projection_factor := NULL;
  ELSIF v_sample_days < 7 THEN
    v_projection_state := 'insufficient-sample';
    v_projection_factor := NULL;
  ELSE
    v_projection_state := 'available';
    v_projection_factor := v_total_days::numeric / v_sample_days::numeric;
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
      COALESCE(category.ordem, 0) AS sort_order,
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
      category.sort_order,
      category.own_group AS effective_group,
      ARRAY[category.id]::uuid[] AS path_ids,
      ARRAY[category.sort_order]::integer[] AS path_orders,
      ARRAY[category.nome]::text[] AS path_names,
      0 AS depth
    FROM categories category
    WHERE NOT EXISTS (SELECT 1 FROM categories parent WHERE parent.id = category.parent_id)

    UNION ALL

    SELECT
      child.id,
      child.parent_id,
      child.nome,
      child.nature,
      child.excluir_dos_totais,
      child.sort_order,
      COALESCE(child.own_group, parent.effective_group),
      parent.path_ids || child.id,
      parent.path_orders || child.sort_order,
      parent.path_names || child.nome,
      parent.depth + 1
    FROM category_tree parent
    JOIN categories child ON child.parent_id = parent.id
    WHERE NOT child.id = ANY(parent.path_ids)
  ),
  category_closure AS (
    SELECT category.id AS ancestor_id, category.id AS descendant_id, ARRAY[category.id]::uuid[] AS visited
    FROM categories category

    UNION ALL

    SELECT closure.ancestor_id, child.id, closure.visited || child.id
    FROM category_closure closure
    JOIN categories child ON child.parent_id = closure.descendant_id
    WHERE NOT child.id = ANY(closure.visited)
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
  budget_months AS (
    SELECT
      generated.month_start::date AS month_start,
      (generated.month_start + interval '1 month')::date AS month_end_exclusive,
      pg_catalog.to_char(generated.month_start, 'YYYY-MM') AS month_key,
      GREATEST(generated.month_start::date, p_start) AS overlap_start,
      LEAST((generated.month_start + interval '1 month')::date, p_end_exclusive) AS overlap_end_exclusive
    FROM pg_catalog.generate_series(
      pg_catalog.date_trunc('month', p_start::timestamp),
      pg_catalog.date_trunc('month', (p_end_exclusive - 1)::timestamp),
      interval '1 month'
    ) AS generated(month_start)
  ),
  raw_budgets AS (
    SELECT
      budget.id,
      budget.categoria_id,
      budget.mes_ano,
      budget.valor_orcado,
      month.month_start,
      month.month_end_exclusive,
      month.overlap_start,
      month.overlap_end_exclusive,
      category.nature,
      category.effective_group
    FROM public.fin_orcamentos budget
    JOIN budget_months month ON month.month_key = budget.mes_ano
    JOIN category_tree category
      ON category.id = budget.categoria_id
     AND category.excluir_dos_totais IS NOT TRUE
     AND category.nature IN ('RECEITA', 'DESPESA')
    WHERE budget.company_id = v_company_id
      AND (p_category_nature IS NULL OR category.nature = p_category_nature)
      AND (v_group IS NULL OR category.effective_group = v_group)
      AND (
        p_category_id IS NULL
        OR category.id IN (SELECT scope.id FROM category_scope scope)
      )
  ),
  effective_budgets AS (
    SELECT budget.*
    FROM raw_budgets budget
    WHERE NOT EXISTS (
      SELECT 1
      FROM raw_budgets descendant_budget
      JOIN category_closure closure
        ON closure.ancestor_id = budget.categoria_id
       AND closure.descendant_id = descendant_budget.categoria_id
       AND closure.descendant_id <> closure.ancestor_id
      WHERE descendant_budget.mes_ano = budget.mes_ano
    )
  ),
  budget_conflicts AS (
    SELECT budget.id
    FROM raw_budgets budget
    WHERE EXISTS (
      SELECT 1
      FROM raw_budgets descendant_budget
      JOIN category_closure closure
        ON closure.ancestor_id = budget.categoria_id
       AND closure.descendant_id = descendant_budget.categoria_id
       AND closure.descendant_id <> closure.ancestor_id
      WHERE descendant_budget.mes_ano = budget.mes_ano
    )
  ),
  period_budgets AS (
    SELECT
      budget.categoria_id,
      budget.nature,
      budget.effective_group,
      budget.mes_ano,
      round(
        budget.valor_orcado
        * (budget.overlap_end_exclusive - budget.overlap_start)::numeric
        / (budget.month_end_exclusive - budget.month_start)::numeric,
        2
      ) AS amount
    FROM effective_budgets budget
  ),
  budget_direct AS (
    SELECT
      budget.categoria_id,
      budget.nature,
      budget.effective_group,
      round(SUM(budget.amount), 2) AS amount
    FROM period_budgets budget
    GROUP BY budget.categoria_id, budget.nature, budget.effective_group
  ),
  budget_rollups AS (
    SELECT
      closure.ancestor_id AS category_id,
      budget.nature,
      round(SUM(budget.amount), 2) AS amount
    FROM budget_direct budget
    JOIN category_closure closure ON closure.descendant_id = budget.categoria_id
    GROUP BY closure.ancestor_id, budget.nature
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
      CASE WHEN category.nature = resolved.nature THEN category.id ELSE NULL END AS category_id,
      resolved.amount,
      category.effective_group,
      CASE
        WHEN category.excluir_dos_totais IS TRUE THEN 'nonOperational'::text
        WHEN resolved.excluir_dos_relatorios IS NOT TRUE THEN 'operational'::text
        ELSE 'excluded'::text
      END AS section
    FROM resolved_amounts resolved
    LEFT JOIN category_tree category ON category.id = resolved.categoria_id
  ),
  scoped_amounts AS (
    SELECT amount.*
    FROM classified_amounts amount
    WHERE (p_category_nature IS NULL OR amount.nature = p_category_nature)
      AND (v_group IS NULL OR amount.effective_group = v_group)
      AND (
        p_category_id IS NULL
        OR amount.category_id IN (SELECT scope.id FROM category_scope scope)
      )
  ),
  actual_direct AS (
    SELECT
      amount.category_id,
      amount.nature,
      amount.effective_group,
      round(SUM(amount.amount), 2) AS amount
    FROM scoped_amounts amount
    WHERE amount.section = 'operational'
    GROUP BY amount.category_id, amount.nature, amount.effective_group
  ),
  actual_rollups AS (
    SELECT
      closure.ancestor_id AS category_id,
      actual.nature,
      round(SUM(actual.amount), 2) AS amount
    FROM actual_direct actual
    JOIN category_closure closure ON closure.descendant_id = actual.category_id
    WHERE actual.category_id IS NOT NULL
    GROUP BY closure.ancestor_id, actual.nature
  ),
  actual_metrics AS (
    SELECT
      round(COALESCE(SUM(amount.amount) FILTER (WHERE amount.nature = 'RECEITA'), 0), 2) AS revenue,
      round(COALESCE(SUM(amount.amount) FILTER (WHERE amount.nature = 'DESPESA'), 0), 2) AS expense,
      round(COALESCE(SUM(amount.amount) FILTER (
        WHERE amount.nature = 'DESPESA' AND amount.effective_group = 'cmv'
      ), 0), 2) AS cmv
    FROM scoped_amounts amount
    WHERE amount.section = 'operational'
  ),
  projection_metrics AS (
    SELECT
      round(COALESCE(SUM(amount.amount) FILTER (WHERE amount.nature = 'RECEITA'), 0), 2) AS revenue,
      round(COALESCE(SUM(amount.amount) FILTER (WHERE amount.nature = 'DESPESA'), 0), 2) AS expense,
      round(COALESCE(SUM(amount.amount) FILTER (
        WHERE amount.nature = 'DESPESA' AND amount.effective_group = 'cmv'
      ), 0), 2) AS cmv
    FROM scoped_amounts amount
    WHERE amount.section = 'operational'
      AND amount.data_competencia < v_cutoff_exclusive
  ),
  budget_metrics AS (
    SELECT
      round(COALESCE(SUM(budget.amount) FILTER (WHERE budget.nature = 'RECEITA'), 0), 2) AS revenue,
      round(COALESCE(SUM(budget.amount) FILTER (WHERE budget.nature = 'DESPESA'), 0), 2) AS expense,
      round(COALESCE(SUM(budget.amount) FILTER (
        WHERE budget.nature = 'DESPESA' AND budget.effective_group = 'cmv'
      ), 0), 2) AS cmv,
      COUNT(*) FILTER (WHERE budget.nature = 'RECEITA') > 0 AS revenue_configured,
      COUNT(*) FILTER (WHERE budget.nature = 'DESPESA') > 0 AS expense_configured,
      COUNT(*) FILTER (
        WHERE budget.nature = 'DESPESA' AND budget.effective_group = 'cmv'
      ) > 0 AS cmv_configured
    FROM period_budgets budget
  ),
  coverage_rows AS (
    SELECT
      amount.nature,
      amount.effective_group,
      amount.amount,
      EXISTS (
        SELECT 1
        FROM effective_budgets budget
        JOIN category_closure closure
          ON closure.ancestor_id = budget.categoria_id
         AND closure.descendant_id = amount.category_id
        WHERE budget.mes_ano = pg_catalog.to_char(amount.data_competencia, 'YYYY-MM')
          AND budget.nature = amount.nature
      ) AS covered
    FROM scoped_amounts amount
    WHERE amount.section = 'operational'
  ),
  coverage_metrics AS (
    SELECT
      round(COALESCE(SUM(row.amount) FILTER (WHERE row.nature = 'RECEITA' AND row.covered), 0), 2) AS revenue_covered,
      round(COALESCE(SUM(row.amount) FILTER (WHERE row.nature = 'DESPESA' AND row.covered), 0), 2) AS expense_covered,
      round(COALESCE(SUM(row.amount) FILTER (
        WHERE row.nature = 'DESPESA' AND row.effective_group = 'cmv' AND row.covered
      ), 0), 2) AS cmv_covered
    FROM coverage_rows row
  ),
  actual_covered_direct AS (
    SELECT
      amount.category_id,
      amount.nature,
      round(SUM(amount.amount), 2) AS amount
    FROM scoped_amounts amount
    WHERE amount.section = 'operational'
      AND amount.category_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM effective_budgets budget
        JOIN category_closure coverage_closure
          ON coverage_closure.ancestor_id = budget.categoria_id
         AND coverage_closure.descendant_id = amount.category_id
        WHERE budget.mes_ano = pg_catalog.to_char(amount.data_competencia, 'YYYY-MM')
          AND budget.nature = amount.nature
      )
    GROUP BY amount.category_id, amount.nature
  ),
  actual_covered_rollups AS (
    SELECT
      closure.ancestor_id AS category_id,
      covered.nature,
      round(SUM(covered.amount), 2) AS amount
    FROM actual_covered_direct covered
    JOIN category_closure closure ON closure.descendant_id = covered.category_id
    GROUP BY closure.ancestor_id, covered.nature
  ),
  series_buckets AS (
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
  series_actual AS (
    SELECT
      bucket.bucket_anchor,
      bucket.bucket_start,
      bucket.bucket_end_exclusive,
      round(COALESCE(SUM(amount.amount) FILTER (WHERE amount.nature = 'RECEITA'), 0), 2) AS revenue,
      round(COALESCE(SUM(amount.amount) FILTER (WHERE amount.nature = 'DESPESA'), 0), 2) AS expense,
      round(COALESCE(SUM(amount.amount) FILTER (
        WHERE amount.nature = 'DESPESA' AND amount.effective_group = 'cmv'
      ), 0), 2) AS cmv
    FROM series_buckets bucket
    LEFT JOIN scoped_amounts amount
      ON amount.section = 'operational'
     AND amount.data_competencia >= bucket.bucket_start
     AND amount.data_competencia < bucket.bucket_end_exclusive
    GROUP BY bucket.bucket_anchor, bucket.bucket_start, bucket.bucket_end_exclusive
  ),
  series_budget_rows AS (
    SELECT
      bucket.bucket_anchor,
      budget.nature,
      budget.effective_group,
      round(
        budget.valor_orcado
        * GREATEST(
            LEAST(bucket.bucket_end_exclusive, budget.month_end_exclusive)
            - GREATEST(bucket.bucket_start, budget.month_start),
            0
          )::numeric
        / (budget.month_end_exclusive - budget.month_start)::numeric,
        2
      ) AS amount
    FROM series_buckets bucket
    JOIN effective_budgets budget
      ON budget.month_start < bucket.bucket_end_exclusive
     AND budget.month_end_exclusive > bucket.bucket_start
  ),
  series_budget AS (
    SELECT
      bucket.bucket_anchor,
      CASE WHEN COUNT(row.bucket_anchor) FILTER (WHERE row.nature = 'RECEITA') > 0
        THEN round(SUM(row.amount) FILTER (WHERE row.nature = 'RECEITA'), 2)
        ELSE NULL::numeric
      END AS revenue,
      CASE WHEN COUNT(row.bucket_anchor) FILTER (WHERE row.nature = 'DESPESA') > 0
        THEN round(SUM(row.amount) FILTER (WHERE row.nature = 'DESPESA'), 2)
        ELSE NULL::numeric
      END AS expense,
      CASE WHEN COUNT(row.bucket_anchor) FILTER (
        WHERE row.nature = 'DESPESA' AND row.effective_group = 'cmv'
      ) > 0
        THEN round(SUM(row.amount) FILTER (
          WHERE row.nature = 'DESPESA' AND row.effective_group = 'cmv'
        ), 2)
        ELSE NULL::numeric
      END AS cmv
    FROM series_buckets bucket
    LEFT JOIN series_budget_rows row ON row.bucket_anchor = bucket.bucket_anchor
    GROUP BY bucket.bucket_anchor
  ),
  series_payload AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'key', CASE p_granularity
          WHEN 'day' THEN pg_catalog.to_char(actual.bucket_anchor, 'YYYY-MM-DD')
          WHEN 'month' THEN pg_catalog.to_char(actual.bucket_anchor, 'YYYY-MM')
          ELSE pg_catalog.to_char(actual.bucket_anchor, 'YYYY')
        END,
        'start', actual.bucket_start,
        'endExclusive', actual.bucket_end_exclusive,
        'actual', jsonb_build_object(
          'revenue', actual.revenue,
          'expense', actual.expense,
          'result', round(actual.revenue - actual.expense, 2),
          'marginPercent', CASE WHEN actual.revenue = 0 THEN NULL
            ELSE ((actual.revenue - actual.expense) / actual.revenue) * 100 END,
          'cmv', actual.cmv,
          'cmvPercent', CASE WHEN actual.revenue = 0 THEN NULL
            ELSE (actual.cmv / actual.revenue) * 100 END
        ),
        'budget', jsonb_build_object(
          'revenue', budget.revenue,
          'expense', budget.expense,
          'result', CASE WHEN budget.revenue IS NULL OR budget.expense IS NULL THEN NULL
            ELSE round(budget.revenue - budget.expense, 2) END,
          'marginPercent', CASE
            WHEN budget.revenue IS NULL OR budget.expense IS NULL OR budget.revenue = 0 THEN NULL
            ELSE ((budget.revenue - budget.expense) / budget.revenue) * 100
          END,
          'cmv', budget.cmv,
          'cmvPercent', CASE
            WHEN budget.revenue IS NULL OR budget.cmv IS NULL OR budget.revenue = 0 THEN NULL
            ELSE (budget.cmv / budget.revenue) * 100
          END
        )
      ) ORDER BY actual.bucket_anchor
    ), '[]'::jsonb) AS points
    FROM series_actual actual
    JOIN series_budget budget ON budget.bucket_anchor = actual.bucket_anchor
  ),
  cmv_target_stats AS (
    SELECT
      COUNT(month.month_key) AS expected_months,
      COUNT(target.id) AS configured_months,
      MIN(target.meta_cmv_total) AS min_target,
      MAX(target.meta_cmv_total) AS max_target
    FROM budget_months month
    LEFT JOIN public.metas_cmv target
      ON target.company_id = v_company_id
     AND target.mes_ano = month.month_key
  ),
  category_rows AS (
    SELECT
      category.id AS category_id,
      category.parent_id,
      category.nome,
      category.nature,
      category.effective_group,
      category.depth,
      category.path_orders,
      category.path_names,
      COALESCE(actual_direct.amount, 0)::numeric AS direct_actual,
      COALESCE(actual_rollup.amount, 0)::numeric AS actual_amount,
      budget_direct.amount AS direct_budget,
      budget_rollup.amount AS budget_amount,
      COALESCE(covered.amount, 0)::numeric AS actual_covered_amount
    FROM category_tree category
    LEFT JOIN actual_direct
      ON actual_direct.category_id = category.id
     AND actual_direct.nature = category.nature
    LEFT JOIN actual_rollups actual_rollup
      ON actual_rollup.category_id = category.id
     AND actual_rollup.nature = category.nature
    LEFT JOIN budget_direct
      ON budget_direct.categoria_id = category.id
     AND budget_direct.nature = category.nature
    LEFT JOIN budget_rollups budget_rollup
      ON budget_rollup.category_id = category.id
     AND budget_rollup.nature = category.nature
    LEFT JOIN actual_covered_rollups covered
      ON covered.category_id = category.id
     AND covered.nature = category.nature
    WHERE category.excluir_dos_totais IS NOT TRUE
      AND category.nature IN ('RECEITA', 'DESPESA')
      AND (COALESCE(actual_rollup.amount, 0) <> 0 OR budget_rollup.amount IS NOT NULL)
      AND (p_category_nature IS NULL OR category.nature = p_category_nature)
      AND (v_group IS NULL OR category.effective_group = v_group)
      AND (
        p_category_id IS NULL
        OR category.id IN (SELECT scope.id FROM category_scope scope)
      )
  ),
  category_enriched AS (
    SELECT
      row.*,
      row.budget_amount IS NOT NULL AS budget_configured,
      row.budget_amount IS NOT NULL
        AND row.actual_amount = row.actual_covered_amount AS coverage_complete,
      CASE
        WHEN row.budget_amount IS NULL OR row.actual_amount <> row.actual_covered_amount THEN NULL::numeric
        ELSE round(row.actual_amount - row.budget_amount, 2)
      END AS variance_amount,
      CASE
        WHEN row.budget_amount IS NULL
          OR row.budget_amount = 0
          OR row.actual_amount <> row.actual_covered_amount THEN NULL::numeric
        ELSE ((row.actual_amount - row.budget_amount) / pg_catalog.abs(row.budget_amount)) * 100
      END AS variance_percent,
      CASE
        WHEN row.budget_amount IS NULL OR row.actual_amount <> row.actual_covered_amount THEN NULL::numeric
        WHEN row.nature = 'RECEITA' THEN round(row.actual_amount - row.budget_amount, 2)
        ELSE round(row.budget_amount - row.actual_amount, 2)
      END AS favorable_variance
    FROM category_rows row
  ),
  category_numbered AS (
    SELECT
      enriched.*,
      COUNT(*) OVER () AS total_count,
      ROW_NUMBER() OVER (
        ORDER BY
          pg_catalog.abs(enriched.variance_amount) DESC NULLS LAST,
          enriched.path_orders,
          enriched.path_names,
          enriched.category_id
      ) AS row_number
    FROM category_enriched enriched
  ),
  category_page AS (
    SELECT jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'totalCount', COALESCE(MAX(numbered.total_count), 0),
      'hasMore', COALESCE(MAX(numbered.total_count), 0) > v_offset + p_page_size,
      'items', COALESCE(jsonb_agg(
        jsonb_build_object(
          'categoryId', numbered.category_id,
          'parentCategoryId', numbered.parent_id,
          'name', numbered.nome,
          'nature', numbered.nature,
          'effectiveGroup', numbered.effective_group,
          'depth', numbered.depth,
          'directActual', numbered.direct_actual,
          'actualAmount', numbered.actual_amount,
          'directBudget', numbered.direct_budget,
          'budgetAmount', numbered.budget_amount,
          'actualCoveredAmount', numbered.actual_covered_amount,
          'budgetConfigured', numbered.budget_configured,
          'coverageComplete', numbered.coverage_complete,
          'varianceAmount', numbered.variance_amount,
          'variancePercent', numbered.variance_percent,
          'revenueSharePercent', CASE WHEN metrics.revenue = 0 THEN NULL
            ELSE (numbered.actual_amount / metrics.revenue) * 100 END,
          'resultSharePercent', CASE WHEN metrics.revenue - metrics.expense = 0 THEN NULL
            ELSE (numbered.actual_amount / pg_catalog.abs(metrics.revenue - metrics.expense)) * 100 END
        ) ORDER BY numbered.row_number
      ) FILTER (
        WHERE numbered.row_number > v_offset
          AND numbered.row_number <= v_offset + p_page_size
      ), '[]'::jsonb)
    ) AS payload
    FROM category_numbered numbered
    CROSS JOIN actual_metrics metrics
  ),
  variation_payload AS (
    SELECT jsonb_build_object(
      'favorable', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'categoryId', favorable.category_id,
          'name', favorable.nome,
          'nature', favorable.nature,
          'actualAmount', favorable.actual_amount,
          'budgetAmount', favorable.budget_amount,
          'varianceAmount', favorable.variance_amount,
          'variancePercent', favorable.variance_percent
        ) ORDER BY favorable.favorable_variance DESC, favorable.nome, favorable.category_id)
        FROM (
          SELECT * FROM category_enriched
          WHERE direct_budget IS NOT NULL
            AND favorable_variance > 0
          ORDER BY favorable_variance DESC, nome, category_id
          LIMIT 3
        ) favorable
      ), '[]'::jsonb),
      'unfavorable', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'categoryId', unfavorable.category_id,
          'name', unfavorable.nome,
          'nature', unfavorable.nature,
          'actualAmount', unfavorable.actual_amount,
          'budgetAmount', unfavorable.budget_amount,
          'varianceAmount', unfavorable.variance_amount,
          'variancePercent', unfavorable.variance_percent
        ) ORDER BY unfavorable.favorable_variance ASC, unfavorable.nome, unfavorable.category_id)
        FROM (
          SELECT * FROM category_enriched
          WHERE direct_budget IS NOT NULL
            AND favorable_variance < 0
          ORDER BY favorable_variance ASC, nome, category_id
          LIMIT 3
        ) unfavorable
      ), '[]'::jsonb)
    ) AS payload
  )
  SELECT jsonb_build_object(
    'contractVersion', '1.0',
    'generatedAt', CURRENT_TIMESTAMP,
    'range', jsonb_build_object('start', p_start, 'endExclusive', p_end_exclusive),
    'sources', jsonb_build_object(
      'actual', 'fin_lancamentos',
      'budget', 'fin_orcamentos',
      'cmvTarget', 'metas_cmv.meta_cmv_total'
    ),
    'rules', jsonb_build_object(
      'regime', 'competencia',
      'budgetProration', 'valor mensal x dias sobrepostos / dias do mes',
      'hierarchyPrecedence', 'orcamento mais especifico vence no mesmo mes',
      'projectionFormula', 'realizado acumulado / dias transcorridos x dias totais',
      'openItemsIncluded', false
    ),
    'actual', jsonb_build_object(
      'revenue', actual.revenue,
      'expense', actual.expense,
      'result', round(actual.revenue - actual.expense, 2),
      'marginPercent', CASE WHEN actual.revenue = 0 THEN NULL
        ELSE ((actual.revenue - actual.expense) / actual.revenue) * 100 END,
      'cmv', actual.cmv,
      'cmvPercent', CASE WHEN actual.revenue = 0 THEN NULL
        ELSE (actual.cmv / actual.revenue) * 100 END
    ),
    'budget', jsonb_build_object(
      'revenue', CASE WHEN budget.revenue_configured THEN budget.revenue ELSE NULL END,
      'expense', CASE WHEN budget.expense_configured THEN budget.expense ELSE NULL END,
      'result', CASE
        WHEN budget.revenue_configured AND budget.expense_configured
          AND coverage.revenue_covered = actual.revenue
          AND coverage.expense_covered = actual.expense
        THEN round(budget.revenue - budget.expense, 2)
        ELSE NULL
      END,
      'marginPercent', CASE
        WHEN budget.revenue_configured AND budget.expense_configured
          AND coverage.revenue_covered = actual.revenue
          AND coverage.expense_covered = actual.expense
          AND budget.revenue <> 0
        THEN ((budget.revenue - budget.expense) / budget.revenue) * 100
        ELSE NULL
      END,
      'cmv', CASE WHEN budget.cmv_configured THEN budget.cmv ELSE NULL END,
      'cmvPercent', CASE
        WHEN budget.revenue_configured AND budget.cmv_configured
          AND coverage.revenue_covered = actual.revenue
          AND coverage.cmv_covered = actual.cmv
          AND budget.revenue <> 0
        THEN (budget.cmv / budget.revenue) * 100
        ELSE NULL
      END,
      'cmvTargetPercent', CASE
        WHEN target.configured_months = target.expected_months
          AND target.min_target = target.max_target
        THEN target.min_target
        ELSE NULL
      END,
      'cmvTargetState', CASE
        WHEN target.configured_months = 0 THEN 'not-configured'
        WHEN target.configured_months < target.expected_months THEN 'partial'
        WHEN target.min_target <> target.max_target THEN 'mixed-values'
        ELSE 'available'
      END
    ),
    'coverage', jsonb_build_object(
      'revenue', jsonb_build_object(
        'configured', budget.revenue_configured,
        'complete', budget.revenue_configured AND coverage.revenue_covered = actual.revenue,
        'actualCovered', coverage.revenue_covered,
        'actualTotal', actual.revenue
      ),
      'expense', jsonb_build_object(
        'configured', budget.expense_configured,
        'complete', budget.expense_configured AND coverage.expense_covered = actual.expense,
        'actualCovered', coverage.expense_covered,
        'actualTotal', actual.expense
      ),
      'cmv', jsonb_build_object(
        'configured', budget.cmv_configured,
        'complete', budget.cmv_configured AND coverage.cmv_covered = actual.cmv,
        'actualCovered', coverage.cmv_covered,
        'actualTotal', actual.cmv
      )
    ),
    'projection', jsonb_build_object(
      'state', v_projection_state,
      'cutoffDate', LEAST(v_today, p_end_exclusive - 1),
      'sampleDays', v_sample_days,
      'totalDays', v_total_days,
      'factor', v_projection_factor,
      'metrics', CASE WHEN v_projection_state = 'available' THEN jsonb_build_object(
        'revenue', round(projected.revenue * v_projection_factor, 2),
        'expense', round(projected.expense * v_projection_factor, 2),
        'result', round((projected.revenue - projected.expense) * v_projection_factor, 2),
        'marginPercent', CASE WHEN projected.revenue = 0 THEN NULL
          ELSE ((projected.revenue - projected.expense) / projected.revenue) * 100 END,
        'cmv', round(projected.cmv * v_projection_factor, 2),
        'cmvPercent', CASE WHEN projected.revenue = 0 THEN NULL
          ELSE (projected.cmv / projected.revenue) * 100 END
      ) ELSE NULL END
    ),
    'series', series.points,
    'categories', page.payload,
    'variations', variations.payload,
    'hierarchyConflictCount', (SELECT COUNT(*) FROM budget_conflicts)
  )
  INTO v_result
  FROM actual_metrics actual
  CROSS JOIN projection_metrics projected
  CROSS JOIN budget_metrics budget
  CROSS JOIN coverage_metrics coverage
  CROSS JOIN series_payload series
  CROSS JOIN cmv_target_stats target
  CROSS JOIN category_page page
  CROSS JOIN variation_payload variations;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_presentation_plan(
  date, date, text, text, text, uuid, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_presentation_plan(
  date, date, text, text, text, uuid, integer, integer
) TO authenticated, service_role;

-- Mantém a tela canônica de Orçamento alinhada à Fase 9: receitas e despesas
-- operacionais, rateio prevalente e orçamento no pai comparado ao acumulado da
-- subárvore. Nenhum título em aberto participa do realizado.
CREATE OR REPLACE FUNCTION public.orcamento_execucao_mensal(p_mes text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_start date;
  v_end_exclusive date;
  v_result jsonb;
BEGIN
  IF p_mes IS NULL OR p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING ERRCODE = '22007', MESSAGE = 'ORCAMENTO_MES_INVALIDO';
  END IF;

  v_company_id := public.assert_tenant();
  IF NOT (SELECT public.has_permission(auth.uid(), 'financeiro:orcamento:view')) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERMISSION_DENIED: financeiro:orcamento:view';
  END IF;

  v_start := (p_mes || '-01')::date;
  v_end_exclusive := (v_start + interval '1 month')::date;

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
      category.excluir_dos_totais
    FROM public.fin_categorias category
    WHERE category.company_id = v_company_id
  ),
  category_closure AS (
    SELECT category.id AS ancestor_id, category.id AS descendant_id, ARRAY[category.id]::uuid[] AS visited
    FROM categories category

    UNION ALL

    SELECT closure.ancestor_id, child.id, closure.visited || child.id
    FROM category_closure closure
    JOIN categories child ON child.parent_id = closure.descendant_id
    WHERE NOT child.id = ANY(closure.visited)
  ),
  ledger_entries AS (
    SELECT
      ledger.id,
      ledger.tipo,
      ledger.valor,
      ledger.categoria_id,
      ledger.excluir_dos_relatorios
    FROM public.fin_lancamentos ledger
    WHERE ledger.company_id = v_company_id
      AND ledger.data_competencia >= v_start
      AND ledger.data_competencia < v_end_exclusive
      AND ledger.status IN ('REALIZADO', 'CONCILIADO')
      AND ledger.tipo IN ('RECEITA', 'DESPESA')
      AND NOT (ledger.origem = 'conciliacao' AND ledger.conciliado IS NOT TRUE)
  ),
  resolved_amounts AS (
    SELECT
      ledger.id AS entry_id,
      ledger.tipo AS nature,
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
  actual_direct AS (
    SELECT
      category.id AS category_id,
      resolved.nature,
      round(SUM(resolved.amount), 2) AS amount
    FROM resolved_amounts resolved
    JOIN categories category
      ON category.id = resolved.categoria_id
     AND category.nature = resolved.nature
     AND category.excluir_dos_totais IS NOT TRUE
    WHERE resolved.excluir_dos_relatorios IS NOT TRUE
    GROUP BY category.id, resolved.nature
  ),
  actual_rollups AS (
    SELECT
      closure.ancestor_id AS category_id,
      actual.nature,
      round(SUM(actual.amount), 2) AS amount
    FROM actual_direct actual
    JOIN category_closure closure ON closure.descendant_id = actual.category_id
    GROUP BY closure.ancestor_id, actual.nature
  ),
  result_rows AS (
    SELECT
      budget.id,
      budget.categoria_id,
      category.nome AS category_name,
      category.nature,
      budget.valor_orcado,
      COALESCE(actual.amount, 0)::numeric AS actual_amount,
      budget.updated_at
    FROM public.fin_orcamentos budget
    JOIN categories category
      ON category.id = budget.categoria_id
     AND category.excluir_dos_totais IS NOT TRUE
     AND category.nature IN ('RECEITA', 'DESPESA')
    LEFT JOIN actual_rollups actual
      ON actual.category_id = budget.categoria_id
     AND actual.nature = category.nature
    WHERE budget.company_id = v_company_id
      AND budget.mes_ano = p_mes
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', row.id,
      'categoria_id', row.categoria_id,
      'categoriaNome', row.category_name,
      'categoriaTipo', pg_catalog.lower(row.nature),
      'valorOrcado', row.valor_orcado,
      'valorRealizado', row.actual_amount,
      'pctExecucao', CASE WHEN row.valor_orcado = 0 THEN 0
        ELSE round((row.actual_amount / row.valor_orcado) * 100, 1) END,
      'statusExecucao', CASE
        WHEN row.nature = 'DESPESA' AND row.actual_amount > row.valor_orcado THEN 'estourado'
        WHEN row.nature = 'DESPESA' AND row.actual_amount > row.valor_orcado * 0.8 THEN 'alerta'
        WHEN row.nature = 'RECEITA' AND row.actual_amount < row.valor_orcado * 0.8 THEN 'estourado'
        WHEN row.nature = 'RECEITA' AND row.actual_amount < row.valor_orcado THEN 'alerta'
        ELSE 'ok'
      END,
      'valorExcedido', CASE
        WHEN row.nature = 'DESPESA' THEN GREATEST(row.actual_amount - row.valor_orcado, 0)
        ELSE GREATEST(row.valor_orcado - row.actual_amount, 0)
      END,
      'updated_at', row.updated_at
    ) ORDER BY
      pg_catalog.abs(row.actual_amount - row.valor_orcado) DESC,
      row.category_name,
      row.id
  ), '[]'::jsonb)
  INTO v_result
  FROM result_rows row;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.orcamento_execucao_mensal(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orcamento_execucao_mensal(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_fin_presentation_plan(
  date, date, text, text, text, uuid, integer, integer
) IS 'Fase 9 da Apresentação Sócios: realizado canônico, orçamento categorial, meta percentual de CMV, projeção determinística e categorias paginadas.';

-- Força a resolução das colunas usadas antes do deploy concluir.
DO $migration_check$
BEGIN
  PERFORM pg_catalog.pg_get_functiondef(
    'public.get_fin_presentation_plan(date,date,text,text,text,uuid,integer,integer)'::regprocedure
  );
  PERFORM pg_catalog.pg_get_functiondef(
    'public._guarded_upsert_orcamento(uuid,text,numeric,timestamptz)'::regprocedure
  );
  PERFORM pg_catalog.pg_get_functiondef(
    'public.orcamento_execucao_mensal(text)'::regprocedure
  );
  PERFORM
    budget.id,
    budget.company_id,
    budget.categoria_id,
    budget.mes_ano,
    budget.valor_orcado,
    budget.updated_at,
    category.id,
    category.company_id,
    category.parent_id,
    category.nome,
    category.tipo,
    category.grupo,
    category.excluir_dos_totais,
    category.ordem,
    ledger.id,
    ledger.company_id,
    ledger.tipo,
    ledger.valor,
    ledger.data_competencia,
    ledger.categoria_id,
    ledger.status,
    ledger.origem,
    ledger.conciliado,
    ledger.excluir_dos_relatorios,
    allocation.company_id,
    allocation.lancamento_id,
    allocation.categoria_id,
    allocation.valor,
    target.company_id,
    target.mes_ano,
    target.meta_cmv_total
  FROM public.fin_orcamentos budget
  LEFT JOIN public.fin_categorias category ON false
  LEFT JOIN public.fin_lancamentos ledger ON false
  LEFT JOIN public.fin_lancamento_rateios allocation ON false
  LEFT JOIN public.metas_cmv target ON false
  WHERE false;
END;
$migration_check$;
