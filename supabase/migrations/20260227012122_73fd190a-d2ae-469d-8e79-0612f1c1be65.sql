
-- EPIs (Personal Protective Equipment)
CREATE TABLE public.rh_epis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'outro',
  ca_numero TEXT DEFAULT '',
  data_entrega DATE NOT NULL DEFAULT CURRENT_DATE,
  data_validade DATE,
  quantidade INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ATIVO',
  assinatura_colaborador BOOLEAN NOT NULL DEFAULT false,
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.rh_epis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rh_epis" ON public.rh_epis
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'diretor'::app_role) OR
    has_role(auth.uid(), 'gerente_geral'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'diretor'::app_role) OR
    has_role(auth.uid(), 'gerente_geral'::app_role)
  );

CREATE POLICY "Gerente can manage rh_epis" ON public.rh_epis
  FOR ALL USING (has_role(auth.uid(), 'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Colaborador can read own epis" ON public.rh_epis
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = rh_epis.colaborador_id AND c.user_id = auth.uid())
  );

-- Exames Periódicos
CREATE TABLE public.rh_exames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'periodico',
  descricao TEXT DEFAULT '',
  data_realizacao DATE,
  data_vencimento DATE,
  resultado TEXT DEFAULT 'APTO',
  clinica TEXT DEFAULT '',
  medico TEXT DEFAULT '',
  crm TEXT DEFAULT '',
  arquivo_path TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.rh_exames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rh_exames" ON public.rh_exames
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'diretor'::app_role) OR
    has_role(auth.uid(), 'gerente_geral'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'diretor'::app_role) OR
    has_role(auth.uid(), 'gerente_geral'::app_role)
  );

CREATE POLICY "Gerente can manage rh_exames" ON public.rh_exames
  FOR ALL USING (has_role(auth.uid(), 'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Colaborador can read own exames" ON public.rh_exames
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = rh_exames.colaborador_id AND c.user_id = auth.uid())
  );

-- Incidentes / Acidentes de Trabalho
CREATE TABLE public.rh_incidentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID REFERENCES public.rh_colaboradores(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'incidente',
  gravidade TEXT NOT NULL DEFAULT 'leve',
  data_ocorrencia DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_ocorrencia TIME DEFAULT CURRENT_TIME,
  local TEXT DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  causa_provavel TEXT DEFAULT '',
  acao_imediata TEXT DEFAULT '',
  acao_corretiva TEXT DEFAULT '',
  afastamento_dias INTEGER NOT NULL DEFAULT 0,
  cat_emitida BOOLEAN NOT NULL DEFAULT false,
  cat_numero TEXT DEFAULT '',
  testemunhas TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ABERTO',
  encerrado_em TIMESTAMPTZ,
  encerrado_por UUID,
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.rh_incidentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rh_incidentes" ON public.rh_incidentes
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'diretor'::app_role) OR
    has_role(auth.uid(), 'gerente_geral'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'diretor'::app_role) OR
    has_role(auth.uid(), 'gerente_geral'::app_role)
  );

CREATE POLICY "Gerente can manage rh_incidentes" ON public.rh_incidentes
  FOR ALL USING (has_role(auth.uid(), 'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Authenticated can read rh_incidentes" ON public.rh_incidentes
  FOR SELECT USING (true);
