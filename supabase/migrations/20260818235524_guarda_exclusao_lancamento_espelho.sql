-- Espelho de baixa não pode ser excluído — só estornado.
--
-- Excluir o lançamento não desfaz a baixa: o boleto continua PAGO e fica sem
-- despesa no razão. O guard anterior só barrava TRANSFERENCIA.
--
-- Reconstruída a partir do histórico aplicado em produção
-- (supabase_migrations.schema_migrations, version 20260818235524); o arquivo
-- original não chegou a ser versionado.

CREATE OR REPLACE FUNCTION public._guarded_delete_lancamento(
  p_id uuid,
  p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id    uuid;
  v_tipo       text;
  v_updated_at timestamptz;
  v_old_data   jsonb;
  v_deleted    int;
  v_ref_modulo text;
  v_ref_id     text;
  v_origem     text;
  v_bloqueio   text;
BEGIN
  v_company_id := assert_tenant();
  v_user_id    := auth.uid();

  IF NOT has_permission('financeiro:lancamentos:delete') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:lancamentos:delete';
  END IF;

  SELECT tipo, updated_at, referencia_modulo, referencia_id, origem,
         jsonb_build_object('descricao', descricao, 'valor', valor, 'tipo', tipo)
  INTO v_tipo, v_updated_at, v_ref_modulo, v_ref_id, v_origem, v_old_data
  FROM fin_lancamentos
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_tipo = 'TRANSFERENCIA' THEN
    RAISE EXCEPTION 'Use a ação "Excluir Transferência" para este lançamento.';
  END IF;

  IF v_ref_modulo = 'contas_pagar' AND v_ref_id IS NOT NULL AND v_ref_id <> '' THEN
    SELECT cp.descricao INTO v_bloqueio
    FROM fin_contas_pagar cp
    WHERE cp.id::text = v_ref_id AND cp.company_id = v_company_id AND cp.status = 'PAGO';
    IF FOUND THEN
      RAISE EXCEPTION
        'LANCAMENTO_ESPELHO: este lançamento é a baixa da conta a pagar "%". Use Estornar em Contas a Pagar — excluir aqui deixaria a conta paga sem despesa no razão.',
        v_bloqueio;
    END IF;
  END IF;

  IF v_ref_modulo = 'contas_receber' AND v_ref_id IS NOT NULL AND v_ref_id <> '' THEN
    SELECT cr.descricao INTO v_bloqueio
    FROM fin_contas_receber cr
    WHERE cr.id::text = v_ref_id AND cr.company_id = v_company_id AND cr.status = 'RECEBIDO';
    IF FOUND THEN
      RAISE EXCEPTION
        'LANCAMENTO_ESPELHO: este lançamento é a baixa da conta a receber "%". Use Estornar em Contas a Receber.',
        v_bloqueio;
    END IF;
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  DELETE FROM fin_lancamento_rateios WHERE lancamento_id = p_id AND company_id = v_company_id;
  DELETE FROM fin_lancamentos WHERE id = p_id AND company_id = v_company_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, user_id, company_id)
  VALUES ('lancamentos', p_id, 'excluir', v_old_data, v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$function$;

NOTIFY pgrst, 'reload schema';
