CREATE OR REPLACE FUNCTION public.validate_rh_folha_numeric()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.salario_base < 0 THEN
    RAISE EXCEPTION '400: salario_base não pode ser negativo (valor: %)', NEW.salario_base;
  END IF;
  IF NEW.valor_hora < 0 THEN
    RAISE EXCEPTION '400: valor_hora não pode ser negativo (valor: %)', NEW.valor_hora;
  END IF;
  IF NEW.horas_normais < 0 THEN
    RAISE EXCEPTION '400: horas_normais não pode ser negativo (valor: %)', NEW.horas_normais;
  END IF;
  IF NEW.horas_extras_50 < 0 THEN
    RAISE EXCEPTION '400: horas_extras_50 não pode ser negativo (valor: %)', NEW.horas_extras_50;
  END IF;
  IF NEW.horas_extras_100 < 0 THEN
    RAISE EXCEPTION '400: horas_extras_100 não pode ser negativo (valor: %)', NEW.horas_extras_100;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_rh_folha_numeric
  BEFORE INSERT OR UPDATE ON public.rh_folha_pagamento
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_rh_folha_numeric();