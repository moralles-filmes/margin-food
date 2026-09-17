-- Corrige dependências de leitura de perfis limitados, sem alterar seus grants RBAC.
-- Hotfix independente: não publica as demais migrations pendentes das Fases 2–8.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Cadastros usa estoque:cadastros:* na UI; setores/categorias/locais não são subtabs.
-- SELECT também aceita a ação de escrita para UPDATE/DELETE/RETURNING.

ALTER POLICY tenant_select_stock_categories ON public.stock_categories
TO authenticated USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:view',
      'estoque:cadastros:create',
      'estoque:cadastros:edit',
      'estoque:cadastros:delete',
      'estoque:cadastros:manage',
      'stock:read',
      'stock:write',
      'stock:edit',
      'stock:delete',
      'system:global:manage'
    ]::text[]))
);

ALTER POLICY tenant_insert_stock_categories ON public.stock_categories
TO authenticated WITH CHECK (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:create',
      'estoque:cadastros:manage',
      'stock:edit',
      'stock:write',
      'system:global:manage'
    ]::text[]))
);

ALTER POLICY tenant_update_stock_categories ON public.stock_categories
TO authenticated USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:edit',
      'estoque:cadastros:manage',
      'stock:edit',
      'system:global:manage'
    ]::text[]))
)
WITH CHECK (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:edit',
      'estoque:cadastros:manage',
      'stock:edit',
      'system:global:manage'
    ]::text[]))
);

ALTER POLICY tenant_delete_stock_categories ON public.stock_categories
TO authenticated USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:delete',
      'estoque:cadastros:manage',
      'stock:edit',
      'stock:delete',
      'system:global:manage'
    ]::text[]))
);

-- Consumidores consultam somente opções ativas; isto não autoriza escrita.
CREATE POLICY operational_active_lookup ON public.stock_categories
FOR SELECT TO authenticated USING (
  is_active AND company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:dashboard:view',
      'estoque:ranking:view',
      'estoque:perdas:view',
      'estoque:transferencias:view',
      'estoque:preditivo:view',
      'estoque:saldo:view',
      'estoque:movimentacoes:view',
      'estoque:simulador:view',
      'estoque:requisicoes:view',
      'estoque:catalogo:view',
      'estoque:catalogo:create',
      'estoque:catalogo:edit',
      'estoque:movimentacoes:create',
      'inventario:rapido:view',
      'inventario:rapido:create',
      'compras:pedidos:view',
      'compras:pedidos:create',
      'compras:pedidos:edit'
    ]::text[]))
);

ALTER POLICY tenant_select_stock_locations ON public.stock_locations
TO authenticated USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:view',
      'estoque:cadastros:create',
      'estoque:cadastros:edit',
      'estoque:cadastros:delete',
      'estoque:cadastros:manage',
      'stock:read',
      'stock:write',
      'stock:edit',
      'stock:delete',
      'system:global:manage'
    ]::text[]))
);

ALTER POLICY tenant_insert_stock_locations ON public.stock_locations
TO authenticated WITH CHECK (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:create',
      'estoque:cadastros:manage',
      'stock:edit',
      'stock:write',
      'system:global:manage'
    ]::text[]))
);

ALTER POLICY tenant_update_stock_locations ON public.stock_locations
TO authenticated USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:edit',
      'estoque:cadastros:manage',
      'stock:edit',
      'system:global:manage'
    ]::text[]))
)
WITH CHECK (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:edit',
      'estoque:cadastros:manage',
      'stock:edit',
      'system:global:manage'
    ]::text[]))
);

ALTER POLICY tenant_delete_stock_locations ON public.stock_locations
TO authenticated USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:delete',
      'estoque:cadastros:manage',
      'stock:edit',
      'stock:delete',
      'system:global:manage'
    ]::text[]))
);

-- Consumidores consultam somente opções ativas; isto não autoriza escrita.
CREATE POLICY operational_active_lookup ON public.stock_locations
FOR SELECT TO authenticated USING (
  is_active AND company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:catalogo:view',
      'estoque:catalogo:create',
      'estoque:catalogo:edit',
      'estoque:transferencias:view',
      'estoque:transferencias:create'
    ]::text[]))
);

ALTER POLICY tenant_select_stock_sectors ON public.stock_sectors
TO authenticated USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:view',
      'estoque:cadastros:create',
      'estoque:cadastros:edit',
      'estoque:cadastros:delete',
      'estoque:cadastros:manage',
      'stock:read',
      'stock:write',
      'stock:edit',
      'stock:delete',
      'system:global:manage'
    ]::text[]))
);

ALTER POLICY tenant_insert_stock_sectors ON public.stock_sectors
TO authenticated WITH CHECK (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:create',
      'estoque:cadastros:manage',
      'stock:edit',
      'stock:write',
      'system:global:manage'
    ]::text[]))
);

ALTER POLICY tenant_update_stock_sectors ON public.stock_sectors
TO authenticated USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:edit',
      'estoque:cadastros:manage',
      'stock:edit',
      'system:global:manage'
    ]::text[]))
)
WITH CHECK (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:edit',
      'estoque:cadastros:manage',
      'stock:edit',
      'system:global:manage'
    ]::text[]))
);

ALTER POLICY tenant_delete_stock_sectors ON public.stock_sectors
TO authenticated USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:cadastros:delete',
      'estoque:cadastros:manage',
      'stock:edit',
      'stock:delete',
      'system:global:manage'
    ]::text[]))
);

-- Consumidores consultam somente opções ativas; isto não autoriza escrita.
CREATE POLICY operational_active_lookup ON public.stock_sectors
FOR SELECT TO authenticated USING (
  is_active AND company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:movimentacoes:view',
      'estoque:movimentacoes:create',
      'estoque:movimentacoes:edit',
      'estoque:requisicoes:view',
      'estoque:requisicoes:create',
      'estoque:requisicoes:approve',
      'estoque:requisicoes:close',
      'estoque:requisicoes:manage',
      'cmv:categoria:view',
      'cmv:setor:view',
      'cmv:top-itens:view',
      'cmv:semanal:view'
    ]::text[]))
);

-- Inventário precisa resolver o turno, inclusive nas consultas com JOIN.
CREATE POLICY operational_active_lookup ON public.turnos
FOR SELECT TO authenticated USING (
  ativo AND company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'inventario:lista:view',
      'inventario:criar:create',
      'inventario:detalhe:view',
      'inventario:detalhe:edit',
      'inventario:detalhe:close'
    ]::text[]))
);

-- O seletor de cargos pertence à tela Usuários, não ao submódulo inexistente cargos.
ALTER POLICY tenant_select_job_roles ON public.job_roles
TO authenticated USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'configuracoes:usuarios:view',
      'configuracoes:usuarios:create',
      'configuracoes:usuarios:edit',
      'configuracoes:usuarios:delete',
      'configuracoes:usuarios:manage',
      'users:manage',
      'system:global:manage'
    ]::text[]))
);

NOTIFY pgrst, 'reload schema';
COMMIT;
