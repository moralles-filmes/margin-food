-- =========================================================
-- ITEM-LEVEL STATUS for requisicao_estoque_itens
-- =========================================================

-- Item status enum-like values: SOLICITADO, ATENDIDO, RECUSADO
-- Using text with a CHECK-like trigger (per project standard)

ALTER TABLE public.requisicao_estoque_itens
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'SOLICITADO',
  ADD COLUMN IF NOT EXISTS recusado_por uuid,
  ADD COLUMN IF NOT EXISTS recusado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_recusa text,
  ADD COLUMN IF NOT EXISTS atendido_por uuid,
  ADD COLUMN IF NOT EXISTS atendido_em timestamptz;

-- Validation trigger for item status whitelist
CREATE OR REPLACE FUNCTION public.validate_requisicao_item_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_statuses text[] := ARRAY['SOLICITADO', 'ATENDIDO', 'RECUSADO'];
BEGIN
  IF NOT (NEW.status = ANY(allowed_statuses)) THEN
    RAISE EXCEPTION 'Status de item inválido: %. Permitidos: %', NEW.status, array_to_string(allowed_statuses, ', ');
  END IF;

  -- If marking as RECUSADO, require motivo_recusa
  IF NEW.status = 'RECUSADO' AND (NEW.motivo_recusa IS NULL OR trim(NEW.motivo_recusa) = '') THEN
    RAISE EXCEPTION 'Motivo de recusa é obrigatório para itens recusados';
  END IF;

  -- If marking as RECUSADO, require recusado_por and recusado_em
  IF NEW.status = 'RECUSADO' AND (NEW.recusado_por IS NULL OR NEW.recusado_em IS NULL) THEN
    RAISE EXCEPTION 'recusado_por e recusado_em são obrigatórios para itens recusados';
  END IF;

  -- If marking as ATENDIDO, require atendido_por and atendido_em
  IF NEW.status = 'ATENDIDO' AND (NEW.atendido_por IS NULL OR NEW.atendido_em IS NULL) THEN
    RAISE EXCEPTION 'atendido_por e atendido_em são obrigatórios para itens atendidos';
  END IF;

  -- Prevent changing from terminal status
  IF TG_OP = 'UPDATE' AND OLD.status IN ('ATENDIDO', 'RECUSADO') AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'Não é possível alterar status de item já % ', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_requisicao_item_status ON public.requisicao_estoque_itens;
CREATE TRIGGER trg_validate_requisicao_item_status
BEFORE INSERT OR UPDATE ON public.requisicao_estoque_itens
FOR EACH ROW
EXECUTE FUNCTION public.validate_requisicao_item_status();

-- =========================================================
-- Aggregated status function for the parent requisição
-- =========================================================
CREATE OR REPLACE FUNCTION public.compute_requisicao_status_agregado(p_requisicao_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_items int;
  atendidos int;
  recusados int;
  solicitados int;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'ATENDIDO'),
    count(*) FILTER (WHERE status = 'RECUSADO'),
    count(*) FILTER (WHERE status = 'SOLICITADO')
  INTO total_items, atendidos, recusados, solicitados
  FROM public.requisicao_estoque_itens
  WHERE requisicao_id = p_requisicao_id;

  IF total_items = 0 THEN RETURN 'SOLICITADA'; END IF;
  IF recusados = total_items THEN RETURN 'NEGADA'; END IF;
  IF atendidos = total_items THEN RETURN 'ATENDIDA'; END IF;
  IF solicitados = total_items THEN RETURN 'SOLICITADA'; END IF;
  IF atendidos > 0 AND recusados > 0 AND solicitados = 0 THEN RETURN 'PARCIALMENTE_ATENDIDA'; END IF;
  IF atendidos > 0 AND solicitados > 0 THEN RETURN 'PARCIALMENTE_ATENDIDA'; END IF;
  IF recusados > 0 AND solicitados > 0 THEN RETURN 'SOLICITADA'; END IF;

  RETURN 'SOLICITADA';
END;
$$;

-- Add PARCIALMENTE_ATENDIDA to status display
COMMENT ON FUNCTION public.compute_requisicao_status_agregado IS 'Computes aggregated requisition status from item-level statuses. Returns: SOLICITADA, ATENDIDA, NEGADA, or PARCIALMENTE_ATENDIDA';