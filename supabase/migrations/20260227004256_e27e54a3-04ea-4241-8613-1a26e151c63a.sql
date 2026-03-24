
-- ==========================================
-- RH FASE 2: ESCALAS (SCHEDULING)
-- ==========================================

-- 1. ESCALAS (weekly schedule definitions)
CREATE TABLE public.rh_escalas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_inicio date NOT NULL, -- Monday of the week
  setor text NOT NULL DEFAULT 'salao',
  status text NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO, PUBLICADA, ENCERRADA
  publicada_em timestamptz,
  publicada_por uuid,
  custo_projetado numeric DEFAULT 0,
  observacoes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(semana_inicio, setor)
);

ALTER TABLE public.rh_escalas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rh_escalas" ON public.rh_escalas
  FOR ALL USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  );

CREATE POLICY "Gerente can manage rh_escalas" ON public.rh_escalas
  FOR ALL USING (has_role(auth.uid(), 'gerente'))
  WITH CHECK (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Authenticated can read published rh_escalas" ON public.rh_escalas
  FOR SELECT USING (status = 'PUBLICADA' OR status = 'ENCERRADA');

-- 2. ESCALA SLOTS (individual shift assignments)
CREATE TABLE public.rh_escala_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escala_id uuid NOT NULL REFERENCES public.rh_escalas(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  dia date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  funcao text DEFAULT 'Geral',
  tipo text NOT NULL DEFAULT 'TRABALHO', -- TRABALHO, FOLGA, FERIAS, FALTA_JUST
  observacao text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rh_escala_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rh_escala_slots" ON public.rh_escala_slots
  FOR ALL USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  );

CREATE POLICY "Gerente can manage rh_escala_slots" ON public.rh_escala_slots
  FOR ALL USING (has_role(auth.uid(), 'gerente'))
  WITH CHECK (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Colaborador can read own slots" ON public.rh_escala_slots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = colaborador_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Authenticated can read published slots" ON public.rh_escala_slots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM rh_escalas e WHERE e.id = escala_id AND (e.status = 'PUBLICADA' OR e.status = 'ENCERRADA'))
  );

-- 3. TROCAS DE TURNO (shift swap workflow)
CREATE TABLE public.rh_trocas_turno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_original_id uuid NOT NULL REFERENCES public.rh_escala_slots(id) ON DELETE CASCADE,
  solicitante_id uuid NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  substituto_id uuid REFERENCES public.rh_colaboradores(id) ON DELETE SET NULL,
  motivo text NOT NULL,
  status text NOT NULL DEFAULT 'PENDENTE', -- PENDENTE, APROVADA, REJEITADA, CANCELADA
  aprovado_por uuid,
  aprovado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rh_trocas_turno ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rh_trocas" ON public.rh_trocas_turno
  FOR ALL USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  );

CREATE POLICY "Gerente can manage rh_trocas" ON public.rh_trocas_turno
  FOR ALL USING (has_role(auth.uid(), 'gerente'))
  WITH CHECK (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Colaborador can read own trocas" ON public.rh_trocas_turno
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = solicitante_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = substituto_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Colaborador can insert own trocas" ON public.rh_trocas_turno
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = solicitante_id AND c.user_id = auth.uid())
  );

-- 4. DISPONIBILIDADE DO COLABORADOR
CREATE TABLE public.rh_disponibilidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  dia_semana integer NOT NULL, -- 0=Dom, 1=Seg ... 6=Sab
  disponivel boolean NOT NULL DEFAULT true,
  hora_inicio time,
  hora_fim time,
  observacao text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(colaborador_id, dia_semana)
);

ALTER TABLE public.rh_disponibilidade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rh_disponibilidade" ON public.rh_disponibilidade
  FOR ALL USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  );

CREATE POLICY "Gerente can manage rh_disponibilidade" ON public.rh_disponibilidade
  FOR ALL USING (has_role(auth.uid(), 'gerente'))
  WITH CHECK (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Colaborador can manage own disponibilidade" ON public.rh_disponibilidade
  FOR ALL USING (
    EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = colaborador_id AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = colaborador_id AND c.user_id = auth.uid())
  );
