CREATE OR REPLACE FUNCTION public.rpc_create_company(
  p_nome text,
  p_cnpj text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT has_permission(auth.uid(), 'system:admin') THEN
    RAISE EXCEPTION 'Sem permissão (system:admin).';
  END IF;

  INSERT INTO public.companies (nome, cnpj)
  VALUES (p_nome, p_cnpj)
  RETURNING id INTO v_id;

  -- Audit
  INSERT INTO public.audit_logs (module, action, entity, entity_id, actor_user_id, source, success, after)
  VALUES ('system', 'create_company', 'companies', v_id::text, auth.uid(), 'rpc', true,
    jsonb_build_object('nome', p_nome, 'cnpj', p_cnpj));

  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- 4b) Set user company (admin only)