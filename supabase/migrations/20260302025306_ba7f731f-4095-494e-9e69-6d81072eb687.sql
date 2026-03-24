-- Fix: estorno types must be checked BEFORE prefix patterns
CREATE OR REPLACE FUNCTION public.set_stock_movement_direction()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.direction := CASE
    -- Estornos first (reverse the original direction)
    WHEN NEW.tipo = 'SAIDA_ESTORNO' THEN 'IN'
    WHEN NEW.tipo = 'ENTRADA_ESTORNO' THEN 'OUT'
    -- Then prefix-based rules
    WHEN NEW.tipo LIKE 'ENTRADA%' THEN 'IN'
    WHEN NEW.tipo = 'AJUSTE_INVENTARIO_POSITIVO' THEN 'IN'
    WHEN NEW.tipo = 'AJUSTE_CORRECAO_POSTERIOR_ENTRADA' THEN 'IN'
    WHEN NEW.tipo LIKE 'SAIDA%' THEN 'OUT'
    WHEN NEW.tipo = 'BAIXA_PERDA' THEN 'OUT'
    WHEN NEW.tipo = 'AJUSTE_INVENTARIO_NEGATIVO' THEN 'OUT'
    WHEN NEW.tipo = 'AJUSTE_CORRECAO_POSTERIOR_SAIDA' THEN 'OUT'
    WHEN NEW.tipo = 'AJUSTE' THEN 'OUT'
    ELSE 'OUT'
  END;
  RETURN NEW;
END;
$function$;

-- Fix existing records with wrong direction
UPDATE movimentacoes_estoque SET direction = 'IN' WHERE tipo = 'SAIDA_ESTORNO' AND direction = 'OUT';
UPDATE movimentacoes_estoque SET direction = 'OUT' WHERE tipo = 'ENTRADA_ESTORNO' AND direction = 'IN';