CREATE OR REPLACE FUNCTION public.trg_mask_numero_cartao()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero_cartao IS NOT NULL AND NEW.numero_cartao != '' THEN
    NEW.numero_cartao_last4 := RIGHT(NEW.numero_cartao, 4);
  ELSE
    NEW.numero_cartao_last4 := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_numero_cartao_last4 ON public.rh_beneficios;
CREATE TRIGGER set_numero_cartao_last4
  BEFORE INSERT OR UPDATE ON public.rh_beneficios
  FOR EACH ROW EXECUTE FUNCTION public.trg_mask_numero_cartao();

-- RPC to read beneficios with masking (non-admin sees only last4)