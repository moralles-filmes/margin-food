
-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Authorized can manage produtos" ON public.produtos;

-- Create a broader write policy using effective permissions
CREATE POLICY "Authorized can manage produtos"
ON public.produtos
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'compras_assistente'::app_role)
  OR has_role(auth.uid(), 'estoquista'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'compras_assistente'::app_role)
  OR has_role(auth.uid(), 'estoquista'::app_role)
);

-- Also fix movimentacoes_estoque if same issue exists
DROP POLICY IF EXISTS "Authorized can manage movimentacoes" ON public.movimentacoes_estoque;

CREATE POLICY "Authorized can manage movimentacoes"
ON public.movimentacoes_estoque
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'compras_assistente'::app_role)
  OR has_role(auth.uid(), 'estoquista'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'compras_assistente'::app_role)
  OR has_role(auth.uid(), 'estoquista'::app_role)
);
