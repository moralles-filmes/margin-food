-- Santander's OFX LEDGERBAL covers only the current-account pocket. The
-- previous consolidation repair anchored the account at zero after a ContaMax
-- sweep and therefore removed principal that was still invested. Restore the
-- proven consolidated opening and fail closed if the audited data drifted.
DO $repair$
DECLARE
  v_account_count integer;
  v_account_id uuid;
  v_company_id uuid;
  v_actor_id uuid;
  v_initial_balance numeric;
  v_balance_before numeric;
  v_balance_after numeric;
BEGIN
  SELECT
    count(*)::integer,
    (array_agg(c.id ORDER BY c.id))[1],
    (array_agg(c.company_id ORDER BY c.id))[1],
    (array_agg(c.created_by ORDER BY c.id))[1]
  INTO v_account_count, v_account_id, v_company_id, v_actor_id
  FROM public.fin_contas c
  WHERE c.banco = '033'
    AND regexp_replace(COALESCE(c.numero_conta, ''), '\D', '', 'g') = '130117470';

  IF v_account_count = 0 THEN
    RETURN;
  END IF;

  IF v_account_count <> 1 OR v_actor_id IS NULL THEN
    RAISE EXCEPTION
      'SANTANDER_OPENING_REPAIR_ABORTED: expected one audited Santander GM account, found %',
      v_account_count;
  END IF;

  SELECT c.saldo_inicial
  INTO v_initial_balance
  FROM public.fin_contas c
  WHERE c.id = v_account_id
    AND c.company_id = v_company_id
  FOR UPDATE;

  IF v_initial_balance NOT IN (10202.41, 33164.29) THEN
    RAISE EXCEPTION
      'SANTANDER_OPENING_REPAIR_ABORTED: unexpected opening balance R$%',
      v_initial_balance;
  END IF;

  SELECT c.saldo_inicial + COALESCE(sum(
    CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = c.id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = c.id THEN l.valor
      WHEN l.tipo = 'RECEITA' AND l.conta_id = c.id THEN l.valor
      WHEN l.tipo = 'DESPESA' AND l.conta_id = c.id THEN -l.valor
      ELSE 0
    END
  ), 0)
  INTO v_balance_before
  FROM public.fin_contas c
  LEFT JOIN public.fin_lancamentos l
    ON l.company_id = c.company_id
   AND l.status IN ('REALIZADO', 'CONCILIADO')
   AND (l.conta_id = c.id OR l.conta_destino_id = c.id)
   AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= date '2026-08-31'
  WHERE c.id = v_account_id
    AND c.company_id = v_company_id
  GROUP BY c.saldo_inicial;

  IF v_initial_balance = 10202.41 THEN
    IF v_balance_before <> 327.41 THEN
      RAISE EXCEPTION
        'SANTANDER_OPENING_REPAIR_ABORTED: expected pre-repair 2026-08-31 balance R$327.41, found R$%',
        v_balance_before;
    END IF;

    INSERT INTO public.fin_audit_logs (
      entidade, entidade_id, acao, antes, depois, user_id, company_id
    ) VALUES (
      'contas_bancarias',
      v_account_id,
      'corrigir_saldo_inicial_contamax_consolidado',
      jsonb_build_object(
        'saldo_inicial', v_initial_balance,
        'saldo_em_2026_08_31', v_balance_before
      ),
      jsonb_build_object(
        'saldo_inicial', 33164.29,
        'data_saldo_inicial', date '2026-08-01',
        'saldo_em_2026_08_31', 23289.29,
        'reason', 'LEDGERBAL Santander representa apenas a conta corrente; o principal ContaMax permanece no saldo consolidado'
      ),
      v_actor_id,
      v_company_id
    );

    UPDATE public.fin_contas c
    SET saldo_inicial = 33164.29,
        data_saldo_inicial = date '2026-08-01',
        updated_at = now()
    WHERE c.id = v_account_id
      AND c.company_id = v_company_id;
  END IF;

  SELECT c.saldo_inicial + COALESCE(sum(
    CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = c.id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = c.id THEN l.valor
      WHEN l.tipo = 'RECEITA' AND l.conta_id = c.id THEN l.valor
      WHEN l.tipo = 'DESPESA' AND l.conta_id = c.id THEN -l.valor
      ELSE 0
    END
  ), 0)
  INTO v_balance_after
  FROM public.fin_contas c
  LEFT JOIN public.fin_lancamentos l
    ON l.company_id = c.company_id
   AND l.status IN ('REALIZADO', 'CONCILIADO')
   AND (l.conta_id = c.id OR l.conta_destino_id = c.id)
   AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= date '2026-08-31'
  WHERE c.id = v_account_id
    AND c.company_id = v_company_id
  GROUP BY c.saldo_inicial;

  IF v_balance_after <> 23289.29 THEN
    RAISE EXCEPTION
      'SANTANDER_OPENING_REPAIR_ABORTED: expected audited 2026-08-31 balance R$23289.29, found R$%',
      v_balance_after;
  END IF;
END;
$repair$;
