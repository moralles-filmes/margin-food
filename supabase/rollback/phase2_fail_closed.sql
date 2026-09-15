-- Contenção de emergência, não restauração das definições vulneráveis.
-- Preserva leitura da unidade e RPCs globais list/update/onboard já protegidas.
-- Executar somente após validar projeto e backup, em janela de manutenção.
BEGIN;
SET LOCAL lock_timeout='5s';
REVOKE ALL ON FUNCTION public.cleanup_old_audit_logs(integer), public.refresh_materialized_views()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_create_company(text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.companies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.companies TO authenticated;
DROP POLICY IF EXISTS companies_admin ON public.companies;
NOTIFY pgrst, 'reload schema';
COMMIT;
