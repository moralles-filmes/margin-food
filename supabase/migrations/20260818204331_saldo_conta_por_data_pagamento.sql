-- get_fin_saldo_conta_em: saldo de conta bancária é regime de CAIXA.
--
-- A função somava por `data_competencia`, então uma baixa de Contas a Pagar cujo
-- boleto tem competência num mês anterior ao pagamento entrava no saldo do mês da
-- competência. Na conferência de saldo da importação de extrato isso aparecia como
-- "saldo não confere": o espelho de um boleto com competência 24/07 pago em 17/08
-- derrubava em R$ 875,00 o saldo base de 31/07, e o extrato de agosto acusava uma
-- diferença que não existia — o dinheiro estava lançado, só no mês errado.
--
-- Passa a usar COALESCE(data_pagamento, data_competencia), alinhando com o Livro
-- Razão (que já agrupa por data de pagamento) e com a regra de que saldo bancário
-- reflete dinheiro que efetivamente entrou/saiu na data em que se moveu.
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
    AND COALESCE(l.data_pagamento, l.data_competencia) <= p_data;

  RETURN v_saldo;
END;
$function$;
