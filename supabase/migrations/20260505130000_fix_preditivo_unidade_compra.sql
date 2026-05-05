-- =========================================================
-- FIX: get_stock_predictive_analysis_v2 — exibir em unidade de compra
-- Data: 2026-05-05 (corrigido pela migration 20260505130100)
-- Causa: mesma raiz do Ranking — movimentacoes_estoque.quantidade em base.
--   Campos escalares (saldo, médias, previsão, sugestão) e JSON arrays
--   (serie_7d[].previsao, perfil_dow[].media) eram exibidos em base.
-- Solução: introduzir fator_exibicao em active_products (= fator_conversao_padrao
--   para dual-unit; 1.0 como fallback). Propagar pelo pipeline. Dividir todos
--   os campos de quantidade no JSON final. R$ e dias são invariantes.
--   status_risco, cobertura_dias e ruptura_em_dias permanecem calculados em
--   base para preservar a lógica de alertas.
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_stock_predictive_analysis_v2(
  p_category_id text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_target_coverage_days int DEFAULT 7,
  p_only_critical boolean DEFAULT false,
  p_use_weekday_pattern boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_result jsonb;
  v_today_dow int;
  v_dow_names text[] := ARRAY['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
BEGIN
  SELECT p.company_id INTO v_company_id
    FROM profiles p WHERE p.id = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Tenant inválido';
  END IF;
  PERFORM assert_tenant();
  v_today_dow := EXTRACT(DOW FROM current_date)::int;

  WITH active_products AS (
    SELECT
      p.id,
      p.nome_produto,
      p.categoria,
      p.unidade_medida,
      -- Unidade de exibição: unidade_compra quando dual-unit válido, senão base
      CASE
        WHEN p.unidade_compra IS NOT NULL
         AND p.unidade_compra <> p.unidade_medida
         AND COALESCE(p.fator_conversao_padrao, 0) > 0
        THEN p.unidade_compra
        ELSE p.unidade_medida
      END AS unidade_exibicao,
      -- Fator de conversão para display (1.0 para produtos sem dual-unit → sem efeito)
      CASE
        WHEN p.unidade_compra IS NOT NULL
         AND p.unidade_compra <> p.unidade_medida
         AND COALESCE(p.fator_conversao_padrao, 0) > 0
        THEN p.fator_conversao_padrao
        ELSE 1.0
      END AS fator_exibicao,
      COALESCE(p.custo_medio_30d, p.custo_ultima_compra, p.custo_padrao, 0) AS custo_unitario
    FROM produtos p
    WHERE p.company_id = v_company_id AND p.ativo = true
      AND (p_product_id IS NULL OR p.id = p_product_id)
      AND (p_category_id IS NULL OR p.categoria = p_category_id)
  ),
  saldos AS (
    SELECT m.produto_id,
           SUM(CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END) AS saldo_atual
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company_id AND m.status = 'ATIVO'
      AND m.produto_id IN (SELECT id FROM active_products)
    GROUP BY m.produto_id
  ),
  daily_consumption AS (
    SELECT m.produto_id, m.data AS dia,
           EXTRACT(DOW FROM m.data)::int AS dow,
           SUM(m.quantidade) AS consumo
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company_id AND m.status = 'ATIVO'
      AND m.direction = 'OUT'
      AND m.tipo IN ('SAIDA', 'BAIXA_PERDA', 'SAIDA_TRANSFERENCIA')
      AND m.data >= (current_date - interval '60 days')
      AND m.produto_id IN (SELECT id FROM active_products)
    GROUP BY m.produto_id, m.data
  ),
  dow_avg AS (
    SELECT dc.produto_id, dc.dow, AVG(dc.consumo) AS media_dow, COUNT(*) AS ocorrencias
    FROM daily_consumption dc GROUP BY dc.produto_id, dc.dow
  ),
  avg_7d AS (
    SELECT dc.produto_id, SUM(dc.consumo) / 7.0 AS media_diaria_7d, COUNT(DISTINCT dc.dia) AS dias_com_consumo_7d
    FROM daily_consumption dc WHERE dc.dia >= (current_date - interval '7 days') GROUP BY dc.produto_id
  ),
  avg_30d AS (
    SELECT dc.produto_id, SUM(dc.consumo) / 30.0 AS media_diaria_30d, COUNT(DISTINCT dc.dia) AS dias_com_consumo_30d
    FROM daily_consumption dc WHERE dc.dia >= (current_date - interval '30 days') GROUP BY dc.produto_id
  ),
  weekday_profile AS (
    SELECT da.produto_id,
           jsonb_object_agg(da.dow::text, jsonb_build_object('media', ROUND(da.media_dow::numeric, 2), 'n', da.ocorrencias)) AS perfil_dow,
           SUM(da.ocorrencias) AS total_ocorrencias,
           COUNT(DISTINCT da.dow) AS dow_count
    FROM dow_avg da GROUP BY da.produto_id
  ),
  analise AS (
    SELECT ap.id AS produto_id, ap.nome_produto, ap.categoria,
      ap.unidade_medida, ap.unidade_exibicao, ap.fator_exibicao,
      ap.custo_unitario,
      COALESCE(s.saldo_atual, 0) AS saldo_atual,
      COALESCE(a7.media_diaria_7d, 0) AS media_diaria_7d,
      COALESCE(a7.dias_com_consumo_7d, 0) AS dias_com_consumo_7d,
      COALESCE(a30.media_diaria_30d, 0) AS media_diaria_30d,
      COALESCE(a30.dias_com_consumo_30d, 0) AS dias_com_consumo_30d,
      COALESCE(wp.perfil_dow, '{}'::jsonb) AS perfil_dow,
      COALESCE(wp.total_ocorrencias, 0) AS total_ocorrencias,
      COALESCE(wp.dow_count, 0) AS dow_count,
      (COALESCE(wp.total_ocorrencias, 0) >= 14 AND COALESCE(wp.dow_count, 0) >= 4) AS has_seasonality
    FROM active_products ap
    LEFT JOIN saldos s ON s.produto_id = ap.id
    LEFT JOIN avg_7d a7 ON a7.produto_id = ap.id
    LEFT JOIN avg_30d a30 ON a30.produto_id = ap.id
    LEFT JOIN weekday_profile wp ON wp.produto_id = ap.id
  ),
  forecast_days AS (
    SELECT a.produto_id, d.offset_day,
      ((v_today_dow + d.offset_day) % 7) AS future_dow,
      COALESCE((a.perfil_dow -> (((v_today_dow + d.offset_day) % 7)::text) ->> 'media')::numeric, 0) AS dow_media,
      CASE
        WHEN a.media_diaria_7d > 0 AND a.media_diaria_30d > 0 THEN (a.media_diaria_7d * 0.7 + a.media_diaria_30d * 0.3)
        WHEN a.media_diaria_7d > 0 THEN a.media_diaria_7d
        WHEN a.media_diaria_30d > 0 THEN a.media_diaria_30d
        ELSE 0
      END AS media_recente,
      a.has_seasonality
    FROM analise a
    CROSS JOIN generate_series(1, GREATEST(p_target_coverage_days, 7)) AS d(offset_day)
  ),
  forecast_computed AS (
    SELECT fd.produto_id, fd.offset_day, fd.future_dow,
      CASE
        WHEN p_use_weekday_pattern AND fd.has_seasonality AND fd.dow_media > 0 THEN
          ROUND((fd.media_recente * 0.4 + fd.dow_media * 0.6)::numeric, 3)
        ELSE ROUND(fd.media_recente::numeric, 3)
      END AS previsao_dia
    FROM forecast_days fd
  ),
  forecast_agg AS (
    SELECT fc.produto_id,
      MAX(CASE WHEN fc.offset_day = 1 THEN fc.previsao_dia END) AS previsao_amanha,
      SUM(CASE WHEN fc.offset_day <= 7 THEN fc.previsao_dia ELSE 0 END) AS previsao_7d,
      SUM(fc.previsao_dia) AS previsao_n_dias
    FROM forecast_computed fc GROUP BY fc.produto_id
  ),
  rupture_calc AS (
    SELECT fc.produto_id,
      MIN(fc.offset_day) FILTER (
        WHERE (SELECT SUM(fc2.previsao_dia) FROM forecast_computed fc2 WHERE fc2.produto_id = fc.produto_id AND fc2.offset_day <= fc.offset_day) >= a.saldo_atual AND a.saldo_atual > 0
      ) AS ruptura_em_dias,
      (SELECT fc3.offset_day FROM forecast_computed fc3 WHERE fc3.produto_id = fc.produto_id AND fc3.offset_day <= 7 ORDER BY fc3.previsao_dia DESC LIMIT 1) AS dia_pico_offset,
      (SELECT fc3.future_dow FROM forecast_computed fc3 WHERE fc3.produto_id = fc.produto_id AND fc3.offset_day <= 7 ORDER BY fc3.previsao_dia DESC LIMIT 1) AS dia_pico_dow
    FROM forecast_computed fc
    JOIN analise a ON a.produto_id = fc.produto_id
    WHERE fc.offset_day <= GREATEST(p_target_coverage_days, 14)
    GROUP BY fc.produto_id, a.saldo_atual
  ),
  -- serie_7d em base: conversão aplicada no JSON final por item
  forecast_series AS (
    SELECT fc.produto_id,
      jsonb_agg(jsonb_build_object('day', fc.offset_day, 'dow', fc.future_dow, 'dow_label', v_dow_names[(fc.future_dow) + 1], 'previsao', fc.previsao_dia) ORDER BY fc.offset_day) FILTER (WHERE fc.offset_day <= 7) AS serie_7d
    FROM forecast_computed fc GROUP BY fc.produto_id
  ),
  resultado AS (
    SELECT a.*,
      COALESCE(fa.previsao_amanha, 0) AS previsao_amanha,
      COALESCE(fa.previsao_7d, 0) AS previsao_7d,
      COALESCE(fa.previsao_n_dias, 0) AS previsao_n_dias,
      rc.ruptura_em_dias,
      CASE WHEN rc.ruptura_em_dias IS NOT NULL THEN (current_date + rc.ruptura_em_dias)::text ELSE NULL END AS ruptura_data,
      COALESCE(v_dow_names[(rc.dia_pico_dow) + 1], '') AS dia_critico,
      rc.dia_pico_dow,
      COALESCE(fs.serie_7d, '[]'::jsonb) AS serie_7d,
      CASE
        WHEN p_use_weekday_pattern AND a.has_seasonality AND (a.perfil_dow -> (v_today_dow::text) ->> 'media') IS NOT NULL THEN
          ROUND((CASE WHEN a.media_diaria_7d > 0 AND a.media_diaria_30d > 0 THEN (a.media_diaria_7d * 0.7 + a.media_diaria_30d * 0.3)
                      WHEN a.media_diaria_7d > 0 THEN a.media_diaria_7d ELSE a.media_diaria_30d END * 0.4 +
                 (a.perfil_dow -> (v_today_dow::text) ->> 'media')::numeric * 0.6)::numeric, 3)
        ELSE ROUND(CASE WHEN a.media_diaria_7d > 0 AND a.media_diaria_30d > 0 THEN (a.media_diaria_7d * 0.7 + a.media_diaria_30d * 0.3)
                        WHEN a.media_diaria_7d > 0 THEN a.media_diaria_7d ELSE a.media_diaria_30d END::numeric, 3)
      END AS consumo_previsto_diario,
      CASE
        WHEN a.media_diaria_7d = 0 AND a.media_diaria_30d = 0 THEN 'sem_dados'
        WHEN a.media_diaria_30d = 0 THEN 'subindo'
        WHEN a.media_diaria_7d > a.media_diaria_30d * 1.15 THEN 'subindo'
        WHEN a.media_diaria_7d < a.media_diaria_30d * 0.85 THEN 'caindo'
        ELSE 'estavel'
      END AS tendencia,
      CASE
        WHEN p_use_weekday_pattern AND a.has_seasonality THEN '40% média recente + 60% padrão ' || v_dow_names[(v_today_dow) + 1]
        ELSE '70% últimos 7d + 30% últimos 30d'
      END AS explicacao_previsao
    FROM analise a
    LEFT JOIN forecast_agg fa ON fa.produto_id = a.produto_id
    LEFT JOIN rupture_calc rc ON rc.produto_id = a.produto_id
    LEFT JOIN forecast_series fs ON fs.produto_id = a.produto_id
  ),
  final_calc AS (
    SELECT r.*,
      -- cobertura e status permanecem em base (resultado em dias = invariante)
      CASE WHEN r.consumo_previsto_diario > 0 THEN ROUND((r.saldo_atual / r.consumo_previsto_diario)::numeric, 1) ELSE 999 END AS cobertura_dias,
      CASE
        WHEN r.consumo_previsto_diario = 0 THEN 'sem_consumo'
        WHEN r.ruptura_em_dias IS NOT NULL AND r.ruptura_em_dias <= 1 THEN 'ruptura_iminente'
        WHEN r.ruptura_em_dias IS NOT NULL AND r.ruptura_em_dias <= 3 THEN 'critico'
        WHEN (r.saldo_atual / NULLIF(r.consumo_previsto_diario, 0)) < 7 THEN 'atencao'
        ELSE 'sem_risco'
      END AS status_risco,
      -- sugestão em base (para custo_estimado_compra = sugestão_base * custo_base = R$ correto)
      GREATEST(0, ROUND((r.previsao_n_dias - r.saldo_atual)::numeric, 3)) AS sugestao_compra_base,
      GREATEST(0, ROUND(((r.previsao_n_dias - r.saldo_atual) * r.custo_unitario)::numeric, 2)) AS custo_estimado_compra
    FROM resultado r
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'produto_id', f.produto_id,
        'nome_produto', f.nome_produto,
        'categoria', f.categoria,
        -- unidade de exibição (unidade_compra para dual-unit, base como fallback)
        'unidade_medida', f.unidade_exibicao,
        'custo_unitario', f.custo_unitario,
        -- quantidades convertidas: dividir por fator_exibicao (1.0 para não-dual = sem efeito)
        'saldo_atual',              ROUND((f.saldo_atual              / f.fator_exibicao)::numeric, 4),
        'media_diaria_7d',          ROUND((f.media_diaria_7d          / f.fator_exibicao)::numeric, 4),
        'media_diaria_30d',         ROUND((f.media_diaria_30d         / f.fator_exibicao)::numeric, 4),
        'consumo_previsto_diario',  ROUND((f.consumo_previsto_diario  / f.fator_exibicao)::numeric, 4),
        'previsao_amanha',          ROUND((f.previsao_amanha          / f.fator_exibicao)::numeric, 4),
        'previsao_7d',              ROUND((f.previsao_7d              / f.fator_exibicao)::numeric, 4),
        -- sugestão de compra convertida; custo em R$ não converte
        'sugestao_compra',          ROUND((f.sugestao_compra_base     / f.fator_exibicao)::numeric, 4),
        'custo_estimado_compra',    f.custo_estimado_compra,
        -- dias: invariantes sob conversão
        'cobertura_dias',   LEAST(f.cobertura_dias, 999),
        'tendencia',        f.tendencia,
        'status_risco',     f.status_risco,
        'ruptura_em_dias',  f.ruptura_em_dias,
        'ruptura_data',     f.ruptura_data,
        'dia_critico',      f.dia_critico,
        'has_seasonality',  f.has_seasonality,
        'explicacao',       f.explicacao_previsao,
        -- serie_7d: converter previsao por item (usado na projeção gráfica do front)
        'serie_7d', CASE
          WHEN f.fator_exibicao = 1.0 THEN f.serie_7d
          ELSE (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'day',       (el->>'day')::int,
                'dow',       (el->>'dow')::int,
                'dow_label', el->>'dow_label',
                'previsao',  ROUND(((el->>'previsao')::numeric / f.fator_exibicao)::numeric, 3)
              ) ORDER BY (el->>'day')::int
            ), '[]'::jsonb)
            FROM jsonb_array_elements(f.serie_7d) AS el
          )
        END,
        -- perfil_dow: converter media por dia-da-semana (usado no tooltip do mini-gráfico)
        'perfil_dow', CASE
          WHEN f.fator_exibicao = 1.0 THEN f.perfil_dow
          ELSE (
            SELECT COALESCE(jsonb_object_agg(
              kv.dow_key,
              jsonb_build_object(
                'media', ROUND(((kv.dow_val->>'media')::numeric / f.fator_exibicao)::numeric, 3),
                'n',     (kv.dow_val->>'n')::int
              )
            ), '{}'::jsonb)
            FROM jsonb_each(f.perfil_dow) AS kv(dow_key, dow_val)
          )
        END
      ) ORDER BY
        CASE f.status_risco WHEN 'ruptura_iminente' THEN 1 WHEN 'critico' THEN 2 WHEN 'atencao' THEN 3 WHEN 'sem_risco' THEN 4 ELSE 5 END,
        f.cobertura_dias ASC
      )
      FROM final_calc f
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
        'itens_cobertura_abaixo_3d', COUNT(*) FILTER (WHERE f.cobertura_dias < 3 AND f.consumo_previsto_diario > 0),
        'ruptura_3d', COUNT(*) FILTER (WHERE f.ruptura_em_dias IS NOT NULL AND f.ruptura_em_dias <= 3),
        'pico_fds', COUNT(*) FILTER (WHERE f.dia_pico_dow IN (0, 5, 6)),
        'com_sazonalidade', COUNT(*) FILTER (WHERE f.has_seasonality)
      )
      FROM final_calc f
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Blindagem: força resolução das colunas unidade_compra e fator_conversao_padrao
-- em produtos agora, no push, em vez de silenciosamente em runtime.
DO $$
BEGIN
    PERFORM 1
    FROM public.produtos p
    WHERE p.unidade_compra IS NOT NULL
      AND p.fator_conversao_padrao > 0
    LIMIT 0;
END$$;

NOTIFY pgrst, 'reload schema';
