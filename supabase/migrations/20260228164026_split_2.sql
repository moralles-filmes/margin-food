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
  IF NOT has_permission(auth.uid(), 'finance:manage') THEN
    RAISE EXCEPTION 'Sem permissão para executar esta operação.';
  END IF;

  SELECT id INTO v_filho_id FROM fin_lancamentos WHERE lancamento_pai_id = p_lancamento_id AND tipo = 'TRANSFERENCIA' LIMIT 1;
  IF v_filho_id IS NOT NULL THEN
    v_pai_id := p_lancamento_id;
  ELSE
    SELECT lancamento_pai_id INTO v_pai_id FROM fin_lancamentos WHERE id = p_lancamento_id AND tipo = 'TRANSFERENCIA' AND lancamento_pai_id IS NOT NULL;
    IF v_pai_id IS NULL THEN RAISE EXCEPTION 'Lançamento não é uma transferência válida'; END IF;
    SELECT id INTO v_filho_id FROM fin_lancamentos WHERE lancamento_pai_id = v_pai_id AND tipo = 'TRANSFERENCIA' LIMIT 1;
  END IF;

  PERFORM public.log_audit('rpc', 'financeiro', 'fin_lancamentos', v_pai_id, 'TRANSFER_DELETE',
    jsonb_build_object('pai_id', v_pai_id, 'filho_id', v_filho_id), NULL);

  DELETE FROM fin_lancamentos WHERE id = v_filho_id;
  DELETE FROM fin_lancamentos WHERE id = v_pai_id;
END;
$$;

-- Update pay_conta_pagar to log