CREATE OR REPLACE FUNCTION public.get_inactive_stock_items()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_permission(auth.uid(), 'stock:read') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  RETURN (
    SELECT COALESCE(json_agg(row_to_json(sub) ORDER BY sub.days_inactive DESC), '[]'::json)
    FROM (
      SELECT
        p.id AS item_id,
        p.nome_produto AS item_name,
        p.categoria AS category,
        p.local_estoque AS location,
        p.unidade_medida,
        p.inactivity_days_threshold,
        COALESCE(p.last_movement_at, p.created_at) AS last_movement_at,
        EXTRACT(DAY FROM now() - COALESCE(p.last_movement_at, p.created_at))::int AS days_inactive,
        COALESCE((
          SELECT SUM(
            CASE
              WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
              WHEN m.tipo LIKE 'ENTRADA%' OR m.tipo = 'AJUSTE' OR m.tipo LIKE '%DEVOLUCAO%' THEN m.quantidade
              ELSE -m.quantidade
            END
          )
          FROM movimentacoes_estoque m WHERE m.produto_id = p.id AND m.status = 'ATIVO'
        ), 0) AS stock_qty
      FROM produtos p
      WHERE p.ativo = true
        AND p.inactivity_days_threshold IS NOT NULL
        AND EXTRACT(DAY FROM now() - COALESCE(p.last_movement_at, p.created_at)) >= p.inactivity_days_threshold
    ) sub
  );
END;
$$;

-- 6) get_spend_by_sector → stock:read (used by Relatórios which already requires stock:read)