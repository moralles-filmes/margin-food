-- ============================================================
-- Cadastro de Setores (Controle de Estoque -> Cadastros)
--
-- Substitui as listas de setor hardcoded no código (SETORES em
-- NovaMovimentacaoModal, MovimentacoesSection, RequisicaoEstoqueSection,
-- RequisicaoListaFixa, ListaFixaSetorAdmin, CmvFiltersBar) por uma
-- tabela multi-tenant editável em Controle de Estoque -> Cadastros,
-- seguindo o mesmo padrão de stock_categories/stock_locations.
-- ============================================================

CREATE TABLE public.stock_sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL DEFAULT get_current_company_id() REFERENCES public.companies(id),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON TABLE public.stock_sectors TO authenticated, service_role;

-- Case-insensitive unique name per empresa (apenas entre setores ativos)
CREATE UNIQUE INDEX stock_sectors_name_unique ON public.stock_sectors (company_id, lower(name)) WHERE is_active = true;
CREATE INDEX idx_stock_sectors_company_id ON public.stock_sectors (company_id);

ALTER TABLE public.stock_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_sectors FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select_stock_sectors" ON public.stock_sectors
  FOR SELECT TO authenticated
  USING (
    company_id = (select get_current_company_id())
    AND (select has_any_permission(auth.uid(), ARRAY['estoque:setores:view', 'stock:read', 'system:global:manage']))
  );

CREATE POLICY "tenant_insert_stock_sectors" ON public.stock_sectors
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (select get_current_company_id())
    AND (select has_any_permission(auth.uid(), ARRAY['estoque:setores:create', 'stock:edit', 'system:global:manage']))
  );

CREATE POLICY "tenant_update_stock_sectors" ON public.stock_sectors
  FOR UPDATE TO authenticated
  USING (
    company_id = (select get_current_company_id())
    AND (select has_any_permission(auth.uid(), ARRAY['estoque:setores:edit', 'stock:edit', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (select get_current_company_id())
  );

CREATE POLICY "tenant_delete_stock_sectors" ON public.stock_sectors
  FOR DELETE TO authenticated
  USING (
    company_id = (select get_current_company_id())
    AND (select has_any_permission(auth.uid(), ARRAY['estoque:setores:delete', 'stock:edit', 'system:global:manage']))
  );

CREATE TRIGGER stock_sectors_updated_at
  BEFORE UPDATE ON public.stock_sectors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_block_placeholder_company
  BEFORE INSERT OR UPDATE ON public.stock_sectors
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_placeholder_company();

-- Backfill: semeia os 8 setores hoje hardcoded no código para toda empresa
-- ativa existente, preservando o comportamento atual dos pickers até que
-- cada empresa personalize sua lista em Cadastros.
INSERT INTO public.stock_sectors (company_id, name, sort_order, is_active)
SELECT c.id, v.name, v.ord, true
FROM public.companies c
CROSS JOIN (VALUES
  ('Cozinha', 1), ('Salão', 2), ('Limpeza', 3), ('Sushi', 4),
  ('Peixaria', 5), ('Copa', 6), ('Administrativo', 7), ('Delivery', 8)
) AS v(name, ord)
WHERE c.ativo = true
  AND c.id <> '00000000-0000-0000-0000-000000000001'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM public.stock_sectors s WHERE s.company_id = c.id AND lower(s.name) = lower(v.name)
  );

NOTIFY pgrst, 'reload schema';
