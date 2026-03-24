
-- Folha de pagamento mensal
CREATE TABLE public.rh_folha_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL, -- '2026-02'
  salario_base NUMERIC NOT NULL DEFAULT 0,
  valor_hora NUMERIC NOT NULL DEFAULT 0,
  horas_normais NUMERIC NOT NULL DEFAULT 0,
  horas_extras_50 NUMERIC NOT NULL DEFAULT 0,
  horas_extras_100 NUMERIC NOT NULL DEFAULT 0,
  adicional_noturno NUMERIC NOT NULL DEFAULT 0,
  adicional_insalubridade NUMERIC NOT NULL DEFAULT 0,
  adicional_periculosidade NUMERIC NOT NULL DEFAULT 0,
  gratificacoes NUMERIC NOT NULL DEFAULT 0,
  total_proventos NUMERIC NOT NULL DEFAULT 0,
  desconto_inss NUMERIC NOT NULL DEFAULT 0,
  desconto_irrf NUMERIC NOT NULL DEFAULT 0,
  desconto_vale_transporte NUMERIC NOT NULL DEFAULT 0,
  desconto_vale_refeicao NUMERIC NOT NULL DEFAULT 0,
  desconto_faltas NUMERIC NOT NULL DEFAULT 0,
  desconto_atrasos NUMERIC NOT NULL DEFAULT 0,
  outros_descontos NUMERIC NOT NULL DEFAULT 0,
  total_descontos NUMERIC NOT NULL DEFAULT 0,
  salario_liquido NUMERIC NOT NULL DEFAULT 0,
  dias_trabalhados INTEGER NOT NULL DEFAULT 0,
  faltas INTEGER NOT NULL DEFAULT 0,
  atrasos_min NUMERIC NOT NULL DEFAULT 0,
  observacoes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO, CALCULADO, APROVADO, PAGO
  calculado_em TIMESTAMPTZ DEFAULT NULL,
  calculado_por UUID DEFAULT NULL,
  aprovado_em TIMESTAMPTZ DEFAULT NULL,
  aprovado_por UUID DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(colaborador_id, periodo)
);

ALTER TABLE public.rh_folha_pagamento ENABLE ROW LEVEL SECURITY;

-- RLS
CREATE POLICY "Masters can manage rh_folha_pagamento" ON public.rh_folha_pagamento
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Financeiro can read rh_folha_pagamento" ON public.rh_folha_pagamento
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Colaborador can read own folha" ON public.rh_folha_pagamento
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = rh_folha_pagamento.colaborador_id AND c.user_id = auth.uid()));
