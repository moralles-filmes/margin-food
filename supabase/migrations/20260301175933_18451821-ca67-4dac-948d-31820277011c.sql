
-- Revoke pg_net function access from API roles
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA net FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA net FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA net FROM public;

-- Also revoke USAGE on the net schema from API roles
REVOKE USAGE ON SCHEMA net FROM anon;
REVOKE USAGE ON SCHEMA net FROM authenticated;
REVOKE USAGE ON SCHEMA net FROM public;

-- Document accepted risk
CREATE TABLE IF NOT EXISTS public.security_risk_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  mitigation text NOT NULL,
  accepted_by text,
  accepted_at timestamptz DEFAULT now()
);

ALTER TABLE public.security_risk_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_risk_register FORCE ROW LEVEL SECURITY;

-- Only super-admin can read/write
CREATE POLICY "srr_select_admin" ON public.security_risk_register
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'system:global:manage'));

CREATE POLICY "srr_write_admin" ON public.security_risk_register
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'system:global:manage'));

INSERT INTO public.security_risk_register (title, description, mitigation, accepted_by)
VALUES (
  'pg_net extension in public schema',
  'pg_net is installed in the public schema because PostgreSQL does not support SET SCHEMA for this extension. Functions reside in the net schema.',
  'All EXECUTE grants revoked from anon, authenticated, and public roles. Only postgres and service_role retain access. Monitored via quarterly audit query.',
  'System Governance'
);
