
-- Table for monthly HR cost snapshots
CREATE TABLE public.rh_custos_mensais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo TEXT NOT NULL, -- 'yyyy-MM'
  total_salarios NUMERIC NOT NULL DEFAULT 0,
  total_horas_extras NUMERIC NOT NULL DEFAULT 0,
  total_beneficios NUMERIC NOT NULL DEFAULT 0,
  total_encargos NUMERIC NOT NULL DEFAULT 0,
  total_insalubridade NUMERIC NOT NULL DEFAULT 0,
  total_noturno NUMERIC NOT NULL DEFAULT 0,
  total_geral NUMERIC NOT NULL DEFAULT 0,
  qtd_colaboradores INTEGER NOT NULL DEFAULT 0,
  custo_medio_colaborador NUMERIC NOT NULL DEFAULT 0,
  detalhamento JSONB DEFAULT '[]'::jsonb,
  calculado_por UUID,
  calculado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(periodo)
);

ALTER TABLE public.rh_custos_mensais ENABLE ROW LEVEL SECURITY;

-- Only masters can manage
CREATE POLICY "Masters can manage rh_custos_mensais"
  ON public.rh_custos_mensais FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'diretor'::app_role) OR has_role(auth.uid(), 'gerente_geral'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'diretor'::app_role) OR has_role(auth.uid(), 'gerente_geral'::app_role));

-- Gerente can read
CREATE POLICY "Gerente can read rh_custos_mensais"
  ON public.rh_custos_mensais FOR SELECT
  USING (has_role(auth.uid(), 'gerente'::app_role));

-- Financeiro can read
CREATE POLICY "Financeiro can read rh_custos_mensais"
  ON public.rh_custos_mensais FOR SELECT
  USING (has_role(auth.uid(), 'financeiro'::app_role));
