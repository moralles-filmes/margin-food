CREATE OR REPLACE FUNCTION public.get_report_item_detail(p_produto_id uuid, p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_result jsonb;
  v_produto RECORD;
BEGIN
  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  SELECT id, nome_produto, categoria, unidade_medida,
    COALESCE(NULLIF(avg30_cost_base_unit, 0), NULLIF(last_cost_base_unit, 0), NULLIF(default_cost_base_unit, 0), 0) AS custo_base
  INTO v_produto FROM produtos WHERE id = p_produto_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;

  SELECT jsonb_build_object(
    'produto_id', v_produto.id,
    'nome', v_produto.nome_produto,
    'categoria', v_produto.categoria,
    'unidade', v_produto.unidade_medida,
    'custo_base', v_produto.custo_base,
    'saldo_atual', COALESCE((
      SELECT SUM(CASE
        WHEN tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
        WHEN direction = 'IN' THEN quantidade ELSE -quantidade END)
      FROM movimentacoes_estoque WHERE produto_id = p_produto_id AND status = 'ATIVO'
    ), 0),
    -- Breakdown by movement type in period
    'breakdown', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'qtd', qtd, 'custo', custo))
      FROM (
        SELECT tipo, SUM(quantidade) AS qtd, SUM(custo_total) AS custo
        FROM movimentacoes_estoque
        WHERE produto_id = p_produto_id AND status = 'ATIVO'
          AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND data BETWEEN p_start AND p_end
        GROUP BY tipo ORDER BY custo DESC
      ) sub
    ), '[]'::jsonb),
    -- Price history (last 20 entries)
    'preco_historico', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('data', data::text, 'preco', custo_unitario, 'qtd', quantidade))
      FROM (
        SELECT data, custo_unitario, quantidade
        FROM movimentacoes_estoque
        WHERE produto_id = p_produto_id AND status = 'ATIVO'
          AND direction = 'IN'
          AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
        ORDER BY data DESC, created_at DESC
        LIMIT 20
      ) sub
    ), '[]'::jsonb),
    -- Weekly consumption series
    'consumo_semanal', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('semana', semana, 'consumo', consumo))
      FROM (
        SELECT
          'W' || CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int AS semana,
          SUM(quantidade) AS consumo
        FROM movimentacoes_estoque
        WHERE produto_id = p_produto_id AND status = 'ATIVO'
          AND direction = 'OUT'
          AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND internal_transfer = false
          AND data BETWEEN p_start AND p_end
        GROUP BY CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int
        ORDER BY CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int
      ) sub
    ), '[]'::jsonb),
    -- Weekly loss series
    'perdas_semanal', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('semana', semana, 'perda', perda))
      FROM (
        SELECT
          'W' || CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int AS semana,
          SUM(quantidade) AS perda
        FROM movimentacoes_estoque
        WHERE produto_id = p_produto_id AND status = 'ATIVO'
          AND tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')
          AND data BETWEEN p_start AND p_end
        GROUP BY CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int
        ORDER BY CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int
      ) sub
    ), '[]'::jsonb),
    -- Suppliers used
    'fornecedores', COALESCE((
      SELECT jsonb_agg(DISTINCT origem)
      FROM movimentacoes_estoque
      WHERE produto_id = p_produto_id AND status = 'ATIVO'
        AND direction = 'IN'
        AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
        AND origem IS NOT NULL AND origem != ''
        AND data BETWEEN p_start AND p_end
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;