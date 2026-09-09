-- Requisitantes precisam escolher o setor antes de abrir a lista fixa ou criar um pedido.
-- Acesso somente de leitura aos setores ativos da própria empresa; escrita mantém o RBAC atual.
CREATE POLICY requisition_read_active_stock_sectors
ON public.stock_sectors
FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.get_current_company_id())
  AND is_active
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
    'estoque:requisicoes:create',
    'estoque:requisicoes:manage'
  ]::text[]))
);
