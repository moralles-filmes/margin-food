CREATE OR REPLACE FUNCTION public.rbac_sql_lint_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT COALESCE(public.has_permission(auth.uid(), 'system:global:manage'), false) THEN
    RAISE EXCEPTION 'Forbidden: requires system:global:manage';
  END IF;

  RETURN public.rbac_sql_lint_report_internal();
END;
$$;

-- 3) Admin wrapper for service-role driven execution with explicit actor UUID.