-- Manipulação (e Dashboard/Estoque/Planejamento/Metas do Salmão) precisa LER
-- salmon_entries: é de lá que saem lote, SIF, saldo e custo/kg do lote.
-- Com a policy antiga exigindo salmon:entradas:view, um operador que só tem
-- salmon:manipulacao:view/create recebia 0 linhas e a tela mostrava
-- "Nenhum lote disponível em estoque" mesmo com entrada ativa no estoque.
-- Leitura apenas — create/edit/delete de entradas seguem exigindo salmon:entradas:*.

DROP POLICY IF EXISTS salmon_tenant_select ON public.salmon_entries;

CREATE POLICY salmon_tenant_select ON public.salmon_entries
  FOR SELECT TO authenticated
  USING (
    company_id = (select get_current_company_id())
    AND (select has_any_permission(auth.uid(), ARRAY[
      'salmon:entradas:view',
      'salmon:read',
      'salmon:manipulacao:view',
      'salmon:estoque:view',
      'salmon:dashboard:view',
      'salmon:planejamento:view',
      'salmon:metas:view',
      'system:global:manage'
    ]::text[]))
  );
