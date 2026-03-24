
-- ============================================================
-- Drop ALL legacy policies on inventarios + inventario_itens
-- ============================================================
DROP POLICY IF EXISTS "tenant_read" ON public.inventarios;
DROP POLICY IF EXISTS "tenant_insert" ON public.inventarios;
DROP POLICY IF EXISTS "tenant_update" ON public.inventarios;
DROP POLICY IF EXISTS "tenant_delete" ON public.inventarios;

DROP POLICY IF EXISTS "tenant_read" ON public.inventario_itens;
DROP POLICY IF EXISTS "tenant_insert" ON public.inventario_itens;
DROP POLICY IF EXISTS "tenant_update" ON public.inventario_itens;
DROP POLICY IF EXISTS "tenant_delete" ON public.inventario_itens;

-- ============================================================
-- inventarios: granular policies
-- ============================================================
CREATE POLICY "inv_select_granular" ON public.inventarios
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'inventario:lista:view',
      'inventario:detalhe:view',
      'inventario:dashboard:view',
      'inventario:auditoria:view',
      'system:global:manage'
    ])
  );

CREATE POLICY "inv_insert_granular" ON public.inventarios
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'inventario:criar:create',
      'system:global:manage'
    ])
  );

CREATE POLICY "inv_update_granular" ON public.inventarios
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'inventario:detalhe:edit',
      'inventario:detalhe:close',
      'inventario:auditoria:approve',
      'inventario:auditoria:edit',
      'system:global:manage'
    ])
  )
  WITH CHECK (
    company_id = get_current_company_id()
  );

-- No DELETE policy (soft delete only via RPC)

-- ============================================================
-- inventario_itens: granular policies
-- ============================================================
CREATE POLICY "inv_itens_select_granular" ON public.inventario_itens
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'inventario:detalhe:view',
      'inventario:auditoria:view',
      'system:global:manage'
    ])
  );

CREATE POLICY "inv_itens_insert_granular" ON public.inventario_itens
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'inventario:criar:create',
      'system:global:manage'
    ])
  );

CREATE POLICY "inv_itens_update_granular" ON public.inventario_itens
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'inventario:detalhe:edit',
      'inventario:auditoria:edit',
      'system:global:manage'
    ])
  )
  WITH CHECK (
    company_id = get_current_company_id()
  );

-- No DELETE policy (soft delete only via RPC)
