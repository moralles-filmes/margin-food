-- =========================================================
-- PERF: get_movimentacoes_kpis
-- Agrega KPIs de movimentacoes (entradas e saidas) em uma
-- unica round-trip ao banco, usando SUM/COUNT no Postgres.
-- Elimina o padrao anterior de baixar todas as linhas para
-- somar no cliente (O(n) na rede), que causava delay ao
-- alternar o toggle Entradas/Saidas.
-- Retorna ambos os lados de uma vez para que o toggle
-- vire filtragem instantanea client-side.
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_movimentacoes_kpis(
  p_produto_id     uuid    DEFAULT NULL,
  p_setor          text    DEFAULT NULL,
  p_date_from      date    DEFAULT NULL,
  p_date_to        date    DEFAULT NULL,
  p_show_cancelled boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_result  jsonb;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'estoque:movimentacoes:view', 'stock:read', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Sem permissão para visualizar movimentações';
  END IF;

  SELECT jsonb_build_object(
    'entradas', jsonb_build_object(
      'total_valor', COALESCE(SUM(
        CASE WHEN m.direction = 'IN' THEN
          CASE WHEN m.quantidade > 0 AND m.custo_unitario >= 0
               THEN m.quantidade * m.custo_unitario
               ELSE m.custo_total
          END
        END
      ), 0),
      'total_qtd', COALESCE(SUM(
        CASE WHEN m.direction = 'IN' THEN m.quantidade END
      ), 0),
      'registros', COUNT(*) FILTER (WHERE m.direction = 'IN')
    ),
    'saidas', jsonb_build_object(
      'total_valor', COALESCE(SUM(
        CASE WHEN m.direction = 'OUT' THEN
          CASE WHEN m.quantidade > 0 AND m.custo_unitario >= 0
               THEN m.quantidade * m.custo_unitario
               ELSE m.custo_total
          END
        END
      ), 0),
      'total_qtd', COALESCE(SUM(
        CASE WHEN m.direction = 'OUT' THEN m.quantidade END
      ), 0),
      'registros', COUNT(*) FILTER (WHERE m.direction = 'OUT')
    )
  ) INTO v_result
  FROM public.movimentacoes_estoque m
  WHERE m.company_id    = v_company
    AND (p_produto_id IS NULL OR m.produto_id = p_produto_id)
    AND (p_setor      IS NULL OR m.setor      = p_setor)
    AND (p_date_from  IS NULL OR m.data      >= p_date_from)
    AND (p_date_to    IS NULL OR m.data      <= p_date_to)
    AND (p_show_cancelled OR m.status = 'ATIVO')
    AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO');

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_movimentacoes_kpis TO authenticated;
-- DO block omitido: assert_tenant() requer sessao autenticada; colunas sao estaveis.
