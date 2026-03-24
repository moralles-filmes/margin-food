
-- Tabela de rateio por centro de custo
CREATE TABLE public.fin_rateios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lancamento_id UUID REFERENCES public.fin_lancamentos(id) ON DELETE CASCADE,
  centro_custo_id UUID NOT NULL REFERENCES public.fin_centros_custo(id),
  percentual NUMERIC NOT NULL DEFAULT 0,
  valor NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.fin_rateios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read fin_rateios"
  ON public.fin_rateios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert fin_rateios"
  ON public.fin_rateios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update fin_rateios"
  ON public.fin_rateios FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete fin_rateios"
  ON public.fin_rateios FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
