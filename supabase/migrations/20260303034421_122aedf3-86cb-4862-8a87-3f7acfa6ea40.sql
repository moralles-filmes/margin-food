
-- Fix remaining purchases: policies

-- ── solic_compra_mercado_item (different policy names) ──
DROP POLICY IF EXISTS "purchases:read solic_items" ON public.solic_compra_mercado_item;
DROP POLICY IF EXISTS "purchases:create solic_items" ON public.solic_compra_mercado_item;
DROP POLICY IF EXISTS "purchases:edit solic_items" ON public.solic_compra_mercado_item;
DROP POLICY IF EXISTS "purchases:delete solic_items" ON public.solic_compra_mercado_item;

-- These were already created in previous migration with correct names, 
-- but old ones had different names. Check if new ones exist:
-- If the compras: versions already exist from the previous migration, skip.
-- Since the previous migration used "solic_mercado_item" suffix and these have "solic_items",
-- these are DIFFERENT policies on the SAME table. Drop old and re-create.

CREATE POLICY "compras:view solic_items" ON public.solic_compra_mercado_item
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:pedidos:create solic_items" ON public.solic_compra_mercado_item
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:pedidos:create','compras:lista:create','system:global:manage']));

CREATE POLICY "compras:pedidos:edit solic_items" ON public.solic_compra_mercado_item
  FOR UPDATE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit','compras:lista:edit','system:global:manage']))
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit','compras:lista:edit','system:global:manage']));

CREATE POLICY "compras:pedidos:delete solic_items" ON public.solic_compra_mercado_item
  FOR DELETE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete','system:global:manage']));

-- ── suppliers: fix SELECT policy that references purchases:create ──
DROP POLICY IF EXISTS "suppliers_perm_select" ON public.suppliers;

CREATE POLICY "compras:fornecedores:view suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_any_permission(auth.uid(), ARRAY[
    'compras:fornecedores:view','compras:lista:view','compras:pedidos:view',
    'system:global:manage'
  ]));
