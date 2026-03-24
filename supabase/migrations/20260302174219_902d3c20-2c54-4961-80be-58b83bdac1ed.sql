
-- BLOCO 1: Add company_id and severity to audit_logs + RLS + RPC

-- 1a) Add missing columns
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'INFO';

-- 1b) Create index for tenant queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON public.audit_logs(company_id, created_at DESC);

-- 1c) RLS policies (table already has RLS enabled based on GlobalAuditView usage)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'audit_logs_select_tenant') THEN
    CREATE POLICY "audit_logs_select_tenant" ON public.audit_logs
      FOR SELECT TO authenticated
      USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'audit_logs_insert_tenant') THEN
    CREATE POLICY "audit_logs_insert_tenant" ON public.audit_logs
      FOR INSERT TO authenticated
      WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- 1d) Drop old permissive policies if any
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Allow all access to audit_logs') THEN
    DROP POLICY "Allow all access to audit_logs" ON public.audit_logs;
  END IF;
END $$;

-- 1e) Ensure RLS is enabled
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1f) Create SECURITY DEFINER RPC for audit writes
CREATE OR REPLACE FUNCTION public.audit_log_write(
  _module text,
  _action text,
  _entity_type text,
  _entity_id text DEFAULT NULL,
  _before jsonb DEFAULT NULL,
  _after jsonb DEFAULT NULL,
  _metadata jsonb DEFAULT NULL,
  _severity text DEFAULT 'INFO'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_email text;
  v_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.company_id, p.email INTO v_company_id, v_email
  FROM profiles p WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  SELECT string_agg(ur.role::text, ',') INTO v_role
  FROM user_roles ur WHERE ur.user_id = v_user_id;

  INSERT INTO audit_logs (
    company_id, actor_user_id, actor_email, actor_role,
    module, action, entity, entity_id,
    before, after, metadata, severity, source, success
  ) VALUES (
    v_company_id, v_user_id, v_email, v_role,
    _module, _action, _entity_type, _entity_id,
    _before, _after, _metadata, _severity, 'edge_function', true
  );
END;
$$;
