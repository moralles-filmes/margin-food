-- Uma transferência é um único fato financeiro com conta de origem e destino.
-- O Livro Razão e os cálculos de saldo já interpretam esse registro único nos
-- dois lados. A RPC de conciliação antiga criava também um lançamento-filho,
-- duplicando a transferência na listagem e anulando o efeito no saldo filtrado.

CREATE OR REPLACE FUNCTION public.reconcile_create_transfer(
  p_data date,
  p_valor numeric,
  p_descricao text,
  p_conta_origem_id uuid,
  p_conta_destino_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_lancamento_id uuid;
  v_nome_origem text;
  v_nome_destino text;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: valor deve ser maior que zero';
  END IF;

  IF p_conta_origem_id = p_conta_destino_id THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: contas de origem e destino devem ser diferentes';
  END IF;

  SELECT c.nome INTO v_nome_origem
  FROM public.fin_contas c
  WHERE c.id = p_conta_origem_id AND c.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta de origem';
  END IF;

  SELECT c.nome INTO v_nome_destino
  FROM public.fin_contas c
  WHERE c.id = p_conta_destino_id AND c.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta de destino';
  END IF;

  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento,
    descricao, conta_id, conta_destino_id,
    status, forma_pagamento, conciliado, conciliado_em, conciliado_por,
    created_by, company_id, origem
  )
  VALUES (
    'TRANSFERENCIA', p_valor, p_data, p_data,
    COALESCE(NULLIF(btrim(p_descricao), ''), format('Transferência: %s → %s', v_nome_origem, v_nome_destino)),
    p_conta_origem_id, p_conta_destino_id,
    'REALIZADO', 'TRANSFERENCIA', true, now(), v_uid,
    v_uid, v_company, 'transferencia'
  )
  RETURNING id INTO v_lancamento_id;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, user_id, company_id, depois
  )
  VALUES (
    'transferencia', v_lancamento_id, 'reconcile_transfer', v_uid, v_company,
    jsonb_build_object(
      'lancamento_id', v_lancamento_id,
      'origem', p_conta_origem_id,
      'destino', p_conta_destino_id,
      'valor', p_valor,
      'data', p_data,
      'modelo', 'registro_unico'
    )
  );

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_create_transfer(date, numeric, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_create_transfer(date, numeric, text, uuid, uuid, uuid) TO authenticated;

-- Compatibilidade: transferências históricas podem ter o par pai/filho antigo,
-- enquanto as novas transferências conciliadas têm somente um registro.
-- O repositório antigo declarava retorno void e o banco atual usa jsonb; o DROP
-- explícito permite convergir os dois ambientes para a assinatura vigente.
DROP FUNCTION IF EXISTS public.delete_transfer(uuid);

CREATE OR REPLACE FUNCTION public.delete_transfer(p_lancamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_target public.fin_lancamentos%ROWTYPE;
  v_parent_id uuid;
  v_child_id uuid;
  v_before jsonb;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:lancamentos:delete', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:lancamentos:delete necessário';
  END IF;

  SELECT l.* INTO v_target
  FROM public.fin_lancamentos l
  WHERE l.id = p_lancamento_id
    AND l.company_id = v_company
    AND l.tipo = 'TRANSFERENCIA';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transferência';
  END IF;

  v_parent_id := COALESCE(v_target.lancamento_pai_id, v_target.id);
  SELECT l.id INTO v_child_id
  FROM public.fin_lancamentos l
  WHERE l.lancamento_pai_id = v_parent_id
    AND l.company_id = v_company
    AND l.tipo = 'TRANSFERENCIA'
  LIMIT 1;

  v_before := jsonb_build_object(
    'lancamento_id', v_target.id,
    'legacy_child_id', v_child_id,
    'valor', v_target.valor,
    'conta_origem_id', v_target.conta_id,
    'conta_destino_id', v_target.conta_destino_id
  );

  IF v_child_id IS NOT NULL THEN
    DELETE FROM public.fin_lancamentos
    WHERE id = v_child_id AND company_id = v_company;
    DELETE FROM public.fin_lancamentos
    WHERE id = v_parent_id AND company_id = v_company;
  ELSE
    DELETE FROM public.fin_lancamentos
    WHERE id = v_target.id AND company_id = v_company;
  END IF;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, user_id, company_id, antes
  )
  VALUES ('transferencia', v_target.id, 'excluir', v_uid, v_company, v_before);

  RETURN jsonb_build_object(
    'ok', true,
    'lancamento_id', v_target.id,
    'legacy_child_id', v_child_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_transfer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_transfer(uuid) TO authenticated;

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
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_target public.fin_lancamentos%ROWTYPE;
  v_parent_id uuid;
  v_child_id uuid;
  v_nome_origem text;
  v_nome_destino text;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:lancamentos:edit', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:lancamentos:edit necessário';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: valor deve ser maior que zero';
  END IF;
  IF p_conta_origem_id = p_conta_destino_id THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: contas de origem e destino devem ser diferentes';
  END IF;

  SELECT l.* INTO v_target
  FROM public.fin_lancamentos l
  WHERE l.id = p_lancamento_id
    AND l.company_id = v_company
    AND l.tipo = 'TRANSFERENCIA';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transferência';
  END IF;

  SELECT c.nome INTO v_nome_origem
  FROM public.fin_contas c
  WHERE c.id = p_conta_origem_id AND c.company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: conta de origem'; END IF;

  SELECT c.nome INTO v_nome_destino
  FROM public.fin_contas c
  WHERE c.id = p_conta_destino_id AND c.company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: conta de destino'; END IF;

  v_parent_id := COALESCE(v_target.lancamento_pai_id, v_target.id);
  SELECT l.id INTO v_child_id
  FROM public.fin_lancamentos l
  WHERE l.lancamento_pai_id = v_parent_id
    AND l.company_id = v_company
    AND l.tipo = 'TRANSFERENCIA'
  LIMIT 1;

  IF v_child_id IS NOT NULL THEN
    UPDATE public.fin_lancamentos SET
      valor = p_valor,
      data_competencia = p_data_competencia,
      data_pagamento = p_data_competencia,
      descricao = 'Transferência para ' || v_nome_destino,
      observacoes = p_descricao,
      conta_id = p_conta_origem_id,
      conta_destino_id = p_conta_destino_id,
      updated_at = now()
    WHERE id = v_parent_id AND company_id = v_company;

    UPDATE public.fin_lancamentos SET
      valor = p_valor,
      data_competencia = p_data_competencia,
      data_pagamento = p_data_competencia,
      descricao = 'Transferência de ' || v_nome_origem,
      observacoes = p_descricao,
      conta_id = p_conta_destino_id,
      conta_destino_id = p_conta_origem_id,
      updated_at = now()
    WHERE id = v_child_id AND company_id = v_company;
  ELSE
    UPDATE public.fin_lancamentos SET
      valor = p_valor,
      data_competencia = p_data_competencia,
      data_pagamento = p_data_competencia,
      descricao = COALESCE(NULLIF(btrim(p_descricao), ''), format('Transferência: %s → %s', v_nome_origem, v_nome_destino)),
      conta_id = p_conta_origem_id,
      conta_destino_id = p_conta_destino_id,
      updated_at = now()
    WHERE id = v_target.id AND company_id = v_company;
  END IF;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, user_id, company_id, antes, depois
  )
  VALUES (
    'transferencia', v_target.id, 'editar', v_uid, v_company,
    jsonb_build_object('valor', v_target.valor, 'data', v_target.data_competencia, 'origem', v_target.conta_id, 'destino', v_target.conta_destino_id),
    jsonb_build_object('valor', p_valor, 'data', p_data_competencia, 'origem', p_conta_origem_id, 'destino', p_conta_destino_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_transfer(uuid, numeric, date, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_transfer(uuid, numeric, date, text, uuid, uuid) TO authenticated;

-- Força a resolução das colunas durante o db push.
DO $$
DECLARE v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM l.id, l.tipo, l.valor, l.conta_id, l.conta_destino_id,
          l.lancamento_pai_id, l.company_id, l.origem
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_sentinel;
END $$;
