
-- Tabela de férias e afastamentos
CREATE TABLE public.rh_ferias_afastamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'ferias', -- ferias, atestado, licenca_medica, licenca_maternidade, falta_justificada, falta_injustificada, folga_compensatoria
  status TEXT NOT NULL DEFAULT 'SOLICITADO', -- SOLICITADO, APROVADO, REJEITADO, EM_ANDAMENTO, CONCLUIDO, CANCELADO
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  dias_uteis INTEGER NOT NULL DEFAULT 0,
  motivo TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  documento_url TEXT DEFAULT NULL,
  solicitado_por UUID NOT NULL,
  aprovado_por UUID DEFAULT NULL,
  aprovado_em TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rh_ferias_afastamentos ENABLE ROW LEVEL SECURITY;

-- Saldo de férias por colaborador
CREATE TABLE public.rh_ferias_saldo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  periodo_aquisitivo TEXT NOT NULL, -- e.g. '2025-2026'
  dias_direito INTEGER NOT NULL DEFAULT 30,
  dias_gozados INTEGER NOT NULL DEFAULT 0,
  dias_vendidos INTEGER NOT NULL DEFAULT 0,
  dias_restantes INTEGER NOT NULL DEFAULT 30,
  vencimento DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(colaborador_id, periodo_aquisitivo)
);

ALTER TABLE public.rh_ferias_saldo ENABLE ROW LEVEL SECURITY;

-- RLS: rh_ferias_afastamentos
CREATE POLICY "Masters can manage rh_ferias_afastamentos" ON public.rh_ferias_afastamentos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Gerente can manage rh_ferias_afastamentos" ON public.rh_ferias_afastamentos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gerente'))
  WITH CHECK (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Colaborador can read own ferias" ON public.rh_ferias_afastamentos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = rh_ferias_afastamentos.colaborador_id AND c.user_id = auth.uid()));

CREATE POLICY "Colaborador can insert own ferias" ON public.rh_ferias_afastamentos
  FOR INSERT TO authenticated
  WITH CHECK (solicitado_por = auth.uid());

-- RLS: rh_ferias_saldo
CREATE POLICY "Masters can manage rh_ferias_saldo" ON public.rh_ferias_saldo
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Gerente can read rh_ferias_saldo" ON public.rh_ferias_saldo
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Colaborador can read own saldo" ON public.rh_ferias_saldo
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = rh_ferias_saldo.colaborador_id AND c.user_id = auth.uid()));
