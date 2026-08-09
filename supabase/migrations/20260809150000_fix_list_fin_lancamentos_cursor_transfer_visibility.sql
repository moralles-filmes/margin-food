-- Corrige list_fin_lancamentos_cursor: transferências de ENTRADA na conta filtrada
-- não apareciam como linha na lista, mas já entravam no cálculo de saldo_apos,
-- quebrando o invariante saldo(n) = saldo(n-1) ± valor(n) no Livro Razão filtrado
-- por conta. Ver CLAUDE.md / relatório de revisão final da feature
-- "saldo Livro Razão + conferência de extrato" (2026-08-09).
--
-- Mudança 1 (bug real, produção): filtered.WHERE ganha
--   OR l.conta_destino_id = p_conta_id
-- para exibir também as transferências recebidas pela conta filtrada.
--
-- Mudança 2 (hardening, sem impacto hoje): no CASE de ledger (ramo
-- p_conta_id IS NOT NULL), os branches RECEITA/DESPESA passam a exigir
-- l.conta_id = p_conta_id explicitamente, evitando que uma linha só
-- alcançada via conta_destino_id (hoje só TRANSFERENCIA) seja contada por
-- engano se um dia RECEITA/DESPESA também usarem conta_destino_id. O ramo
-- ELSE (p_conta_id IS NULL) não é alterado.

CREATE OR REPLACE FUNCTION public.list_fin_lancamentos_cursor(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_conta_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_cursor_date date DEFAULT NULL::date, p_cursor_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    WITH filtered AS (
      SELECT l.*
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.status != 'CANCELADO'
        AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
        AND (p_start IS NULL OR l.data_competencia >= p_start)
        AND (p_end IS NULL OR l.data_competencia <= p_end)
        AND (p_status IS NULL OR l.status = p_status)
        AND (p_tipo IS NULL OR l.tipo = p_tipo)
        AND (p_conta_id IS NULL OR l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
        AND (p_search IS NULL OR l.descricao ILIKE '%' || p_search || '%')
        AND (p_origem IS NULL OR l.origem = p_origem)
        AND (
          p_cursor_date IS NULL
          OR l.data_competencia < p_cursor_date
          OR (l.data_competencia = p_cursor_date AND l.id < p_cursor_id)
        )
      ORDER BY l.data_competencia DESC, l.id DESC
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
      SELECT l.id, l.data_competencia,
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
        AND (p_end IS NULL OR l.data_competencia <= p_end)
    ),
    running AS (
      SELECT led.id,
        (SELECT v FROM saldo_inicial_base) + SUM(led.delta) OVER (
          ORDER BY led.data_competencia ASC, led.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS saldo_apos
      FROM ledger led
    )
    SELECT
      f.id, f.tipo, f.valor, f.data_competencia, f.data_vencimento, f.data_pagamento,
      f.descricao, f.status,
      f.conta_id, f.conta_destino_id, f.categoria_id, f.centro_custo_id,
      f.forma_pagamento, f.recorrente, f.observacoes, f.created_at, f.updated_at,
      f.lancamento_pai_id, f.conciliado, f.referencia_modulo, f.referencia_id,
      f.origem, r.saldo_apos
    FROM filtered f
    LEFT JOIN running r ON r.id = f.id
    ORDER BY f.data_competencia DESC, f.id DESC
  ) t;

  RETURN json_build_object(
    'items', COALESCE(_items, '[]'::json),
    'has_more', (SELECT json_array_length(COALESCE(_items, '[]'::json)) = _effective_limit)
  );
END;
$function$;
