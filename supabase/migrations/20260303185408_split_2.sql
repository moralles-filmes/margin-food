CREATE OR REPLACE FUNCTION public.get_report_items_summary(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  WITH item_data AS (
    SELECT
      p.id,
      p.nome_produto,
      p.categoria,
      COALESCE((
        SELECT SUM(m.custo_total)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS custo_consumido,
      COALESCE((
        SELECT SUM(m.quantidade)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS consumo_qtd,
      COALESCE((
        SELECT SUM(m.quantidade)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS perdas_qtd,
      COALESCE((
        SELECT SUM(m.custo_total)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS perdas_valor,
      COALESCE((
        SELECT CASE WHEN prev.cu > 0 THEN ROUND(((last.cu - prev.cu) / prev.cu * 100)::numeric, 1) ELSE 0 END
        FROM (
          SELECT custo_unitario AS cu FROM movimentacoes_estoque
          WHERE company_id = v_company
            AND produto_id = p.id AND status = 'ATIVO' AND direction = 'IN'
            AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          ORDER BY data DESC, created_at DESC LIMIT 1
        ) last,
        (
          SELECT custo_unitario AS cu FROM movimentacoes_estoque
          WHERE company_id = v_company
            AND produto_id = p.id AND status = 'ATIVO' AND direction = 'IN'
            AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          ORDER BY data DESC, created_at DESC LIMIT 1 OFFSET 1
        ) prev
      ), 0) AS variacao_preco,
      COALESCE((
        SELECT SUM(CASE
          WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
          WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
      ), 0) AS saldo,
      CASE WHEN COALESCE((
        SELECT SUM(CASE
          WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
          WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
      ), 0) > 0 THEN
        ROUND((COALESCE((
          SELECT SUM(m.quantidade)
          FROM movimentacoes_estoque m
          WHERE m.company_id = v_company
            AND m.produto_id = p.id AND m.status = 'ATIVO'
            AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
            AND m.data BETWEEN p_start AND p_end
        ), 0) / GREATEST(COALESCE((
          SELECT SUM(CASE
            WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
            WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END)
          FROM movimentacoes_estoque m
          WHERE m.company_id = v_company
            AND m.produto_id = p.id AND m.status = 'ATIVO'
        ), 0), 0.01))::numeric, 2)
      ELSE 0 END AS giro
    FROM produtos p
    WHERE p.ativo = true
      AND p.company_id = v_company
      AND p.conta_no_cmv = true
  ),
  total AS (SELECT COALESCE(SUM(custo_consumido), 0) AS total_custo FROM item_data),
  ranked AS (
    SELECT d.*,
      CASE WHEN t.total_custo > 0 THEN ROUND((d.custo_consumido / t.total_custo * 100)::numeric, 1) ELSE 0 END AS percent_cmv
    FROM item_data d, total t
    WHERE d.custo_consumido > 0 OR d.perdas_qtd > 0
    ORDER BY d.custo_consumido DESC
  )
  SELECT jsonb_build_object(
    'total_items', (SELECT COUNT(*) FROM item_data),
    'items_com_consumo', (SELECT COUNT(*) FROM item_data WHERE custo_consumido > 0),
    'items_com_perda', (SELECT COUNT(*) FROM item_data WHERE perdas_qtd > 0),
    'total_custo_consumido', (SELECT total_custo FROM total),
    'top_consumo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'produto_id', r.id, 'nome', r.nome_produto, 'categoria', r.categoria,
        'custo_consumido', ROUND(r.custo_consumido::numeric, 2),
        'consumo_qtd', ROUND(r.consumo_qtd::numeric, 3),
        'perdas_qtd', ROUND(r.perdas_qtd::numeric, 3),
        'perdas_valor', ROUND(r.perdas_valor::numeric, 2),
        'variacao_preco', r.variacao_preco,
        'percent_cmv', r.percent_cmv,
        'saldo', ROUND(r.saldo::numeric, 2),
        'giro', r.giro
      ))
      FROM (SELECT * FROM ranked ORDER BY custo_consumido DESC LIMIT 10) r
    ), '[]'::jsonb),
    'top_perda', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'produto_id', r.id, 'nome', r.nome_produto,
        'perdas_qtd', ROUND(r.perdas_qtd::numeric, 3),
        'perdas_valor', ROUND(r.perdas_valor::numeric, 2)
      ))
      FROM (SELECT * FROM ranked WHERE perdas_qtd > 0 ORDER BY perdas_valor DESC LIMIT 5) r
    ), '[]'::jsonb),
    'categorias', COALESCE((
      SELECT jsonb_agg(DISTINCT categoria) FROM item_data WHERE custo_consumido > 0
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;