CREATE OR REPLACE FUNCTION public.get_stock_summary()
  RETURNS json
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_stock_value', COALESCE(agg.total_value, 0),
    'items_count', COALESCE(agg.items_count, 0),
    'missing_cost_items_count', COALESCE(agg.missing_cost, 0),
    'updated_at', now(),
    'breakdown_by_category', COALESCE(agg.by_category, '[]'::json)
  ) INTO result
  FROM (
    SELECT
      SUM(CASE WHEN unit_cost > 0 THEN saldo * unit_cost ELSE 0 END) AS total_value,
      COUNT(*) AS items_count,
      COUNT(*) FILTER (WHERE unit_cost <= 0) AS missing_cost,
      json_agg(json_build_object(
        'categoria', categoria,
        'valor', CASE WHEN unit_cost > 0 THEN ROUND((saldo * unit_cost)::numeric, 2) ELSE 0 END,
        'produto', nome_produto,
        'saldo', saldo,
        'custo_unitario', unit_cost
      )) AS by_category
    FROM (
      SELECT
        p.id,
        p.nome_produto,
        p.categoria,
        COALESCE((
          SELECT SUM(
            CASE
              WHEN m.tipo IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') THEN 0
              WHEN m.direction = 'IN' THEN m.quantidade
              ELSE -m.quantidade
            END
          )
          FROM movimentacoes_estoque m
          WHERE m.produto_id = p.id AND m.status = 'ATIVO'
        ), 0) AS saldo,
        COALESCE(
          NULLIF(p.avg30_cost_base_unit, 0),
          NULLIF(p.last_cost_base_unit, 0),
          NULLIF(p.default_cost_base_unit, 0),
          CASE WHEN COALESCE(p.fator_conversao_padrao, 1) > 0
            THEN p.custo_padrao / COALESCE(NULLIF(p.fator_conversao_padrao, 0), 1)
            ELSE 0
          END
        ) AS unit_cost
      FROM produtos p
      WHERE p.ativo = true
    ) sub
  ) agg;

  RETURN result;
END;
$$;