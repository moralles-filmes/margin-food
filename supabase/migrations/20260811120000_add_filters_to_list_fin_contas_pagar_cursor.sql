-- Contas a Pagar: filtros de periodo (dia/semana/mes) e conta de pagamento na lista de contas a pagar.
-- CREATE OR REPLACE nao substitui quando a lista de parametros muda (mesmo com DEFAULT) — precisa
-- DROP explicito da assinatura antiga antes, senao fica um 2o overload coexistindo (ambiguidade no PostgREST).
DROP FUNCTION IF EXISTS public.list_fin_contas_pagar_cursor(text, text, text, integer, date, uuid);

CREATE OR REPLACE FUNCTION public.list_fin_contas_pagar_cursor(
  p_status text DEFAULT NULL::text,
  p_fornecedor text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_cursor_date date DEFAULT NULL::date,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_data_de date DEFAULT NULL::date,
  p_data_ate date DEFAULT NULL::date,
  p_conta_id uuid DEFAULT NULL::uuid
)
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

REVOKE ALL ON FUNCTION public.list_fin_contas_pagar_cursor(text, text, text, integer, date, uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_fin_contas_pagar_cursor(text, text, text, integer, date, uuid, date, date, uuid) TO authenticated, service_role;
