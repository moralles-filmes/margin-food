DROP MATERIALIZED VIEW IF EXISTS public.mv_fin_dre_mensal CASCADE;
CREATE MATERIALIZED VIEW public.mv_fin_dre_mensal AS
SELECT
  to_char(data_competencia::date, 'YYYY-MM') AS mes,
  tipo,
  categoria_id,
  COUNT(*) AS qtd,
  SUM(valor) AS total
FROM fin_lancamentos
WHERE status = 'REALIZADO' AND tipo != 'TRANSFERENCIA'
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dre_mensal_pk ON public.mv_fin_dre_mensal (mes, tipo, categoria_id);

DROP MATERIALIZED VIEW IF EXISTS public.mv_fin_fluxo_caixa_diario CASCADE;
CREATE MATERIALIZED VIEW public.mv_fin_fluxo_caixa_diario AS
SELECT
  data_competencia::date AS dia,
  conta_id,
  tipo,
  SUM(valor) AS total
FROM fin_lancamentos
WHERE status = 'REALIZADO' AND tipo != 'TRANSFERENCIA'
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_fluxo_diario_pk ON public.mv_fin_fluxo_caixa_diario (dia, conta_id, tipo);

DROP MATERIALIZED VIEW IF EXISTS public.mv_consumo_itens_semana CASCADE;
CREATE MATERIALIZED VIEW public.mv_consumo_itens_semana AS
SELECT
  produto_id,
  date_trunc('week', data)::date AS semana,
  SUM(quantidade) AS total_saida,
  SUM(custo_total) AS custo_total
FROM movimentacoes_estoque
WHERE status = 'ATIVO'
  AND tipo NOT LIKE 'ENTRADA%'
  AND tipo NOT IN ('AJUSTE','ENTRADA_ESTORNO','SAIDA_ESTORNO')
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_consumo_semana_pk ON public.mv_consumo_itens_semana (produto_id, semana);

DROP MATERIALIZED VIEW IF EXISTS public.mv_giro_estoque CASCADE;
CREATE MATERIALIZED VIEW public.mv_giro_estoque AS
SELECT
  p.id AS produto_id,
  p.nome_produto,
  p.categoria,
  COALESCE(SUM(CASE WHEN m.tipo LIKE 'ENTRADA%' AND m.tipo != 'ENTRADA_ESTORNO' THEN m.quantidade ELSE 0 END), 0) AS entradas,
  COALESCE(SUM(CASE WHEN m.tipo NOT LIKE 'ENTRADA%' AND m.tipo NOT IN ('AJUSTE','ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN m.quantidade ELSE 0 END), 0) AS saidas,
  (SELECT COALESCE(SUM(CASE WHEN m2.tipo IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') THEN 0 WHEN m2.direction = 'IN' THEN m2.quantidade ELSE -m2.quantidade END), 0) FROM movimentacoes_estoque m2 WHERE m2.produto_id = p.id AND m2.status = 'ATIVO') AS saldo_atual
FROM produtos p
LEFT JOIN movimentacoes_estoque m ON m.produto_id = p.id AND m.status = 'ATIVO'
  AND m.data >= (CURRENT_DATE - interval '90 days')
WHERE p.ativo = true
GROUP BY p.id, p.nome_produto, p.categoria;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_giro_pk ON public.mv_giro_estoque (produto_id);

DROP MATERIALIZED VIEW IF EXISTS public.mv_pedidos_status_resumo CASCADE;
CREATE MATERIALIZED VIEW public.mv_pedidos_status_resumo AS
SELECT
  to_char(created_at, 'YYYY-MM') AS mes,
  status,
  COUNT(*) AS qtd,
  SUM(total_estimated) AS valor_total
FROM purchase_orders
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pedidos_status_pk ON public.mv_pedidos_status_resumo (mes, status);

-- Remove MVs from public API exposure by revoking access
REVOKE ALL ON public.mv_fin_dre_mensal FROM anon, authenticated;
REVOKE ALL ON public.mv_fin_fluxo_caixa_diario FROM anon, authenticated;
REVOKE ALL ON public.mv_consumo_itens_semana FROM anon, authenticated;
REVOKE ALL ON public.mv_giro_estoque FROM anon, authenticated;
REVOKE ALL ON public.mv_pedidos_status_resumo FROM anon, authenticated;

-- Grant only to authenticated (used via SECURITY DEFINER RPCs)
GRANT SELECT ON public.mv_fin_dre_mensal TO authenticated;
GRANT SELECT ON public.mv_fin_fluxo_caixa_diario TO authenticated;
GRANT SELECT ON public.mv_consumo_itens_semana TO authenticated;
GRANT SELECT ON public.mv_giro_estoque TO authenticated;
GRANT SELECT ON public.mv_pedidos_status_resumo TO authenticated;
