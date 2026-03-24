CREATE OR REPLACE FUNCTION public.set_stock_movement_direction()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.direction := CASE
    -- Estorno segue a direção semântica do movimento reverso,
    -- mas os cálculos de saldo/valor ignoram tipos *_ESTORNO.
    WHEN NEW.tipo = 'SAIDA_ESTORNO' THEN 'OUT'
    WHEN NEW.tipo = 'ENTRADA_ESTORNO' THEN 'IN'
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