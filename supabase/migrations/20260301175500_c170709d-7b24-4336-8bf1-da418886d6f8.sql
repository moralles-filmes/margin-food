
-- Fix WITH CHECK (true) on po_update_approved to satisfy linter
DROP POLICY IF EXISTS "po_update_approved" ON public.purchase_orders;
CREATE POLICY "po_update_approved" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (
    status NOT IN ('OPEN','DRAFT','SUBMITTED')
    AND public.has_any_permission(auth.uid(), ARRAY['compras:lista:approve','system:global:manage'])
  )
  WITH CHECK (
    public.has_any_permission(auth.uid(), ARRAY['compras:lista:approve','system:global:manage'])
  );
