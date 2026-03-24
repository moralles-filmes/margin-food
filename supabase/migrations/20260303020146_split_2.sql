CREATE OR REPLACE FUNCTION public.validate_rh_banco_horas_numeric()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.horas_trabalhadas < 0 THEN
    RAISE EXCEPTION '400: horas_trabalhadas não pode ser negativo (valor: %)', NEW.horas_trabalhadas;
  END IF;
  IF NEW.horas_escaladas < 0 THEN
    RAISE EXCEPTION '400: horas_escaladas não pode ser negativo (valor: %)', NEW.horas_escaladas;
  END IF;
  IF NEW.horas_extras < 0 THEN
    RAISE EXCEPTION '400: horas_extras não pode ser negativo (valor: %)', NEW.horas_extras;
  END IF;
  IF NEW.atrasos_min < 0 THEN
    RAISE EXCEPTION '400: atrasos_min não pode ser negativo (valor: %)', NEW.atrasos_min;
  END IF;
  IF NEW.faltas < 0 THEN
    RAISE EXCEPTION '400: faltas não pode ser negativo (valor: %)', NEW.faltas;
  END IF;
  IF NEW.dias_trabalhados < 0 THEN
    RAISE EXCEPTION '400: dias_trabalhados não pode ser negativo (valor: %)', NEW.dias_trabalhados;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_rh_banco_horas_numeric
  BEFORE INSERT OR UPDATE ON public.rh_banco_horas
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_rh_banco_horas_numeric();

-- rh_folha_pagamento