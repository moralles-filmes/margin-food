CREATE OR REPLACE FUNCTION public.get_stock_predictive_analysis(
  p_category_id text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_base_window_days int DEFAULT 30,
  p_target_coverage_days int DEFAULT 7,
  p_only_critical boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_result jsonb;
BEGIN
  SELECT p.company_id INTO v_company_id
    FROM profiles p WHERE p.id = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Tenant inválido';
  END IF;
  PERFORM assert_tenant();

  WITH active_products AS (
    SELECT p.id, p.nome_produto, p.categoria, p.unidade_medida,
           p.custo_padrao, p.estoque_minimo, p.ativo,
           COALESCE(p.custo_medio_30d, p.custo_ultima_compra, p.custo_padrao, 0) AS custo_unitario
    FROM produtos p
    WHERE p.company_id = v_company_id
      AND p.ativo = true
      AND (p_product_id IS NULL OR p.id = p_product_id)
      AND (p_category_id IS NULL OR p.categoria = p_category_id)
  ),
  saldos AS (
    SELECT m.produto_id,
           SUM(CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END) AS saldo_atual
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company_id
      AND m.status = 'ATIVO'
      AND m.produto_id IN (SELECT id FROM active_products)
    GROUP BY m.produto_id
  ),
  consumo_7d AS (
    SELECT m.produto_id,
           SUM(m.quantidade) AS total_consumo,
           COUNT(DISTINCT m.data) AS dias_com_consumo
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company_id
      AND m.status = 'ATIVO'
      AND m.direction = 'OUT'
      AND m.tipo IN ('SAIDA', 'BAIXA_PERDA', 'SAIDA_TRANSFERENCIA')
      AND m.data >= (current_date - interval '7 days')
      AND m.produto_id IN (SELECT id FROM active_products)
    GROUP BY m.produto_id
  ),
  consumo_30d AS (
    SELECT m.produto_id,
           SUM(m.quantidade) AS total_consumo,
           COUNT(DISTINCT m.data) AS dias_com_consumo
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company_id
      AND m.status = 'ATIVO'
      AND m.direction = 'OUT'
      AND m.tipo IN ('SAIDA', 'BAIXA_PERDA', 'SAIDA_TRANSFERENCIA')
      AND m.data >= (current_date - interval '30 days')
      AND m.produto_id IN (SELECT id FROM active_products)
    GROUP BY m.produto_id
  ),
  analise AS (
    SELECT
      ap.id AS produto_id, ap.nome_produto, ap.categoria, ap.unidade_medida, ap.custo_unitario,
      COALESCE(s.saldo_atual, 0) AS saldo_atual,
      COALESCE(c7.total_consumo, 0) AS consumo_total_7d,
      COALESCE(c7.dias_com_consumo, 0) AS dias_consumo_7d,
      COALESCE(c30.total_consumo, 0) AS consumo_total_30d,
      COALESCE(c30.dias_com_consumo, 0) AS dias_consumo_30d,
      CASE WHEN COALESCE(c7.dias_com_consumo, 0) > 0 THEN c7.total_consumo / 7.0 ELSE 0 END AS media_diaria_7d,
      CASE WHEN COALESCE(c30.dias_com_consumo, 0) > 0 THEN c30.total_consumo / 30.0 ELSE 0 END AS media_diaria_30d
    FROM active_products ap
    LEFT JOIN saldos s ON s.produto_id = ap.id
    LEFT JOIN consumo_7d c7 ON c7.produto_id = ap.id
    LEFT JOIN consumo_30d c30 ON c30.produto_id = ap.id
  ),
  resultado AS (
    SELECT a.*,
      CASE
        WHEN a.media_diaria_7d > 0 AND a.media_diaria_30d > 0 THEN (a.media_diaria_7d * 0.7) + (a.media_diaria_30d * 0.3)
        WHEN a.media_diaria_7d > 0 THEN a.media_diaria_7d
        WHEN a.media_diaria_30d > 0 THEN a.media_diaria_30d
        ELSE 0
      END AS consumo_previsto_diario,
      CASE
        WHEN a.media_diaria_7d = 0 AND a.media_diaria_30d = 0 THEN 'sem_dados'
        WHEN a.media_diaria_30d = 0 THEN 'subindo'
        WHEN a.media_diaria_7d > a.media_diaria_30d * 1.15 THEN 'subindo'
        WHEN a.media_diaria_7d < a.media_diaria_30d * 0.85 THEN 'caindo'
        ELSE 'estavel'
      END AS tendencia
    FROM analise a
  ),
  final AS (
    SELECT r.*,
      CASE WHEN r.consumo_previsto_diario > 0 THEN r.saldo_atual / r.consumo_previsto_diario ELSE 999 END AS cobertura_dias,
      CASE
        WHEN r.consumo_previsto_diario = 0 THEN 'sem_consumo'
        WHEN (r.saldo_atual / NULLIF(r.consumo_previsto_diario, 0)) < 1 THEN 'ruptura_iminente'
        WHEN (r.saldo_atual / NULLIF(r.consumo_previsto_diario, 0)) < 3 THEN 'critico'
        WHEN (r.saldo_atual / NULLIF(r.consumo_previsto_diario, 0)) < 7 THEN 'atencao'
        ELSE 'sem_risco'
      END AS status_risco,
      GREATEST(0, (p_target_coverage_days * r.consumo_previsto_diario) - r.saldo_atual) AS sugestao_compra,
      GREATEST(0, (p_target_coverage_days * r.consumo_previsto_diario) - r.saldo_atual) * r.custo_unitario AS custo_estimado_compra
    FROM resultado r
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'produto_id', f.produto_id, 'nome_produto', f.nome_produto, 'categoria', f.categoria,
        'unidade_medida', f.unidade_medida, 'custo_unitario', ROUND(f.custo_unitario::numeric, 2),
        'saldo_atual', ROUND(f.saldo_atual::numeric, 3), 'media_diaria_7d', ROUND(f.media_diaria_7d::numeric, 3),
        'media_diaria_30d', ROUND(f.media_diaria_30d::numeric, 3),
        'consumo_previsto_diario', ROUND(f.consumo_previsto_diario::numeric, 3),
        'cobertura_dias', ROUND(LEAST(f.cobertura_dias, 999)::numeric, 1),
        'tendencia', f.tendencia, 'status_risco', f.status_risco,
        'sugestao_compra', ROUND(f.sugestao_compra::numeric, 3),
        'custo_estimado_compra', ROUND(f.custo_estimado_compra::numeric, 2)
      ) ORDER BY
        CASE f.status_risco WHEN 'ruptura_iminente' THEN 1 WHEN 'critico' THEN 2 WHEN 'atencao' THEN 3 WHEN 'sem_risco' THEN 4 ELSE 5 END,
        f.cobertura_dias ASC
      )
      FROM final f
      WHERE (NOT p_only_critical OR f.status_risco IN ('ruptura_iminente', 'critico', 'atencao'))
    ), '[]'::jsonb),
    'kpis', (
      SELECT jsonb_build_object(
        'total_itens', COUNT(*),
        'ruptura_iminente', COUNT(*) FILTER (WHERE f.status_risco = 'ruptura_iminente'),
        'critico', COUNT(*) FILTER (WHERE f.status_risco = 'critico'),
        'atencao', COUNT(*) FILTER (WHERE f.status_risco = 'atencao'),
        'sem_risco', COUNT(*) FILTER (WHERE f.status_risco = 'sem_risco'),
        'sem_consumo', COUNT(*) FILTER (WHERE f.status_risco = 'sem_consumo'),
        'tendencia_subindo', COUNT(*) FILTER (WHERE f.tendencia = 'subindo'),
        'valor_compras_sugeridas', ROUND(COALESCE(SUM(f.custo_estimado_compra), 0)::numeric, 2),
        'itens_cobertura_abaixo_3d', COUNT(*) FILTER (WHERE f.cobertura_dias < 3 AND f.consumo_previsto_diario > 0)
      )
      FROM final f
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Fix v2: replace cancelado = false with status = 'ATIVO'