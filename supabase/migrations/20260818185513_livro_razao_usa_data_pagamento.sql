-- ============================================================================
-- Livro Razao: filtro, agrupamento por dia, paginacao e saldo corrente devem
-- seguir a data real de caixa (pagamento/conciliacao), nao a competencia.
-- ----------------------------------------------------------------------------
-- Bug reportado: despesa paga hoje (data_pagamento) via Contas a Pagar
-- aparecia no Livro Razao agrupada no dia da competencia (ex: 24/07), porque
-- list_fin_lancamentos_cursor filtrava/ordenava/agrupava por data_competencia
-- em vez de data_pagamento. O mesmo valia para o saldo corrente ("saldo_apos",
-- janela SUM() OVER) e para get_fin_lancamentos_totais / get_fin_saldo_atual.
--
-- O Livro Razao e descrito como "ledger central — registra movimentacoes
-- REALIZADAS" e mostra saldo bancario corrente — deve seguir o regime de
-- caixa, igual ao DFC (COALESCE(data_pagamento, conciliado_em::date,
-- data_competencia), ja usado em fin_dfc_summary/fin_dashboard desde as
-- migrations 20260610120300/20260718120000/20260812161758). data_competencia
-- continua intocada nas colunas retornadas (ainda alimenta o DRE e o detalhe
-- do lancamento) — so o campo novo `data_ledger` passa a mandar em
-- filtro/ordenacao/agrupamento/saldo.
--
-- Escopo confirmado em producao antes da correcao: 26 lancamentos afetados,
-- todos origem='espelho_cp' (baixa de Contas a Pagar), nenhum manual e
-- nenhuma Conta a Receber.
--
-- Assinaturas das 3 funcoes abaixo nao mudam (so o corpo) — CREATE OR REPLACE
-- e suficiente, sem DROP, sem risco de overload no PostgREST.
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
  p_origem text DEFAULT NULL::text,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_sem_categoria boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      SELECT l.*,
        COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) AS data_ledger
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.status != 'CANCELADO'
        AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
        AND (p_start IS NULL OR COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) >= p_start)
        AND (p_end IS NULL OR COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= p_end)
        AND (p_status IS NULL OR l.status = p_status)
        AND (p_tipo IS NULL OR l.tipo = p_tipo)
        AND (p_conta_id IS NULL OR l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
        AND (p_search IS NULL OR l.descricao ILIKE '%' || p_search || '%')
        AND (p_origem IS NULL OR l.origem = p_origem)
        AND (
          (NOT COALESCE(p_sem_categoria, false) AND p_categoria_id IS NULL)
          OR (COALESCE(p_sem_categoria, false) AND l.categoria_id IS NULL)
          OR (p_categoria_id IS NOT NULL AND l.categoria_id = p_categoria_id)
        )
        AND (
          p_cursor_date IS NULL
          OR COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) < p_cursor_date
          OR (COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) = p_cursor_date AND l.id < p_cursor_id)
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
        COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) AS data_ledger,
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
        AND (p_end IS NULL OR COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= p_end)
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

GRANT EXECUTE ON FUNCTION public.list_fin_lancamentos_cursor(date, date, text, text, uuid, text, integer, date, uuid, text, uuid, boolean) TO authenticated, service_role;

/* ─────────────────────────────────────────────────────────────────────────
   get_fin_lancamentos_totais — barra Entradas/Saidas/Resultado do Livro
   Razao deve bater com a mesma janela de datas mostrada na lista.
   ───────────────────────────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.get_fin_lancamentos_totais(
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date,
  p_tipo text DEFAULT NULL::text,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT NULL::text,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_sem_categoria boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    AND (p_start IS NULL OR COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) >= p_start)
    AND (p_end IS NULL OR COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= p_end)
    AND (p_tipo IS NULL OR l.tipo = p_tipo)
    AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
    AND (p_origem IS NULL OR l.origem = p_origem)
    AND (
      (NOT COALESCE(p_sem_categoria, false) AND p_categoria_id IS NULL)
      OR (COALESCE(p_sem_categoria, false) AND l.categoria_id IS NULL)
      OR (p_categoria_id IS NOT NULL AND l.categoria_id = p_categoria_id)
    );

  RETURN json_build_object(
    'total_receita', v_receita,
    'total_despesa', v_despesa,
    'total_transferencia', v_transferencia,
    'resultado', v_receita - v_despesa
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_fin_lancamentos_totais(date, date, text, uuid, text, uuid, boolean) TO authenticated, service_role;

/* ─────────────────────────────────────────────────────────────────────────
   get_fin_saldo_atual — card "Saldo atual" do Livro Razao pela data filtrada
   deve refletir o mesmo corte de caixa usado na lista/saldo corrente.
   ───────────────────────────────────────────────────────────────────────── */
CREATE OR REPLACE FUNCTION public.get_fin_saldo_atual(p_conta_id uuid DEFAULT NULL::uuid, p_data date DEFAULT NULL::date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company uuid;
  v_saldo numeric;
  v_saldo_inicial numeric;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_data IS NULL THEN
    IF p_conta_id IS NOT NULL THEN
      SELECT sc.saldo INTO v_saldo
      FROM public.fin_contas_saldo_cache sc
      JOIN public.fin_contas c ON c.id = sc.conta_id
      WHERE sc.conta_id = p_conta_id AND c.company_id = v_company;
    ELSE
      SELECT COALESCE(SUM(sc.saldo), 0) INTO v_saldo
      FROM public.fin_contas_saldo_cache sc
      JOIN public.fin_contas c ON c.id = sc.conta_id
      WHERE c.company_id = v_company AND c.ativo = true;
    END IF;

    RETURN COALESCE(v_saldo, 0);
  END IF;

  IF p_conta_id IS NOT NULL THEN
    SELECT c.saldo_inicial INTO v_saldo_inicial
    FROM public.fin_contas c
    WHERE c.id = p_conta_id AND c.company_id = v_company;

    IF v_saldo_inicial IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    SELECT v_saldo_inicial + COALESCE(SUM(
      CASE
        WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = p_conta_id THEN -l.valor
        WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = p_conta_id THEN l.valor
        WHEN l.tipo = 'RECEITA' AND l.conta_id = p_conta_id THEN l.valor
        WHEN l.tipo = 'DESPESA' AND l.conta_id = p_conta_id THEN -l.valor
        ELSE 0
      END
    ), 0) INTO v_saldo
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND (l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
      AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= p_data;

    RETURN v_saldo;
  END IF;

  SELECT COALESCE(SUM(c.saldo_inicial), 0) INTO v_saldo_inicial
  FROM public.fin_contas c
  WHERE c.company_id = v_company AND c.ativo = true;

  SELECT v_saldo_inicial + COALESCE(SUM(
    CASE
      WHEN l.tipo = 'RECEITA' THEN l.valor
      WHEN l.tipo = 'DESPESA' THEN -l.valor
      ELSE 0
    END
  ), 0) INTO v_saldo
  FROM public.fin_lancamentos l
  JOIN public.fin_contas c ON c.id = l.conta_id
  WHERE l.company_id = v_company
    AND l.status IN ('REALIZADO', 'CONCILIADO')
    AND l.tipo IN ('RECEITA', 'DESPESA')
    AND c.ativo = true
    AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= p_data;

  RETURN v_saldo;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_fin_saldo_atual(uuid, date) TO authenticated;

-- ── DO-block: forca resolucao de colunas no db push (regra CLAUDE.md) ──────
DO $$
DECLARE
  v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM COALESCE(SUM(l.valor) FILTER (WHERE l.tipo = 'RECEITA'), 0)
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_sentinel
    AND l.status != 'CANCELADO'
    AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= '1900-01-31'::date;

  PERFORM l.id, COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) AS data_ledger
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_sentinel
  LIMIT 1;

  PERFORM COALESCE(SUM(
    CASE WHEN l.tipo = 'RECEITA' THEN l.valor WHEN l.tipo = 'DESPESA' THEN -l.valor ELSE 0 END
  ), 0)
  FROM public.fin_lancamentos l
  JOIN public.fin_contas c ON c.id = l.conta_id
  WHERE l.company_id = v_sentinel
    AND l.status IN ('REALIZADO', 'CONCILIADO')
    AND l.tipo IN ('RECEITA', 'DESPESA')
    AND c.ativo = true
    AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= '1900-01-31'::date;
END $$;
