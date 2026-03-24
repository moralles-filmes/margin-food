CREATE OR REPLACE FUNCTION public.get_report_item_detail(p_produto_id uuid, p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_produto record;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  SELECT id, nome_produto, categoria, unidade_medida, is_salmon_raw_linked,
    COALESCE(NULLIF(avg30_cost_base_unit, 0), NULLIF(last_cost_base_unit, 0), NULLIF(default_cost_base_unit, 0), 0) AS custo_base
  INTO v_produto
  FROM public.produtos
  WHERE id = p_produto_id AND company_id = v_company;

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
      FROM public.movimentacoes_estoque
      WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company
    ), 0),
    'breakdown', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'qtd', qtd, 'custo', custo))
      FROM (
        SELECT tipo, SUM(quantidade) AS qtd, SUM(custo_total) AS custo
        FROM public.movimentacoes_estoque
        WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company
          AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND data BETWEEN p_start AND p_end
        GROUP BY tipo ORDER BY custo DESC
      ) sub
    ), '[]'::jsonb),
    'preco_historico', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('data', data::text, 'preco', custo_unitario, 'qtd', quantidade))
      FROM (
        SELECT data, custo_unitario, quantidade
        FROM public.movimentacoes_estoque
        WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company
          AND direction = 'IN'
          AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
        ORDER BY data DESC, created_at DESC
        LIMIT 20
      ) sub
    ), '[]'::jsonb),
    'consumo_semanal', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('semana', semana, 'consumo', consumo))
      FROM (
        SELECT
          'W' || CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int AS semana,
          SUM(quantidade) AS consumo
        FROM public.movimentacoes_estoque
        WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company
          AND direction = 'OUT'
          AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND data BETWEEN p_start AND p_end
        GROUP BY CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int
        ORDER BY CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int
      ) sub
    ), '[]'::jsonb),
    'perdas_semanal', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('semana', semana, 'perda', perda))
      FROM (
        SELECT
          'W' || CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int AS semana,
          SUM(quantidade) AS perda
        FROM public.movimentacoes_estoque
        WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company
          AND tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')
          AND data BETWEEN p_start AND p_end
        GROUP BY CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int
        ORDER BY CEIL(EXTRACT(DAY FROM data::timestamp) / 7.0)::int
      ) sub
    ), '[]'::jsonb),
    'fornecedores', COALESCE((
      SELECT jsonb_agg(DISTINCT origem)
      FROM public.movimentacoes_estoque
      WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company
        AND direction = 'IN'
        AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
        AND origem IS NOT NULL AND origem != ''
        AND data BETWEEN p_start AND p_end
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- Fix list_report_items_cursor: include all OUT movements for consumo (remove internal_transfer filter)