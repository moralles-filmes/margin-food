CREATE OR REPLACE FUNCTION public.has_compras_view(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT has_any_permission(p_user_id, ARRAY[
    'compras:lista:view','compras:pedidos:view','compras:checklist:view',
    'compras:calendario:view','compras:ranking:view','compras:fornecedores:view',
    'compras:recebimentos:view','compras:confirmacoes:view',
    'system:global:manage'
  ])
$$;

-- ── aprovacoes_solic_compra_mercado ──
DROP POLICY IF EXISTS "purchases:approve aprovacoes" ON public.aprovacoes_solic_compra_mercado;
DROP POLICY IF EXISTS "purchases:read aprovacoes" ON public.aprovacoes_solic_compra_mercado;

CREATE POLICY "compras:confirmacoes:approve insert" ON public.aprovacoes_solic_compra_mercado
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:lista:approve','compras:confirmacoes:approve','system:global:manage']));

CREATE POLICY "compras:view aprovacoes" ON public.aprovacoes_solic_compra_mercado
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

-- ── confirmacoes_recebimento ──
DROP POLICY IF EXISTS "purchases:delete confirmacoes" ON public.confirmacoes_recebimento;
DROP POLICY IF EXISTS "purchases:read confirmacoes" ON public.confirmacoes_recebimento;
DROP POLICY IF EXISTS "purchases:receiving:confirm insert" ON public.confirmacoes_recebimento;
DROP POLICY IF EXISTS "purchases:receiving:confirm update" ON public.confirmacoes_recebimento;

CREATE POLICY "compras:confirmacoes:view" ON public.confirmacoes_recebimento
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:confirmacoes:approve insert" ON public.confirmacoes_recebimento
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:confirmacoes:approve','compras:recebimentos:create','system:global:manage']));

CREATE POLICY "compras:confirmacoes:approve update" ON public.confirmacoes_recebimento
  FOR UPDATE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:confirmacoes:approve','system:global:manage']))
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:confirmacoes:approve','system:global:manage']));

CREATE POLICY "compras:pedidos:delete confirmacoes" ON public.confirmacoes_recebimento
  FOR DELETE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete','system:global:manage']));

-- ── purchase_ignored_rules ──
DROP POLICY IF EXISTS "purchases:delete ignored_rules" ON public.purchase_ignored_rules;
DROP POLICY IF EXISTS "purchases:edit ignored_rules insert" ON public.purchase_ignored_rules;
DROP POLICY IF EXISTS "purchases:edit ignored_rules update" ON public.purchase_ignored_rules;
DROP POLICY IF EXISTS "purchases:read ignored_rules" ON public.purchase_ignored_rules;

CREATE POLICY "compras:view ignored_rules" ON public.purchase_ignored_rules
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:pedidos:edit ignored_rules insert" ON public.purchase_ignored_rules
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit','system:global:manage']));

CREATE POLICY "compras:pedidos:edit ignored_rules update" ON public.purchase_ignored_rules
  FOR UPDATE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit','system:global:manage']))
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit','system:global:manage']));

CREATE POLICY "compras:pedidos:delete ignored_rules" ON public.purchase_ignored_rules
  FOR DELETE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete','system:global:manage']));

-- ── purchase_order_items ──
DROP POLICY IF EXISTS "poi_tenant_select" ON public.purchase_order_items;
DROP POLICY IF EXISTS "poi_tenant_insert" ON public.purchase_order_items;
DROP POLICY IF EXISTS "poi_tenant_update" ON public.purchase_order_items;
DROP POLICY IF EXISTS "poi_tenant_delete" ON public.purchase_order_items;

CREATE POLICY "compras:view order_items" ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:pedidos:create order_items" ON public.purchase_order_items
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:pedidos:create','compras:lista:create','system:global:manage']));

CREATE POLICY "compras:pedidos:edit order_items" ON public.purchase_order_items
  FOR UPDATE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit','compras:checklist:edit','compras:recebimentos:edit','system:global:manage']))
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit','compras:checklist:edit','compras:recebimentos:edit','system:global:manage']));

CREATE POLICY "compras:pedidos:delete order_items" ON public.purchase_order_items
  FOR DELETE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete','system:global:manage']));

-- ── purchase_orders ──
DROP POLICY IF EXISTS "po_tenant_select" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_tenant_insert" ON public.purchase_orders;
DROP POLICY IF EXISTS "po_tenant_delete" ON public.purchase_orders;

CREATE POLICY "compras:view orders" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:pedidos:create orders" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:pedidos:create','compras:lista:create','system:global:manage']));

CREATE POLICY "compras:pedidos:delete orders" ON public.purchase_orders
  FOR DELETE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete','system:global:manage']));

-- ── purchase_reminders ──
DROP POLICY IF EXISTS "Purchases editors can delete reminders" ON public.purchase_reminders;
DROP POLICY IF EXISTS "Purchases editors can update reminders" ON public.purchase_reminders;
DROP POLICY IF EXISTS "Authenticated users can insert reminders" ON public.purchase_reminders;
DROP POLICY IF EXISTS "purchases:read reminders" ON public.purchase_reminders;

CREATE POLICY "compras:calendario:view reminders" ON public.purchase_reminders
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:calendario:edit insert" ON public.purchase_reminders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND has_any_permission(auth.uid(), ARRAY['compras:calendario:edit','system:global:manage']));

CREATE POLICY "compras:calendario:edit update" ON public.purchase_reminders
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND has_any_permission(auth.uid(), ARRAY['compras:calendario:edit','system:global:manage']))
  WITH CHECK (created_by = auth.uid() AND has_any_permission(auth.uid(), ARRAY['compras:calendario:edit','system:global:manage']));

-- W4: reminders — soft delete via setting active=false; block hard DELETE
CREATE POLICY "compras:calendario:no_hard_delete" ON public.purchase_reminders
  FOR DELETE TO authenticated
  USING (false); -- block all hard deletes

-- ── purchase_requisition_audit ──
DROP POLICY IF EXISTS "purchases:read req_audit" ON public.purchase_requisition_audit;

CREATE POLICY "compras:view req_audit" ON public.purchase_requisition_audit
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

-- ── purchase_requisition_items ──
DROP POLICY IF EXISTS "purchases:delete req_items" ON public.purchase_requisition_items;
DROP POLICY IF EXISTS "purchases:create req_items" ON public.purchase_requisition_items;
DROP POLICY IF EXISTS "purchases:edit req_items" ON public.purchase_requisition_items;
DROP POLICY IF EXISTS "purchases:read req_items" ON public.purchase_requisition_items;

CREATE POLICY "compras:view req_items" ON public.purchase_requisition_items
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:lista:create req_items" ON public.purchase_requisition_items
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:lista:create','compras:pedidos:create','system:global:manage']));

CREATE POLICY "compras:lista:edit req_items" ON public.purchase_requisition_items
  FOR UPDATE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:lista:edit','compras:pedidos:edit','system:global:manage']))
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:lista:edit','compras:pedidos:edit','system:global:manage']));

CREATE POLICY "compras:lista:delete req_items" ON public.purchase_requisition_items
  FOR DELETE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:lista:delete','compras:pedidos:delete','system:global:manage']));

-- ── purchase_requisitions ──
DROP POLICY IF EXISTS "purchases:delete requisitions" ON public.purchase_requisitions;
DROP POLICY IF EXISTS "purchases:create requisitions" ON public.purchase_requisitions;
DROP POLICY IF EXISTS "purchases:edit requisitions" ON public.purchase_requisitions;
DROP POLICY IF EXISTS "purchases:read requisitions" ON public.purchase_requisitions;

CREATE POLICY "compras:view requisitions" ON public.purchase_requisitions
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:lista:create requisitions" ON public.purchase_requisitions
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:lista:create','compras:pedidos:create','system:global:manage']));

CREATE POLICY "compras:lista:edit requisitions" ON public.purchase_requisitions
  FOR UPDATE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:lista:edit','compras:pedidos:edit','system:global:manage']))
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:lista:edit','compras:pedidos:edit','system:global:manage']));

CREATE POLICY "compras:lista:delete requisitions" ON public.purchase_requisitions
  FOR DELETE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:lista:delete','compras:pedidos:delete','system:global:manage']));

-- ── recebimento_itens ──
DROP POLICY IF EXISTS "purchases:delete receb_itens" ON public.recebimento_itens;
DROP POLICY IF EXISTS "purchases:receiving:manage receb_itens insert" ON public.recebimento_itens;
DROP POLICY IF EXISTS "purchases:read receb_itens" ON public.recebimento_itens;
DROP POLICY IF EXISTS "purchases:receiving:manage receb_itens update" ON public.recebimento_itens;

CREATE POLICY "compras:recebimentos:view itens" ON public.recebimento_itens
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:recebimentos:create itens" ON public.recebimento_itens
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:recebimentos:create','compras:recebimentos:edit','system:global:manage']));

CREATE POLICY "compras:recebimentos:edit itens" ON public.recebimento_itens
  FOR UPDATE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:recebimentos:edit','system:global:manage']))
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:recebimentos:edit','system:global:manage']));

CREATE POLICY "compras:recebimentos:delete itens" ON public.recebimento_itens
  FOR DELETE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete','system:global:manage']));

-- ── recebimentos ──
DROP POLICY IF EXISTS "purchases:delete recebimentos" ON public.recebimentos;
DROP POLICY IF EXISTS "purchases:receiving:manage receb insert" ON public.recebimentos;
DROP POLICY IF EXISTS "purchases:read recebimentos" ON public.recebimentos;
DROP POLICY IF EXISTS "purchases:receiving:manage receb update" ON public.recebimentos;

CREATE POLICY "compras:recebimentos:view" ON public.recebimentos
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:recebimentos:create" ON public.recebimentos
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:recebimentos:create','system:global:manage']));

CREATE POLICY "compras:recebimentos:edit" ON public.recebimentos
  FOR UPDATE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:recebimentos:edit','system:global:manage']))
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:recebimentos:edit','system:global:manage']));

CREATE POLICY "compras:recebimentos:delete" ON public.recebimentos
  FOR DELETE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete','system:global:manage']));

-- ── solic_compra_mercado ──
DROP POLICY IF EXISTS "purchases:delete solic_mercado" ON public.solic_compra_mercado;
DROP POLICY IF EXISTS "purchases:read solic_mercado" ON public.solic_compra_mercado;
DROP POLICY IF EXISTS "purchases:create solic_mercado" ON public.solic_compra_mercado;
DROP POLICY IF EXISTS "purchases:edit solic_mercado" ON public.solic_compra_mercado;

CREATE POLICY "compras:view solic_mercado" ON public.solic_compra_mercado
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:pedidos:create solic_mercado" ON public.solic_compra_mercado
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:pedidos:create','compras:lista:create','system:global:manage']));

CREATE POLICY "compras:pedidos:edit solic_mercado" ON public.solic_compra_mercado
  FOR UPDATE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit','compras:lista:edit','system:global:manage']))
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit','compras:lista:edit','system:global:manage']));

CREATE POLICY "compras:pedidos:delete solic_mercado" ON public.solic_compra_mercado
  FOR DELETE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete','system:global:manage']));

-- ── solic_compra_mercado_item ──
DROP POLICY IF EXISTS "purchases:delete solic_mercado_item" ON public.solic_compra_mercado_item;
DROP POLICY IF EXISTS "purchases:read solic_mercado_item" ON public.solic_compra_mercado_item;
DROP POLICY IF EXISTS "purchases:create solic_mercado_item" ON public.solic_compra_mercado_item;
DROP POLICY IF EXISTS "purchases:edit solic_mercado_item" ON public.solic_compra_mercado_item;

CREATE POLICY "compras:view solic_mercado_item" ON public.solic_compra_mercado_item
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:pedidos:create solic_mercado_item" ON public.solic_compra_mercado_item
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:pedidos:create','compras:lista:create','system:global:manage']));

CREATE POLICY "compras:pedidos:edit solic_mercado_item" ON public.solic_compra_mercado_item
  FOR UPDATE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit','compras:lista:edit','system:global:manage']))
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit','compras:lista:edit','system:global:manage']));

CREATE POLICY "compras:pedidos:delete solic_mercado_item" ON public.solic_compra_mercado_item
  FOR DELETE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete','system:global:manage']));

-- ── solicitacoes_compra ──
DROP POLICY IF EXISTS "purchases:delete solicitacoes" ON public.solicitacoes_compra;
DROP POLICY IF EXISTS "purchases:read solicitacoes" ON public.solicitacoes_compra;
DROP POLICY IF EXISTS "purchases:create solicitacoes" ON public.solicitacoes_compra;
DROP POLICY IF EXISTS "purchases:edit solicitacoes" ON public.solicitacoes_compra;

CREATE POLICY "compras:view solicitacoes" ON public.solicitacoes_compra
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() AND has_compras_view(auth.uid()));

CREATE POLICY "compras:lista:create solicitacoes" ON public.solicitacoes_compra
  FOR INSERT TO authenticated
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:lista:create','system:global:manage']));

CREATE POLICY "compras:lista:edit solicitacoes" ON public.solicitacoes_compra
  FOR UPDATE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:lista:edit','system:global:manage']))
  WITH CHECK (has_any_permission(auth.uid(), ARRAY['compras:lista:edit','system:global:manage']));

CREATE POLICY "compras:lista:delete solicitacoes" ON public.solicitacoes_compra
  FOR DELETE TO authenticated
  USING (has_any_permission(auth.uid(), ARRAY['compras:lista:delete','system:global:manage']));


-- ─── W2: ATOMIC RPCs ───

-- Add idempotency_key column
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_po_company_idempotency 
  ON public.purchase_orders (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ── create_purchase_order_atomic ──