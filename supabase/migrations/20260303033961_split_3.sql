CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_purchase_orders_updated_at') THEN
    CREATE TRIGGER trg_purchase_orders_updated_at
      BEFORE UPDATE ON public.purchase_orders
      FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_purchase_order_items_updated_at') THEN
    CREATE TRIGGER trg_purchase_order_items_updated_at
      BEFORE UPDATE ON public.purchase_order_items
      FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_purchase_reminders_updated_at') THEN
    CREATE TRIGGER trg_purchase_reminders_updated_at
      BEFORE UPDATE ON public.purchase_reminders
      FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();
  END IF;
END $$;