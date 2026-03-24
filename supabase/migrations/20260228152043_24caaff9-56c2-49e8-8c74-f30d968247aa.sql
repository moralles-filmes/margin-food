
-- Helper: permission check for RLS (deny-by-default)
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _permission = ANY(public.get_effective_permissions(_user_id));
$$;

-- =====================
-- Finance
-- =====================

-- fin_lancamento_rateios
DROP POLICY IF EXISTS "Authenticated users can insert rateios" ON public.fin_lancamento_rateios;
CREATE POLICY "Finance manage can insert rateios"
ON public.fin_lancamento_rateios
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'finance:manage'));

DROP POLICY IF EXISTS "Authenticated users can update rateios" ON public.fin_lancamento_rateios;
CREATE POLICY "Finance manage can update rateios"
ON public.fin_lancamento_rateios
FOR UPDATE
TO authenticated
USING (public.has_permission(auth.uid(), 'finance:manage'))
WITH CHECK (public.has_permission(auth.uid(), 'finance:manage'));

DROP POLICY IF EXISTS "Authenticated users can delete rateios" ON public.fin_lancamento_rateios;
CREATE POLICY "Finance manage can delete rateios"
ON public.fin_lancamento_rateios
FOR DELETE
TO authenticated
USING (public.has_permission(auth.uid(), 'finance:manage'));

-- fin_rateios
DROP POLICY IF EXISTS "Authenticated users can insert fin_rateios" ON public.fin_rateios;
CREATE POLICY "Finance manage can insert fin_rateios"
ON public.fin_rateios
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'finance:manage')
  AND (created_by IS NULL OR created_by = auth.uid())
);

DROP POLICY IF EXISTS "Authenticated users can update fin_rateios" ON public.fin_rateios;
CREATE POLICY "Finance manage can update fin_rateios"
ON public.fin_rateios
FOR UPDATE
TO authenticated
USING (public.has_permission(auth.uid(), 'finance:manage'))
WITH CHECK (public.has_permission(auth.uid(), 'finance:manage'));

DROP POLICY IF EXISTS "Authenticated users can delete fin_rateios" ON public.fin_rateios;
CREATE POLICY "Finance manage can delete fin_rateios"
ON public.fin_rateios
FOR DELETE
TO authenticated
USING (public.has_permission(auth.uid(), 'finance:manage'));

-- fin_regras_categorizacao
DROP POLICY IF EXISTS "Authenticated users can insert fin_regras_categorizacao" ON public.fin_regras_categorizacao;
CREATE POLICY "Finance manage can insert fin_regras_categorizacao"
ON public.fin_regras_categorizacao
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'finance:manage')
  AND (created_by IS NULL OR created_by = auth.uid())
);

DROP POLICY IF EXISTS "Authenticated users can update fin_regras_categorizacao" ON public.fin_regras_categorizacao;
CREATE POLICY "Finance manage can update fin_regras_categorizacao"
ON public.fin_regras_categorizacao
FOR UPDATE
TO authenticated
USING (public.has_permission(auth.uid(), 'finance:manage'))
WITH CHECK (public.has_permission(auth.uid(), 'finance:manage'));

DROP POLICY IF EXISTS "Authenticated users can delete fin_regras_categorizacao" ON public.fin_regras_categorizacao;
CREATE POLICY "Finance manage can delete fin_regras_categorizacao"
ON public.fin_regras_categorizacao
FOR DELETE
TO authenticated
USING (public.has_permission(auth.uid(), 'finance:manage'));

-- =====================
-- Purchases / Suppliers
-- =====================

-- purchase_orders (update)
DROP POLICY IF EXISTS "Authenticated users can update purchase_orders" ON public.purchase_orders;
CREATE POLICY "Purchases editors can update purchase_orders"
ON public.purchase_orders
FOR UPDATE
TO authenticated
USING (
  public.has_permission(auth.uid(), 'purchases:create')
  OR public.has_permission(auth.uid(), 'purchases:approve')
  OR public.has_permission(auth.uid(), 'purchases:receiving:confirm')
  OR created_by = auth.uid()
  OR responsible_user_id = auth.uid()
)
WITH CHECK (
  public.has_permission(auth.uid(), 'purchases:create')
  OR public.has_permission(auth.uid(), 'purchases:approve')
  OR public.has_permission(auth.uid(), 'purchases:receiving:confirm')
  OR created_by = auth.uid()
  OR responsible_user_id = auth.uid()
);

-- purchase_order_items (insert/update)
DROP POLICY IF EXISTS "Authenticated users can insert purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "Purchases editors can insert purchase_order_items"
ON public.purchase_order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.purchase_orders o
    WHERE o.id = purchase_order_items.order_id
      AND (
        public.has_permission(auth.uid(), 'purchases:create')
        OR public.has_permission(auth.uid(), 'purchases:approve')
        OR o.created_by = auth.uid()
        OR o.responsible_user_id = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS "Authenticated users can update purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "Purchases editors can update purchase_order_items"
ON public.purchase_order_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.purchase_orders o
    WHERE o.id = purchase_order_items.order_id
      AND (
        public.has_permission(auth.uid(), 'purchases:create')
        OR public.has_permission(auth.uid(), 'purchases:approve')
        OR public.has_permission(auth.uid(), 'purchases:receiving:confirm')
        OR o.created_by = auth.uid()
        OR o.responsible_user_id = auth.uid()
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.purchase_orders o
    WHERE o.id = purchase_order_items.order_id
      AND (
        public.has_permission(auth.uid(), 'purchases:create')
        OR public.has_permission(auth.uid(), 'purchases:approve')
        OR public.has_permission(auth.uid(), 'purchases:receiving:confirm')
        OR o.created_by = auth.uid()
        OR o.responsible_user_id = auth.uid()
      )
  )
);

-- purchase_reminders (update/delete)
DROP POLICY IF EXISTS "Authenticated users can update reminders" ON public.purchase_reminders;
CREATE POLICY "Purchases editors can update reminders"
ON public.purchase_reminders
FOR UPDATE
TO authenticated
USING (
  (created_by = auth.uid())
  AND (public.has_permission(auth.uid(), 'purchases:create') OR public.has_permission(auth.uid(), 'purchases:approve'))
)
WITH CHECK (
  (created_by = auth.uid())
  AND (public.has_permission(auth.uid(), 'purchases:create') OR public.has_permission(auth.uid(), 'purchases:approve'))
);

DROP POLICY IF EXISTS "Authenticated users can delete reminders" ON public.purchase_reminders;
CREATE POLICY "Purchases editors can delete reminders"
ON public.purchase_reminders
FOR DELETE
TO authenticated
USING (
  (created_by = auth.uid())
  AND (public.has_permission(auth.uid(), 'purchases:create') OR public.has_permission(auth.uid(), 'purchases:approve'))
);

-- purchase_requisition_audit (insert)
DROP POLICY IF EXISTS "Auth can insert purchase_requisition_audit" ON public.purchase_requisition_audit;
CREATE POLICY "Users can insert their own purchase_requisition_audit"
ON public.purchase_requisition_audit
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- supplier_item_prices (insert/update/delete)
DROP POLICY IF EXISTS "Authenticated users can insert supplier prices" ON public.supplier_item_prices;
CREATE POLICY "Suppliers editors can insert supplier prices"
ON public.supplier_item_prices
FOR INSERT
TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'suppliers:edit'));

DROP POLICY IF EXISTS "Authenticated users can update supplier prices" ON public.supplier_item_prices;
CREATE POLICY "Suppliers editors can update supplier prices"
ON public.supplier_item_prices
FOR UPDATE
TO authenticated
USING (public.has_permission(auth.uid(), 'suppliers:edit'))
WITH CHECK (public.has_permission(auth.uid(), 'suppliers:edit'));

DROP POLICY IF EXISTS "Authenticated users can delete supplier prices" ON public.supplier_item_prices;
CREATE POLICY "Suppliers editors can delete supplier prices"
ON public.supplier_item_prices
FOR DELETE
TO authenticated
USING (public.has_permission(auth.uid(), 'suppliers:edit'));

-- notifications (insert) - prevent spoofing sender
DROP POLICY IF EXISTS "Authenticated insert notifications" ON public.notifications;
CREATE POLICY "Users can insert notifications as themselves"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());
