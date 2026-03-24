
-- Trilhas de treinamento
CREATE TABLE public.rh_trilhas_treinamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  setor TEXT NOT NULL DEFAULT 'geral', -- geral, cozinha, sushi, salao, etc
  obrigatoria BOOLEAN NOT NULL DEFAULT false,
  modulos JSONB DEFAULT '[]'::jsonb, -- [{titulo, descricao, tipo: 'leitura'|'video'|'quiz', conteudo, quiz_perguntas: [{pergunta, opcoes, resposta_correta}]}]
  carga_horaria_min INTEGER DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rh_trilhas_treinamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rh_trilhas" ON public.rh_trilhas_treinamento
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Gerente can manage rh_trilhas" ON public.rh_trilhas_treinamento
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gerente'))
  WITH CHECK (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Authenticated can read active rh_trilhas" ON public.rh_trilhas_treinamento
  FOR SELECT TO authenticated
  USING (ativo = true);

-- Progresso individual de treinamento
CREATE TABLE public.rh_progresso_treinamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_id UUID NOT NULL REFERENCES public.rh_trilhas_treinamento(id),
  colaborador_id UUID NOT NULL REFERENCES public.rh_colaboradores(id),
  modulos_concluidos JSONB DEFAULT '[]'::jsonb, -- [{modulo_idx, concluido_em, quiz_nota}]
  status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO', -- EM_ANDAMENTO, CONCLUIDO, EXPIRADO
  certificado_emitido BOOLEAN DEFAULT false,
  nota_final NUMERIC DEFAULT 0,
  concluido_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(trilha_id, colaborador_id)
);

ALTER TABLE public.rh_progresso_treinamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rh_progresso" ON public.rh_progresso_treinamento
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Gerente can manage rh_progresso" ON public.rh_progresso_treinamento
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gerente'))
  WITH CHECK (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Colaborador can read own rh_progresso" ON public.rh_progresso_treinamento
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM rh_colaboradores c
    WHERE c.id = rh_progresso_treinamento.colaborador_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Colaborador can update own rh_progresso" ON public.rh_progresso_treinamento
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM rh_colaboradores c
    WHERE c.id = rh_progresso_treinamento.colaborador_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rh_colaboradores c
    WHERE c.id = rh_progresso_treinamento.colaborador_id AND c.user_id = auth.uid()
  ));
