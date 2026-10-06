-- ── Fornecedores (suppliers): cadastro compartilhado entre Compras e Financeiro ──
-- A tabela é uma só: o que se cadastra em Compras aparece no Financeiro e
-- vice-versa. Até aqui a RLS só aceitava chaves de Compras, então quem é só
-- do Financeiro via a lista de fornecedores vazia em Contas a Pagar e na
-- Conciliação, e o "Cadastrar fornecedor" do formulário do boleto era recusado.
--
-- Mantém as chaves de Compras e acrescenta as do Financeiro:
--   * ler: Cadastros Base (financeiro:cadastros:view) e as telas que escolhem
--     o fornecedor do título/lançamento (financeiro:pagar:view,
--     financeiro:conciliacao:view), mais o legado finance:read;
--   * criar/editar/excluir: financeiro:cadastros:create/edit/delete (Financeiro
--     → Cadastros Base → Fornecedores). O legado finance:manage vale para criar
--     e editar, nunca para excluir: ele não expande para financeiro:cadastros:delete
--     no LEGACY_PERMISSION_MAP (e finance:delete não existe no banco).
-- A exclusão física continua barrada por FK quando o fornecedor já está em
-- conta a pagar/receber ou preço cadastrado; a tela orienta desativar.
-- Nenhuma chave nova: todas já existem em src/permissions/registry.ts.
--
-- ALTER POLICY preserva os nomes (o pacote do release F12 e os catálogos de
-- auditoria referenciam "compras:fornecedores:view suppliers" pelo nome).
-- A policy RESTRICTIVE multiunit_scope_boundary continua valendo por cima.

ALTER POLICY "compras:fornecedores:view suppliers" ON public.suppliers
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY[
      'compras:fornecedores:view', 'compras:lista:view', 'compras:pedidos:view',
      'financeiro:cadastros:view', 'financeiro:pagar:view', 'financeiro:conciliacao:view', 'finance:read',
      'system:global:manage'
    ]))
  );

ALTER POLICY suppliers_perm_insert ON public.suppliers
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY[
      'compras:fornecedores:create', 'financeiro:cadastros:create', 'finance:manage', 'system:global:manage'
    ]))
  );

ALTER POLICY suppliers_perm_update ON public.suppliers
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY[
      'compras:fornecedores:edit', 'financeiro:cadastros:edit', 'finance:manage', 'system:global:manage'
    ]))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
  );

ALTER POLICY suppliers_perm_delete ON public.suppliers
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY[
      'compras:fornecedores:delete', 'financeiro:cadastros:delete', 'system:global:manage'
    ]))
  );
