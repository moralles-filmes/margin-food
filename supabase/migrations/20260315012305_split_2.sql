CREATE OR REPLACE FUNCTION public._guarded_aprovar_conta_pagar(
  p_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_rows int;
  v_new_updated_at timestamptz;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT has_permission('financeiro:pagar:approve') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:pagar:approve';
  END IF;

  UPDATE fin_contas_pagar
  SET status = 'APROVADO',
      aprovado_por = v_user_id,
      aprovado_em = now()
  WHERE id = p_id
    AND company_id = v_company_id
    AND updated_at = p_expected_updated_at
    AND status = 'AGUARDANDO_APROVACAO'
  RETURNING updated_at INTO v_new_updated_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Conflito de concorrência ou status inválido. Recarregue a página.';
  END IF;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, user_id, company_id)
  VALUES ('contas_pagar', p_id::text, 'aprovar', v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'updated_at', v_new_updated_at);
END;
$$;