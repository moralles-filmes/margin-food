
-- 1. Table to store users eligible as inventory reviewers (managed by admin)
CREATE TABLE public.inventario_conferentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT (auth.jwt()->>'company_id')::uuid REFERENCES companies(id),
  user_id uuid NOT NULL,
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

ALTER TABLE public.inventario_conferentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conferentes_select" ON public.inventario_conferentes
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id());

CREATE POLICY "conferentes_insert" ON public.inventario_conferentes
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_permission(auth.uid(), 'inventario:conferentes:manage')
  );

CREATE POLICY "conferentes_delete" ON public.inventario_conferentes
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_permission(auth.uid(), 'inventario:conferentes:manage')
  );

-- 2. Add conferente_user_id to inventarios
ALTER TABLE public.inventarios
  ADD COLUMN IF NOT EXISTS conferente_user_id uuid,
  ADD COLUMN IF NOT EXISTS conferente_atribuido_em timestamptz,
  ADD COLUMN IF NOT EXISTS conferente_atribuido_por uuid;

-- 3. Register new permissions
INSERT INTO public.permissions (key, description, module)
VALUES
  ('inventario:conferentes:manage', 'Gerenciar lista de conferentes do inventário', 'inventario'),
  ('inventario:conferentes:view', 'Visualizar conferentes do inventário', 'inventario')
ON CONFLICT (key) DO NOTHING;

-- 4. Grant manage permission to admin role
INSERT INTO public.role_permissions (role, permission_key)
VALUES
  ('admin', 'inventario:conferentes:manage'),
  ('admin', 'inventario:conferentes:view'),
  ('operador', 'inventario:conferentes:view')
ON CONFLICT DO NOTHING;
