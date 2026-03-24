CREATE OR REPLACE FUNCTION public.get_saldo_conta(p_conta_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(c.saldo_inicial, 0) + COALESCE(
    (SELECT SUM(
      CASE
        WHEN l.tipo = 'RECEITA' THEN l.valor
        WHEN l.tipo = 'DESPESA' THEN -l.valor
        WHEN l.tipo = 'TRANSFERENCIA' THEN
          CASE
            WHEN l.conta_id = p_conta_id AND l.conta_destino_id IS NOT NULL AND l.conta_destino_id != p_conta_id THEN -l.valor
            WHEN l.conta_id = p_conta_id AND (l.conta_destino_id IS NULL OR l.conta_destino_id = p_conta_id) THEN l.valor
            ELSE 0
          END
        ELSE 0
      END
    )
    FROM fin_lancamentos l
    WHERE l.conta_id = p_conta_id AND l.status = 'REALIZADO'
    ), 0
  )
  FROM fin_contas c
  WHERE c.id = p_conta_id;
$$;