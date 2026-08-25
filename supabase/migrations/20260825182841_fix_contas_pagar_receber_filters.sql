-- Alinha as duas listagens financeiras:
-- 1. VENCIDO é uma condição derivada (data vencida + título ainda aberto), não
--    um valor de status persistido confiável.
-- 2. A busca por descrição é normalizada e indexada.
-- 3. O mesmo retorno paginado inclui total e quantidade de todos os registros
--    filtrados, sem limitar o resumo aos 50 itens carregados na tela.

ALTER TABLE public.fin_contas_receber
  ADD COLUMN IF NOT EXISTS descricao_unaccent text
    GENERATED ALWAYS AS (lower(public.immutable_unaccent(descricao))) STORED;

CREATE INDEX IF NOT EXISTS idx_fin_contas_receber_descricao_unaccent
  ON public.fin_contas_receber USING gin (descricao_unaccent gin_trgm_ops);

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
  _effective_limit integer;
  _filtered_total numeric;
  _filtered_count bigint;
  _has_more boolean;
  v_company uuid;
  v_search text;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);
  v_search := NULLIF(lower(public.immutable_unaccent(btrim(p_search))), '');

  WITH filtered AS MATERIALIZED (
    SELECT
      c.id, c.descricao, c.valor, c.data_vencimento, c.data_pagamento,
      c.fornecedor, c.status, c.categoria_id, c.centro_custo_id, c.conta_id,
      c.forma_pagamento, c.observacoes, c.created_at, c.updated_at,
      c.aprovado_por, c.aprovado_em, c.valor_pago
    FROM public.fin_contas_pagar c
    WHERE c.company_id = v_company
      AND c.status != 'CANCELADO'
      AND (
        p_status IS NULL
        OR (
          p_status = 'VENCIDO'
          AND c.data_vencimento < CURRENT_DATE
          AND c.status NOT IN ('PAGO', 'CANCELADO')
        )
        OR (p_status <> 'VENCIDO' AND c.status = p_status)
      )
      AND (p_fornecedor IS NULL OR c.fornecedor ILIKE '%' || p_fornecedor || '%')
      AND (v_search IS NULL OR c.descricao_unaccent LIKE '%' || v_search || '%')
      AND (p_data_de IS NULL OR c.data_vencimento >= p_data_de)
      AND (p_data_ate IS NULL OR c.data_vencimento <= p_data_ate)
      AND (p_conta_id IS NULL OR c.conta_id = p_conta_id)
      AND (
        (NOT COALESCE(p_sem_categoria, false) AND p_categoria_id IS NULL)
        OR (
          COALESCE(p_sem_categoria, false) AND c.categoria_id IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.fin_lancamento_rateios flr
            WHERE flr.lancamento_id = c.id AND flr.categoria_id IS NOT NULL
          )
        )
        OR (p_categoria_id IS NOT NULL AND c.categoria_id = p_categoria_id)
      )
  ), page_rows AS (
    SELECT f.*
    FROM filtered f
    WHERE p_cursor_date IS NULL
      OR f.data_vencimento < p_cursor_date
      OR (f.data_vencimento = p_cursor_date AND f.id < p_cursor_id)
    ORDER BY f.data_vencimento DESC, f.id DESC
    LIMIT _effective_limit + 1
  ), visible_rows AS (
    SELECT p.*
    FROM page_rows p
    ORDER BY p.data_vencimento DESC, p.id DESC
    LIMIT _effective_limit
  )
  SELECT
    COALESCE(
      (SELECT json_agg(row_to_json(v) ORDER BY v.data_vencimento DESC, v.id DESC) FROM visible_rows v),
      '[]'::json
    ),
    COALESCE((SELECT SUM(f.valor) FROM filtered f), 0),
    (SELECT COUNT(*) FROM filtered f),
    (SELECT COUNT(*) FROM page_rows p) > _effective_limit
  INTO _items, _filtered_total, _filtered_count, _has_more;

  RETURN json_build_object(
    'items', _items,
    'has_more', _has_more,
    'filtered_total', _filtered_total,
    'filtered_count', _filtered_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_fin_contas_pagar_cursor(text, text, text, integer, date, uuid, date, date, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_fin_contas_pagar_cursor(text, text, text, integer, date, uuid, date, date, uuid, uuid, boolean) TO authenticated, service_role;

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
  _effective_limit integer;
  _filtered_total numeric;
  _filtered_count bigint;
  _has_more boolean;
  v_company uuid;
  v_search text;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);
  v_search := NULLIF(lower(public.immutable_unaccent(btrim(p_search))), '');

  WITH filtered AS MATERIALIZED (
    SELECT
      c.id, c.descricao, c.valor, c.data_vencimento, c.data_recebimento,
      c.cliente, c.status, c.categoria_id, c.conta_id,
      c.forma_pagamento, c.observacoes, c.created_at, c.updated_at,
      c.valor_recebido
    FROM public.fin_contas_receber c
    WHERE c.company_id = v_company
      AND c.status != 'CANCELADO'
      AND (
        p_status IS NULL
        OR (
          p_status = 'VENCIDO'
          AND c.data_vencimento < CURRENT_DATE
          AND c.status NOT IN ('RECEBIDO', 'CANCELADO')
        )
        OR (p_status <> 'VENCIDO' AND c.status = p_status)
      )
      AND (p_cliente IS NULL OR c.cliente ILIKE '%' || p_cliente || '%')
      AND (v_search IS NULL OR c.descricao_unaccent LIKE '%' || v_search || '%')
      AND (p_data_de IS NULL OR c.data_vencimento >= p_data_de)
      AND (p_data_ate IS NULL OR c.data_vencimento <= p_data_ate)
      AND (p_conta_id IS NULL OR c.conta_id = p_conta_id)
      AND (
        (NOT COALESCE(p_sem_categoria, false) AND p_categoria_id IS NULL)
        OR (
          COALESCE(p_sem_categoria, false) AND c.categoria_id IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.fin_lancamento_rateios flr
            WHERE flr.lancamento_id = c.id AND flr.categoria_id IS NOT NULL
          )
        )
        OR (p_categoria_id IS NOT NULL AND c.categoria_id = p_categoria_id)
      )
  ), page_rows AS (
    SELECT f.*
    FROM filtered f
    WHERE p_cursor_date IS NULL
      OR f.data_vencimento < p_cursor_date
      OR (f.data_vencimento = p_cursor_date AND f.id < p_cursor_id)
    ORDER BY f.data_vencimento DESC, f.id DESC
    LIMIT _effective_limit + 1
  ), visible_rows AS (
    SELECT p.*
    FROM page_rows p
    ORDER BY p.data_vencimento DESC, p.id DESC
    LIMIT _effective_limit
  )
  SELECT
    COALESCE(
      (SELECT json_agg(row_to_json(v) ORDER BY v.data_vencimento DESC, v.id DESC) FROM visible_rows v),
      '[]'::json
    ),
    COALESCE((SELECT SUM(f.valor) FROM filtered f), 0),
    (SELECT COUNT(*) FROM filtered f),
    (SELECT COUNT(*) FROM page_rows p) > _effective_limit
  INTO _items, _filtered_total, _filtered_count, _has_more;

  RETURN json_build_object(
    'items', _items,
    'has_more', _has_more,
    'filtered_total', _filtered_total,
    'filtered_count', _filtered_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_fin_contas_receber_cursor(text, text, text, integer, date, uuid, date, date, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_fin_contas_receber_cursor(text, text, text, integer, date, uuid, date, date, uuid, uuid, boolean) TO authenticated, service_role;

-- Força a resolução das colunas, do rateio e dos predicados novos no deploy.
DO $$
DECLARE
  v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM c.id
  FROM public.fin_contas_pagar c
  WHERE c.company_id = v_sentinel
    AND c.data_vencimento < CURRENT_DATE
    AND c.status NOT IN ('PAGO', 'CANCELADO')
    AND c.descricao_unaccent LIKE '%teste%'
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios flr
      WHERE flr.lancamento_id = c.id AND flr.categoria_id IS NOT NULL
    )
  LIMIT 1;

  PERFORM c.id
  FROM public.fin_contas_receber c
  WHERE c.company_id = v_sentinel
    AND c.data_vencimento < CURRENT_DATE
    AND c.status NOT IN ('RECEBIDO', 'CANCELADO')
    AND c.descricao_unaccent LIKE '%teste%'
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios flr
      WHERE flr.lancamento_id = c.id AND flr.categoria_id IS NOT NULL
    )
  LIMIT 1;
END $$;
