-- Contas a Pagar / Contas a Receber / Livro Razao:
-- (1) filtro de Categoria (incluindo "SEM CATEGORIA") nos 3 modulos;
-- (2) Contas a Receber ganha os mesmos filtros de periodo (dia/semana/mes) e conta de pagamento
--     ja entregues em Contas a Pagar (migration 20260811120000).
--
-- CREATE OR REPLACE nao substitui quando a lista de parametros muda (mesmo com DEFAULT) — precisa
-- DROP explicito da assinatura antiga antes, senao fica um overload coexistindo (ambiguidade no
-- PostgREST), mesma regra ja documentada no CLAUDE.md.

/* ─────────────────────────────────────────────────────────────────────────
   1. list_fin_contas_pagar_cursor — + p_categoria_id / p_sem_categoria
   ───────────────────────────────────────────────────────────────────────── */
DROP FUNCTION IF EXISTS public.list_fin_contas_pagar_cursor(text, text, text, integer, date, uuid, date, date, uuid);

CREATE OR REPLACE FUNCTION public.list_fin_contas_pagar_cursor(
  p_status text DEFAULT NULL::text,
  p_fornecedor text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_cursor_date date DEFAULT NULL::date,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_data_de date DEFAULT NULL::date,
  p_data_ate date DEFAULT NULL::date,
  p_conta_id uuid DEFAULT NULL::uuid,
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
    SELECT
      c.id, c.descricao, c.valor, c.data_vencimento, c.data_pagamento,
      c.fornecedor, c.status, c.categoria_id, c.centro_custo_id, c.conta_id,
      c.forma_pagamento, c.observacoes, c.created_at, c.updated_at,
      c.aprovado_por, c.aprovado_em, c.valor_pago
    FROM public.fin_contas_pagar c
    WHERE c.company_id = v_company
      AND c.status != 'CANCELADO'
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_fornecedor IS NULL OR c.fornecedor ILIKE '%' || p_fornecedor || '%')
      AND (p_search IS NULL OR c.descricao ILIKE '%' || p_search || '%')
      AND (p_data_de IS NULL OR c.data_vencimento >= p_data_de)
      AND (p_data_ate IS NULL OR c.data_vencimento <= p_data_ate)
      AND (p_conta_id IS NULL OR c.conta_id = p_conta_id)
      AND (
        (NOT COALESCE(p_sem_categoria, false) AND p_categoria_id IS NULL)
        OR (COALESCE(p_sem_categoria, false) AND c.categoria_id IS NULL)
        OR (p_categoria_id IS NOT NULL AND c.categoria_id = p_categoria_id)
      )
      AND (
        p_cursor_date IS NULL
        OR c.data_vencimento < p_cursor_date
        OR (c.data_vencimento = p_cursor_date AND c.id < p_cursor_id)
      )
    ORDER BY c.data_vencimento DESC, c.id DESC
    LIMIT _effective_limit
  ) t;

  RETURN json_build_object(
    'items', COALESCE(_items, '[]'::json),
    'has_more', (SELECT json_array_length(COALESCE(_items, '[]'::json)) = _effective_limit)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_fin_contas_pagar_cursor(text, text, text, integer, date, uuid, date, date, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_fin_contas_pagar_cursor(text, text, text, integer, date, uuid, date, date, uuid, uuid, boolean) TO authenticated, service_role;

/* ─────────────────────────────────────────────────────────────────────────
   2. list_fin_contas_receber_cursor — + periodo (p_data_de/p_data_ate),
      p_conta_id (mesmos filtros de Contas a Pagar) e p_categoria_id/p_sem_categoria
   ───────────────────────────────────────────────────────────────────────── */
DROP FUNCTION IF EXISTS public.list_fin_contas_receber_cursor(text, text, text, integer, date, uuid);

CREATE OR REPLACE FUNCTION public.list_fin_contas_receber_cursor(
  p_status text DEFAULT NULL::text,
  p_cliente text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_cursor_date date DEFAULT NULL::date,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_data_de date DEFAULT NULL::date,
  p_data_ate date DEFAULT NULL::date,
  p_conta_id uuid DEFAULT NULL::uuid,
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
    SELECT
      c.id, c.descricao, c.valor, c.data_vencimento, c.data_recebimento,
      c.cliente, c.status, c.categoria_id, c.conta_id,
      c.forma_pagamento, c.observacoes, c.created_at, c.updated_at,
      c.valor_recebido
    FROM public.fin_contas_receber c
    WHERE c.company_id = v_company
      AND c.status != 'CANCELADO'
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_cliente IS NULL OR c.cliente ILIKE '%' || p_cliente || '%')
      AND (p_search IS NULL OR c.descricao ILIKE '%' || p_search || '%')
      AND (p_data_de IS NULL OR c.data_vencimento >= p_data_de)
      AND (p_data_ate IS NULL OR c.data_vencimento <= p_data_ate)
      AND (p_conta_id IS NULL OR c.conta_id = p_conta_id)
      AND (
        (NOT COALESCE(p_sem_categoria, false) AND p_categoria_id IS NULL)
        OR (COALESCE(p_sem_categoria, false) AND c.categoria_id IS NULL)
        OR (p_categoria_id IS NOT NULL AND c.categoria_id = p_categoria_id)
      )
      AND (
        p_cursor_date IS NULL
        OR c.data_vencimento < p_cursor_date
        OR (c.data_vencimento = p_cursor_date AND c.id < p_cursor_id)
      )
    ORDER BY c.data_vencimento DESC, c.id DESC
    LIMIT _effective_limit
  ) t;

  RETURN json_build_object(
    'items', COALESCE(_items, '[]'::json),
    'has_more', (SELECT json_array_length(COALESCE(_items, '[]'::json)) = _effective_limit)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_fin_contas_receber_cursor(text, text, text, integer, date, uuid, date, date, uuid, uuid, boolean) TO authenticated, service_role;

/* ─────────────────────────────────────────────────────────────────────────
   3. list_fin_lancamentos_cursor (overload com p_origem) — + p_categoria_id/p_sem_categoria
      O overload de 9 parametros (sem p_origem) e dead code pre-existente e
      permanece intocado.
   ───────────────────────────────────────────────────────────────────────── */
DROP FUNCTION IF EXISTS public.list_fin_lancamentos_cursor(date, date, text, text, uuid, text, integer, date, uuid, text);

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
          (NOT COALESCE(p_sem_categoria, false) AND p_categoria_id IS NULL)
          OR (COALESCE(p_sem_categoria, false) AND l.categoria_id IS NULL)
          OR (p_categoria_id IS NOT NULL AND l.categoria_id = p_categoria_id)
        )
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

GRANT EXECUTE ON FUNCTION public.list_fin_lancamentos_cursor(date, date, text, text, uuid, text, integer, date, uuid, text, uuid, boolean) TO authenticated, service_role;

/* ─────────────────────────────────────────────────────────────────────────
   4. get_fin_lancamentos_totais — + p_categoria_id/p_sem_categoria (mesmo criterio
      da lista, para a barra "Entradas/Saidas/Resultado" do Livro Razao continuar
      batendo com o filtro de categoria aplicado)
   ───────────────────────────────────────────────────────────────────────── */
DROP FUNCTION IF EXISTS public.get_fin_lancamentos_totais(date, date, text, uuid, text);

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
    AND (p_start IS NULL OR l.data_competencia >= p_start)
    AND (p_end IS NULL OR l.data_competencia <= p_end)
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
