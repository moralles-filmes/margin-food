
-- Drop the old UPDATE policy and recreate with estoquista included
DROP POLICY IF EXISTS "Authorized can update requisicoes" ON public.requisicoes_estoque;

CREATE POLICY "Authorized can update requisicoes"
ON public.requisicoes_estoque FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'diretor'::app_role) OR
  has_role(auth.uid(), 'gerente_geral'::app_role) OR
  has_role(auth.uid(), 'gerente'::app_role) OR
  has_role(auth.uid(), 'estoquista'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'diretor'::app_role) OR
  has_role(auth.uid(), 'gerente_geral'::app_role) OR
  has_role(auth.uid(), 'gerente'::app_role) OR
  has_role(auth.uid(), 'estoquista'::app_role)
);

-- Also allow estoquista to read all requisicoes (not just own)
DROP POLICY IF EXISTS "Authorized can read all requisicoes" ON public.requisicoes_estoque;

CREATE POLICY "Authorized can read all requisicoes"
ON public.requisicoes_estoque FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'diretor'::app_role) OR
  has_role(auth.uid(), 'gerente_geral'::app_role) OR
  has_role(auth.uid(), 'gerente'::app_role) OR
  has_role(auth.uid(), 'compras'::app_role) OR
  has_role(auth.uid(), 'estoquista'::app_role)
);
