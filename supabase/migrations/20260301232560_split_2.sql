CREATE OR REPLACE FUNCTION public.rbac_sql_lint_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'system:global:manage') THEN
    RAISE EXCEPTION 'Forbidden: requires system:global:manage';
  END IF;
  RETURN public.rbac_sql_lint_report_internal();
END;
$function$;