
-- Onboarding / Trilha de integração
CREATE TABLE public.rh_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.rh_colaboradores(id),
  titulo TEXT NOT NULL DEFAULT 'Onboarding',
  status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO', -- EM_ANDAMENTO, CONCLUIDO, CANCELADO
  fase_atual TEXT NOT NULL DEFAULT '30dias', -- 30dias, 60dias, 90dias
  checklist_admissao JSONB DEFAULT '[]'::jsonb, -- [{texto, feito, data_conclusao}]
  checklist_30dias JSONB DEFAULT '[]'::jsonb,
  checklist_60dias JSONB DEFAULT '[]'::jsonb,
  checklist_90dias JSONB DEFAULT '[]'::jsonb,
  avaliacao_30 JSONB DEFAULT NULL, -- {nota, comentario, avaliador}
  avaliacao_60 JSONB DEFAULT NULL,
  avaliacao_90 JSONB DEFAULT NULL,
  mentor_id UUID REFERENCES public.rh_colaboradores(id),
  observacoes TEXT DEFAULT '',
  concluido_em TIMESTAMP WITH TIME ZONE,
  criado_por UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rh_onboarding ENABLE ROW LEVEL SECURITY;

-- Masters full access
CREATE POLICY "Masters can manage rh_onboarding" ON public.rh_onboarding
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

-- Gerente can manage
CREATE POLICY "Gerente can manage rh_onboarding" ON public.rh_onboarding
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gerente'))
  WITH CHECK (has_role(auth.uid(), 'gerente'));

-- Colaborador can read own onboarding
CREATE POLICY "Colaborador can read own rh_onboarding" ON public.rh_onboarding
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM rh_colaboradores c
    WHERE c.id = rh_onboarding.colaborador_id AND c.user_id = auth.uid()
  ));

-- Mentor can read assigned onboarding
CREATE POLICY "Mentor can read assigned rh_onboarding" ON public.rh_onboarding
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM rh_colaboradores c
    WHERE c.id = rh_onboarding.mentor_id AND c.user_id = auth.uid()
  ));
