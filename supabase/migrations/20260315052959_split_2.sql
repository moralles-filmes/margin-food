CREATE OR REPLACE FUNCTION public.trg_refresh_saldo_cache_conta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM refresh_saldo_cache(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saldo_cache_conta ON public.fin_contas;
CREATE TRIGGER trg_saldo_cache_conta
AFTER INSERT OR UPDATE OF saldo_inicial ON public.fin_contas
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_saldo_cache_conta();

-- 5) Seed cache for all existing contas
INSERT INTO fin_contas_saldo_cache (conta_id, company_id, saldo, updated_at)
SELECT c.id, c.company_id,
  c.saldo_inicial + COALESCE((
    SELECT SUM(CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = c.id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = c.id THEN l.valor
      WHEN l.tipo = 'RECEITA' AND l.conta_id = c.id THEN l.valor
      WHEN l.tipo = 'DESPESA' AND l.conta_id = c.id THEN -l.valor
      ELSE 0 END)
    FROM fin_lancamentos l
    WHERE l.status IN ('REALIZADO','CONCILIADO') AND l.company_id = c.company_id
      AND (l.conta_id = c.id OR l.conta_destino_id = c.id)
  ), 0),
  now()
FROM fin_contas c WHERE c.ativo = true
ON CONFLICT (conta_id) DO UPDATE SET saldo = EXCLUDED.saldo, updated_at = now();

-- 6) Recreate get_fin_alertas with RBAC + totals + cache + limits