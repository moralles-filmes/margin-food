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