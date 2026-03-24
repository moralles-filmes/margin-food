CREATE OR REPLACE FUNCTION public.validate_supplier_item_price()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.unit_cost < 0 THEN
    RAISE EXCEPTION 'unit_cost não pode ser negativo em supplier_item_prices';
  END IF;
  RETURN NEW;
END;
$fn$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_sip') THEN
    CREATE TRIGGER trg_validate_sip BEFORE INSERT OR UPDATE ON public.supplier_item_prices
      FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_item_price();
  END IF;
END $$;

-- 3) Fix race condition in storno RPC: add FOR UPDATE locks