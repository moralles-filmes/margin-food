
-- Gestão Disciplinar
CREATE TABLE public.rh_ocorrencias_disciplinares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'advertencia_verbal', -- advertencia_verbal, advertencia_escrita, suspensao, termo_responsabilidade, elogio
  motivo TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  data_ocorrencia DATE NOT NULL DEFAULT CURRENT_DATE,
  testemunhas TEXT DEFAULT '',
  gravidade TEXT NOT NULL DEFAULT 'leve', -- leve, moderada, grave, gravissima
  status TEXT NOT NULL DEFAULT 'ativo', -- ativo, revogado, expirado
  documento_path TEXT DEFAULT '',
  assinatura_colaborador BOOLEAN NOT NULL DEFAULT false,
  assinatura_gestor BOOLEAN NOT NULL DEFAULT false,
  aplicado_por UUID NOT NULL,
  aplicado_por_nome TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  revogado_em TIMESTAMPTZ,
  revogado_por UUID,
  revogado_motivo TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rh_ocorrencias_disciplinares ENABLE ROW LEVEL SECURITY;

-- Masters can manage
CREATE POLICY "Masters can manage rh_ocorrencias"
  ON public.rh_ocorrencias_disciplinares FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'diretor'::app_role) OR has_role(auth.uid(), 'gerente_geral'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'diretor'::app_role) OR has_role(auth.uid(), 'gerente_geral'::app_role));

-- Gerente can read and insert
CREATE POLICY "Gerente can read rh_ocorrencias"
  ON public.rh_ocorrencias_disciplinares FOR SELECT
  USING (has_role(auth.uid(), 'gerente'::app_role));

CREATE POLICY "Gerente can insert rh_ocorrencias"
  ON public.rh_ocorrencias_disciplinares FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

-- Colaborador can read own
CREATE POLICY "Colaborador can read own ocorrencias"
  ON public.rh_ocorrencias_disciplinares FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM rh_colaboradores c
    WHERE c.id = rh_ocorrencias_disciplinares.colaborador_id AND c.user_id = auth.uid()
  ));
