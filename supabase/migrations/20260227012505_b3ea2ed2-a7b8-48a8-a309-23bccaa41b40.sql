
CREATE TABLE public.rh_comunicados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL DEFAULT '',
  conteudo TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'aviso',
  prioridade TEXT NOT NULL DEFAULT 'normal',
  setores_alvo TEXT[] DEFAULT '{}',
  autor_id UUID,
  autor_nome TEXT DEFAULT '',
  fixado BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  data_expiracao DATE,
  visualizacoes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rh_comunicados ENABLE ROW LEVEL SECURITY;

-- Masters can manage
CREATE POLICY "Masters can manage rh_comunicados" ON public.rh_comunicados
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'diretor'::app_role) OR
    has_role(auth.uid(), 'gerente_geral'::app_role)
  ) WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'diretor'::app_role) OR
    has_role(auth.uid(), 'gerente_geral'::app_role)
  );

-- Gerente can manage
CREATE POLICY "Gerente can manage rh_comunicados" ON public.rh_comunicados
  FOR ALL USING (has_role(auth.uid(), 'gerente'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gerente'::app_role));

-- All authenticated can read active
CREATE POLICY "Authenticated can read active comunicados" ON public.rh_comunicados
  FOR SELECT USING (ativo = true);
