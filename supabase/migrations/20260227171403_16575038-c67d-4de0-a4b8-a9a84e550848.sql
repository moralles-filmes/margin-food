
-- 1. Create fin_lancamento_rateios table
CREATE TABLE public.fin_lancamento_rateios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL REFERENCES public.fin_lancamentos(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES public.fin_categorias(id),
  centro_custo_id UUID REFERENCES public.fin_centros_custo(id),
  valor NUMERIC NOT NULL DEFAULT 0,
  percentual NUMERIC,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add centro_custo_padrao_id to fin_categorias
ALTER TABLE public.fin_categorias
  ADD COLUMN IF NOT EXISTS centro_custo_padrao_id UUID REFERENCES public.fin_centros_custo(id);

-- 3. Enable RLS
ALTER TABLE public.fin_lancamento_rateios ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for fin_lancamento_rateios (authenticated users)
CREATE POLICY "Authenticated users can read rateios"
  ON public.fin_lancamento_rateios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert rateios"
  ON public.fin_lancamento_rateios FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update rateios"
  ON public.fin_lancamento_rateios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete rateios"
  ON public.fin_lancamento_rateios FOR DELETE TO authenticated USING (true);

-- 5. Index for performance
CREATE INDEX idx_fin_lancamento_rateios_lancamento ON public.fin_lancamento_rateios(lancamento_id);
CREATE INDEX idx_fin_lancamento_rateios_categoria ON public.fin_lancamento_rateios(categoria_id);
