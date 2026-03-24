-- Criação da tabela financeiro_fechamento_caixa (recuperada do split)
CREATE TABLE IF NOT EXISTS public.financeiro_fechamento_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  faturamento_bruto numeric(14,2) NOT NULL DEFAULT 0,
  taxas numeric(14,2) DEFAULT 0,
  descontos numeric(14,2) DEFAULT 0,
  faturamento_liquido numeric(14,2) GENERATED ALWAYS AS (faturamento_bruto - COALESCE(taxas, 0) - COALESCE(descontos, 0)) STORED,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fechamento_caixa_data ON public.financeiro_fechamento_caixa(data);
ALTER TABLE public.financeiro_fechamento_caixa ENABLE ROW LEVEL SECURITY;

-- 2a) Create companies table (foundation for multi-tenant) - Recuperada do split
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.companies IS 'Multi-tenant company registry. Each tenant maps to one company.';

-- Insert a default company for existing single-tenant data
INSERT INTO public.companies (id, nome) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Empresa Principal')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  -- For now (single-tenant migration), return the default company.
  -- In full SaaS mode, this would read from user_profiles or a session variable.
  SELECT '00000000-0000-0000-0000-000000000001'::uuid;
$$;

-- 2c) Add company_id column to fechamento_caixa
ALTER TABLE public.financeiro_fechamento_caixa 
  ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL 
  DEFAULT '00000000-0000-0000-0000-000000000001'
  REFERENCES public.companies(id);

-- 2d) Drop old unique index on (data) and create new on (company_id, data)
DROP INDEX IF EXISTS idx_fechamento_caixa_data;

CREATE UNIQUE INDEX idx_fechamento_caixa_company_data 
  ON public.financeiro_fechamento_caixa (company_id, data);

-- Covering index for period queries
CREATE INDEX IF NOT EXISTS idx_fechamento_caixa_company_data_desc
  ON public.financeiro_fechamento_caixa (company_id, data DESC);

-- 2e) Update RLS policies to include company_id isolation
DROP POLICY IF EXISTS fechamento_read ON public.financeiro_fechamento_caixa;
DROP POLICY IF EXISTS fechamento_insert ON public.financeiro_fechamento_caixa;
DROP POLICY IF EXISTS fechamento_update ON public.financeiro_fechamento_caixa;
DROP POLICY IF EXISTS fechamento_delete ON public.financeiro_fechamento_caixa;

CREATE POLICY "fechamento_read" ON public.financeiro_fechamento_caixa
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_permission(auth.uid(), 'finance:read')
  );

CREATE POLICY "fechamento_insert" ON public.financeiro_fechamento_caixa
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_permission(auth.uid(), 'finance:manage')
  );

CREATE POLICY "fechamento_update" ON public.financeiro_fechamento_caixa
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_permission(auth.uid(), 'finance:manage')
  )
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_permission(auth.uid(), 'finance:manage')
  );

CREATE POLICY "fechamento_delete" ON public.financeiro_fechamento_caixa
  FOR DELETE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_permission(auth.uid(), 'finance:manage')
  );

-- Companies: only admins manage, authenticated can read own
CREATE POLICY "companies_read" ON public.companies
  FOR SELECT TO authenticated
  USING (id = get_current_company_id());

CREATE POLICY "companies_admin" ON public.companies
  FOR ALL TO authenticated
  USING (has_permission(auth.uid(), 'system:admin'));

-- 2f) Update RPCs to use company_id