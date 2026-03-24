
-- Fix: Recreate triggers with correct events (INSERT OR UPDATE)
-- trg_set_direction
DROP TRIGGER IF EXISTS trg_set_direction ON public.movimentacoes_estoque;
CREATE TRIGGER trg_set_direction
  BEFORE INSERT OR UPDATE OF tipo ON public.movimentacoes_estoque
  FOR EACH ROW
  EXECUTE FUNCTION public.set_stock_movement_direction();

-- trg_validate_stock_movement  
DROP TRIGGER IF EXISTS trg_validate_stock_movement ON public.movimentacoes_estoque;
CREATE TRIGGER trg_validate_stock_movement
  BEFORE INSERT OR UPDATE OF quantidade, custo_unitario, custo_total ON public.movimentacoes_estoque
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_stock_movement();
