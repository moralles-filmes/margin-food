CREATE OR REPLACE FUNCTION public.validate_salmon_entry()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.gross_kg <= 0 THEN RAISE EXCEPTION 'gross_kg deve ser > 0'; END IF;
  IF NEW.total_value < 0 THEN RAISE EXCEPTION 'total_value não pode ser negativo'; END IF;
  IF NEW.status NOT IN ('ACTIVE', 'CANCELLED') THEN RAISE EXCEPTION 'status inválido: %', NEW.status; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_salmon_entry BEFORE INSERT OR UPDATE ON public.salmon_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_salmon_entry();