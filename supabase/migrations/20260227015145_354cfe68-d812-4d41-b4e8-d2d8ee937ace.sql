
-- Add conciliation columns to fin_lancamentos
ALTER TABLE public.fin_lancamentos 
  ADD COLUMN IF NOT EXISTS conciliado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS conciliado_em timestamptz,
  ADD COLUMN IF NOT EXISTS conciliado_por uuid REFERENCES auth.users(id);

-- Create budget table
CREATE TABLE public.fin_orcamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_ano text NOT NULL,
  categoria_id uuid REFERENCES public.fin_categorias(id),
  valor_orcado numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(mes_ano, categoria_id)
);

ALTER TABLE public.fin_orcamentos ENABLE ROW LEVEL SECURITY;

-- RLS for fin_orcamentos
CREATE POLICY "Masters can manage fin_orcamentos" ON public.fin_orcamentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'diretor') OR public.has_role(auth.uid(), 'gerente_geral') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'diretor') OR public.has_role(auth.uid(), 'gerente_geral') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Financeiro can manage fin_orcamentos" ON public.fin_orcamentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'financeiro'));
