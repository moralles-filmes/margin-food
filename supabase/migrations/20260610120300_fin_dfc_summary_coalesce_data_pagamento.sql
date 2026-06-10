-- ============================================================================
-- M4 — DFC (get_fin_dfc_summary): hardening da data de caixa
-- ----------------------------------------------------------------------------
-- A função já apura corretamente o realizado por data_pagamento. Esta migration
-- só adiciona robustez: se um lançamento REALIZADO/CONCILIADO não tiver
-- data_pagamento preenchida, usa conciliado_em (data da conciliação) e, em último
-- caso, data_competencia — evitando que o valor "suma" do DFC realizado.
-- Continua apenas status IN ('REALIZADO','CONCILIADO') (regime de caixa).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_fin_dfc_summary(p_inicio date, p_fim date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_saldo_inicial numeric;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:fluxo:view', 'financeiro:relatorios:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Saldo inicial = sum of account balances + net movements (por caixa) before period
  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial
  FROM fin_contas WHERE company_id = v_company_id AND ativo = true;

  v_saldo_inicial := v_saldo_inicial + COALESCE((
    SELECT SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE -valor END)
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_inicio
  ), 0);

  WITH effective_values AS (
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_lancamentos l ON l.id = r.lancamento_id AND l.company_id = v_company_id
    WHERE l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    SELECT l.categoria_id, l.valor
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = l.id AND r.company_id = v_company_id
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
    'saldo_inicial', v_saldo_inicial,
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
