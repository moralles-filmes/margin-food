
-- ============ SUPPLIERS ============
-- Drop dangerous qual=true SELECT
DROP POLICY IF EXISTS "Authenticated users can read suppliers" ON public.suppliers;
-- Drop ALL policy (no company_id filter)
DROP POLICY IF EXISTS "Users with purchases:create can manage suppliers" ON public.suppliers;

CREATE POLICY "suppliers_tenant_select" ON public.suppliers
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'purchases:create'::text));

CREATE POLICY "suppliers_tenant_insert" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'purchases:create'::text));

CREATE POLICY "suppliers_tenant_update" ON public.suppliers
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'purchases:create'::text))
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "suppliers_tenant_delete" ON public.suppliers
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'purchases:create'::text));

-- ============ PURCHASE_ORDERS ============
DROP POLICY IF EXISTS "purchases:read orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchases:create orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchases:delete orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_update_draft" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_update_approved" ON public.purchase_orders;

CREATE POLICY "po_tenant_select" ON public.purchase_orders
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'purchases:read'::text));

CREATE POLICY "po_tenant_insert" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'purchases:create'::text) AND created_by = auth.uid());

CREATE POLICY "po_tenant_update_draft" ON public.purchase_orders
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND status IN ('OPEN','DRAFT','SUBMITTED')
    AND (created_by = auth.uid() OR responsible_user_id = auth.uid() OR public.has_permission(auth.uid(), 'compras:pedidos:edit'::text)))
  WITH CHECK (company_id = public.get_current_company_id() AND status IN ('OPEN','DRAFT','SUBMITTED'));

CREATE POLICY "po_tenant_update_approved" ON public.purchase_orders
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND status NOT IN ('OPEN','DRAFT','SUBMITTED')
    AND public.has_any_permission(auth.uid(), ARRAY['compras:lista:approve','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY['compras:lista:approve','system:global:manage']));

CREATE POLICY "po_tenant_delete" ON public.purchase_orders
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'purchases:delete'::text));

-- ============ PURCHASE_ORDER_ITEMS ============
DROP POLICY IF EXISTS "purchases:read order_items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchases:delete order_items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Purchases editors can insert purchase_order_items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Purchases editors can update purchase_order_items" ON public.purchase_order_items;

CREATE POLICY "poi_tenant_select" ON public.purchase_order_items
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'purchases:read'::text));

CREATE POLICY "poi_tenant_insert" ON public.purchase_order_items
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id() AND EXISTS (
    SELECT 1 FROM public.purchase_orders o
    WHERE o.id = purchase_order_items.order_id
      AND (public.has_permission(auth.uid(), 'purchases:create'::text)
        OR public.has_permission(auth.uid(), 'purchases:approve'::text)
        OR o.created_by = auth.uid() OR o.responsible_user_id = auth.uid())
  ));

CREATE POLICY "poi_tenant_update" ON public.purchase_order_items
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND EXISTS (
    SELECT 1 FROM public.purchase_orders o
    WHERE o.id = purchase_order_items.order_id
      AND (public.has_permission(auth.uid(), 'purchases:create'::text)
        OR public.has_permission(auth.uid(), 'purchases:approve'::text)
        OR public.has_permission(auth.uid(), 'purchases:receiving:confirm'::text)
        OR o.created_by = auth.uid() OR o.responsible_user_id = auth.uid())
  ))
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "poi_tenant_delete" ON public.purchase_order_items
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'purchases:delete'::text));

-- ============ SALMON_ENTRIES ============
DROP POLICY IF EXISTS "salmon_entries_select" ON public.salmon_entries;
DROP POLICY IF EXISTS "salmon_entries_insert" ON public.salmon_entries;
DROP POLICY IF EXISTS "salmon_entries_update" ON public.salmon_entries;
DROP POLICY IF EXISTS "salmon_entries_delete" ON public.salmon_entries;

CREATE POLICY "salmon_tenant_select" ON public.salmon_entries
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'salmon:read'::text));

CREATE POLICY "salmon_tenant_insert" ON public.salmon_entries
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'salmon:entries:create'::text));

CREATE POLICY "salmon_tenant_update" ON public.salmon_entries
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'salmon:edit'::text))
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "salmon_tenant_delete" ON public.salmon_entries
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_permission(auth.uid(), 'salmon:delete'::text));
