-- Harden purchase-related RBAC to deny-by-default and remove broad authenticated reads

-- solic_compra_mercado
DROP POLICY IF EXISTS "Authenticated can read solic_mercado" ON public.solic_compra_mercado;
CREATE POLICY "Authorized can read solic_mercado"
ON public.solic_compra_mercado
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::public.app_role)
  OR has_role(auth.uid(), 'diretor'::public.app_role)
  OR has_role(auth.uid(), 'gerente_geral'::public.app_role)
  OR has_role(auth.uid(), 'compras'::public.app_role)
  OR has_role(auth.uid(), 'compras_assistente'::public.app_role)
  OR has_role(auth.uid(), 'estoquista'::public.app_role)
);

-- solic_compra_mercado_item
DROP POLICY IF EXISTS "Authenticated can read solic_items" ON public.solic_compra_mercado_item;
CREATE POLICY "Authorized can read solic_items"
ON public.solic_compra_mercado_item
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::public.app_role)
  OR has_role(auth.uid(), 'diretor'::public.app_role)
  OR has_role(auth.uid(), 'gerente_geral'::public.app_role)
  OR has_role(auth.uid(), 'compras'::public.app_role)
  OR has_role(auth.uid(), 'compras_assistente'::public.app_role)
  OR has_role(auth.uid(), 'estoquista'::public.app_role)
);

-- recebimentos
DROP POLICY IF EXISTS "Authenticated can read recebimentos" ON public.recebimentos;
CREATE POLICY "Authorized can read recebimentos"
ON public.recebimentos
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::public.app_role)
  OR has_role(auth.uid(), 'diretor'::public.app_role)
  OR has_role(auth.uid(), 'gerente_geral'::public.app_role)
  OR has_role(auth.uid(), 'compras'::public.app_role)
  OR has_role(auth.uid(), 'estoquista'::public.app_role)
);

-- recebimento_itens
DROP POLICY IF EXISTS "Authenticated can read recebimento_itens" ON public.recebimento_itens;
CREATE POLICY "Authorized can read recebimento_itens"
ON public.recebimento_itens
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::public.app_role)
  OR has_role(auth.uid(), 'diretor'::public.app_role)
  OR has_role(auth.uid(), 'gerente_geral'::public.app_role)
  OR has_role(auth.uid(), 'compras'::public.app_role)
  OR has_role(auth.uid(), 'estoquista'::public.app_role)
);

-- confirmacoes_recebimento
DROP POLICY IF EXISTS "Authenticated can read confirmacoes" ON public.confirmacoes_recebimento;
CREATE POLICY "Authorized can read confirmacoes"
ON public.confirmacoes_recebimento
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::public.app_role)
  OR has_role(auth.uid(), 'diretor'::public.app_role)
  OR has_role(auth.uid(), 'gerente_geral'::public.app_role)
  OR has_role(auth.uid(), 'compras'::public.app_role)
  OR has_role(auth.uid(), 'estoquista'::public.app_role)
);
