CREATE OR REPLACE FUNCTION public.trg_validate_rateio_sum()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_lancamento_id uuid;
  v_lancamento_valor numeric;
  v_soma_rateios numeric;
BEGIN
  -- Determine which lancamento_id to check
  IF TG_OP = 'DELETE' THEN
    v_lancamento_id := OLD.lancamento_id;
  ELSE
    v_lancamento_id := NEW.lancamento_id;
  END IF;

  -- Lock the parent lancamento row
  SELECT ABS(valor) INTO v_lancamento_valor
  FROM fin_lancamentos
  WHERE id = v_lancamento_id
  FOR UPDATE;

  IF v_lancamento_valor IS NULL THEN
    RAISE EXCEPTION 'Lançamento não encontrado: %', v_lancamento_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Sum all rateios for this lancamento (excluding current row on DELETE)
  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(SUM(ABS(valor)), 0) INTO v_soma_rateios
    FROM fin_lancamento_rateios
    WHERE lancamento_id = v_lancamento_id AND id <> OLD.id;
  ELSE
    SELECT COALESCE(SUM(ABS(valor)), 0) INTO v_soma_rateios
    FROM fin_lancamento_rateios
    WHERE lancamento_id = v_lancamento_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    -- Add the new/updated row's value
    v_soma_rateios := v_soma_rateios + ABS(NEW.valor);
  END IF;

  -- Validate with 0.01 tolerance
  IF v_soma_rateios > v_lancamento_valor + 0.01 THEN
    RAISE EXCEPTION 'Soma dos rateios (%) excede o valor do lançamento (%). Diferença: %',
      v_soma_rateios, v_lancamento_valor, v_soma_rateios - v_lancamento_valor
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_rateio_sum ON public.fin_lancamento_rateios;
CREATE TRIGGER trg_validate_rateio_sum
  BEFORE INSERT OR UPDATE OR DELETE ON public.fin_lancamento_rateios
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_rateio_sum();


-- ─────────────────────────────────────────────────────────────
-- W4: Mandatory justificativa_edicao on critical lancamento updates
-- Classification: SAFE (new trigger, only rejects invalid edits)
-- ─────────────────────────────────────────────────────────────