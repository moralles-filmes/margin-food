-- =========================================================
-- FIX: get_spend_by_sector somava entradas de inventário
-- Data: 2026-05-01
-- Problema: O card "Gastos por Setor" em Relatórios Gerais
--   somava AJUSTE_INVENTARIO_POSITIVO (entrada com direction='IN'
--   gerada pelo módulo Inventário quando contagem física > saldo
--   esperado). Filtro `tipo NOT LIKE 'ENTRADA%'` é insuficiente
--   porque o universo de tipos inclui IN cujo nome não começa
--   com ENTRADA (vide CHECK constraint em 20260228023512).
--
-- Fix: usa coluna canônica `direction = 'OUT'`, padrão já
--   adotado em get_relatorios_kpis (20260501195715). Cobre os
--   9 tipos de saída atuais e exclui automaticamente todos os
--   tipos de entrada — inclusive AJUSTE_INVENTARIO_POSITIVO,
--   ENTRADA_COMPRA, ENTRADA_INICIAL.
--
-- Bonus: amplia o filtro "Não incluir perdas" de
--   {BAIXA_PERDA} para {BAIXA_PERDA, SAIDA_PERDA, SAIDA_VENCIMENTO}
--   — todos os 3 tipos representam perda física de estoque.
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_spend_by_sector(
  p_start_date date,
  p_end_date date,
  p_include_losses boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'stock:read') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN (
    WITH sector_spend AS (
      SELECT
        COALESCE(NULLIF(m.setor, ''), 'Não informado') AS sector,
        SUM(m.custo_total) AS total
      FROM public.movimentacoes_estoque m
      WHERE m.company_id = v_company
        AND m.status = 'ATIVO'
        AND m.direction = 'OUT'
        AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
        AND m.data >= p_start_date
        AND m.data <= p_end_date
        AND (
          p_include_losses
          OR m.tipo NOT IN ('BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')
        )
      GROUP BY COALESCE(NULLIF(m.setor, ''), 'Não informado')
    ),
    grand_total AS (
      SELECT COALESCE(SUM(total), 0) AS gt FROM sector_spend
    )
    SELECT json_build_object(
      'total_spend', (SELECT gt FROM grand_total),
      'updated_at', now(),
      'breakdown', COALESCE(
        (SELECT json_agg(
          json_build_object(
            'sector', ss.sector,
            'value', ROUND(ss.total::numeric, 2),
            'percent', CASE WHEN gt.gt > 0
                       THEN ROUND((ss.total / gt.gt * 100)::numeric, 1)
                       ELSE 0 END
          ) ORDER BY ss.total DESC
        )
        FROM sector_spend ss, grand_total gt),
        '[]'::json
      )
    )
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
