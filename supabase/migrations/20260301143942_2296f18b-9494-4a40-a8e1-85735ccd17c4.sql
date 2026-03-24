
-- 1. Insert the new permission salmon:manipulacao:delete
INSERT INTO public.permissions (key, description, module, action)
VALUES ('salmon:manipulacao:delete', 'Salmão → Manipulação → Cancelar', 'salmon', 'delete')
ON CONFLICT (key) DO NOTHING;

-- 2. Grant to admin role
INSERT INTO public.role_permissions (role, permission_key)
VALUES ('admin', 'salmon:manipulacao:delete')
ON CONFLICT DO NOTHING;

-- 3. Fix the RPC guard: cancel manipulation should require delete, not create
CREATE OR REPLACE FUNCTION public._salmon_cancel_manipulation_guarded(p_manipulation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'salmon:manipulacao:delete') THEN
    RAISE EXCEPTION 'Sem permissão (salmon:manipulacao:delete)';
  END IF;
  UPDATE salmon_manipulations SET status = 'cancelado' WHERE id = p_manipulation_id;
END;
$$;
