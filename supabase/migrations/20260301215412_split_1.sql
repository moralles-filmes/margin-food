CREATE OR REPLACE FUNCTION public.admin_set_super_admin(
  p_target_user_id uuid,
  p_enable boolean,
  p_confirmation_email text,
  p_confirmation_phrase text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company uuid;
  v_target_email text;
  v_target_company uuid;
  v_was_super boolean;
BEGIN
  IF NOT public.has_permission(v_actor, 'system:global:manage') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_company := public.assert_tenant();

  -- Get target info
  SELECT email, company_id INTO v_target_email, v_target_company
  FROM public.profiles WHERE id = p_target_user_id;

  IF v_target_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não encontrado.');
  END IF;

  IF v_target_company IS DISTINCT FROM v_company THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não pertence a esta empresa.');
  END IF;

  -- Double confirmation
  IF p_confirmation_email IS DISTINCT FROM v_target_email THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email de confirmação não confere.');
  END IF;

  IF p_enable AND p_confirmation_phrase IS DISTINCT FROM 'PROMOVER' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Frase de confirmação incorreta. Digite PROMOVER.');
  END IF;

  IF NOT p_enable AND p_confirmation_phrase IS DISTINCT FROM 'REBAIXAR' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Frase de confirmação incorreta. Digite REBAIXAR.');
  END IF;

  -- Check current status
  v_was_super := EXISTS(
    SELECT 1 FROM public.user_permissions
    WHERE user_id = p_target_user_id AND permission_key = 'system:global:manage' AND effect = 'grant'
  );

  -- Apply change
  IF p_enable THEN
    INSERT INTO public.user_permissions (user_id, permission_key, effect, granted_by)
    VALUES (p_target_user_id, 'system:global:manage', 'grant', v_actor)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_permissions
    WHERE user_id = p_target_user_id AND permission_key = 'system:global:manage';
  END IF;

  -- Audit log
  INSERT INTO public.admin_actions_log (company_id, actor_user_id, action, target_user_id, target_email, details)
  VALUES (
    v_company, v_actor,
    CASE WHEN p_enable THEN 'SET_SUPER_ADMIN' ELSE 'UNSET_SUPER_ADMIN' END,
    p_target_user_id, v_target_email,
    jsonb_build_object(
      'before', jsonb_build_object('is_super_admin', v_was_super),
      'after', jsonb_build_object('is_super_admin', p_enable)
    )
  );

  RETURN jsonb_build_object('success', true, 'message',
    CASE WHEN p_enable THEN 'Usuário promovido a super_admin.' ELSE 'Permissão super_admin removida.' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_super_admin(uuid, boolean, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_super_admin(uuid, boolean, text, text) FROM anon, public;