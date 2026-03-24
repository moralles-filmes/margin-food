CREATE OR REPLACE FUNCTION public.validate_stock_movement()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero (recebido: %)', NEW.quantidade;
  END IF;
  IF NEW.custo_unitario < 0 THEN
    RAISE EXCEPTION 'Custo unitário não pode ser negativo';
  END IF;
  IF NEW.custo_total < 0 THEN
    RAISE EXCEPTION 'Custo total não pode ser negativo';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_stock_movement
  BEFORE INSERT OR UPDATE ON public.movimentacoes_estoque
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_stock_movement();

-- 3) RPC batch: get_saldo_produtos