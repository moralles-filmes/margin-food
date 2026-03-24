-- Adicionar coluna 'direction' ausente
ALTER TABLE public.movimentacoes_estoque ADD COLUMN IF NOT EXISTS direction TEXT;

CREATE OR REPLACE FUNCTION public.set_stock_movement_direction()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  NEW.direction := CASE
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
$$;

CREATE TRIGGER trg_set_direction
  BEFORE INSERT OR UPDATE OF tipo ON public.movimentacoes_estoque
  FOR EACH ROW
  EXECUTE FUNCTION public.set_stock_movement_direction();

-- 1c) Backfill existing rows
UPDATE public.movimentacoes_estoque SET direction = CASE
  WHEN tipo LIKE 'ENTRADA%' THEN 'IN'
  WHEN tipo = 'AJUSTE_INVENTARIO_POSITIVO' THEN 'IN'
  WHEN tipo = 'AJUSTE_CORRECAO_POSTERIOR_ENTRADA' THEN 'IN'
  WHEN tipo LIKE 'SAIDA%' THEN 'OUT'
  WHEN tipo = 'BAIXA_PERDA' THEN 'OUT'
  WHEN tipo = 'AJUSTE_INVENTARIO_NEGATIVO' THEN 'OUT'
  WHEN tipo = 'AJUSTE_CORRECAO_POSTERIOR_SAIDA' THEN 'OUT'
  WHEN tipo = 'AJUSTE' THEN 'OUT'
  ELSE 'OUT'
END;

-- 2) CONSTRAINTS de integridade
-- Use validation trigger instead of CHECK for quantidade (more flexible)