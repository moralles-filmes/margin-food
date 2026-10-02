-- Projeção de Fluxo: estimativa do que não passa por títulos.
--
-- A projeção só enxergava CP/CR em aberto e lançamentos PREVISTO. Num restaurante a maior
-- parte da receita (cartão/PIX) e boa parte da despesa (set/2026 na Ren Sushi: R$ 358 mil de
-- R$ 650 mil) entram pela conciliação sem título — a projeção de 30 dias saía com R$ 408 mil
-- de saída e nenhuma entrada.
--
-- Cada dia futuro (a partir de amanhã) recebe a média do mesmo dia da semana das últimas
-- 4 semanas fechadas do Livro Razão (caixa), só com lançamentos operacionais que NÃO são
-- baixa de conta a pagar/receber — esses já entram pelo vencimento dos títulos em aberto,
-- então nada é contado duas vezes. A janela termina no último dia com receita lançada (o
-- extrato chega com atraso; terminar em "ontem" puxaria a média para baixo). Não
-- operacionais (lucro de sócio, empréstimo) ficam fora da estimativa por serem irregulares.
--
-- Contrato aditivo: saldo/saldo_final/dias_negativo/saldo_minimo continuam só com títulos e
-- previstos (o frontend antigo não muda); a versão com estimativa vem nos campos *_estimada
-- e *_com_estimativa. Mesma assinatura — CREATE OR REPLACE, sem DROP.
CREATE OR REPLACE FUNCTION public.get_fin_fluxo_projecao(p_dias integer DEFAULT 30, p_saldo_manual numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_hoje date;
  v_fim date;
  v_saldo_inicial_contas numeric;
  v_saldo_base numeric;
  v_janela_fim date;
  v_janela_inicio date;
  v_result jsonb;
BEGIN
  -- Tenant isolation
  v_company_id := assert_tenant();

  -- RBAC
  IF NOT has_any_permission(
    auth.uid(),
    ARRAY['financeiro:projecao:view','system:global:manage']
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_fim  := v_hoje + p_dias;

  -- Saldo inicial cadastrado nas contas bancárias ativas
  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial_contas
  FROM fin_contas
  WHERE company_id = v_company_id AND ativo = true;

  -- 1. Saldo base: saldo inicial das contas + realizado/conciliado, excluindo transferências
  SELECT v_saldo_inicial_contas + COALESCE(SUM(
    CASE
      WHEN tipo = 'RECEITA' THEN valor
      WHEN tipo = 'DESPESA' THEN -valor
      ELSE 0
    END
  ), 0)
  INTO v_saldo_base
  FROM public.fin_lancamentos
  WHERE company_id = v_company_id
    AND tipo != 'TRANSFERENCIA'
    AND status IN ('REALIZADO', 'CONCILIADO');

  -- Override with manual if provided
  IF p_saldo_manual IS NOT NULL THEN
    v_saldo_base := p_saldo_manual;
  END IF;

  -- Janela da estimativa: 4 semanas fechadas até o último dia com receita lançada.
  SELECT MAX(COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia))
  INTO v_janela_fim
  FROM public.fin_lancamentos
  WHERE company_id = v_company_id
    AND tipo = 'RECEITA'
    AND status IN ('REALIZADO', 'CONCILIADO')
    AND excluir_dos_relatorios IS NOT TRUE
    AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
    AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) < v_hoje;
  v_janela_inicio := v_janela_fim - 27;

  -- 2. Build timeline using CTE
  WITH movimentacoes AS (
    -- Lançamentos previstos (atrasados entram hoje)
    SELECT GREATEST(COALESCE(data_vencimento, data_competencia), v_hoje) AS data,
           CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END AS entrada,
           CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END AS saida
    FROM public.fin_lancamentos
    WHERE company_id = v_company_id
      AND tipo != 'TRANSFERENCIA'
      AND status = 'PREVISTO'
      AND COALESCE(data_vencimento, data_competencia) <= v_fim

    UNION ALL

    -- Contas a pagar (vencidas entram hoje)
    SELECT GREATEST(data_vencimento, v_hoje) AS data,
           0 AS entrada,
           valor AS saida
    FROM public.fin_contas_pagar
    WHERE company_id = v_company_id
      AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND data_vencimento <= v_fim

    UNION ALL

    -- Contas a receber (vencidas entram hoje)
    SELECT GREATEST(data_vencimento, v_hoje) AS data,
           valor AS entrada,
           0 AS saida
    FROM public.fin_contas_receber
    WHERE company_id = v_company_id
      AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND data_vencimento <= v_fim
  ),
  historico AS (
    SELECT
      EXTRACT(ISODOW FROM ledger.data_efetiva)::integer AS dia_semana,
      COALESCE(SUM(ledger.valor) FILTER (WHERE ledger.tipo = 'RECEITA'), 0) / 4.0 AS receita,
      COALESCE(SUM(ledger.valor) FILTER (WHERE ledger.tipo = 'DESPESA'), 0) / 4.0 AS despesa
    FROM (
      SELECT tipo, valor,
        COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) AS data_efetiva
      FROM public.fin_lancamentos
      WHERE company_id = v_company_id
        AND tipo IN ('RECEITA', 'DESPESA')
        AND status IN ('REALIZADO', 'CONCILIADO')
        AND excluir_dos_relatorios IS NOT TRUE
        AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
        AND COALESCE(NULLIF(referencia_modulo, ''), '-') NOT IN ('contas_pagar', 'contas_receber')
    ) ledger
    WHERE ledger.data_efetiva BETWEEN v_janela_inicio AND v_janela_fim
    GROUP BY 1
  ),
  dias_serie AS (
    SELECT d::date AS data
    FROM generate_series(v_hoje, v_fim, '1 day'::interval) d
  ),
  daily_agg AS (
    SELECT ds.data,
           COALESCE(SUM(m.entrada), 0) AS entradas,
           COALESCE(SUM(m.saida), 0) AS saidas
    FROM dias_serie ds
    LEFT JOIN movimentacoes m ON m.data = ds.data
    GROUP BY ds.data
  ),
  daily_estimado AS (
    SELECT agg.data,
           agg.entradas,
           agg.saidas,
           CASE WHEN agg.data > v_hoje THEN round(COALESCE(h.receita, 0), 2) ELSE 0 END AS receita_estimada,
           CASE WHEN agg.data > v_hoje THEN round(COALESCE(h.despesa, 0), 2) ELSE 0 END AS despesa_estimada
    FROM daily_agg agg
    LEFT JOIN historico h ON h.dia_semana = EXTRACT(ISODOW FROM agg.data)::integer
  ),
  timeline AS (
    SELECT data,
           entradas,
           saidas,
           receita_estimada,
           despesa_estimada,
           v_saldo_base + SUM(entradas - saidas) OVER (ORDER BY data) AS saldo,
           v_saldo_base + SUM(entradas + receita_estimada - saidas - despesa_estimada) OVER (ORDER BY data) AS saldo_com_estimativa
    FROM daily_estimado
  )
  SELECT jsonb_build_object(
    'saldo_inicial', v_saldo_base,
    'entradas', (SELECT COALESCE(SUM(entradas), 0) FROM timeline),
    'saidas', (SELECT COALESCE(SUM(saidas), 0) FROM timeline),
    'saldo_final', (SELECT saldo FROM timeline ORDER BY data DESC LIMIT 1),
    'dias_negativo', (SELECT COUNT(*) FROM timeline WHERE saldo < 0),
    'saldo_minimo', (SELECT COALESCE(MIN(saldo), 0) FROM timeline),
    'estimativa', jsonb_build_object(
      'disponivel', v_janela_fim IS NOT NULL,
      'janela_inicio', v_janela_inicio,
      'janela_fim', v_janela_fim,
      'receita_estimada', (SELECT COALESCE(SUM(receita_estimada), 0) FROM timeline),
      'despesa_estimada', (SELECT COALESCE(SUM(despesa_estimada), 0) FROM timeline),
      'saldo_final', (SELECT saldo_com_estimativa FROM timeline ORDER BY data DESC LIMIT 1),
      'dias_negativo', (SELECT COUNT(*) FROM timeline WHERE saldo_com_estimativa < 0),
      'saldo_minimo', (SELECT COALESCE(MIN(saldo_com_estimativa), 0) FROM timeline)
    ),
    'timeline', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'data', to_char(data, 'YYYY-MM-DD'),
          'saldo', saldo,
          'entradas', entradas,
          'saidas', saidas,
          'receita_estimada', receita_estimada,
          'despesa_estimada', despesa_estimada,
          'saldo_com_estimativa', saldo_com_estimativa
        ) ORDER BY data
      )
      FROM timeline
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
