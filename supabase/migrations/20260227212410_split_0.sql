-- Add inactivity threshold and cached last_movement_at to produtos
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS inactivity_days_threshold integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_movement_at timestamptz DEFAULT NULL;

-- Backfill last_movement_at from existing movements
UPDATE public.produtos p
SET last_movement_at = sub.last_at
FROM (
  SELECT produto_id, MAX(created_at) AS last_at
  FROM movimentacoes_estoque
  WHERE status = 'ATIVO'
    AND tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
  GROUP BY produto_id
) sub
WHERE p.id = sub.produto_id;

CREATE OR REPLACE FUNCTION public.update_produto_last_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'ATIVO' AND NEW.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') THEN
    UPDATE produtos SET last_movement_at = NEW.created_at
    WHERE id = NEW.produto_id
      AND (last_movement_at IS NULL OR last_movement_at < NEW.created_at);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_update_last_movement
  AFTER INSERT ON public.movimentacoes_estoque
  FOR EACH ROW
  EXECUTE FUNCTION public.update_produto_last_movement();

-- Function to get inactive items