-- Trigger: block orphan estorno movements (must have estorno_de_id referencing a real movement)
CREATE OR REPLACE FUNCTION public.validate_estorno_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_original RECORD;
BEGIN
  -- Only validate ESTORNO types
  IF NEW.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') THEN
    RETURN NEW;
  END IF;

  -- 1. Must have estorno_de_id
  IF NEW.estorno_de_id IS NULL THEN
    RAISE EXCEPTION '400: Movimentação de estorno deve referenciar a movimentação original (estorno_de_id obrigatório).';
  END IF;

  -- 2. Original movement must exist and belong to same company
  SELECT id, company_id, status INTO v_original
  FROM public.movimentacoes_estoque
  WHERE id = NEW.estorno_de_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Movimentação original não encontrada.';
  END IF;

  IF v_original.company_id != NEW.company_id THEN
    RAISE EXCEPTION '403: Movimentação original pertence a outro tenant.';
  END IF;

  -- 3. Original must not already be CANCELADO
  IF v_original.status = 'CANCELADO' THEN
    RAISE EXCEPTION '409: Movimentação original já foi cancelada. Estorno duplicado bloqueado.';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger BEFORE INSERT on movimentacoes_estoque
DROP TRIGGER IF EXISTS trg_validate_estorno ON public.movimentacoes_estoque;
CREATE TRIGGER trg_validate_estorno
  BEFORE INSERT ON public.movimentacoes_estoque
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_estorno_movement();