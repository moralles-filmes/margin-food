
-- Fix suppliers RLS: use granular permissions instead of purchases:create for all ops

-- Drop old policies
DROP POLICY IF EXISTS suppliers_tenant_select ON suppliers;
DROP POLICY IF EXISTS suppliers_tenant_insert ON suppliers;
DROP POLICY IF EXISTS suppliers_tenant_update ON suppliers;
DROP POLICY IF EXISTS suppliers_tenant_delete ON suppliers;

-- SELECT: view permission
CREATE POLICY suppliers_perm_select ON suppliers
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'compras:fornecedores:view',
      'compras:lista:view',
      'purchases:create',
      'system:global:manage'
    ])
  );

-- INSERT: create permission
CREATE POLICY suppliers_perm_insert ON suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'compras:fornecedores:create',
      'system:global:manage'
    ])
  );

-- UPDATE: edit permission
CREATE POLICY suppliers_perm_update ON suppliers
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'compras:fornecedores:edit',
      'system:global:manage'
    ])
  )
  WITH CHECK (company_id = get_current_company_id());

-- DELETE: delete permission
CREATE POLICY suppliers_perm_delete ON suppliers
  FOR DELETE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'compras:fornecedores:delete',
      'system:global:manage'
    ])
  );
