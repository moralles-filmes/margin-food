-- Hardening (defesa em profundidade, sem impacto hoje): get_fin_saldo_conta_em
-- já restringe o ledger a (conta_id = p_conta_id OR conta_destino_id = p_conta_id),
-- mas o CASE que soma RECEITA/DESPESA não reconferia l.conta_id = p_conta_id,
-- deixando aberta a possibilidade (hoje inexistente nos dados) de uma linha
-- RECEITA/DESPESA ser contada só por bater em conta_destino_id. Mesmo fix
-- aplicado em list_fin_lancamentos_cursor (migration 20260809150000) pelo
-- mesmo motivo. Ver relatório da revisão final da feature "saldo Livro Razão
-- + conferência de extrato" (2026-08-09).

CREATE OR REPLACE FUNCTION public.get_fin_saldo_conta_em(p_conta_id uuid, p_data date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_saldo_inicial numeric;
  v_saldo numeric;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY['financeiro:conciliacao:view', 'financeiro:conciliacao:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

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
END;
$function$;
