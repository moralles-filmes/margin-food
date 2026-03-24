CREATE OR REPLACE FUNCTION public.validate_rh_beneficios_numeric()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.valor_empresa < 0 THEN
    RAISE EXCEPTION '400: valor_empresa não pode ser negativo (valor: %)', NEW.valor_empresa;
  END IF;
  IF NEW.valor_colaborador < 0 THEN
    RAISE EXCEPTION '400: valor_colaborador não pode ser negativo (valor: %)', NEW.valor_colaborador;
  END IF;
  IF NEW.percentual_desconto < 0 THEN
    RAISE EXCEPTION '400: percentual_desconto não pode ser negativo (valor: %)', NEW.percentual_desconto;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_rh_beneficios_numeric
  BEFORE INSERT OR UPDATE ON public.rh_beneficios
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_rh_beneficios_numeric();

-- rh_banco_horas