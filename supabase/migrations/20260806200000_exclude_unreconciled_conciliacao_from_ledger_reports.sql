-- ============================================================================
-- Livro Razão / DRE: excluir lançamentos origem='conciliacao' desconciliados
--
-- Contexto: unreconcile_lancamento (20260806190000) nunca exclui o registro —
-- só desmarca conciliado/conciliado_em/conciliado_por, para permitir o fluxo
-- de corrigir categoria e reconciliar depois. Só que Livro Razão e DRE não
-- filtram por `conciliado`, então o lançamento continuava aparecendo nesses
-- relatórios enquanto estava sendo corrigido — o que o usuário reportou como
-- bug (2026-08-06).
--
-- Para lançamentos `origem='manual'` (a maioria) conciliado=false é o estado
-- normal por meses até alguém bater com o extrato — excluí-los do Livro
-- Razão/DRE seria uma regressão grave (esconderia quase tudo). Mas para
-- `origem='conciliacao'` o registro só existe já `conciliado=true`; se foi
-- desmarcado, é porque está sob revisão (ex: sem categoria) e não deveria
-- contar até ser reconciliado de novo.
--
-- Fix: adiciona `AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)`
-- em list_fin_lancamentos_cursor, get_fin_lancamentos_totais (Livro Razão) e
-- get_fin_dre_summary (só nas 2 branches que leem fin_lancamentos direto —
-- as 4 branches de CP/CR em aberto não têm coluna `origem`, não se aplicam).
--
-- Deliberadamente NÃO tocado (fora de escopo, refletem o dinheiro real que
-- já saiu/entrou na conta, independente da categorização estar correta):
-- Saldo em Caixa (fin_contas_saldo_cache / refresh_saldo_cache), Dashboard
-- Financeiro (get_fin_dashboard_summary/charts), get_fin_kpis, DFC.
-- ============================================================================

-- 1. list_fin_lancamentos_cursor (overload com p_origem — a única chamada
--    pelo frontend; LivroRazaoSection.tsx sempre passa p_origem)
CREATE OR REPLACE FUNCTION public.list_fin_lancamentos_cursor(
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date,
  p_status text DEFAULT NULL::text,
  p_tipo text DEFAULT NULL::text,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_cursor_date date DEFAULT NULL::date,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  _items json;
  _effective_limit int;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);

  SELECT json_agg(row_to_json(t)) INTO _items
  FROM (
    SELECT
      l.id, l.tipo, l.valor, l.data_competencia, l.data_vencimento, l.data_pagamento,
      l.descricao, l.status,
      l.conta_id, l.conta_destino_id, l.categoria_id, l.centro_custo_id,
      l.forma_pagamento, l.recorrente, l.observacoes, l.created_at, l.updated_at,
      l.lancamento_pai_id, l.conciliado, l.referencia_modulo, l.referencia_id,
      l.origem
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.status != 'CANCELADO'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND (p_start IS NULL OR l.data_competencia >= p_start)
      AND (p_end IS NULL OR l.data_competencia <= p_end)
      AND (p_status IS NULL OR l.status = p_status)
      AND (p_tipo IS NULL OR l.tipo = p_tipo)
      AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
      AND (p_search IS NULL OR l.descricao ILIKE '%' || p_search || '%')
      AND (p_origem IS NULL OR l.origem = p_origem)
      AND (
        p_cursor_date IS NULL
        OR l.data_competencia < p_cursor_date
        OR (l.data_competencia = p_cursor_date AND l.id < p_cursor_id)
      )
    ORDER BY l.data_competencia DESC, l.id DESC
    LIMIT _effective_limit
  ) t;

  RETURN json_build_object(
    'items', COALESCE(_items, '[]'::json),
    'has_more', (SELECT json_array_length(COALESCE(_items, '[]'::json)) = _effective_limit)
  );
END;
$function$;

-- 2. get_fin_lancamentos_totais (mesma exclusão)
CREATE OR REPLACE FUNCTION public.get_fin_lancamentos_totais(
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date,
  p_tipo text DEFAULT NULL::text,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT NULL::text
)
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
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT
    COALESCE(SUM(l.valor) FILTER (WHERE l.tipo = 'RECEITA'), 0),
    COALESCE(SUM(l.valor) FILTER (WHERE l.tipo = 'DESPESA'), 0),
    COALESCE(SUM(l.valor) FILTER (WHERE l.tipo = 'TRANSFERENCIA'), 0)
  INTO v_receita, v_despesa, v_transferencia
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company
    AND l.status != 'CANCELADO'
    AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
    AND (p_start IS NULL OR l.data_competencia >= p_start)
    AND (p_end IS NULL OR l.data_competencia <= p_end)
    AND (p_tipo IS NULL OR l.tipo = p_tipo)
    AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
    AND (p_origem IS NULL OR l.origem = p_origem);

  RETURN json_build_object(
    'total_receita', v_receita,
    'total_despesa', v_despesa,
    'total_transferencia', v_transferencia,
    'resultado', v_receita - v_despesa
  );
END;
$function$;

-- 3. get_fin_dre_summary (exclusão só nas branches 1 e 2, que leem
--    fin_lancamentos direto; branches 3-6 são CP/CR em aberto, sem coluna origem)
CREATE OR REPLACE FUNCTION public.get_fin_dre_summary(p_mes text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_inicio date;
  v_fim date;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:dre:view', 'financeiro:relatorios:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_inicio := (p_mes || '-01')::date;
  v_fim := (v_inicio + interval '1 month' - interval '1 day')::date;

  WITH effective_values AS (
    -- 1. Lançamentos REALIZADO/CONCILIADO com rateio
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_lancamentos l ON l.id = r.lancamento_id AND l.company_id = v_company_id
    WHERE l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND l.data_competencia BETWEEN v_inicio AND v_fim
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND r.company_id = v_company_id
    UNION ALL
    -- 2. Lançamentos REALIZADO/CONCILIADO sem rateio
    SELECT l.categoria_id, l.valor
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND l.data_competencia BETWEEN v_inicio AND v_fim
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
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
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN v_inicio AND v_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 4. Contas a PAGAR em aberto sem rateio
    SELECT cp.categoria_id, cp.valor
    FROM fin_contas_pagar cp
    WHERE cp.company_id = v_company_id
      AND cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN v_inicio AND v_fim
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
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN v_inicio AND v_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 6. Contas a RECEBER em aberto sem rateio
    SELECT cr.categoria_id, cr.valor
    FROM fin_contas_receber cr
    WHERE cr.company_id = v_company_id
      AND cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN v_inicio AND v_fim
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
    'mes', p_mes,
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
