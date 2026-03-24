CREATE OR REPLACE FUNCTION public.rbac_sql_lint_report_admin(p_actor_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_permission(p_actor_user_id, 'system:global:manage') THEN
    RAISE EXCEPTION 'Forbidden: requires system:global:manage';
  END IF;
  RETURN public.rbac_sql_lint_report_internal();
END;
$$;

-- 3) Refactor original to delegate to internal