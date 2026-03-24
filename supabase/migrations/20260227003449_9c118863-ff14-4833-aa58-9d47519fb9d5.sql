
-- ==========================================
-- RH MODULE - FASE 1: Prontuário + Ponto + Banco de Horas
-- ==========================================

-- 1. COLABORADORES (Employee Record)
CREATE TABLE public.rh_colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nome text NOT NULL,
  cpf text,
  telefone text DEFAULT '',
  email text DEFAULT '',
  cargo text NOT NULL DEFAULT 'Colaborador',
  funcao text NOT NULL DEFAULT 'Geral',
  setor text NOT NULL DEFAULT 'salao',
  unidade text DEFAULT 'Matriz',
  data_admissao date NOT NULL DEFAULT CURRENT_DATE,
  tipo_contrato text NOT NULL DEFAULT 'CLT',
  status text NOT NULL DEFAULT 'ativo',
  foto_url text,
  carga_horaria_semanal numeric NOT NULL DEFAULT 44,
  salario numeric DEFAULT 0,
  valor_hora numeric DEFAULT 0,
  adicional_noturno_percent numeric DEFAULT 0,
  funcoes_habilitadas text[] DEFAULT '{}',
  observacoes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.rh_colaboradores ENABLE ROW LEVEL SECURITY;

-- Masters can manage all
CREATE POLICY "Masters can manage rh_colaboradores" ON public.rh_colaboradores
  FOR ALL USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  );

-- Gerente can read and update (not salary fields - handled in edge function)
CREATE POLICY "Gerente can read rh_colaboradores" ON public.rh_colaboradores
  FOR SELECT USING (has_role(auth.uid(), 'gerente'));

-- Colaborador can read own record
CREATE POLICY "Colaborador can read own rh_colaboradores" ON public.rh_colaboradores
  FOR SELECT USING (user_id = auth.uid());

-- 2. PONTO REGISTROS (Time Clock)
CREATE TABLE public.rh_ponto_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL, -- 'ENTRADA', 'SAIDA', 'INICIO_INTERVALO', 'FIM_INTERVALO'
  hora timestamptz NOT NULL DEFAULT now(),
  metodo text NOT NULL DEFAULT 'manual', -- 'manual', 'app', 'gestor'
  justificativa text DEFAULT '',
  geo_lat numeric,
  geo_lng numeric,
  foto_url text,
  aprovado boolean DEFAULT false,
  aprovado_por uuid,
  aprovado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.rh_ponto_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rh_ponto" ON public.rh_ponto_registros
  FOR ALL USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  );

CREATE POLICY "Gerente can manage rh_ponto" ON public.rh_ponto_registros
  FOR ALL USING (has_role(auth.uid(), 'gerente'))
  WITH CHECK (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Colaborador can read own ponto" ON public.rh_ponto_registros
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = colaborador_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Colaborador can insert own ponto" ON public.rh_ponto_registros
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = colaborador_id AND c.user_id = auth.uid())
  );

-- 3. PONTO AJUSTES (Immutable audit trail for adjustments)
CREATE TABLE public.rh_ponto_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ponto_id uuid NOT NULL REFERENCES public.rh_ponto_registros(id) ON DELETE CASCADE,
  campo_alterado text NOT NULL,
  valor_anterior text,
  valor_novo text,
  motivo text NOT NULL,
  ajustado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rh_ponto_ajustes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rh_ponto_ajustes" ON public.rh_ponto_ajustes
  FOR ALL USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  );

CREATE POLICY "Gerente can read rh_ponto_ajustes" ON public.rh_ponto_ajustes
  FOR SELECT USING (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Colaborador can read own ajustes" ON public.rh_ponto_ajustes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rh_ponto_registros p
      JOIN rh_colaboradores c ON c.id = p.colaborador_id
      WHERE p.id = ponto_id AND c.user_id = auth.uid()
    )
  );

-- 4. BANCO DE HORAS (calculated summaries per period)
CREATE TABLE public.rh_banco_horas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  periodo text NOT NULL, -- '2026-02' format
  horas_trabalhadas numeric NOT NULL DEFAULT 0,
  horas_escaladas numeric NOT NULL DEFAULT 0,
  horas_extras numeric NOT NULL DEFAULT 0,
  banco_horas_saldo numeric NOT NULL DEFAULT 0,
  atrasos_min numeric NOT NULL DEFAULT 0,
  faltas integer NOT NULL DEFAULT 0,
  dias_trabalhados integer NOT NULL DEFAULT 0,
  calculado_em timestamptz NOT NULL DEFAULT now(),
  calculado_por uuid,
  observacoes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(colaborador_id, periodo)
);

ALTER TABLE public.rh_banco_horas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage rh_banco_horas" ON public.rh_banco_horas
  FOR ALL USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  ) WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  );

CREATE POLICY "Gerente can read rh_banco_horas" ON public.rh_banco_horas
  FOR SELECT USING (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Colaborador can read own banco_horas" ON public.rh_banco_horas
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = colaborador_id AND c.user_id = auth.uid())
  );

-- 5. RH AUDIT LOG
CREATE TABLE public.rh_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acao text NOT NULL,
  entidade text NOT NULL, -- 'colaborador', 'ponto', 'banco_horas'
  entidade_id uuid,
  antes jsonb,
  depois jsonb,
  motivo text DEFAULT '',
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rh_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can read rh_audit" ON public.rh_audit_log
  FOR SELECT USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  );

CREATE POLICY "Authenticated can insert rh_audit" ON public.rh_audit_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
