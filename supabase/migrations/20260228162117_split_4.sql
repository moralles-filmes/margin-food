CREATE OR REPLACE FUNCTION public.validate_cp_valor()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero';
  END IF;
  RETURN NEW;
END;
$$;