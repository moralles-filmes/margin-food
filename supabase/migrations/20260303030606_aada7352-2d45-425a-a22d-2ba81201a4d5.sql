
-- C4: Server-side aprovado_em — trigger auto-fills when status changes to APROVADO
CREATE OR REPLACE FUNCTION public.trg_fin_contas_pagar_aprovado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Auto-set aprovado_em when status transitions to APROVADO
  IF NEW.status = 'APROVADO' AND (OLD.status IS DISTINCT FROM 'APROVADO') THEN
    NEW.aprovado_em := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fin_contas_pagar_set_aprovado_em
BEFORE UPDATE ON public.fin_contas_pagar
FOR EACH ROW
EXECUTE FUNCTION public.trg_fin_contas_pagar_aprovado_em();
