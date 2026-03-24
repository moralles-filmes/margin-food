
-- ═══════════════════════════════════════════════════════════════
-- COMPRAS RLS MIGRATION: has_role() → has_permission()
-- ═══════════════════════════════════════════════════════════════

-- PHASE 0: Seed missing permission definitions
INSERT INTO permissions (key, module, submodule, action, description) VALUES
  ('purchases:edit', 'purchases', NULL, 'edit', 'Editar Compras'),
  ('purchases:delete', 'purchases', NULL, 'delete', 'Excluir Compras'),
  ('purchases:receiving:manage', 'purchases', 'receiving', 'manage', 'Gerenciar Recebimentos')
ON CONFLICT (key) DO NOTHING;

-- PHASE 1: Seed missing role_permissions
INSERT INTO role_permissions (role, permission_key) VALUES
  ('admin', 'purchases:edit'),
  ('admin', 'purchases:delete'),
  ('admin', 'purchases:receiving:manage')
ON CONFLICT (role, permission_key) DO NOTHING;

-- PHASE 2: Drop ALL legacy has_role policies

DROP POLICY IF EXISTS "Admin or Compras can insert aprovacoes" ON aprovacoes_solic_compra_mercado;
DROP POLICY IF EXISTS "Authenticated can read aprovacoes" ON aprovacoes_solic_compra_mercado;
DROP POLICY IF EXISTS "Admin or Compras or Assistente can manage confirmacoes" ON confirmacoes_recebimento;
DROP POLICY IF EXISTS "Authorized can read confirmacoes" ON confirmacoes_recebimento;
DROP POLICY IF EXISTS "Auth can manage purchase_ignored_rules" ON purchase_ignored_rules;
DROP POLICY IF EXISTS "Admin can delete purchase_orders" ON purchase_orders;
DROP POLICY IF EXISTS "Admin can update purchase_orders" ON purchase_orders;
DROP POLICY IF EXISTS "Authenticated users can read purchase_orders" ON purchase_orders;
DROP POLICY IF EXISTS "Authenticated users can insert purchase_orders" ON purchase_orders;
DROP POLICY IF EXISTS "Admin can delete purchase_order_items" ON purchase_order_items;
DROP POLICY IF EXISTS "Admin can update purchase_order_items" ON purchase_order_items;
DROP POLICY IF EXISTS "Authenticated users can read purchase_order_items" ON purchase_order_items;
DROP POLICY IF EXISTS "Auth can read purchase_requisition_audit" ON purchase_requisition_audit;
DROP POLICY IF EXISTS "Auth can read purchase_requisition_items" ON purchase_requisition_items;
DROP POLICY IF EXISTS "Auth can write purchase_requisition_items" ON purchase_requisition_items;
DROP POLICY IF EXISTS "Auth can read purchase_requisitions" ON purchase_requisitions;
DROP POLICY IF EXISTS "Auth can write purchase_requisitions" ON purchase_requisitions;
DROP POLICY IF EXISTS "Admin or Compras can manage recebimento_itens" ON recebimento_itens;
DROP POLICY IF EXISTS "Authorized can read recebimento_itens" ON recebimento_itens;
DROP POLICY IF EXISTS "Admin or Compras can manage recebimentos" ON recebimentos;
DROP POLICY IF EXISTS "Authorized can read recebimentos" ON recebimentos;
DROP POLICY IF EXISTS "Admin or Compras can insert solic_mercado" ON solic_compra_mercado;
DROP POLICY IF EXISTS "Authorized can read solic_mercado" ON solic_compra_mercado;
DROP POLICY IF EXISTS "Authorized can update solic_mercado" ON solic_compra_mercado;
DROP POLICY IF EXISTS "Authorized can manage solic_items" ON solic_compra_mercado_item;
DROP POLICY IF EXISTS "Authorized can read solic_items" ON solic_compra_mercado_item;
DROP POLICY IF EXISTS "Compras can read all solicitacoes_compra" ON solicitacoes_compra;
DROP POLICY IF EXISTS "Compras can update solicitacoes_compra" ON solicitacoes_compra;

-- PHASE 3: Create new has_permission() policies

-- aprovacoes_solic_compra_mercado
CREATE POLICY "purchases:read aprovacoes" ON aprovacoes_solic_compra_mercado FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));
CREATE POLICY "purchases:approve aprovacoes" ON aprovacoes_solic_compra_mercado FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'purchases:approve'));

-- confirmacoes_recebimento
CREATE POLICY "purchases:read confirmacoes" ON confirmacoes_recebimento FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));
CREATE POLICY "purchases:receiving:confirm insert" ON confirmacoes_recebimento FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'purchases:receiving:confirm'));
CREATE POLICY "purchases:receiving:confirm update" ON confirmacoes_recebimento FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'purchases:receiving:confirm')) WITH CHECK (has_permission(auth.uid(), 'purchases:receiving:confirm'));
CREATE POLICY "purchases:delete confirmacoes" ON confirmacoes_recebimento FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'purchases:delete'));

-- purchase_ignored_rules
CREATE POLICY "purchases:read ignored_rules" ON purchase_ignored_rules FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));
CREATE POLICY "purchases:edit ignored_rules insert" ON purchase_ignored_rules FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'purchases:edit'));
CREATE POLICY "purchases:edit ignored_rules update" ON purchase_ignored_rules FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'purchases:edit')) WITH CHECK (has_permission(auth.uid(), 'purchases:edit'));
CREATE POLICY "purchases:delete ignored_rules" ON purchase_ignored_rules FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'purchases:delete'));

-- purchase_orders
CREATE POLICY "purchases:read orders" ON purchase_orders FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));
CREATE POLICY "purchases:create orders" ON purchase_orders FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'purchases:create') AND created_by = auth.uid());
CREATE POLICY "purchases:delete orders" ON purchase_orders FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'purchases:delete'));

-- purchase_order_items
CREATE POLICY "purchases:read order_items" ON purchase_order_items FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));
CREATE POLICY "purchases:delete order_items" ON purchase_order_items FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'purchases:delete'));

-- purchase_requisition_audit
CREATE POLICY "purchases:read req_audit" ON purchase_requisition_audit FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));

-- purchase_requisition_items
CREATE POLICY "purchases:read req_items" ON purchase_requisition_items FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));
CREATE POLICY "purchases:create req_items" ON purchase_requisition_items FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'purchases:create'));
CREATE POLICY "purchases:edit req_items" ON purchase_requisition_items FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'purchases:edit')) WITH CHECK (has_permission(auth.uid(), 'purchases:edit'));
CREATE POLICY "purchases:delete req_items" ON purchase_requisition_items FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'purchases:delete'));

-- purchase_requisitions
CREATE POLICY "purchases:read requisitions" ON purchase_requisitions FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));
CREATE POLICY "purchases:create requisitions" ON purchase_requisitions FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'purchases:create'));
CREATE POLICY "purchases:edit requisitions" ON purchase_requisitions FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'purchases:edit')) WITH CHECK (has_permission(auth.uid(), 'purchases:edit'));
CREATE POLICY "purchases:delete requisitions" ON purchase_requisitions FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'purchases:delete'));

-- recebimento_itens
CREATE POLICY "purchases:read receb_itens" ON recebimento_itens FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));
CREATE POLICY "purchases:receiving:manage receb_itens insert" ON recebimento_itens FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'purchases:receiving:manage'));
CREATE POLICY "purchases:receiving:manage receb_itens update" ON recebimento_itens FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'purchases:receiving:manage')) WITH CHECK (has_permission(auth.uid(), 'purchases:receiving:manage'));
CREATE POLICY "purchases:delete receb_itens" ON recebimento_itens FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'purchases:delete'));

-- recebimentos
CREATE POLICY "purchases:read recebimentos" ON recebimentos FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));
CREATE POLICY "purchases:receiving:manage receb insert" ON recebimentos FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'purchases:receiving:manage'));
CREATE POLICY "purchases:receiving:manage receb update" ON recebimentos FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'purchases:receiving:manage')) WITH CHECK (has_permission(auth.uid(), 'purchases:receiving:manage'));
CREATE POLICY "purchases:delete recebimentos" ON recebimentos FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'purchases:delete'));

-- solic_compra_mercado
CREATE POLICY "purchases:read solic_mercado" ON solic_compra_mercado FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));
CREATE POLICY "purchases:create solic_mercado" ON solic_compra_mercado FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'purchases:create') AND solicitante_user_id = auth.uid());
CREATE POLICY "purchases:edit solic_mercado" ON solic_compra_mercado FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'purchases:edit')) WITH CHECK (has_permission(auth.uid(), 'purchases:edit'));
CREATE POLICY "purchases:delete solic_mercado" ON solic_compra_mercado FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'purchases:delete'));

-- solic_compra_mercado_item
CREATE POLICY "purchases:read solic_items" ON solic_compra_mercado_item FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));
CREATE POLICY "purchases:create solic_items" ON solic_compra_mercado_item FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'purchases:create'));
CREATE POLICY "purchases:edit solic_items" ON solic_compra_mercado_item FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'purchases:edit')) WITH CHECK (has_permission(auth.uid(), 'purchases:edit'));
CREATE POLICY "purchases:delete solic_items" ON solic_compra_mercado_item FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'purchases:delete'));

-- solicitacoes_compra
CREATE POLICY "purchases:read solicitacoes" ON solicitacoes_compra FOR SELECT TO authenticated USING (has_permission(auth.uid(), 'purchases:read'));
CREATE POLICY "purchases:edit solicitacoes" ON solicitacoes_compra FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'purchases:edit')) WITH CHECK (has_permission(auth.uid(), 'purchases:edit'));
CREATE POLICY "purchases:delete solicitacoes" ON solicitacoes_compra FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'purchases:delete'));
