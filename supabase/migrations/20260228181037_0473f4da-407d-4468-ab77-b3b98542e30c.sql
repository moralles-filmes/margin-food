
-- ============================================================
-- PHASE B: Migrate Stock module RLS to has_permission()
-- ============================================================

-- ==================== PRODUTOS ====================
DROP POLICY IF EXISTS "Authenticated can read produtos" ON public.produtos;
DROP POLICY IF EXISTS "Authorized can manage produtos" ON public.produtos;

CREATE POLICY "stock_read_produtos"
  ON public.produtos FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:read'));

CREATE POLICY "stock_edit_produtos"
  ON public.produtos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'stock:edit'));

CREATE POLICY "stock_update_produtos"
  ON public.produtos FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'stock:edit'));

CREATE POLICY "stock_delete_produtos"
  ON public.produtos FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:delete'));

-- ==================== MOVIMENTACOES_ESTOQUE ====================
DROP POLICY IF EXISTS "Authenticated can read movimentacoes" ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS "Authorized can insert movimentacoes" ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS "Authorized can manage movimentacoes" ON public.movimentacoes_estoque;

CREATE POLICY "stock_read_movimentacoes"
  ON public.movimentacoes_estoque FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:movements:read'));

CREATE POLICY "stock_insert_movimentacoes"
  ON public.movimentacoes_estoque FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'stock:movements:create'));

CREATE POLICY "stock_update_movimentacoes"
  ON public.movimentacoes_estoque FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:movements:edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'stock:movements:edit'));

CREATE POLICY "stock_delete_movimentacoes"
  ON public.movimentacoes_estoque FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:delete'));

-- ==================== INVENTARIOS ====================
DROP POLICY IF EXISTS "Authenticated can read inventarios" ON public.inventarios;
DROP POLICY IF EXISTS "Admin or Compras can insert inventarios" ON public.inventarios;
DROP POLICY IF EXISTS "Admin or Compras can update inventarios" ON public.inventarios;

CREATE POLICY "inventory_read_inventarios"
  ON public.inventarios FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory:read'));

CREATE POLICY "inventory_insert_inventarios"
  ON public.inventarios FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'inventory:create'));

CREATE POLICY "inventory_update_inventarios"
  ON public.inventarios FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory:edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory:edit'));

CREATE POLICY "inventory_delete_inventarios"
  ON public.inventarios FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory:delete'));

-- ==================== INVENTARIO_ITENS ====================
DROP POLICY IF EXISTS "Authenticated can read inventario_itens" ON public.inventario_itens;
DROP POLICY IF EXISTS "Authorized can insert inventario_itens" ON public.inventario_itens;
DROP POLICY IF EXISTS "Authorized can update inventario_itens" ON public.inventario_itens;

CREATE POLICY "inventory_read_itens"
  ON public.inventario_itens FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory:read'));

CREATE POLICY "inventory_insert_itens"
  ON public.inventario_itens FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'inventory:count'));

CREATE POLICY "inventory_update_itens"
  ON public.inventario_itens FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory:count'))
  WITH CHECK (public.has_permission(auth.uid(), 'inventory:count'));

CREATE POLICY "inventory_delete_itens"
  ON public.inventario_itens FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory:delete'));

-- ==================== AUDIT_INVENTARIO_LOG ====================
DROP POLICY IF EXISTS "Authenticated can read audit_inventario_log" ON public.audit_inventario_log;
DROP POLICY IF EXISTS "Users can insert own audit_inventario_log" ON public.audit_inventario_log;

CREATE POLICY "inventory_read_audit_log"
  ON public.audit_inventario_log FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'inventory:read'));

CREATE POLICY "inventory_insert_audit_log"
  ON public.audit_inventario_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ==================== STOCK_CATEGORIES ====================
DROP POLICY IF EXISTS "stock_categories_select" ON public.stock_categories;
DROP POLICY IF EXISTS "stock_categories_insert" ON public.stock_categories;
DROP POLICY IF EXISTS "stock_categories_update" ON public.stock_categories;
DROP POLICY IF EXISTS "stock_categories_delete" ON public.stock_categories;

CREATE POLICY "stock_read_categories"
  ON public.stock_categories FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:read'));

CREATE POLICY "stock_edit_categories"
  ON public.stock_categories FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'stock:edit'));

CREATE POLICY "stock_update_categories"
  ON public.stock_categories FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'stock:edit'));

CREATE POLICY "stock_delete_categories"
  ON public.stock_categories FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:delete'));

-- ==================== STOCK_LOCATIONS ====================
DROP POLICY IF EXISTS "stock_locations_select" ON public.stock_locations;
DROP POLICY IF EXISTS "stock_locations_insert" ON public.stock_locations;
DROP POLICY IF EXISTS "stock_locations_update" ON public.stock_locations;
DROP POLICY IF EXISTS "stock_locations_delete" ON public.stock_locations;

CREATE POLICY "stock_read_locations"
  ON public.stock_locations FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:read'));

CREATE POLICY "stock_edit_locations"
  ON public.stock_locations FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'stock:edit'));

CREATE POLICY "stock_update_locations"
  ON public.stock_locations FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'stock:edit'));

CREATE POLICY "stock_delete_locations"
  ON public.stock_locations FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:delete'));

-- ==================== STOCK_SKU_COUNTER ====================
DROP POLICY IF EXISTS "stock_sku_counter_select" ON public.stock_sku_counter;
DROP POLICY IF EXISTS "stock_sku_counter_insert" ON public.stock_sku_counter;
DROP POLICY IF EXISTS "stock_sku_counter_update" ON public.stock_sku_counter;
DROP POLICY IF EXISTS "stock_sku_counter_delete" ON public.stock_sku_counter;

-- SKU counter is managed by SECURITY DEFINER RPCs only; 
-- direct access requires stock:edit for safety
CREATE POLICY "stock_read_sku_counter"
  ON public.stock_sku_counter FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:read'));

CREATE POLICY "stock_edit_sku_counter"
  ON public.stock_sku_counter FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'stock:edit'));

CREATE POLICY "stock_update_sku_counter"
  ON public.stock_sku_counter FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'stock:edit'));

CREATE POLICY "stock_delete_sku_counter"
  ON public.stock_sku_counter FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'stock:delete'));
