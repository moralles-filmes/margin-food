CREATE INDEX IF NOT EXISTS financeiro_fechamento_marcas_created_by_idx
  ON public.financeiro_fechamento_marcas (created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS financeiro_fechamento_marca_valores_created_by_idx
  ON public.financeiro_fechamento_marca_valores (created_by)
  WHERE created_by IS NOT NULL;
