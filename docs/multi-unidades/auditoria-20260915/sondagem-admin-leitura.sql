-- Reproduz a leitura como admin local real, sem expor identidades e sem alterar dados.
-- Requer conexão administrativa. Falha se não houver admin local elegível.
-- Sondagem de diagnóstico: resultado zero após correção é esperado.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
DO $audit_context$
DECLARE v_user uuid; v_company uuid;
BEGIN
 SELECT m.user_id,m.company_id INTO v_user,v_company
 FROM public.company_memberships m
 WHERE m.status='active'
 AND 'system:admin'=ANY(public.get_company_permissions(m.user_id,m.company_id))
 AND NOT ('system:global:manage'=ANY(public.get_company_permissions(m.user_id,m.company_id)))
 AND EXISTS(SELECT 1 FROM public.companies other_company
   WHERE other_company.id<>'00000000-0000-0000-0000-000000000001'::uuid
   AND NOT public.is_company_member(m.user_id,other_company.id))
 ORDER BY m.company_id,m.user_id LIMIT 1;
 IF v_user IS NULL THEN RAISE EXCEPTION 'AUDIT_NO_ELIGIBLE_LOCAL_ADMIN'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
 PERFORM set_config('request.headers',jsonb_build_object('x-company-id',v_company)::text,true);
END;
$audit_context$;
SET LOCAL ROLE authenticated;
SELECT jsonb_build_object(
 'local_admin',public.has_permission(auth.uid(),'system:admin'),
 'global_admin',public.has_permission(auth.uid(),'system:global:manage'),
 'companies_visible', (SELECT count(*) FROM public.companies),
 'companies_outside_scope', (SELECT count(*) FROM public.companies WHERE id<>public.get_current_company_id()),
 'companies_without_membership', (SELECT count(*) FROM public.companies WHERE NOT public.is_company_member(auth.uid(),id)),
 'real_companies_without_membership', (SELECT count(*) FROM public.companies WHERE id<>'00000000-0000-0000-0000-000000000001'::uuid AND NOT public.is_company_member(auth.uid(),id)),
 'audit_log_visible', (SELECT count(*) FROM public.audit_log),
 'audit_logs_other_company', (SELECT count(*) FROM public.audit_logs WHERE company_id<>public.get_current_company_id())
) AS evidence;
ROLLBACK;
