
-- ============================================================
-- RECOVERY MIGRATION: Batch 3B - System & Audit
-- Restoring tables required for RLS enforcement
-- ============================================================

-- 1) dashboard_cache
CREATE TABLE IF NOT EXISTS public.dashboard_cache (
  key text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '120 seconds'
);

-- 2) integration_logs
CREATE TABLE IF NOT EXISTS public.integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL,
  entity text,
  external_id text,
  action text,
  status text,
  payload jsonb,
  error text,
  company_id uuid -- added in tenantization usually, but let's ensure table exists
);

-- 3) rbac_legacy_usage (if missing)
CREATE TABLE IF NOT EXISTS public.rbac_legacy_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  method text,
  path text,
  created_at timestamptz DEFAULT now()
);

-- 4) audit_log (singular, sometimes used alongside audit_logs)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user_id uuid,
  module text,
  action text,
  entity text,
  entity_id text,
  old_data jsonb,
  new_data jsonb
);

-- Ensure RLS is enabled for these so the next migration doesn't fail on ALTER TABLE FORCE RLS
ALTER TABLE public.dashboard_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_legacy_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
