-- Bug: admin_actions_log nunca foi criada em produção (a migration original,
-- 20260301215410, ficou como .sql.bak neste repo — mesmo padrão de CLI v2.75
-- CREATE TABLE + CREATE POLICY que quebra `supabase db push`, documentado no
-- CLAUDE.md). Duas RPCs SECURITY DEFINER já ao vivo dependem dela e falham
-- sempre que chamadas:
--   - admin_set_super_admin: INSERT final na função -> toda a transação de
--     promover/rebaixar super_admin dá rollback (relation does not exist).
--   - onboard_new_company: mesma coisa -> criar empresa nova falha por completo.
-- O front (AccessManagementCard.fetchAudit) também lê direto da tabela e
-- sempre cai no catch, mostrando "Não foi possível carregar o log de auditoria."
--
-- Correção: cria a tabela como o .bak original previa, mas com os padrões
-- atuais do projeto (RLS com (select ...) para evitar InitPlan por linha,
-- GRANT explícito exigido pelo PostgREST).

CREATE TABLE IF NOT EXISTS public.admin_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  target_email text,
  details jsonb
);

ALTER TABLE public.admin_actions_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_actions_log FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_admin_actions_log_company ON public.admin_actions_log(company_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_log_created ON public.admin_actions_log(created_at DESC);

DROP POLICY IF EXISTS "super_admin_select_admin_actions" ON public.admin_actions_log;
CREATE POLICY "super_admin_select_admin_actions"
ON public.admin_actions_log FOR SELECT TO authenticated
USING (
  (select public.has_permission(auth.uid(), 'system:global:manage'))
  AND company_id = (select public.get_current_company_id())
);

DROP POLICY IF EXISTS "super_admin_insert_admin_actions" ON public.admin_actions_log;
CREATE POLICY "super_admin_insert_admin_actions"
ON public.admin_actions_log FOR INSERT TO authenticated
WITH CHECK (
  (select public.has_permission(auth.uid(), 'system:global:manage'))
  AND company_id = (select public.get_current_company_id())
);

GRANT ALL ON TABLE public.admin_actions_log TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
