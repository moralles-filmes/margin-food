
-- Tabela de regras de categorização automática
CREATE TABLE public.fin_regras_categorizacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  padrao TEXT NOT NULL,
  tipo_match TEXT NOT NULL DEFAULT 'contem', -- contem, exato, regex
  categoria_id UUID REFERENCES public.fin_categorias(id),
  centro_custo_id UUID REFERENCES public.fin_centros_custo(id),
  prioridade INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fin_regras_categorizacao ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read fin_regras_categorizacao"
  ON public.fin_regras_categorizacao FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert fin_regras_categorizacao"
  ON public.fin_regras_categorizacao FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update fin_regras_categorizacao"
  ON public.fin_regras_categorizacao FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete fin_regras_categorizacao"
  ON public.fin_regras_categorizacao FOR DELETE TO authenticated USING (true);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
