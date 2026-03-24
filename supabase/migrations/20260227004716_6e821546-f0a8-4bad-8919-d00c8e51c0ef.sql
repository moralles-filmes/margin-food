
-- Tarefas operacionais por setor/turno
CREATE TABLE public.rh_tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  setor TEXT NOT NULL DEFAULT 'salao',
  prioridade TEXT NOT NULL DEFAULT 'media', -- baixa, media, alta, critica
  recorrencia TEXT DEFAULT 'unica', -- unica, diaria, semanal
  responsavel_id UUID REFERENCES public.rh_colaboradores(id),
  criado_por UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE', -- PENDENTE, EM_ANDAMENTO, CONCLUIDA, CANCELADA
  prazo TIMESTAMP WITH TIME ZONE,
  concluida_em TIMESTAMP WITH TIME ZONE,
  concluida_por UUID,
  checklist JSONB DEFAULT '[]'::jsonb, -- [{texto, feito}]
  evidencia_url TEXT,
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rh_tarefas ENABLE ROW LEVEL SECURITY;

-- Masters full access
CREATE POLICY "Masters can manage rh_tarefas" ON public.rh_tarefas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

-- Gerente can manage
CREATE POLICY "Gerente can manage rh_tarefas" ON public.rh_tarefas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gerente'))
  WITH CHECK (has_role(auth.uid(), 'gerente'));

-- Colaborador can read assigned tasks
CREATE POLICY "Colaborador can read assigned rh_tarefas" ON public.rh_tarefas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM rh_colaboradores c
    WHERE c.id = rh_tarefas.responsavel_id AND c.user_id = auth.uid()
  ));

-- Colaborador can update assigned tasks (mark complete)
CREATE POLICY "Colaborador can update assigned rh_tarefas" ON public.rh_tarefas
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM rh_colaboradores c
    WHERE c.id = rh_tarefas.responsavel_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rh_colaboradores c
    WHERE c.id = rh_tarefas.responsavel_id AND c.user_id = auth.uid()
  ));
