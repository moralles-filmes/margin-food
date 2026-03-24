CREATE OR REPLACE FUNCTION public.rpc_set_user_company(
  p_user_id uuid,
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_company uuid;
BEGIN
  IF NOT has_permission(auth.uid(), 'system:admin') THEN
    RAISE EXCEPTION 'Sem permissão (system:admin).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id AND ativo = true) THEN
    RAISE EXCEPTION 'Company não encontrada ou inativa.';
  END IF;

  SELECT company_id INTO v_old_company FROM public.profiles WHERE id = p_user_id;
  IF v_old_company IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  UPDATE public.profiles SET company_id = p_company_id, updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.audit_logs (module, action, entity, entity_id, actor_user_id, source, success, before, after)
  VALUES (
    'system', 'set_user_company', 'profiles', p_user_id, auth.uid(), 'rpc', true,
    jsonb_build_object('company_id', v_old_company),
    jsonb_build_object('company_id', p_company_id)
  );

  RETURN jsonb_build_object('ok', true, 'old_company', v_old_company, 'new_company', p_company_id);
END;
$$;