-- Fix: trg_validate_rateio_sum only looked in fin_lancamentos for the parent record.
-- Rateios from fin_contas_pagar / fin_contas_receber caused "Lançamento não encontrado".
-- Now checks all three tables.

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
  IF TG_OP = 'DELETE' THEN
    v_lancamento_id := OLD.lancamento_id;
  ELSE
    v_lancamento_id := NEW.lancamento_id;
  END IF;

  -- Try fin_lancamentos first
  SELECT ABS(valor) INTO v_lancamento_valor
  FROM fin_lancamentos
  WHERE id = v_lancamento_id
  FOR UPDATE;

  -- If not found, try fin_contas_pagar
  IF v_lancamento_valor IS NULL THEN
    SELECT ABS(valor) INTO v_lancamento_valor
    FROM fin_contas_pagar
    WHERE id = v_lancamento_id
    FOR UPDATE;
  END IF;

  -- If not found, try fin_contas_receber
  IF v_lancamento_valor IS NULL THEN
    SELECT ABS(valor) INTO v_lancamento_valor
    FROM fin_contas_receber
    WHERE id = v_lancamento_id
    FOR UPDATE;
  END IF;

  IF v_lancamento_valor IS NULL THEN
    RAISE EXCEPTION 'Lançamento não encontrado: %', v_lancamento_id
      USING ERRCODE = 'P0002';
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(SUM(ABS(valor)), 0) INTO v_soma_rateios
    FROM fin_lancamento_rateios
    WHERE lancamento_id = v_lancamento_id AND id <> OLD.id;
  ELSE
    SELECT COALESCE(SUM(ABS(valor)), 0) INTO v_soma_rateios
    FROM fin_lancamento_rateios
    WHERE lancamento_id = v_lancamento_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    v_soma_rateios := v_soma_rateios + ABS(NEW.valor);
  END IF;

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
