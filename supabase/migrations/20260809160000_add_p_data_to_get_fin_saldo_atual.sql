-- ============================================================================
-- get_fin_saldo_atual ganha p_data date DEFAULT NULL: quando informado, o card
-- "Saldo atual" do Livro Razão passa a refletir o saldo na data filtrada
-- ("até"), em vez de sempre o saldo real de hoje.
--
-- p_data IS NULL: comportamento inalterado, lê fin_contas_saldo_cache (rápido).
-- p_data informado: calcula via ledger, mesma fórmula assinada de
-- get_fin_saldo_conta_em (RECEITA/DESPESA/TRANSFERENCIA), generalizada para
-- somar todas as contas ativas quando p_conta_id IS NULL (TRANSFERENCIA
-- excluída nesse caso — movimento interno não muda o total da empresa, mesmo
-- critério já usado no cálculo original "sem filtro de conta").
-- Ver docs/superpowers/specs/2026-08-09-saldo-atual-por-data-e-saldo-por-dia-design.md
-- ============================================================================

-- CREATE OR REPLACE não substitui uma função existente quando a assinatura de
-- parâmetros muda (mesmo com DEFAULT) — cria uma sobrecarga nova em vez de
-- trocar a antiga, o que deixaria 2 versões de get_fin_saldo_atual (1 e 2
-- argumentos) coexistindo e geraria ambiguidade no PostgREST.
DROP FUNCTION IF EXISTS public.get_fin_saldo_atual(uuid);

CREATE OR REPLACE FUNCTION public.get_fin_saldo_atual(p_conta_id uuid DEFAULT NULL::uuid, p_data date DEFAULT NULL::date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company uuid;
  v_saldo numeric;
  v_saldo_inicial numeric;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_data IS NULL THEN
    IF p_conta_id IS NOT NULL THEN
      SELECT sc.saldo INTO v_saldo
      FROM public.fin_contas_saldo_cache sc
      JOIN public.fin_contas c ON c.id = sc.conta_id
      WHERE sc.conta_id = p_conta_id AND c.company_id = v_company;
    ELSE
      SELECT COALESCE(SUM(sc.saldo), 0) INTO v_saldo
      FROM public.fin_contas_saldo_cache sc
      JOIN public.fin_contas c ON c.id = sc.conta_id
      WHERE c.company_id = v_company AND c.ativo = true;
    END IF;

    RETURN COALESCE(v_saldo, 0);
  END IF;

  IF p_conta_id IS NOT NULL THEN
    SELECT c.saldo_inicial INTO v_saldo_inicial
    FROM public.fin_contas c
    WHERE c.id = p_conta_id AND c.company_id = v_company;

    IF v_saldo_inicial IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND';
    END IF;

    SELECT v_saldo_inicial + COALESCE(SUM(
      CASE
        WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = p_conta_id THEN -l.valor
        WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = p_conta_id THEN l.valor
        WHEN l.tipo = 'RECEITA' AND l.conta_id = p_conta_id THEN l.valor
        WHEN l.tipo = 'DESPESA' AND l.conta_id = p_conta_id THEN -l.valor
        ELSE 0
      END
    ), 0) INTO v_saldo
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND (l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
      AND l.data_competencia <= p_data;

    RETURN v_saldo;
  END IF;

  SELECT COALESCE(SUM(c.saldo_inicial), 0) INTO v_saldo_inicial
  FROM public.fin_contas c
  WHERE c.company_id = v_company AND c.ativo = true;

  SELECT v_saldo_inicial + COALESCE(SUM(
    CASE
      WHEN l.tipo = 'RECEITA' THEN l.valor
      WHEN l.tipo = 'DESPESA' THEN -l.valor
      ELSE 0
    END
  ), 0) INTO v_saldo
  FROM public.fin_lancamentos l
  JOIN public.fin_contas c ON c.id = l.conta_id
  WHERE l.company_id = v_company
    AND l.status IN ('REALIZADO', 'CONCILIADO')
    AND l.tipo IN ('RECEITA', 'DESPESA')
    AND c.ativo = true
    AND l.data_competencia <= p_data;

  RETURN v_saldo;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_saldo_atual(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fin_saldo_atual(uuid, date) TO authenticated;

DO $$
DECLARE v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM COALESCE(SUM(sc.saldo), 0)
  FROM public.fin_contas_saldo_cache sc
  JOIN public.fin_contas c ON c.id = sc.conta_id
  WHERE c.company_id = v_sentinel AND c.ativo = true;

  PERFORM COALESCE(SUM(
    CASE WHEN l.tipo = 'RECEITA' THEN l.valor WHEN l.tipo = 'DESPESA' THEN -l.valor ELSE 0 END
  ), 0)
  FROM public.fin_lancamentos l
  JOIN public.fin_contas c ON c.id = l.conta_id
  WHERE l.company_id = v_sentinel
    AND l.status IN ('REALIZADO', 'CONCILIADO')
    AND l.tipo IN ('RECEITA', 'DESPESA')
    AND c.ativo = true
    AND l.data_competencia <= '1900-01-31'::date;
END $$;
