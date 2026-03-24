CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_set_updated_at_inventarios
  BEFORE UPDATE ON public.inventarios
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER trg_set_updated_at_inventario_itens
  BEFORE UPDATE ON public.inventario_itens
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ── H2 continued: create_inventory_atomic RPC ──