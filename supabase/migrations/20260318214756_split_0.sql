CREATE OR REPLACE FUNCTION public.validate_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero (recebido: %)', NEW.quantidade;
  END IF;

  IF NEW.custo_unitario < 0 THEN
    RAISE EXCEPTION 'Custo unitário não pode ser negativo';
  END IF;

  NEW.custo_total := ROUND((COALESCE(NEW.quantidade, 0) * COALESCE(NEW.custo_unitario, 0))::numeric, 2);

  IF NEW.custo_total < 0 THEN
    RAISE EXCEPTION 'Custo total não pode ser negativo';
  END IF;

  RETURN NEW;
END;
$function$;

UPDATE public.movimentacoes_estoque
SET custo_total = ROUND((COALESCE(quantidade, 0) * COALESCE(custo_unitario, 0))::numeric, 2)
WHERE ROUND(COALESCE(custo_total, 0)::numeric, 2) <> ROUND((COALESCE(quantidade, 0) * COALESCE(custo_unitario, 0))::numeric, 2);