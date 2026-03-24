-- Etapa 5: Legacy permission telemetry table + admin RPC

-- 1) Create telemetry table
CREATE TABLE IF NOT EXISTS public.rbac_legacy_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NULL,
  user_id uuid NULL,
  legacy_key text NOT NULL,
  resolved_to jsonb NOT NULL DEFAULT '[]'::jsonb,
  context text NULL
);

-- 2) Indexes
CREATE INDEX IF NOT EXISTS idx_rbac_legacy_usage_company_created
  ON public.rbac_legacy_usage(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rbac_legacy_usage_legacy_created
  ON public.rbac_legacy_usage(legacy_key, created_at DESC);

-- 3) RLS
ALTER TABLE public.rbac_legacy_usage ENABLE ROW LEVEL SECURITY;

-- Admin can read all
CREATE POLICY "admin_read_legacy_usage" ON public.rbac_legacy_usage
  FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'system:global:manage')
  );

-- Authenticated can insert own telemetry
CREATE POLICY "authenticated_insert_legacy_usage" ON public.rbac_legacy_usage
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 4) Top legacies RPC (last 7 days)
CREATE OR REPLACE FUNCTION public.rbac_top_legacy_usage(
  _days int DEFAULT 7,
  _limit int DEFAULT 20
)
RETURNS TABLE(legacy_key text, usage_count bigint, first_seen timestamptz, last_seen timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    legacy_key,
    COUNT(*) AS usage_count,
    MIN(created_at) AS first_seen,
    MAX(created_at) AS last_seen
  FROM rbac_legacy_usage
  WHERE created_at >= now() - (_days || ' days')::interval
  GROUP BY legacy_key
  ORDER BY usage_count DESC
  LIMIT _limit;
$$;