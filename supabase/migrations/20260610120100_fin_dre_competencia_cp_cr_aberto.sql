-- ============================================================================
-- M2 — DRE por competência incluindo contas a pagar/receber EM ABERTO
-- ----------------------------------------------------------------------------
-- Problema: get_fin_dre_summary só somava fin_lancamentos REALIZADO/CONCILIADO →
--   o DRE era um relatório de caixa. Uma compra de junho ainda não paga (conta a
--   pagar em aberto) não aparecia no DRE de junho.
--
-- Regra (confirmada com o usuário): o DRE apura por COMPETÊNCIA e inclui:
--   • lançamentos REALIZADO/CONCILIADO (já pagos/recebidos) — como antes;
--   • contas a PAGAR em aberto   (status NOT IN PAGO/CANCELADO/RASCUNHO);
--   • contas a RECEBER em aberto (status NOT IN RECEBIDO/CANCELADO/RASCUNHO);
--   tudo agrupado por data_competencia (CP/CR: COALESCE(competência, vencimento)).
--   NÃO inclui lançamentos manuais PREVISTO (planejamento/orçamento).
--
-- Sem dupla contagem: quando uma CP/CR é paga ela vira espelho REALIZADO (contado
-- em fin_lancamentos) e sai do conjunto "em aberto". CP/CR em aberto não têm espelho.
--
-- Rateio: fin_lancamento_rateios.lancamento_id é polimórfico (sem FK) e guarda os
-- splits de CP/CR sob o id da própria conta (ver _guarded_create_conta_pagar). Por
-- isso o rateio tem prioridade também para CP/CR (mesmo padrão dos lançamentos).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_fin_dre_summary(p_mes text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_inicio date;
  v_fim date;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:dre:view', 'financeiro:relatorios:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_inicio := (p_mes || '-01')::date;
  v_fim := (v_inicio + interval '1 month' - interval '1 day')::date;

  WITH effective_values AS (
    -- 1. Lançamentos REALIZADO/CONCILIADO com rateio
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_lancamentos l ON l.id = r.lancamento_id AND l.company_id = v_company_id
    WHERE l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND l.data_competencia BETWEEN v_inicio AND v_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 2. Lançamentos REALIZADO/CONCILIADO sem rateio
    SELECT l.categoria_id, l.valor
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND l.data_competencia BETWEEN v_inicio AND v_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = l.id AND r.company_id = v_company_id
      )
    UNION ALL
    -- 3. Contas a PAGAR em aberto com rateio (split sob o id da CP)
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_contas_pagar cp ON cp.id = r.lancamento_id AND cp.company_id = v_company_id
    WHERE cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN v_inicio AND v_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 4. Contas a PAGAR em aberto sem rateio
    SELECT cp.categoria_id, cp.valor
    FROM fin_contas_pagar cp
    WHERE cp.company_id = v_company_id
      AND cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN v_inicio AND v_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = cp.id AND r.company_id = v_company_id
      )
    UNION ALL
    -- 5. Contas a RECEBER em aberto com rateio (split sob o id da CR)
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_contas_receber cr ON cr.id = r.lancamento_id AND cr.company_id = v_company_id
    WHERE cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN v_inicio AND v_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 6. Contas a RECEBER em aberto sem rateio
    SELECT cr.categoria_id, cr.valor
    FROM fin_contas_receber cr
    WHERE cr.company_id = v_company_id
      AND cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN v_inicio AND v_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = cr.id AND r.company_id = v_company_id
      )
  ),
  por_categoria AS (
    SELECT
      COALESCE(ev.categoria_id, '00000000-0000-0000-0000-000000000000')::text as cat_id,
      SUM(ev.valor) as total
    FROM effective_values ev
    GROUP BY ev.categoria_id
  )
  SELECT jsonb_build_object(
    'mes', p_mes,
    'categorias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'codigo', c.codigo, 'tipo', c.tipo,
        'parent_id', c.parent_id, 'ordem', c.ordem, 'ativo', c.ativo,
        'grupo', c.grupo, 'linha_dre', c.linha_dre,
        'centro_custo_padrao_id', c.centro_custo_padrao_id
      ) ORDER BY c.ordem, c.codigo)
      FROM fin_categorias c
      WHERE c.company_id = v_company_id AND c.ativo = true
    ), '[]'::jsonb),
    'valores_por_categoria', COALESCE((
      SELECT jsonb_object_agg(pc.cat_id, pc.total)
      FROM por_categoria pc
    ), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- Força a resolução das colunas dos novos JOINs (CP/CR) no db push — evita crash
-- em produção na 1ª execução por erro de coluna (padrão 20260502151400).
DO $$
DECLARE v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM r.valor
  FROM public.fin_lancamento_rateios r
  JOIN public.fin_contas_pagar cp ON cp.id = r.lancamento_id AND cp.company_id = v_sentinel
  WHERE cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
    AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN '1900-01-01' AND '1900-01-31';

  PERFORM cr.valor
  FROM public.fin_contas_receber cr
  WHERE cr.company_id = v_sentinel
    AND cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
    AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN '1900-01-01' AND '1900-01-31';
END $$;
