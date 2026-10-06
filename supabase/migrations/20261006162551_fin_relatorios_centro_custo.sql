-- Centro de custo nos relatórios financeiros (DRE, DFC e Dashboard).
--
-- As três RPCs mantêm a assinatura e tudo o que já devolviam; só ganham chaves novas no retorno:
--   get_fin_dre_summary / get_fin_dfc_summary
--     centros_custo              [{ id, nome }] dos centros com algum valor no período
--     valores_por_centro_custo   { <centro_id> | 'sem_centro': { <cat_id>: total } }, com as mesmas
--                                chaves de cat_id de valores_por_categoria
--   get_fin_dashboard_charts
--     despesas_por_centro_custo  [{ centro_custo_id, nome, valor }] das despesas realizadas do período
--
-- Sem nenhum valor com centro de custo no período, as chaves novas voltam vazias ([] / {}) e a tela
-- não mostra nada de centro de custo — nenhuma unidade usa centro de custo hoje.
--
-- Regra do centro de cada valor (mesma do "rateio manda" da categoria): registro com rateio usa só
-- o centro de cada linha — linha sem centro é 'sem_centro', nunca herda o do cabeçalho, que a tela
-- esconde quando o rateio está ligado —; registro sem rateio usa o do cabeçalho (lançamento/CP/CR).
-- Centro de outra empresa nunca é exposto: cai em 'sem_centro'. Para cada categoria, a soma de
-- valores_por_centro_custo é exatamente valores_por_categoria.
--
-- Ordem: vem depois de 20261006160000_remove_linha_dre_plano_contas (que também reescreve o DRE e o
-- DFC). Os corpos aqui já saem sem linha_dre — iguais aos de lá, mais o centro de custo —, então
-- funcionam antes ou depois do DROP COLUMN; esta precisa ser a última a definir as duas funções.
-- Reverter: reaplicar os corpos anteriores (DRE/DFC de 20261006160000, ou de 20261002142926 e
-- 20260828030805 se aquela não tiver sido aplicada; Dashboard de 20260825212335). Sem DDL nem dados.

-- ── DRE (competência) ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fin_dre_summary(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
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
    SELECT r.categoria_id, r.centro_custo_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_lancamentos l ON l.id = r.lancamento_id AND l.company_id = v_company_id
    WHERE l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND l.data_competencia BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 2. Lançamentos REALIZADO/CONCILIADO sem rateio
    SELECT l.categoria_id, l.centro_custo_id, l.valor
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
    SELECT r.categoria_id, r.centro_custo_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_contas_pagar cp ON cp.id = r.lancamento_id AND cp.company_id = v_company_id
    WHERE cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 4. Contas a PAGAR em aberto sem rateio
    SELECT cp.categoria_id, cp.centro_custo_id, cp.valor
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
    SELECT r.categoria_id, r.centro_custo_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_contas_receber cr ON cr.id = r.lancamento_id AND cr.company_id = v_company_id
    WHERE cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 6. Contas a RECEBER em aberto sem rateio
    SELECT cr.categoria_id, cr.centro_custo_id, cr.valor
    FROM fin_contas_receber cr
    WHERE cr.company_id = v_company_id
      AND cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = cr.id AND r.company_id = v_company_id
      )
  ),
  valores AS (
    -- Centro só vale se for da própria empresa; o resto cai em 'sem_centro'.
    SELECT
      COALESCE(ev.categoria_id, '00000000-0000-0000-0000-000000000000')::text AS cat_id,
      cc.id AS centro_custo_id,
      cc.nome AS centro_nome,
      ev.valor
    FROM effective_values ev
    LEFT JOIN fin_centros_custo cc ON cc.id = ev.centro_custo_id AND cc.company_id = v_company_id
  ),
  por_categoria AS (
    SELECT v.cat_id, SUM(v.valor) as total
    FROM valores v
    GROUP BY v.cat_id
  ),
  por_centro AS (
    SELECT COALESCE(v.centro_custo_id::text, 'sem_centro') AS centro_key, v.cat_id, SUM(v.valor) AS total
    FROM valores v
    WHERE EXISTS (SELECT 1 FROM valores x WHERE x.centro_custo_id IS NOT NULL)
    GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'periodo_inicio', p_inicio,
    'periodo_fim', p_fim,
    'categorias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'codigo', c.codigo, 'tipo', c.tipo,
        'parent_id', c.parent_id, 'ordem', c.ordem, 'ativo', c.ativo,
        'grupo', c.grupo,
        'centro_custo_padrao_id', c.centro_custo_padrao_id
      ) ORDER BY c.ordem, c.codigo)
      FROM fin_categorias c
      WHERE c.company_id = v_company_id AND c.ativo = true
    ), '[]'::jsonb),
    'valores_por_categoria', COALESCE((
      SELECT jsonb_object_agg(pc.cat_id, pc.total)
      FROM por_categoria pc
    ), '{}'::jsonb),
    'centros_custo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', cc.id, 'nome', cc.nome) ORDER BY cc.nome, cc.id)
      FROM (SELECT DISTINCT v.centro_custo_id AS id, v.centro_nome AS nome FROM valores v WHERE v.centro_custo_id IS NOT NULL) cc
    ), '[]'::jsonb),
    'valores_por_centro_custo', COALESCE((
      SELECT jsonb_object_agg(g.centro_key, g.valores)
      FROM (
        SELECT pcc.centro_key, jsonb_object_agg(pcc.cat_id, pcc.total) AS valores
        FROM por_centro pcc
        GROUP BY pcc.centro_key
      ) g
    ), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ── DFC (caixa) ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fin_dfc_summary(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_saldo_inicial numeric;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();
  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:fluxo:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial
  FROM fin_contas WHERE company_id = v_company_id AND ativo = true;
  v_saldo_inicial := v_saldo_inicial + COALESCE((
    SELECT SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE -valor END)
    FROM fin_lancamentos
    WHERE company_id = v_company_id AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) < p_inicio
  ), 0);

  WITH effective_values AS (
    -- _fin_dfc_effective_allocations não devolve o centro: ele vem da linha de rateio ou, sem
    -- rateio, do próprio lançamento, pelo allocation_id que a função já devolve.
    SELECT allocation.categoria_id, allocation.valor, allocation.tipo,
      CASE WHEN allocation.allocation_source = 'allocation'
        THEN rateio.centro_custo_id
        ELSE ledger.centro_custo_id
      END AS centro_custo_id
    FROM public._fin_dfc_effective_allocations(
      v_company_id,
      p_inicio,
      p_fim
    ) AS allocation
    LEFT JOIN fin_lancamento_rateios rateio
      ON allocation.allocation_source = 'allocation'
     AND rateio.id = allocation.allocation_id
     AND rateio.company_id = v_company_id
    LEFT JOIN fin_lancamentos ledger
      ON allocation.allocation_source = 'entry'
     AND ledger.id = allocation.allocation_id
     AND ledger.company_id = v_company_id
  ), valores AS (
    -- Centro só vale se for da própria empresa; o resto cai em 'sem_centro'.
    SELECT CASE
      WHEN ev.categoria_id IS NOT NULL THEN ev.categoria_id::text
      WHEN ev.tipo = 'RECEITA' THEN '00000000-0000-0000-0000-000000000101'
      ELSE '00000000-0000-0000-0000-000000000102'
    END cat_id, cc.id AS centro_custo_id, cc.nome AS centro_nome, ev.valor
    FROM effective_values ev
    LEFT JOIN fin_centros_custo cc ON cc.id = ev.centro_custo_id AND cc.company_id = v_company_id
  ), por_categoria AS (
    SELECT cat_id, SUM(valor) total
    FROM valores GROUP BY 1
  ), por_centro AS (
    SELECT COALESCE(v.centro_custo_id::text, 'sem_centro') AS centro_key, v.cat_id, SUM(v.valor) AS total
    FROM valores v
    WHERE EXISTS (SELECT 1 FROM valores x WHERE x.centro_custo_id IS NOT NULL)
    GROUP BY 1, 2
  ), categorias_resultado AS (
    SELECT c.id, c.nome, c.codigo, c.tipo, c.parent_id, c.ordem, c.ativo,
      c.grupo, c.centro_custo_padrao_id, c.system_key,
      c.excluir_dos_totais, c.updated_at
    FROM fin_categorias c WHERE c.company_id = v_company_id AND c.ativo = true
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000101'::uuid, 'Sem categoria — Receitas', 'S/C-R',
      'receita', NULL::uuid, 9980, true, NULL, NULL::uuid, NULL, false, now()
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000101')
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000102'::uuid, 'Sem categoria — Despesas', 'S/C-D',
      'despesa', NULL::uuid, 9981, true, NULL, NULL::uuid, NULL, false, now()
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000102')
  )
  SELECT jsonb_build_object(
    'saldo_inicial', v_saldo_inicial,
    'categorias', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.ordem, c.codigo) FROM categorias_resultado c), '[]'::jsonb),
    'valores_por_categoria', COALESCE((SELECT jsonb_object_agg(cat_id, total) FROM por_categoria), '{}'::jsonb),
    'centros_custo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', cc.id, 'nome', cc.nome) ORDER BY cc.nome, cc.id)
      FROM (SELECT DISTINCT v.centro_custo_id AS id, v.centro_nome AS nome FROM valores v WHERE v.centro_custo_id IS NOT NULL) cc
    ), '[]'::jsonb),
    'valores_por_centro_custo', COALESCE((
      SELECT jsonb_object_agg(g.centro_key, g.valores)
      FROM (
        SELECT pcc.centro_key, jsonb_object_agg(pcc.cat_id, pcc.total) AS valores
        FROM por_centro pcc
        GROUP BY pcc.centro_key
      ) g
    ), '{}'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

-- ── Dashboard Financeiro (caixa) ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fin_dashboard_charts(p_start date, p_end date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  _evolucao json;
  _despesas_cat json;
  _despesas_cc json;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['finance:read', 'financeiro:dashboard:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT json_agg(row_to_json(t) ORDER BY t.mes) INTO _evolucao
  FROM (
    SELECT mes,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0) AS receitas,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0) AS despesas,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0)
        - COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0) AS resultado
    FROM (
      SELECT tipo, valor,
        to_char(COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia), 'YYYY-MM') AS mes
      FROM public.fin_lancamentos
      WHERE company_id = v_company
        AND excluir_dos_relatorios IS NOT TRUE
        AND status IN ('REALIZADO', 'CONCILIADO')
        AND tipo != 'TRANSFERENCIA'
        AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
        AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) >= p_start
        AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) <= p_end
    ) y
    GROUP BY mes
  ) t;

  SELECT json_agg(row_to_json(t)) INTO _despesas_cat
  FROM (
    SELECT nome, SUM(valor) AS valor FROM (
      SELECT COALESCE(cat.nome, 'Sem categoria') AS nome, r.valor
      FROM public.fin_lancamento_rateios r
      JOIN public.fin_lancamentos l ON l.id = r.lancamento_id
      LEFT JOIN public.fin_categorias cat ON cat.id = r.categoria_id
      WHERE l.company_id = v_company AND r.company_id = v_company
        AND l.excluir_dos_relatorios IS NOT TRUE
        AND l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo = 'DESPESA'
        AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
        AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) >= p_start
        AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) <= p_end
      UNION ALL
      SELECT COALESCE(cat.nome, 'Sem categoria') AS nome, l.valor
      FROM public.fin_lancamentos l
      LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
      WHERE l.company_id = v_company
        AND l.excluir_dos_relatorios IS NOT TRUE
        AND l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo = 'DESPESA'
        AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
        AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) >= p_start
        AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) <= p_end
        AND NOT EXISTS (
          SELECT 1 FROM public.fin_lancamento_rateios r2
          WHERE r2.lancamento_id = l.id AND r2.company_id = v_company
        )
    ) combined
    GROUP BY nome
    ORDER BY SUM(valor) DESC
    LIMIT 8
  ) t;

  -- Mesmo recorte de despesas_por_categoria, agrupado por centro de custo e sem LIMIT (a soma
  -- fecha com a despesa realizada). Vazio quando nenhuma despesa do período tem centro.
  WITH despesas AS (
    SELECT r.centro_custo_id, r.valor
    FROM public.fin_lancamento_rateios r
    JOIN public.fin_lancamentos l ON l.id = r.lancamento_id
    WHERE l.company_id = v_company AND r.company_id = v_company
      AND l.excluir_dos_relatorios IS NOT TRUE
      AND l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo = 'DESPESA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) >= p_start
      AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) <= p_end
    UNION ALL
    SELECT l.centro_custo_id, l.valor
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.excluir_dos_relatorios IS NOT TRUE
      AND l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo = 'DESPESA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) >= p_start
      AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) <= p_end
      AND NOT EXISTS (
        SELECT 1 FROM public.fin_lancamento_rateios r2
        WHERE r2.lancamento_id = l.id AND r2.company_id = v_company
      )
  ), por_centro AS (
    -- Centro só vale se for da própria empresa; o resto cai em "Sem centro de custo".
    SELECT cc.id AS centro_custo_id, COALESCE(cc.nome, 'Sem centro de custo') AS nome, SUM(d.valor) AS valor
    FROM despesas d
    LEFT JOIN public.fin_centros_custo cc ON cc.id = d.centro_custo_id AND cc.company_id = v_company
    GROUP BY cc.id, cc.nome
  )
  SELECT json_agg(row_to_json(t) ORDER BY t.valor DESC, t.nome) INTO _despesas_cc
  FROM (SELECT pc.centro_custo_id, pc.nome, pc.valor FROM por_centro pc) t
  WHERE EXISTS (SELECT 1 FROM por_centro x WHERE x.centro_custo_id IS NOT NULL);

  RETURN json_build_object(
    'evolucao_mensal', COALESCE(_evolucao, '[]'::json),
    'despesas_por_categoria', COALESCE(_despesas_cat, '[]'::json),
    'despesas_por_centro_custo', COALESCE(_despesas_cc, '[]'::json)
  );
END;
$function$;

-- Força a resolução de colunas dos novos JOIN já no push (PL/pgSQL só valida colunas na 1ª
-- execução — sem isso, erro de coluna estouraria em produção).
DO $$
DECLARE
  v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM r.id, r.company_id, r.centro_custo_id
  FROM public.fin_lancamento_rateios r
  WHERE r.company_id = v_sentinel
  LIMIT 1;

  PERFORM l.id, l.company_id, l.centro_custo_id FROM public.fin_lancamentos l WHERE l.company_id = v_sentinel LIMIT 1;
  PERFORM cp.centro_custo_id FROM public.fin_contas_pagar cp WHERE cp.company_id = v_sentinel LIMIT 1;
  PERFORM cr.centro_custo_id FROM public.fin_contas_receber cr WHERE cr.company_id = v_sentinel LIMIT 1;

  PERFORM a.allocation_source, a.allocation_id, a.lancamento_id
  FROM public._fin_dfc_effective_allocations(v_sentinel, NULL, NULL) a
  LIMIT 1;

  PERFORM cc.id, cc.nome FROM public.fin_centros_custo cc WHERE cc.company_id = v_sentinel LIMIT 1;
END
$$;

-- O DRE foi criado com EXECUTE para PUBLIC (e, por herança, anon); DFC e Dashboard já eram só
-- authenticated/service_role. assert_tenant() barrava anon antes de qualquer leitura — aqui só se
-- alinha a superfície.
REVOKE EXECUTE ON FUNCTION public.get_fin_dre_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_dre_summary(date, date) TO authenticated, service_role;
