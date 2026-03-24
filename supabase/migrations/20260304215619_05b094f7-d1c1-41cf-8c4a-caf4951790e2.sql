-- Create salmon_metas_provisionadas table
CREATE TABLE IF NOT EXISTS public.salmon_metas_provisionadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_ano text NOT NULL,
  meta_gramas_por_cliente numeric NOT NULL DEFAULT 0,
  company_id uuid NOT NULL DEFAULT get_current_company_id() REFERENCES companies(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, mes_ano)
);

ALTER TABLE public.salmon_metas_provisionadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.salmon_metas_provisionadas
  FOR ALL TO authenticated
  USING (company_id = get_current_company_id())
  WITH CHECK (company_id = get_current_company_id());

-- Create salmon_auditorias_compra table
CREATE TABLE IF NOT EXISTS public.salmon_auditorias_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada_id uuid NOT NULL,
  data_entrada text NOT NULL,
  valor_total numeric NOT NULL DEFAULT 0,
  fornecedor text NOT NULL DEFAULT '',
  mes_ano text NOT NULL,
  status_meta_no_momento text NOT NULL DEFAULT 'boa',
  status_projecao_no_momento text NOT NULL DEFAULT 'boa',
  status_semana_no_momento text NOT NULL DEFAULT 'boa',
  override_alerta boolean NOT NULL DEFAULT false,
  override_tipo text[] NOT NULL DEFAULT '{}',
  override_motivo text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  override_user text NOT NULL DEFAULT '',
  override_at timestamptz,
  company_id uuid NOT NULL DEFAULT get_current_company_id() REFERENCES companies(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.salmon_auditorias_compra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.salmon_auditorias_compra
  FOR ALL TO authenticated
  USING (company_id = get_current_company_id())
  WITH CHECK (company_id = get_current_company_id());