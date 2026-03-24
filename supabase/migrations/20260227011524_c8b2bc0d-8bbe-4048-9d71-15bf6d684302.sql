
-- Benefits management table
CREATE TABLE public.rh_beneficios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'outro',
  nome TEXT NOT NULL DEFAULT '',
  descricao TEXT DEFAULT '',
  valor_empresa NUMERIC NOT NULL DEFAULT 0,
  valor_colaborador NUMERIC NOT NULL DEFAULT 0,
  percentual_desconto NUMERIC NOT NULL DEFAULT 0,
  elegivel BOOLEAN NOT NULL DEFAULT true,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  status TEXT NOT NULL DEFAULT 'ATIVO',
  operadora TEXT DEFAULT '',
  numero_cartao TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.rh_beneficios ENABLE ROW LEVEL SECURITY;

-- Masters can manage
CREATE POLICY "Masters can manage rh_beneficios" ON public.rh_beneficios
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'diretor'::app_role) OR
    has_role(auth.uid(), 'gerente_geral'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'diretor'::app_role) OR
    has_role(auth.uid(), 'gerente_geral'::app_role)
  );

-- Financeiro can read
CREATE POLICY "Financeiro can read rh_beneficios" ON public.rh_beneficios
  FOR SELECT USING (has_role(auth.uid(), 'financeiro'::app_role));

-- Gerente can read
CREATE POLICY "Gerente can read rh_beneficios" ON public.rh_beneficios
  FOR SELECT USING (has_role(auth.uid(), 'gerente'::app_role));

-- Colaborador can read own
CREATE POLICY "Colaborador can read own beneficios" ON public.rh_beneficios
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rh_colaboradores c
      WHERE c.id = rh_beneficios.colaborador_id AND c.user_id = auth.uid()
    )
  );
