
CREATE OR REPLACE FUNCTION public.audit_log_write(
  _module text,
  _action text,
  _entity_type text,
  _entity_id text DEFAULT NULL::text,
  _before jsonb DEFAULT NULL::jsonb,
  _after jsonb DEFAULT NULL::jsonb,
  _metadata jsonb DEFAULT NULL::jsonb,
  _severity text DEFAULT 'INFO'::text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_email text;
  v_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.company_id, p.email INTO v_company_id, v_email
  FROM profiles p WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  SELECT string_agg(ur.role::text, ',') INTO v_role
  FROM user_roles ur WHERE ur.user_id = v_user_id;

  INSERT INTO audit_logs (
    company_id, actor_user_id, actor_email, actor_role,
    module, action, entity, entity_id,
    before, after, metadata, severity, source, success
  ) VALUES (
    v_company_id, v_user_id, v_email, v_role,
    _module, _action, _entity_type, _entity_id::uuid,
    _before, _after, _metadata, _severity, 'edge_function', true
  );
END;
$$;
