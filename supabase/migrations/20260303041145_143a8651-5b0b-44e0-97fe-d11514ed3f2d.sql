
-- H1: FORCE RLS ON
ALTER TABLE public.planning_metas_compra FORCE ROW LEVEL SECURITY;

-- H2: Block hard DELETE (soft delete only via RPC)
DROP POLICY IF EXISTS planning_delete_tenant ON public.planning_metas_compra;
CREATE POLICY planning_delete_blocked ON public.planning_metas_compra
  FOR DELETE TO authenticated
  USING (false);
