CREATE OR REPLACE FUNCTION public.rpc_delete_fechamento_caixa(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:fechamento:delete', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  DELETE FROM financeiro_fechamento_caixa
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado.';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Security grants
REVOKE ALL ON FUNCTION public.rpc_upsert_fechamento_caixa(date, numeric, numeric, numeric, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_fechamento_caixa(date, numeric, numeric, numeric, text, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_delete_fechamento_caixa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_delete_fechamento_caixa(uuid) TO authenticated;