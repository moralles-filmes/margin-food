-- Orçamento: tela em árvore (DFC/DRE-style) em vez de item-por-item.
--
-- get_fin_orcamento_arvore(p_mes) devolve a árvore INTEIRA de categorias
-- operacionais (mesmo sem orçamento definido ainda) + os orçamentos já
-- salvos no mês + o realizado direto por categoria — no mesmo shape que
-- get_fin_dre_summary, para o client reaproveitar o padrão de rollup já
-- usado em DemonstrativoTree/DRESection.
--
-- _guarded_bulk_upsert_orcamento(p_mes_ano, p_items) salva várias linhas
-- (folhas editadas) numa única transação, reaproveitando internamente
-- _guarded_upsert_orcamento/_guarded_delete_orcamento já existentes — não
-- duplica validação de hierarquia, permissão nem optimistic lock.

CREATE OR REPLACE FUNCTION public.get_fin_orcamento_arvore(p_mes text)
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

  WITH categories AS (
    SELECT
      category.id,
      category.nome,
      category.codigo,
      pg_catalog.lower(category.tipo) AS tipo,
      category.parent_id,
      category.ordem
    FROM public.fin_categorias category
    WHERE category.company_id = v_company_id
      AND category.ativo IS TRUE
      AND category.excluir_dos_totais IS NOT TRUE
      AND pg_catalog.lower(category.tipo) IN ('receita', 'despesa')
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
  direct_amounts AS (
    SELECT
      category.id AS category_id,
      round(SUM(resolved.amount), 2) AS amount
    FROM resolved_amounts resolved
    JOIN categories category
      ON category.id = resolved.categoria_id
     AND pg_catalog.upper(category.tipo) = resolved.nature
    WHERE resolved.excluir_dos_relatorios IS NOT TRUE
    GROUP BY category.id
  )
  SELECT jsonb_build_object(
    'categorias', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', category.id,
        'nome', category.nome,
        'codigo', category.codigo,
        'tipo', category.tipo,
        'parent_id', category.parent_id,
        'ordem', category.ordem
      ) ORDER BY category.ordem, category.codigo), '[]'::jsonb)
      FROM categories category
    ),
    'orcamentos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', budget.id,
        'categoria_id', budget.categoria_id,
        'valor_orcado', budget.valor_orcado,
        'updated_at', budget.updated_at
      )), '[]'::jsonb)
      FROM public.fin_orcamentos budget
      WHERE budget.company_id = v_company_id
        AND budget.mes_ano = p_mes
    ),
    'valores_realizado', (
      SELECT COALESCE(jsonb_object_agg(direct.category_id::text, direct.amount), '{}'::jsonb)
      FROM direct_amounts direct
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_orcamento_arvore(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_orcamento_arvore(text) TO authenticated, service_role;

-- ── Bulk save: N folhas editadas, 1 chamada, 1 transação ──
CREATE OR REPLACE FUNCTION public._guarded_bulk_upsert_orcamento(
  p_mes_ano text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_item jsonb;
  v_categoria_id uuid;
  v_valor numeric;
  v_orcamento_id uuid;
  v_expected_updated_at timestamptz;
  v_saved_count int := 0;
  v_deleted_count int := 0;
BEGIN
  IF p_mes_ano IS NULL OR p_mes_ano !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING ERRCODE = '22007', MESSAGE = 'ORCAMENTO_MES_INVALIDO';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ORCAMENTO_PAYLOAD_INVALIDO';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_categoria_id := NULLIF(v_item->>'categoria_id', '')::uuid;
    v_valor := NULLIF(v_item->>'valor_orcado', '')::numeric;
    v_orcamento_id := NULLIF(v_item->>'orcamento_id', '')::uuid;
    v_expected_updated_at := NULLIF(v_item->>'expected_updated_at', '')::timestamptz;

    IF v_categoria_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ORCAMENTO_PAYLOAD_INVALIDO';
    END IF;

    IF v_valor IS NOT NULL AND v_valor > 0 THEN
      PERFORM public._guarded_upsert_orcamento(
        v_categoria_id, p_mes_ano, v_valor, v_expected_updated_at
      );
      v_saved_count := v_saved_count + 1;
    ELSIF v_orcamento_id IS NOT NULL THEN
      PERFORM public._guarded_delete_orcamento(v_orcamento_id, v_expected_updated_at);
      v_deleted_count := v_deleted_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('salvos', v_saved_count, 'excluidos', v_deleted_count);
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_bulk_upsert_orcamento(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_bulk_upsert_orcamento(text, jsonb) TO authenticated, service_role;

-- Força a resolução das colunas usadas antes do deploy concluir.
DO $migration_check$
BEGIN
  PERFORM pg_catalog.pg_get_functiondef('public.get_fin_orcamento_arvore(text)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_bulk_upsert_orcamento(text,jsonb)'::regprocedure);
  PERFORM
    category.id,
    category.company_id,
    category.parent_id,
    category.nome,
    category.codigo,
    category.tipo,
    category.ordem,
    category.ativo,
    category.excluir_dos_totais,
    budget.id,
    budget.company_id,
    budget.categoria_id,
    budget.mes_ano,
    budget.valor_orcado,
    budget.updated_at,
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
    allocation.valor
  FROM public.fin_categorias category
  LEFT JOIN public.fin_orcamentos budget ON false
  LEFT JOIN public.fin_lancamentos ledger ON false
  LEFT JOIN public.fin_lancamento_rateios allocation ON false
  WHERE false;
END;
$migration_check$;
