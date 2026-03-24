
-- BATCH 1 PART C: REBUILD MVs WITH company_id

DROP MATERIALIZED VIEW IF EXISTS reporting.mv_fin_dre_mensal;
CREATE MATERIALIZED VIEW reporting.mv_fin_dre_mensal AS
SELECT company_id,
  to_char(data_competencia::timestamptz, 'YYYY-MM') AS mes,
  tipo, categoria_id,
  count(*) AS qtd, sum(valor) AS total
FROM public.fin_lancamentos
WHERE status = 'REALIZADO' AND tipo <> 'TRANSFERENCIA'
GROUP BY company_id, to_char(data_competencia::timestamptz, 'YYYY-MM'), tipo, categoria_id;

DROP MATERIALIZED VIEW IF EXISTS reporting.mv_fin_fluxo_caixa_diario;
CREATE MATERIALIZED VIEW reporting.mv_fin_fluxo_caixa_diario AS
SELECT company_id,
  data_competencia AS dia, conta_id, tipo,
  sum(valor) AS total
FROM public.fin_lancamentos
WHERE status = 'REALIZADO' AND tipo <> 'TRANSFERENCIA'
GROUP BY company_id, data_competencia, conta_id, tipo;

DROP MATERIALIZED VIEW IF EXISTS reporting.mv_consumo_itens_semana;
CREATE MATERIALIZED VIEW reporting.mv_consumo_itens_semana AS
SELECT company_id,
  produto_id,
  date_trunc('week', data::timestamptz)::date AS semana,
  sum(quantidade) AS total_saida,
  sum(custo_total) AS custo_total
FROM public.movimentacoes_estoque
WHERE status = 'ATIVO' AND tipo NOT LIKE 'ENTRADA%' AND tipo NOT IN ('AJUSTE','ENTRADA_ESTORNO','SAIDA_ESTORNO')
GROUP BY company_id, produto_id, date_trunc('week', data::timestamptz)::date;

-- mv_giro_estoque: replace get_saldo_produto() with inline calculation (no auth needed)
DROP MATERIALIZED VIEW IF EXISTS reporting.mv_giro_estoque;
CREATE MATERIALIZED VIEW reporting.mv_giro_estoque AS
SELECT p.company_id,
  p.id AS produto_id, p.nome_produto, p.categoria,
  COALESCE(sum(CASE WHEN m.tipo LIKE 'ENTRADA%' AND m.tipo <> 'ENTRADA_ESTORNO' THEN m.quantidade ELSE 0 END), 0) AS entradas,
  COALESCE(sum(CASE WHEN m.tipo NOT LIKE 'ENTRADA%' AND m.tipo NOT IN ('AJUSTE','ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN m.quantidade ELSE 0 END), 0) AS saidas,
  COALESCE((
    SELECT SUM(CASE
      WHEN ms.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
      WHEN ms.direction = 'IN' THEN ms.quantidade
      ELSE -ms.quantidade
    END)
    FROM public.movimentacoes_estoque ms
    WHERE ms.produto_id = p.id AND ms.status = 'ATIVO'
  ), 0) AS saldo_atual
FROM public.produtos p
LEFT JOIN public.movimentacoes_estoque m ON m.produto_id = p.id AND m.status = 'ATIVO' AND m.data >= (CURRENT_DATE - interval '90 days')
WHERE p.ativo = true
GROUP BY p.company_id, p.id, p.nome_produto, p.categoria;

-- Revoke direct access to MVs
REVOKE ALL ON ALL TABLES IN SCHEMA reporting FROM anon, authenticated;
