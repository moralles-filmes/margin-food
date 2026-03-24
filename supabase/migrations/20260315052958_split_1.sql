CREATE OR REPLACE FUNCTION public.trg_refresh_saldo_cache_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.conta_id IS NOT NULL THEN PERFORM refresh_saldo_cache(OLD.conta_id); END IF;
    IF OLD.conta_destino_id IS NOT NULL THEN PERFORM refresh_saldo_cache(OLD.conta_destino_id); END IF;
    RETURN OLD;
  END IF;

  IF NEW.conta_id IS NOT NULL THEN PERFORM refresh_saldo_cache(NEW.conta_id); END IF;
  IF NEW.conta_destino_id IS NOT NULL THEN PERFORM refresh_saldo_cache(NEW.conta_destino_id); END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.conta_id IS NOT NULL AND OLD.conta_id IS DISTINCT FROM NEW.conta_id THEN
      PERFORM refresh_saldo_cache(OLD.conta_id);
    END IF;
    IF OLD.conta_destino_id IS NOT NULL AND OLD.conta_destino_id IS DISTINCT FROM NEW.conta_destino_id THEN
      PERFORM refresh_saldo_cache(OLD.conta_destino_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saldo_cache_lancamento ON public.fin_lancamentos;
CREATE TRIGGER trg_saldo_cache_lancamento
AFTER INSERT OR UPDATE OR DELETE ON public.fin_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_saldo_cache_lancamento();

-- 4) Trigger on fin_contas to refresh cache on saldo_inicial change