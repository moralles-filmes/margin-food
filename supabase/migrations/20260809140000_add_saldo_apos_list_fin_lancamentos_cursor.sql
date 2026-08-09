-- ============================================================================
-- Livro Razão: saldo acumulado por linha (saldo_apos)
--
-- Adiciona `saldo_apos` a cada item de list_fin_lancamentos_cursor — o saldo
-- da conta imediatamente após aquele lançamento, estilo extrato bancário.
--
-- Regras (ver docs/superpowers/specs/2026-08-09-saldo-livro-razao-e-conferencia-extrato-design.md):
-- - Ignora os filtros de Tipo/Origem — eles só decidem o que é exibido, não a
--   verdade do saldo da conta.
-- - NÃO aplica a exclusão de origem='conciliacao' desconciliado (mesma regra
--   já usada em "Saldo em Caixa" — reflete dinheiro real movimentado).
-- - Com p_conta_id: escopo = saldo_inicial daquela conta + lançamentos
--   RECEITA/DESPESA/TRANSFERENCIA que a afetam (mesma fórmula assinada de
--   refresh_saldo_cache).
-- - Sem p_conta_id ("Todas contas"): escopo = soma de saldo_inicial de todas
--   as contas ativas + RECEITA/DESPESA de toda a empresa, excluindo
--   TRANSFERENCIA (movimento interno, não muda o total).
-- - Acumula na mesma ordem do cursor (data_competencia, id) para o saldo
--   decrescer de forma consistente com a ordem visual da tabela.
-- - Bound por p_end quando informado (nada depois de p_end é necessário para
--   o saldo das linhas visíveis).
-- ============================================================================

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
              WHEN l.tipo = 'RECEITA' THEN l.valor
              WHEN l.tipo = 'DESPESA' THEN -l.valor
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

-- Força resolução de colunas em tempo de migration (join novo).
DO $$
DECLARE v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM led.id, led.data_competencia, led.delta
  FROM (
    SELECT l.id, l.data_competencia,
      CASE WHEN l.tipo = 'RECEITA' THEN l.valor WHEN l.tipo = 'DESPESA' THEN -l.valor ELSE 0 END AS delta
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_sentinel AND l.status IN ('REALIZADO', 'CONCILIADO')
  ) led;

  PERFORM COALESCE(SUM(c.saldo_inicial), 0)
  FROM public.fin_contas c
  WHERE c.company_id = v_sentinel AND c.ativo = true;
END $$;
