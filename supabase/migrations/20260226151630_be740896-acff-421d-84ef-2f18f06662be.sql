
-- Tabela de faturamento por período
CREATE TABLE public.faturamento_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  observacao text DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.faturamento_periodos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read faturamento" ON public.faturamento_periodos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin or Compras can insert faturamento" ON public.faturamento_periodos
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role));

CREATE POLICY "Admin or Compras can update faturamento" ON public.faturamento_periodos
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role));

-- Tabela de metas CMV
CREATE TABLE public.metas_cmv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_ano text NOT NULL,
  meta_cmv_geral numeric NOT NULL DEFAULT 35,
  meta_cmv_salmao numeric NOT NULL DEFAULT 15,
  meta_cmv_total numeric NOT NULL DEFAULT 35,
  alerta_amarelo_percent numeric NOT NULL DEFAULT 3,
  alerta_vermelho_percent numeric NOT NULL DEFAULT 6,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mes_ano)
);

ALTER TABLE public.metas_cmv ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read metas_cmv" ON public.metas_cmv
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage metas_cmv" ON public.metas_cmv
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Indexes
CREATE INDEX idx_faturamento_data ON public.faturamento_periodos(data);
CREATE INDEX idx_metas_cmv_mes ON public.metas_cmv(mes_ano);
CREATE INDEX idx_mov_estoque_data_tipo ON public.movimentacoes_estoque(data, tipo);
