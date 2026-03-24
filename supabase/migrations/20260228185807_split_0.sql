CREATE OR REPLACE FUNCTION public.validate_purchase_order_item()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.qty_requested <= 0 THEN
    RAISE EXCEPTION 'qty_requested deve ser > 0 (recebido: %)', NEW.qty_requested;
  END IF;
  IF NEW.estimated_unit_value < 0 THEN
    RAISE EXCEPTION 'estimated_unit_value não pode ser negativo';
  END IF;
  RETURN NEW;
END;
$fn$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_poi') THEN
    CREATE TRIGGER trg_validate_poi BEFORE INSERT OR UPDATE ON public.purchase_order_items
      FOR EACH ROW EXECUTE FUNCTION public.validate_purchase_order_item();
  END IF;
END $$;