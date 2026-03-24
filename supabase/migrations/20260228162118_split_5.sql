CREATE OR REPLACE FUNCTION public.validate_cr_valor()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_cp_valor ON public.fin_contas_pagar;
CREATE TRIGGER trg_validate_cp_valor
  BEFORE INSERT OR UPDATE ON public.fin_contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.validate_cp_valor();

DROP TRIGGER IF EXISTS trg_validate_cr_valor ON public.fin_contas_receber;
CREATE TRIGGER trg_validate_cr_valor
  BEFORE INSERT OR UPDATE ON public.fin_contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.validate_cr_valor();

-- ============================================================
-- E) ATOMIC RPCs FOR CP/CR PAYMENT
-- ============================================================