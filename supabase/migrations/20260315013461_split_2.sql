CREATE OR REPLACE FUNCTION public._guarded_delete_orcamento(
  p_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_deleted int;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:orcamento:delete',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  DELETE FROM fin_orcamentos
  WHERE id = p_id
    AND company_id = v_company_id
    AND updated_at = p_expected_updated_at;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  INSERT INTO fin_audit_logs (acao, entidade, entidade_id, user_id, company_id)
  VALUES ('DELETE', 'fin_orcamentos', p_id::text, auth.uid(), v_company_id);
END;
$$;

REVOKE ALL ON FUNCTION public._guarded_delete_orcamento(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._guarded_delete_orcamento(uuid, timestamptz) TO authenticated;

-- 4. Batch copy month