-- Relatórios do Financeiro passam a ler o Livro Razão pela data efetiva (regime de caixa),
-- a mesma regra do DFC (`_fin_dfc_effective_allocations`):
--   COALESCE(data_pagamento, conciliado_em em BRT, data_competencia)
-- Só a DRE (e o faturamento bruto do Fechamento de Caixa) continuam por competência.
--
-- Caso que motivou: Orçamento de set/2026 da Ren Sushi mostrava R$ 14.514,60 de SALMAO
-- (competência) contra R$ 98.776,97 pagos no mês (DFC/Livro Razão). O comparativo de plano
-- da Apresentação Sócios comparava o mesmo realizado por competência com Resultados (caixa)
-- e caía em "Comparação executiva indisponível".
--
-- Alterações:
--   1. get_fin_orcamento_arvore      → caixa + resíduo "sem categoria" para o total fechar
--   2. get_fin_presentation_plan     → realizado por caixa (patch no corpo vivo, ver bloco 2)
--   3. get_fin_kpis (2 assinaturas)  → receita/despesa/série por caixa, sem CP/CR em aberto;
--                                      top fornecedores = baixas de CP pagas no período
--   4. comparativo_periodos          → caixa, breakdown com rateio
--   5. get_fin_cashflow              → realizado/previsto incluem não operacionais (dinheiro real);
--                                      saldo acumulado com a mesma data efetiva do DFC
--   6. get_fin_fluxo_projecao        → inclui não operacionais e CP/CR vencidos (entram hoje)
--   7. get_fin_lancamentos_totais /
--      list_fin_lancamentos_cursor   → filtro de categoria respeita rateio e subcategorias
--   8. get_fin_dre_summary           → só exclui conciliação pendente (regime não muda)

-- ─── 1. Orçamento × Realizado ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fin_orcamento_arvore(p_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_start date;
  v_end_inclusive date;
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
  v_end_inclusive := (v_start + interval '1 month')::date - 1;

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
  -- Mesma fonte do DFC: rateio manda, data efetiva de caixa, sem transferência
  -- nem conciliação pendente.
  resolved_amounts AS (
    SELECT effective.tipo AS nature, effective.categoria_id, effective.valor AS amount
    FROM public._fin_dfc_effective_allocations(v_company_id, v_start, v_end_inclusive) AS effective
    WHERE effective.tipo IN ('RECEITA', 'DESPESA')
      AND effective.entry_excluded_from_reports IS NOT TRUE
  ),
  classified AS (
    SELECT
      resolved.nature,
      resolved.amount,
      category.id AS category_id,
      non_operational.id IS NOT NULL AS non_operational
    FROM resolved_amounts resolved
    LEFT JOIN categories category
      ON category.id = resolved.categoria_id
     AND pg_catalog.upper(category.tipo) = resolved.nature
    LEFT JOIN public.fin_categorias non_operational
      ON non_operational.id = resolved.categoria_id
     AND non_operational.company_id = v_company_id
     AND non_operational.excluir_dos_totais IS TRUE
  ),
  direct_amounts AS (
    SELECT classified.category_id, round(SUM(classified.amount), 2) AS amount
    FROM classified
    WHERE classified.category_id IS NOT NULL
    GROUP BY classified.category_id
  ),
  -- Sem categoria, categoria inativa ou de natureza trocada: sem isso o total da tela
  -- fica menor que o do Dashboard/Apresentação Sócios.
  unassigned_amounts AS (
    SELECT pg_catalog.lower(classified.nature) AS nature, round(SUM(classified.amount), 2) AS amount
    FROM classified
    WHERE classified.category_id IS NULL
      AND NOT classified.non_operational
    GROUP BY classified.nature
  )
  SELECT jsonb_build_object(
    'regime', 'caixa',
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
    ),
    'valores_sem_categoria', (
      SELECT COALESCE(jsonb_object_agg(unassigned.nature, unassigned.amount), '{}'::jsonb)
      FROM unassigned_amounts unassigned
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

-- ─── 2. Apresentação Sócios — comparativo de plano ──────────────────────────
-- Patch textual no corpo vivo (830 linhas): só o CTE ledger_entries muda — a data efetiva
-- de caixa entra no lugar de data_competencia, mantendo o nome da coluna para o resto da
-- função (mesmo padrão de get_fin_presentation_detail_rows). Cada trecho precisa existir
-- exatamente uma vez, senão a migration aborta sem alterar nada.
-- `rules.regime` continua 'competencia' até o frontend que aceita 'caixa' estar publicado
-- (usePresentationPlan.ts valida o valor); a troca do rótulo vem em migration própria.
DO $patch$
DECLARE
  v_def text := pg_get_functiondef('public.get_fin_presentation_plan(date,date,text,text,text,uuid,integer,integer)'::regprocedure);
  v_effective constant text := 'COALESCE(ledger.data_pagamento, (ledger.conciliado_em AT TIME ZONE ''America/Sao_Paulo'')::date, ledger.data_competencia)';
  v_patches text[][] := ARRAY[
    ARRAY[
      E'      ledger.valor,\n      ledger.data_competencia,\n      ledger.categoria_id,',
      E'      ledger.valor,\n      ' || v_effective || E' AS data_competencia,\n      ledger.categoria_id,'
    ],
    ARRAY[
      E'      AND ledger.data_competencia >= p_start\n      AND ledger.data_competencia < p_end_exclusive',
      E'      AND ' || v_effective || E' >= p_start\n      AND ' || v_effective || ' < p_end_exclusive'
    ]
  ];
  v_needle text;
  v_count integer;
BEGIN
  FOR i IN 1 .. array_length(v_patches, 1) LOOP
    v_needle := v_patches[i][1];
    v_count := (length(v_def) - length(replace(v_def, v_needle, ''))) / length(v_needle);
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'get_fin_presentation_plan: trecho % encontrado % vez(es), esperado 1', i, v_count;
    END IF;
    v_def := replace(v_def, v_needle, v_patches[i][2]);
  END LOOP;
  EXECUTE v_def;
END;
$patch$;

-- ─── 3. KPIs ────────────────────────────────────────────────────────────────
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

  -- Receita/despesa pelo Livro Razão na data efetiva (caixa), mesma base do Dashboard.
  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0),
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'RECEITA'), 0)
  INTO _receita, _despesa, _total_receitas
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND tipo IN ('RECEITA', 'DESPESA')
    AND excluir_dos_relatorios IS NOT TRUE
    AND status IN ('REALIZADO', 'CONCILIADO')
    AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
    AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) BETWEEN v_start AND v_end;

  SELECT
    COALESCE(SUM(CASE WHEN data_vencimento < v_hoje THEN valor ELSE 0 END), 0),
    COALESCE(SUM(valor), 0)
  INTO _total_vencido, _total_pendente
  FROM (SELECT * FROM public.fin_contas_receber WHERE excluir_dos_relatorios IS NOT TRUE)
  WHERE company_id = v_company AND status = 'A_RECEBER';

  SELECT COALESCE(AVG(EXTRACT(DAY FROM (data_pagamento::timestamp - data_vencimento::timestamp))), 0)
  INTO _prazo_pgto
  FROM (SELECT * FROM public.fin_contas_pagar WHERE excluir_dos_relatorios IS NOT TRUE)
  WHERE company_id = v_company AND status = 'PAGO'
    AND data_pagamento IS NOT NULL AND data_vencimento >= v_start;

  SELECT COALESCE(AVG(EXTRACT(DAY FROM (data_recebimento::timestamp - data_vencimento::timestamp))), 0)
  INTO _prazo_receb
  FROM (SELECT * FROM public.fin_contas_receber WHERE excluir_dos_relatorios IS NOT TRUE)
  WHERE company_id = v_company AND status = 'RECEBIDO'
    AND data_recebimento IS NOT NULL AND data_vencimento >= v_start;

  SELECT json_agg(row_to_json(t) ORDER BY t.mes) INTO _receita_por_mes
  FROM (
    SELECT
      to_char(COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia), 'YYYY-MM') AS mes,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0) AS receita,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0) AS despesa
    FROM public.fin_lancamentos
    WHERE company_id = v_company
      AND tipo IN ('RECEITA', 'DESPESA')
      AND excluir_dos_relatorios IS NOT TRUE
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) BETWEEN v_start AND v_end
    GROUP BY 1
  ) t;

  -- Fornecedores: baixas de contas a pagar que saíram do caixa no período
  -- (o ajuste de juros/desconto da baixa não é do fornecedor).
  SELECT json_agg(row_to_json(t)) INTO _top_fornecedores
  FROM (
    SELECT
      COALESCE(s.name, TRIM(UPPER(cp.fornecedor)), 'N/A') AS nome,
      SUM(l.valor) AS total
    FROM public.fin_lancamentos l
    JOIN public.fin_contas_pagar cp
      ON cp.id::text = l.referencia_id
     AND cp.company_id = v_company
    LEFT JOIN suppliers s ON s.id = cp.supplier_id
    WHERE l.company_id = v_company
      AND l.tipo = 'DESPESA'
      AND l.excluir_dos_relatorios IS NOT TRUE
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND COALESCE(l.referencia_modulo, '') = 'contas_pagar'
      AND COALESCE(l.origem, '') <> 'ajuste_pagamento'
      AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) BETWEEN v_start AND v_end
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
  IF NOT public.has_any_permission(auth.uid(), ARRAY['financeiro:kpis:view', 'finance:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  -- Receita/despesa/contagem pelo Livro Razão na data efetiva (caixa).
  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0),
    COALESCE(COUNT(*), 0)
  INTO _receita, _despesa, _total_lanc
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND tipo IN ('RECEITA', 'DESPESA')
    AND excluir_dos_relatorios IS NOT TRUE
    AND status IN ('REALIZADO', 'CONCILIADO')
    AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
    AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) >= p_start
    AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) <= p_end;

  SELECT
    COALESCE(SUM(CASE WHEN status = 'A_RECEBER' AND data_vencimento < v_hoje THEN valor ELSE 0 END), 0),
    COALESCE(SUM(valor), 0)
  INTO _total_vencido, _total_receber
  FROM (SELECT * FROM public.fin_contas_receber WHERE excluir_dos_relatorios IS NOT TRUE)
  WHERE company_id = v_company AND status != 'CANCELADO' AND data_vencimento >= p_start;

  SELECT COALESCE(AVG(EXTRACT(DAY FROM (data_pagamento::timestamp - data_vencimento::timestamp))), 0)
  INTO _prazo_pgto
  FROM (SELECT * FROM public.fin_contas_pagar WHERE excluir_dos_relatorios IS NOT TRUE)
  WHERE company_id = v_company AND status = 'PAGO'
    AND data_pagamento IS NOT NULL AND data_vencimento >= p_start;

  SELECT COALESCE(AVG(EXTRACT(DAY FROM (data_recebimento::timestamp - data_vencimento::timestamp))), 0)
  INTO _prazo_receb
  FROM (SELECT * FROM public.fin_contas_receber WHERE excluir_dos_relatorios IS NOT TRUE)
  WHERE company_id = v_company AND status = 'RECEBIDO'
    AND data_recebimento IS NOT NULL AND data_vencimento >= p_start;

  SELECT json_agg(row_to_json(t) ORDER BY t.mes) INTO _receita_por_mes
  FROM (
    SELECT
      to_char(COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia), 'YYYY-MM') AS mes,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0) AS receita,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0) AS despesa
    FROM public.fin_lancamentos
    WHERE company_id = v_company
      AND tipo IN ('RECEITA', 'DESPESA')
      AND excluir_dos_relatorios IS NOT TRUE
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) >= p_start
      AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) <= p_end
    GROUP BY 1
  ) t;

  SELECT json_agg(row_to_json(t)) INTO _top_fornecedores
  FROM (
    SELECT COALESCE(NULLIF(TRIM(cp.fornecedor), ''), 'N/A') AS nome, SUM(l.valor) AS total
    FROM public.fin_lancamentos l
    JOIN public.fin_contas_pagar cp
      ON cp.id::text = l.referencia_id
     AND cp.company_id = v_company
    WHERE l.company_id = v_company
      AND l.tipo = 'DESPESA'
      AND l.excluir_dos_relatorios IS NOT TRUE
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND COALESCE(l.referencia_modulo, '') = 'contas_pagar'
      AND COALESCE(l.origem, '') <> 'ajuste_pagamento'
      AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) >= p_start
      AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) <= p_end
    GROUP BY COALESCE(NULLIF(TRIM(cp.fornecedor), ''), 'N/A')
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

-- ─── 4. Comparativo entre períodos ──────────────────────────────────────────
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

  -- Totais pelo Livro Razão na data efetiva (caixa), mesma base do Dashboard.
  WITH pa AS (
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END), 0) AS despesa,
      COUNT(*) AS total_lancamentos
    FROM public.fin_lancamentos
    WHERE company_id = v_company_id
      AND tipo IN ('RECEITA', 'DESPESA')
      AND excluir_dos_relatorios IS NOT TRUE
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) BETWEEN v_inicio_a AND v_fim_a
  )
  SELECT jsonb_build_object(
    'mes', p_mes_a,
    'receita', receita,
    'despesa', despesa,
    'resultado', receita - despesa,
    'margem', CASE WHEN receita > 0 THEN ((receita - despesa) / receita) * 100 ELSE 0 END,
    'total_lancamentos', total_lancamentos
  ) INTO v_pa FROM pa;

  WITH pb AS (
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END), 0) AS despesa,
      COUNT(*) AS total_lancamentos
    FROM public.fin_lancamentos
    WHERE company_id = v_company_id
      AND tipo IN ('RECEITA', 'DESPESA')
      AND excluir_dos_relatorios IS NOT TRUE
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) BETWEEN v_inicio_b AND v_fim_b
  )
  SELECT jsonb_build_object(
    'mes', p_mes_b,
    'receita', receita,
    'despesa', despesa,
    'resultado', receita - despesa,
    'margem', CASE WHEN receita > 0 THEN ((receita - despesa) / receita) * 100 ELSE 0 END,
    'total_lancamentos', total_lancamentos
  ) INTO v_pb FROM pb;

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
    -- Despesa por categoria com rateio (mesma resolução do DFC).
    'breakdown_categorias', COALESCE((
      WITH cat_a AS (
        SELECT COALESCE(c.nome, 'Sem categoria') AS categoria, SUM(effective.valor) AS valor
        FROM public._fin_dfc_effective_allocations(v_company_id, v_inicio_a, v_fim_a) AS effective
        LEFT JOIN fin_categorias c ON c.id = effective.categoria_id AND c.company_id = v_company_id
        WHERE effective.tipo = 'DESPESA'
          AND effective.entry_excluded_from_reports IS NOT TRUE
        GROUP BY COALESCE(c.nome, 'Sem categoria')
      ),
      cat_b AS (
        SELECT COALESCE(c.nome, 'Sem categoria') AS categoria, SUM(effective.valor) AS valor
        FROM public._fin_dfc_effective_allocations(v_company_id, v_inicio_b, v_fim_b) AS effective
        LEFT JOIN fin_categorias c ON c.id = effective.categoria_id AND c.company_id = v_company_id
        WHERE effective.tipo = 'DESPESA'
          AND effective.entry_excluded_from_reports IS NOT TRUE
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
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

-- ─── 5. Fluxo de Caixa ──────────────────────────────────────────────────────
-- Realizado e previsto incluem lançamentos/títulos não operacionais: lucro de sócio e
-- empréstimo saem do banco, e o Fluxo precisa fechar com o Livro Razão/DFC.
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

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:fluxo:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Saldo acumulado = saldo_inicial contas ativas + movimentos realizados (data efetiva) até p_fim
  v_saldo_acumulado := (
    SELECT COALESCE(SUM(saldo_inicial), 0) FROM fin_contas
    WHERE company_id = v_company_id AND ativo = true
  ) + COALESCE((
    SELECT SUM(CASE WHEN tipo = 'RECEITA' THEN valor WHEN tipo = 'DESPESA' THEN -valor ELSE 0 END)
    FROM public.fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) <= p_fim
  ), 0);

  WITH realizado AS (
    SELECT
      COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) as data,
      SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END) as entradas,
      SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END) as saidas
    FROM public.fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) BETWEEN p_inicio AND p_fim
    GROUP BY COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia)
  ),
  realizado_detalhes AS (
    SELECT
      COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) as data,
      id,
      descricao,
      valor,
      tipo,
      COALESCE(origem, 'manual') as origem
    FROM public.fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) BETWEEN p_inicio AND p_fim
  ),
  previsto_lanc AS (
    SELECT
      COALESCE(data_vencimento, data_competencia) as data,
      SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END) as prev_entradas,
      SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END) as prev_saidas
    FROM public.fin_lancamentos
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
    FROM public.fin_lancamentos
    WHERE company_id = v_company_id
      AND status = 'PREVISTO'
      AND tipo != 'TRANSFERENCIA'
      AND COALESCE(data_vencimento, data_competencia) BETWEEN p_inicio AND p_fim
  ),
  pagar AS (
    SELECT data_vencimento as data, SUM(valor) as prev_saidas
    FROM public.fin_contas_pagar
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
    FROM public.fin_contas_pagar
    WHERE company_id = v_company_id
      AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND (
        data_vencimento BETWEEN p_inicio AND p_fim
        OR data_vencimento < v_today
      )
  ),
  receber AS (
    SELECT data_vencimento as data, SUM(valor) as prev_entradas
    FROM public.fin_contas_receber
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
    FROM public.fin_contas_receber
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

-- ─── 6. Projeção de Fluxo ───────────────────────────────────────────────────
-- Mesmos títulos do Fluxo de Caixa: não operacionais entram, e CP/CR vencidos e ainda
-- abertos entram no dia de hoje (antes sumiam da projeção, que ficava otimista).
CREATE OR REPLACE FUNCTION public.get_fin_fluxo_projecao(p_dias integer DEFAULT 30, p_saldo_manual numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_hoje date;
  v_fim date;
  v_saldo_inicial_contas numeric;
  v_saldo_base numeric;
  v_result jsonb;
BEGIN
  -- Tenant isolation
  v_company_id := assert_tenant();

  -- RBAC
  IF NOT has_any_permission(
    auth.uid(),
    ARRAY['financeiro:projecao:view','system:global:manage']
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_fim  := v_hoje + p_dias;

  -- Saldo inicial cadastrado nas contas bancárias ativas
  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial_contas
  FROM fin_contas
  WHERE company_id = v_company_id AND ativo = true;

  -- 1. Saldo base: saldo inicial das contas + realizado/conciliado, excluindo transferências
  SELECT v_saldo_inicial_contas + COALESCE(SUM(
    CASE
      WHEN tipo = 'RECEITA' THEN valor
      WHEN tipo = 'DESPESA' THEN -valor
      ELSE 0
    END
  ), 0)
  INTO v_saldo_base
  FROM public.fin_lancamentos
  WHERE company_id = v_company_id
    AND tipo != 'TRANSFERENCIA'
    AND status IN ('REALIZADO', 'CONCILIADO');

  -- Override with manual if provided
  IF p_saldo_manual IS NOT NULL THEN
    v_saldo_base := p_saldo_manual;
  END IF;

  -- 2. Build timeline using CTE
  WITH movimentacoes AS (
    -- Lançamentos previstos (atrasados entram hoje)
    SELECT GREATEST(COALESCE(data_vencimento, data_competencia), v_hoje) AS data,
           CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END AS entrada,
           CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END AS saida
    FROM public.fin_lancamentos
    WHERE company_id = v_company_id
      AND tipo != 'TRANSFERENCIA'
      AND status = 'PREVISTO'
      AND COALESCE(data_vencimento, data_competencia) <= v_fim

    UNION ALL

    -- Contas a pagar (vencidas entram hoje)
    SELECT GREATEST(data_vencimento, v_hoje) AS data,
           0 AS entrada,
           valor AS saida
    FROM public.fin_contas_pagar
    WHERE company_id = v_company_id
      AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND data_vencimento <= v_fim

    UNION ALL

    -- Contas a receber (vencidas entram hoje)
    SELECT GREATEST(data_vencimento, v_hoje) AS data,
           valor AS entrada,
           0 AS saida
    FROM public.fin_contas_receber
    WHERE company_id = v_company_id
      AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND data_vencimento <= v_fim
  ),
  dias_serie AS (
    SELECT d::date AS data
    FROM generate_series(v_hoje, v_fim, '1 day'::interval) d
  ),
  daily_agg AS (
    SELECT ds.data,
           COALESCE(SUM(m.entrada), 0) AS entradas,
           COALESCE(SUM(m.saida), 0) AS saidas
    FROM dias_serie ds
    LEFT JOIN movimentacoes m ON m.data = ds.data
    GROUP BY ds.data
    ORDER BY ds.data
  ),
  timeline AS (
    SELECT data,
           entradas,
           saidas,
           v_saldo_base + SUM(entradas - saidas) OVER (ORDER BY data) AS saldo
    FROM daily_agg
  )
  SELECT jsonb_build_object(
    'saldo_inicial', v_saldo_base,
    'entradas', (SELECT COALESCE(SUM(entradas), 0) FROM timeline),
    'saidas', (SELECT COALESCE(SUM(saidas), 0) FROM timeline),
    'saldo_final', (SELECT saldo FROM timeline ORDER BY data DESC LIMIT 1),
    'dias_negativo', (SELECT COUNT(*) FROM timeline WHERE saldo < 0),
    'saldo_minimo', (SELECT COALESCE(MIN(saldo), 0) FROM timeline),
    'timeline', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'data', to_char(data, 'YYYY-MM-DD'),
          'saldo', saldo,
          'entradas', entradas,
          'saidas', saidas
        ) ORDER BY data
      )
      FROM timeline
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ─── 7. Livro Razão — filtro de categoria ───────────────────────────────────
-- "Rateio manda": a categoria do lançamento é a das linhas de rateio quando existem.
-- Filtrar uma categoria traz também as subcategorias (igual à linha do DFC) e os totais
-- somam só a parte do lançamento que cai nela. "Sem categoria" inclui linha de rateio sem
-- categoria — o mesmo resíduo que o DFC mostra como "Sem categoria — Despesas".
CREATE OR REPLACE FUNCTION public.get_fin_lancamentos_totais(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_tipo text DEFAULT NULL::text, p_conta_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT NULL::text, p_categoria_id uuid DEFAULT NULL::uuid, p_sem_categoria boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_company uuid;
  v_receita numeric;
  v_despesa numeric;
  v_transferencia numeric;
  v_sem boolean := COALESCE(p_sem_categoria, false);
  v_scope uuid[];
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view', 'finance:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_categoria_id IS NOT NULL AND NOT v_sem THEN
    WITH RECURSIVE category_scope AS (
      SELECT c.id FROM public.fin_categorias c
      WHERE c.company_id = v_company AND c.id = p_categoria_id
      UNION
      SELECT child.id FROM public.fin_categorias child
      JOIN category_scope scope ON child.parent_id = scope.id
      WHERE child.company_id = v_company
    )
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_scope FROM category_scope;
  END IF;

  WITH base AS (
    SELECT l.id, l.tipo, l.valor, l.categoria_id,
      EXISTS (
        SELECT 1 FROM public.fin_lancamento_rateios flr
        WHERE flr.lancamento_id = l.id AND flr.company_id = v_company
      ) AS tem_rateio
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.status != 'CANCELADO'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND (p_start IS NULL OR COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) >= p_start)
      AND (p_end IS NULL OR COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) <= p_end)
      AND (p_tipo IS NULL OR l.tipo = p_tipo)
      AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
      AND (p_origem IS NULL OR l.origem = p_origem)
  ),
  scoped AS (
    SELECT base.tipo,
      CASE
        WHEN NOT v_sem AND v_scope IS NULL THEN base.valor
        WHEN base.tem_rateio THEN (
          SELECT COALESCE(SUM(flr.valor), 0) FROM public.fin_lancamento_rateios flr
          WHERE flr.lancamento_id = base.id AND flr.company_id = v_company
            AND ((v_sem AND flr.categoria_id IS NULL) OR flr.categoria_id = ANY(v_scope))
        )
        WHEN v_sem AND base.categoria_id IS NULL THEN base.valor
        WHEN base.categoria_id = ANY(v_scope) THEN base.valor
        ELSE 0
      END AS valor
    FROM base
  )
  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo = 'TRANSFERENCIA'), 0)
  INTO v_receita, v_despesa, v_transferencia
  FROM scoped;

  RETURN json_build_object(
    'total_receita', v_receita,
    'total_despesa', v_despesa,
    'total_transferencia', v_transferencia,
    'resultado', v_receita - v_despesa
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_fin_lancamentos_cursor(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_conta_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_cursor_date date DEFAULT NULL::date, p_cursor_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT NULL::text, p_categoria_id uuid DEFAULT NULL::uuid, p_sem_categoria boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  _items json;
  _effective_limit int;
  v_company uuid;
  v_sem boolean := COALESCE(p_sem_categoria, false);
  v_scope uuid[];
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view', 'finance:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);

  IF p_categoria_id IS NOT NULL AND NOT v_sem THEN
    WITH RECURSIVE category_scope AS (
      SELECT c.id FROM public.fin_categorias c
      WHERE c.company_id = v_company AND c.id = p_categoria_id
      UNION
      SELECT child.id FROM public.fin_categorias child
      JOIN category_scope scope ON child.parent_id = scope.id
      WHERE child.company_id = v_company
    )
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_scope FROM category_scope;
  END IF;

  SELECT json_agg(row_to_json(t)) INTO _items
  FROM (
    WITH filtered AS (
      SELECT l.*,
        COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) AS data_ledger
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.status != 'CANCELADO'
        AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
        AND (p_start IS NULL OR COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) >= p_start)
        AND (p_end IS NULL OR COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) <= p_end)
        AND (p_status IS NULL OR l.status = p_status)
        AND (p_tipo IS NULL OR l.tipo = p_tipo)
        AND (p_conta_id IS NULL OR l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
        AND (p_search IS NULL OR l.descricao ILIKE '%' || p_search || '%')
        AND (p_origem IS NULL OR l.origem = p_origem)
        AND (
          (NOT v_sem AND v_scope IS NULL)
          OR (
            v_sem AND (
              EXISTS (
                SELECT 1 FROM public.fin_lancamento_rateios flr
                WHERE flr.lancamento_id = l.id AND flr.company_id = v_company AND flr.categoria_id IS NULL
              )
              OR (
                l.categoria_id IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM public.fin_lancamento_rateios flr
                  WHERE flr.lancamento_id = l.id AND flr.company_id = v_company
                )
              )
            )
          )
          OR (
            v_scope IS NOT NULL AND (
              EXISTS (
                SELECT 1 FROM public.fin_lancamento_rateios flr
                WHERE flr.lancamento_id = l.id AND flr.company_id = v_company AND flr.categoria_id = ANY(v_scope)
              )
              OR (
                l.categoria_id = ANY(v_scope)
                AND NOT EXISTS (
                  SELECT 1 FROM public.fin_lancamento_rateios flr
                  WHERE flr.lancamento_id = l.id AND flr.company_id = v_company
                )
              )
            )
          )
        )
        AND (
          p_cursor_date IS NULL
          OR COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) < p_cursor_date
          OR (COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) = p_cursor_date AND l.id < p_cursor_id)
        )
      ORDER BY data_ledger DESC, l.id DESC
      LIMIT _effective_limit
    ),
    saldo_inicial_base AS (
      SELECT COALESCE(SUM(c.saldo_inicial), 0) AS v
      FROM public.fin_contas c
      WHERE c.company_id = v_company
        AND (p_conta_id IS NOT NULL OR c.ativo = true)
        AND (p_conta_id IS NULL OR c.id = p_conta_id)
    ),
    ledger AS (
      SELECT l.id,
        COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) AS data_ledger,
        CASE
          WHEN p_conta_id IS NOT NULL THEN
            CASE
              WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = p_conta_id THEN -l.valor
              WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = p_conta_id THEN l.valor
              WHEN l.tipo = 'RECEITA' AND l.conta_id = p_conta_id THEN l.valor
              WHEN l.tipo = 'DESPESA' AND l.conta_id = p_conta_id THEN -l.valor
              ELSE 0
            END
          ELSE
            CASE
              WHEN l.tipo = 'RECEITA' THEN l.valor
              WHEN l.tipo = 'DESPESA' THEN -l.valor
              ELSE 0
            END
        END AS delta
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.status IN ('REALIZADO', 'CONCILIADO')
        AND (p_conta_id IS NULL OR l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
        AND (p_conta_id IS NOT NULL OR l.tipo != 'TRANSFERENCIA')
        AND (p_end IS NULL OR COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) <= p_end)
    ),
    running AS (
      SELECT led.id,
        (SELECT v FROM saldo_inicial_base) + SUM(led.delta) OVER (
          ORDER BY led.data_ledger ASC, led.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS saldo_apos
      FROM ledger led
    )
    SELECT
      f.id, f.tipo, f.valor, f.data_competencia, f.data_vencimento, f.data_pagamento,
      f.data_ledger,
      f.descricao, f.status,
      f.conta_id, f.conta_destino_id, f.categoria_id, f.centro_custo_id,
      f.forma_pagamento, f.recorrente, f.observacoes, f.created_at, f.updated_at,
      f.lancamento_pai_id, f.conciliado, f.referencia_modulo, f.referencia_id,
      f.origem, r.saldo_apos
    FROM filtered f
    LEFT JOIN running r ON r.id = f.id
    ORDER BY f.data_ledger DESC, f.id DESC
  ) t;

  RETURN json_build_object(
    'items', COALESCE(_items, '[]'::json),
    'has_more', (SELECT json_array_length(COALESCE(_items, '[]'::json)) = _effective_limit)
  );
END;
$function$;

-- ─── 8. DRE — continua por competência, só sem conciliação pendente ─────────
CREATE OR REPLACE FUNCTION public.get_fin_dre_summary(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:dre:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  WITH effective_values AS (
    -- 1. Lançamentos REALIZADO/CONCILIADO com rateio
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_lancamentos l ON l.id = r.lancamento_id AND l.company_id = v_company_id
    WHERE l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND l.data_competencia BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 2. Lançamentos REALIZADO/CONCILIADO sem rateio
    SELECT l.categoria_id, l.valor
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND l.data_competencia BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = l.id AND r.company_id = v_company_id
      )
    UNION ALL
    -- 3. Contas a PAGAR em aberto com rateio (split sob o id da CP)
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_contas_pagar cp ON cp.id = r.lancamento_id AND cp.company_id = v_company_id
    WHERE cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 4. Contas a PAGAR em aberto sem rateio
    SELECT cp.categoria_id, cp.valor
    FROM fin_contas_pagar cp
    WHERE cp.company_id = v_company_id
      AND cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = cp.id AND r.company_id = v_company_id
      )
    UNION ALL
    -- 5. Contas a RECEBER em aberto com rateio (split sob o id da CR)
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_contas_receber cr ON cr.id = r.lancamento_id AND cr.company_id = v_company_id
    WHERE cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 6. Contas a RECEBER em aberto sem rateio
    SELECT cr.categoria_id, cr.valor
    FROM fin_contas_receber cr
    WHERE cr.company_id = v_company_id
      AND cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = cr.id AND r.company_id = v_company_id
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
    'periodo_inicio', p_inicio,
    'periodo_fim', p_fim,
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
