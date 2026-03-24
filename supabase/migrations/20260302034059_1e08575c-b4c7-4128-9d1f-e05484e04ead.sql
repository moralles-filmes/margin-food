
-- Fix supplier_item_prices RLS: migrate from legacy 'suppliers:edit' to granular permissions

DROP POLICY IF EXISTS "Suppliers editors can insert supplier prices" ON supplier_item_prices;
DROP POLICY IF EXISTS "Suppliers editors can update supplier prices" ON supplier_item_prices;
DROP POLICY IF EXISTS "Suppliers editors can delete supplier prices" ON supplier_item_prices;

CREATE POLICY sip_perm_insert ON supplier_item_prices
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit', 'system:global:manage'])
  );

CREATE POLICY sip_perm_update ON supplier_item_prices
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit', 'system:global:manage'])
  )
  WITH CHECK (company_id = get_current_company_id());

CREATE POLICY sip_perm_delete ON supplier_item_prices
  FOR DELETE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit', 'system:global:manage'])
  );
