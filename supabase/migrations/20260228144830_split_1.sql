CREATE OR REPLACE FUNCTION public.update_transfer(
  p_lancamento_id uuid,
  p_valor numeric,
  p_data_competencia date,
  p_descricao text,
  p_conta_origem_id uuid,
  p_conta_destino_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pai_id uuid;
  v_filho_id uuid;
  v_nome_origem text;
  v_nome_destino text;
BEGIN
  -- Resolve parent/child
  SELECT id INTO v_filho_id FROM fin_lancamentos WHERE lancamento_pai_id = p_lancamento_id AND tipo = 'TRANSFERENCIA' LIMIT 1;
  
  IF v_filho_id IS NOT NULL THEN
    v_pai_id := p_lancamento_id;
  ELSE
    SELECT lancamento_pai_id INTO v_pai_id FROM fin_lancamentos WHERE id = p_lancamento_id AND tipo = 'TRANSFERENCIA' AND lancamento_pai_id IS NOT NULL;
    IF v_pai_id IS NULL THEN
      RAISE EXCEPTION 'Lançamento não é uma transferência válida';
    END IF;
    SELECT id INTO v_filho_id FROM fin_lancamentos WHERE lancamento_pai_id = v_pai_id AND tipo = 'TRANSFERENCIA' LIMIT 1;
  END IF;

  SELECT nome INTO v_nome_origem FROM fin_contas WHERE id = p_conta_origem_id;
  SELECT nome INTO v_nome_destino FROM fin_contas WHERE id = p_conta_destino_id;

  -- Update parent (origin side)
  UPDATE fin_lancamentos SET
    valor = p_valor,
    data_competencia = p_data_competencia,
    data_pagamento = p_data_competencia,
    descricao = 'Transferência para ' || COALESCE(v_nome_destino, ''),
    conta_id = p_conta_origem_id,
    conta_destino_id = p_conta_destino_id,
    updated_at = now()
  WHERE id = v_pai_id;

  -- Update child (destination side)
  UPDATE fin_lancamentos SET
    valor = p_valor,
    data_competencia = p_data_competencia,
    data_pagamento = p_data_competencia,
    descricao = 'Transferência de ' || COALESCE(v_nome_origem, ''),
    conta_id = p_conta_destino_id,
    conta_destino_id = p_conta_origem_id,
    updated_at = now()
  WHERE id = v_filho_id;
END;
$$;

-- Function to compute current balance for an account