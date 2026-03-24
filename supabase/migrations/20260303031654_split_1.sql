CREATE OR REPLACE FUNCTION public.trg_validate_fin_lancamento_update()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only enforce when status is REALIZADO
  IF OLD.status = 'REALIZADO' THEN
    -- Check if critical fields changed
    IF (
      NEW.valor IS DISTINCT FROM OLD.valor
      OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id
      OR NEW.conta_id IS DISTINCT FROM OLD.conta_id
      OR NEW.data_competencia IS DISTINCT FROM OLD.data_competencia
      OR NEW.centro_custo_id IS DISTINCT FROM OLD.centro_custo_id
    ) THEN
      -- Require justificativa_edicao
      IF NEW.justificativa_edicao IS NULL OR TRIM(NEW.justificativa_edicao) = '' THEN
        RAISE EXCEPTION 'Justificativa obrigatória ao editar lançamento realizado (campos: valor, categoria, conta, data, centro de custo)'
          USING ERRCODE = 'P0003';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_fin_lancamento_update ON public.fin_lancamentos;
CREATE TRIGGER trg_validate_fin_lancamento_update
  BEFORE UPDATE ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_fin_lancamento_update();