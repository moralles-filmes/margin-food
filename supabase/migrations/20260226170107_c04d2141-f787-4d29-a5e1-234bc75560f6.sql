
-- Componentes (hierarchy: INSUMO references produtos, PRE_PREPARO, ITEM_PRONTO, PRODUTO_FINAL)
CREATE TABLE public.ficha_componentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('PRE_PREPARO', 'ITEM_PRONTO', 'PRODUTO_FINAL')),
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'Geral',
  rendimento numeric NOT NULL DEFAULT 1,
  unidade_rendimento text NOT NULL DEFAULT 'un',
  perda_estimada_percent numeric NOT NULL DEFAULT 0,
  custo_indireto numeric NOT NULL DEFAULT 0,
  peso_por_unidade numeric,
  tempo_preparo_min integer,
  modo_preparo text DEFAULT '',
  checklist jsonb DEFAULT '[]'::jsonb,
  observacoes text DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  custo_total_calculado numeric NOT NULL DEFAULT 0,
  custo_unitario_calculado numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- BOM (Bill of Materials) - links components
CREATE TABLE public.ficha_componente_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  componente_pai_id uuid NOT NULL REFERENCES public.ficha_componentes(id) ON DELETE CASCADE,
  componente_filho_id uuid, -- NULL if referencing a produto (insumo)
  produto_id uuid REFERENCES public.produtos(id), -- for INSUMO references
  quantidade numeric NOT NULL DEFAULT 0,
  unidade text NOT NULL DEFAULT 'un',
  custo_snapshot numeric NOT NULL DEFAULT 0,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sales channels
CREATE TABLE public.canais_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  taxa_percentual numeric NOT NULL DEFAULT 0,
  taxa_fixa numeric NOT NULL DEFAULT 0,
  imposto_percent numeric NOT NULL DEFAULT 0,
  custo_embalagem_adicional numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Product pricing per channel
CREATE TABLE public.precificacao_canal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  componente_id uuid NOT NULL REFERENCES public.ficha_componentes(id) ON DELETE CASCADE,
  canal_id uuid NOT NULL REFERENCES public.canais_venda(id) ON DELETE CASCADE,
  preco_venda numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(componente_id, canal_id)
);

-- Simulation scenarios
CREATE TABLE public.cenarios_simulacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  componente_id uuid NOT NULL REFERENCES public.ficha_componentes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.ficha_componentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ficha_componente_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canais_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.precificacao_canal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cenarios_simulacao ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated
CREATE POLICY "Authenticated can read ficha_componentes" ON public.ficha_componentes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read ficha_componente_itens" ON public.ficha_componente_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read canais_venda" ON public.canais_venda FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read precificacao_canal" ON public.precificacao_canal FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read cenarios_simulacao" ON public.cenarios_simulacao FOR SELECT TO authenticated USING (true);

-- Write: admin + compras
CREATE POLICY "Admin or Compras can manage ficha_componentes" ON public.ficha_componentes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role));

CREATE POLICY "Admin or Compras can manage ficha_componente_itens" ON public.ficha_componente_itens FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role));

CREATE POLICY "Admin or Compras can manage canais_venda" ON public.canais_venda FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role));

CREATE POLICY "Admin or Compras can manage precificacao_canal" ON public.precificacao_canal FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role));

CREATE POLICY "Admin or Compras can manage cenarios_simulacao" ON public.cenarios_simulacao FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role));

-- Indexes
CREATE INDEX idx_ficha_componentes_tipo ON public.ficha_componentes(tipo);
CREATE INDEX idx_ficha_componente_itens_pai ON public.ficha_componente_itens(componente_pai_id);
CREATE INDEX idx_ficha_componente_itens_filho ON public.ficha_componente_itens(componente_filho_id);
CREATE INDEX idx_precificacao_canal_comp ON public.precificacao_canal(componente_id);
CREATE INDEX idx_cenarios_comp ON public.cenarios_simulacao(componente_id);
