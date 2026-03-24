
DROP FUNCTION IF EXISTS public.get_inactive_stock_items();

CREATE OR REPLACE FUNCTION public.get_inactive_stock_items()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_result json;
BEGIN
  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
  INTO v_result
  FROM (
    SELECT
      p.id AS item_id,
      p.nome_produto AS item_name,
      p.categoria AS category,
      p.local_estoque AS location,
      p.unidade_medida,
      coalesce(p.inactivity_days_threshold, 30) AS inactivity_days_threshold,
      coalesce(p.last_movement_at, p.created_at) AS last_movement_at,
      extract(day FROM now() - coalesce(p.last_movement_at, p.created_at))::int AS days_inactive,
      coalesce(s.saldo, 0) AS stock_qty
    FROM public.produtos p
    LEFT JOIN LATERAL (
      SELECT sum(
        CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END
      ) AS saldo
      FROM public.movimentacoes_estoque m
      WHERE m.produto_id = p.id
        AND m.status = 'ATIVO'
        AND m.company_id = v_company_id
    ) s ON true
    WHERE p.company_id = v_company_id
      AND p.ativo = true
      AND extract(day FROM now() - coalesce(p.last_movement_at, p.created_at))::int
          >= coalesce(p.inactivity_days_threshold, 30)
    ORDER BY days_inactive DESC
  ) t;

  RETURN v_result;
END;
$$;
