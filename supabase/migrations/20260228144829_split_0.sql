CREATE OR REPLACE FUNCTION public.delete_transfer(p_lancamento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pai_id uuid;
  v_filho_id uuid;
BEGIN
  -- Check if this is a parent (has child pointing to it)
  SELECT id INTO v_filho_id FROM fin_lancamentos WHERE lancamento_pai_id = p_lancamento_id AND tipo = 'TRANSFERENCIA' LIMIT 1;
  
  IF v_filho_id IS NOT NULL THEN
    -- p_lancamento_id is the parent
    v_pai_id := p_lancamento_id;
  ELSE
    -- Check if this is a child (has lancamento_pai_id)
    SELECT lancamento_pai_id INTO v_pai_id FROM fin_lancamentos WHERE id = p_lancamento_id AND tipo = 'TRANSFERENCIA' AND lancamento_pai_id IS NOT NULL;
    IF v_pai_id IS NULL THEN
      RAISE EXCEPTION 'Lançamento não é uma transferência válida';
    END IF;
    v_filho_id := p_lancamento_id;
    -- re-fetch child in case
    SELECT id INTO v_filho_id FROM fin_lancamentos WHERE lancamento_pai_id = v_pai_id AND tipo = 'TRANSFERENCIA' LIMIT 1;
  END IF;

  -- Delete both
  DELETE FROM fin_lancamentos WHERE id = v_filho_id;
  DELETE FROM fin_lancamentos WHERE id = v_pai_id;
END;
$$;

-- Atomic function to update a transfer (both sides)