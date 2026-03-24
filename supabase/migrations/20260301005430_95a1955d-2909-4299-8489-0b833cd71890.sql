
-- Fix search_path warning for trg_mask_numero_cartao
CREATE OR REPLACE FUNCTION public.trg_mask_numero_cartao()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.numero_cartao IS NOT NULL AND NEW.numero_cartao != '' THEN
    NEW.numero_cartao_last4 := RIGHT(NEW.numero_cartao, 4);
  ELSE
    NEW.numero_cartao_last4 := NULL;
  END IF;
  RETURN NEW;
END;
$$;
