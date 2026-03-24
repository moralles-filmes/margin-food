
-- =====================================================
-- FIN CRITICAL FIX — C1 + C5: fin_audit_logs multi-tenant hardening
-- =====================================================

-- C1.1: Add company_id column (nullable first for backfill)
ALTER TABLE public.fin_audit_logs
  ADD COLUMN company_id uuid;

-- C1.2: Backfill from profiles (0 rows exist, but safe for future)
UPDATE public.fin_audit_logs fal
SET company_id = p.company_id
FROM public.profiles p
WHERE fal.user_id = p.id
  AND fal.company_id IS NULL;

-- C1.3: Delete orphan rows without company_id (safety net)
DELETE FROM public.fin_audit_logs WHERE company_id IS NULL;

-- C1.4: Set NOT NULL + DEFAULT
ALTER TABLE public.fin_audit_logs
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.fin_audit_logs
  ALTER COLUMN company_id SET DEFAULT get_current_company_id();

-- C1.5: FK to companies
ALTER TABLE public.fin_audit_logs
  ADD CONSTRAINT fin_audit_logs_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id);

-- C1.6: Index for performance
CREATE INDEX idx_fin_audit_logs_company_created_at
  ON public.fin_audit_logs(company_id, created_at DESC);

-- C1.7: FORCE RLS
ALTER TABLE public.fin_audit_logs FORCE ROW LEVEL SECURITY;

-- C1.8: Drop legacy SELECT policy
DROP POLICY IF EXISTS "fin_read_audit_logs" ON public.fin_audit_logs;

-- C1.9: New granular SELECT policy (tenant-safe)
CREATE POLICY "select_fin_audit_logs_tenant"
ON public.fin_audit_logs
FOR SELECT TO authenticated
USING (
  company_id = get_current_company_id()
  AND has_any_permission(auth.uid(), ARRAY['financeiro:auditoria:view', 'system:global:manage'])
);

-- C5: INSERT policy
CREATE POLICY "insert_fin_audit_logs_tenant"
ON public.fin_audit_logs
FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_current_company_id()
  AND has_any_permission(auth.uid(), ARRAY[
    'financeiro:auditoria:write',
    'financeiro:lancamentos:create',
    'financeiro:pagar:create',
    'financeiro:receber:create',
    'financeiro:conciliacao:manage',
    'system:global:manage'
  ])
);

-- C1.10: UPDATE policy (audit = immutable, only system:global:manage)
CREATE POLICY "update_fin_audit_logs_system"
ON public.fin_audit_logs
FOR UPDATE TO authenticated
USING (
  company_id = get_current_company_id()
  AND has_any_permission(auth.uid(), ARRAY['system:global:manage'])
);

-- C1.11: DELETE policy (audit = immutable, only system:global:manage)
CREATE POLICY "delete_fin_audit_logs_system"
ON public.fin_audit_logs
FOR DELETE TO authenticated
USING (
  company_id = get_current_company_id()
  AND has_any_permission(auth.uid(), ARRAY['system:global:manage'])
);

-- C1.12: Placeholder blocker trigger (uses existing function trg_block_placeholder_company)
CREATE TRIGGER trg_block_placeholder_company
BEFORE INSERT OR UPDATE ON public.fin_audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.trg_block_placeholder_company();

-- =====================================================
-- C2/C3: Secure reconcile_batch_lancamentos
-- =====================================================

-- Drop old insecure function (accepts p_user_id = impersonation vector)
DROP FUNCTION IF EXISTS public.reconcile_batch_lancamentos(uuid[], uuid);

-- New secure version: NO p_user_id, uses auth.uid() + assert_tenant()
CREATE OR REPLACE FUNCTION public.reconcile_batch_lancamentos(p_lancamento_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_count int;
BEGIN
  -- Fail-closed: validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuário não autenticado';
  END IF;

  -- Fail-closed: validate tenant (blocks placeholder UUID)
  v_company_id := assert_tenant();

  -- Permission check (granular)
  IF NOT has_any_permission(v_user_id, ARRAY['financeiro:conciliacao:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:manage necessário';
  END IF;

  -- Tenant-safe + idempotent UPDATE
  UPDATE fin_lancamentos
  SET
    conciliado = true,
    conciliado_em = now(),
    conciliado_por = v_user_id
  WHERE company_id = v_company_id
    AND id = ANY(p_lancamento_ids)
    AND conciliado IS DISTINCT FROM true;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Audit trail (only if something changed — idempotent)
  IF v_count > 0 THEN
    INSERT INTO fin_audit_logs (entidade, acao, user_id, company_id, depois)
    VALUES (
      'lancamentos', 'reconcile_batch', v_user_id, v_company_id,
      jsonb_build_object('count', v_count, 'ids', p_lancamento_ids)
    );
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'reconciled_count', v_count);
END;
$$;

-- Revoke direct execute from public, grant only to authenticated
REVOKE ALL ON FUNCTION public.reconcile_batch_lancamentos(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_batch_lancamentos(uuid[]) TO authenticated;
