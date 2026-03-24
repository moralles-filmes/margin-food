CREATE OR REPLACE FUNCTION public.handle_first_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: if admin already exists, skip silently
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RETURN NEW;
  END IF;

  -- First admin assignment (only if no admin exists yet)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin')
  ON CONFLICT DO NOTHING;

  -- Audit log
  INSERT INTO public.audit_logs (
    module, action, entity, entity_id, actor_user_id, source, success,
    after, metadata
  ) VALUES (
    'system', 'create_first_admin', 'user_roles', NEW.id::text, NEW.id,
    'trigger', true,
    jsonb_build_object('user_id', NEW.id, 'role', 'admin'),
    jsonb_build_object('trigger', 'handle_first_admin', 'note', 'Bootstrap first admin')
  );

  RETURN NEW;
END;
$$;