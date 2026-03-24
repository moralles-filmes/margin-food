-- Bug Tracker table for stabilization phase
CREATE TABLE public.system_bugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  module text NOT NULL CHECK (module IN ('estoque','financeiro','compras','auth','relatorios','admin','edge','rh','planning','salmon','ficha_tecnica','geral')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','fixed','validated')),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  fixed_at timestamptz,
  validated_at timestamptz,
  validated_by uuid,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.system_bugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_bugs FORCE ROW LEVEL SECURITY;

-- Admin+ can read all bugs in their company
CREATE POLICY "admin_read_bugs" ON public.system_bugs
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_permission(auth.uid(), 'system:global:manage')
  );

-- Admin+ can create bugs
CREATE POLICY "admin_insert_bugs" ON public.system_bugs
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_permission(auth.uid(), 'system:global:manage')
  );

-- Admin+ can update bugs (but validated status enforced in app)
CREATE POLICY "admin_update_bugs" ON public.system_bugs
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_permission(auth.uid(), 'system:global:manage')
  )
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_permission(auth.uid(), 'system:global:manage')
  );

-- Admin+ can delete bugs
CREATE POLICY "admin_delete_bugs" ON public.system_bugs
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_permission(auth.uid(), 'system:global:manage')
  );

-- Index for common queries
CREATE INDEX idx_system_bugs_status ON public.system_bugs(status);
CREATE INDEX idx_system_bugs_severity ON public.system_bugs(severity);
CREATE INDEX idx_system_bugs_company ON public.system_bugs(company_id);