
-- Stock Categories
CREATE TABLE public.stock_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique name
CREATE UNIQUE INDEX stock_categories_name_unique ON public.stock_categories (lower(name)) WHERE is_active = true;

ALTER TABLE public.stock_categories ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "stock_categories_select" ON public.stock_categories
  FOR SELECT TO authenticated USING (true);

-- Only master/compras roles can insert/update/delete
CREATE POLICY "stock_categories_insert" ON public.stock_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'compras')
  );

CREATE POLICY "stock_categories_update" ON public.stock_categories
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'compras')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'compras')
  );

CREATE POLICY "stock_categories_delete" ON public.stock_categories
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'compras')
  );

-- Stock Locations
CREATE TABLE public.stock_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('seco', 'refrigerado', 'congelado', 'bar', 'producao')),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX stock_locations_name_unique ON public.stock_locations (lower(name)) WHERE is_active = true;

ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_locations_select" ON public.stock_locations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "stock_locations_insert" ON public.stock_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'compras')
  );

CREATE POLICY "stock_locations_update" ON public.stock_locations
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'compras')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'compras')
  );

CREATE POLICY "stock_locations_delete" ON public.stock_locations
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'diretor') OR
    public.has_role(auth.uid(), 'gerente_geral') OR
    public.has_role(auth.uid(), 'compras')
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_categories_updated_at
  BEFORE UPDATE ON public.stock_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER stock_locations_updated_at
  BEFORE UPDATE ON public.stock_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
