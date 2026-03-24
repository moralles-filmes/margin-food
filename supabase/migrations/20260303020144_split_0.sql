CREATE OR REPLACE FUNCTION public.validate_rh_colaboradores_numeric()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.salario IS NOT NULL AND NEW.salario < 0 THEN
    RAISE EXCEPTION '400: salario não pode ser negativo (valor: %)', NEW.salario;
  END IF;
  IF NEW.valor_hora IS NOT NULL AND NEW.valor_hora < 0 THEN
    RAISE EXCEPTION '400: valor_hora não pode ser negativo (valor: %)', NEW.valor_hora;
  END IF;
  IF NEW.carga_horaria_semanal <= 0 THEN
    RAISE EXCEPTION '400: carga_horaria_semanal deve ser maior que zero (valor: %)', NEW.carga_horaria_semanal;
  END IF;
  IF NEW.adicional_noturno_percent IS NOT NULL AND NEW.adicional_noturno_percent < 0 THEN
    RAISE EXCEPTION '400: adicional_noturno_percent não pode ser negativo (valor: %)', NEW.adicional_noturno_percent;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_rh_colaboradores_numeric
  BEFORE INSERT OR UPDATE ON public.rh_colaboradores
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_rh_colaboradores_numeric();

-- rh_beneficios