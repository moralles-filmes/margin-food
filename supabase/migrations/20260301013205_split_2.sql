CREATE OR REPLACE FUNCTION public.rpc_delete_fechamento_caixa(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF NOT has_permission(auth.uid(), 'finance:manage') THEN
    RAISE EXCEPTION 'Sem permissão (finance:manage).';
  END IF;

  v_company_id := get_current_company_id();

  DELETE FROM financeiro_fechamento_caixa 
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado.';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;