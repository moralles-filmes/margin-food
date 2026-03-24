CREATE OR REPLACE FUNCTION public.create_transfer(p_conta_origem uuid, p_conta_destino uuid, p_valor numeric, p_data date, p_descricao text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_id uuid;
  v_nome_origem text;
  v_nome_destino text;
  v_caller uuid;
BEGIN
  v_caller := COALESCE(p_created_by, auth.uid());

  IF NOT has_permission(v_caller, 'finance:manage') THEN
    RAISE EXCEPTION 'Sem permissão para executar esta operação.';
  END IF;

  IF p_conta_origem = p_conta_destino THEN
    RAISE EXCEPTION 'Conta origem e destino devem ser diferentes';
  END IF;
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  SELECT nome INTO v_nome_origem FROM fin_contas WHERE id = p_conta_origem;
  SELECT nome INTO v_nome_destino FROM fin_contas WHERE id = p_conta_destino;

  INSERT INTO fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento,
    descricao, conta_id, conta_destino_id,
    status, forma_pagamento, created_by, observacoes
  ) VALUES (
    'TRANSFERENCIA', p_valor, p_data, p_data,
    'Transferência para ' || COALESCE(v_nome_destino, ''),
    p_conta_origem, p_conta_destino,
    'REALIZADO', 'TRANSFERENCIA', v_caller, p_descricao
  )
  RETURNING id INTO v_parent_id;

  INSERT INTO fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento,
    descricao, conta_id, conta_destino_id,
    status, forma_pagamento, created_by, observacoes,
    lancamento_pai_id
  ) VALUES (
    'TRANSFERENCIA', p_valor, p_data, p_data,
    'Transferência de ' || COALESCE(v_nome_origem, ''),
    p_conta_destino, p_conta_origem,
    'REALIZADO', 'TRANSFERENCIA', v_caller, p_descricao,
    v_parent_id
  );

  RETURN v_parent_id;
END;
$function$;

-- 2) update_transfer