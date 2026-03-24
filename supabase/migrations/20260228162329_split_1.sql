CREATE OR REPLACE FUNCTION public.validate_cr_valor()
  RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero';
  END IF;
  RETURN NEW;
END;
$$;