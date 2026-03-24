
-- ════════════════════════════════════════════════════════════
-- Table: alertas_falta_estoque
-- Stores operational alerts for out-of-stock items from requisitions.
-- NOT a purchase order. Purely informational alert.
-- ════════════════════════════════════════════════════════════

CREATE TABLE public.alertas_falta_estoque (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  produto_nome TEXT NOT NULL DEFAULT '',
  quantidade_solicitada NUMERIC NOT NULL DEFAULT 0,
  unidade TEXT NOT NULL DEFAULT 'UN',
  saldo_no_momento NUMERIC NOT NULL DEFAULT 0,
  requisicao_id UUID REFERENCES public.requisicoes_estoque(id),
  requisicao_item_id UUID NULL,
  setor_solicitante TEXT NOT NULL DEFAULT '',
  origem TEXT NOT NULL DEFAULT 'REQUISICAO_ESTOQUE',
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  confirmado_por UUID NULL,
  confirmado_em TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,

  -- Idempotency: prevent duplicate alerts for same item+requisicao
  CONSTRAINT uq_alerta_falta_item_req UNIQUE (requisicao_id, produto_id)
);

-- Force RLS
ALTER TABLE public.alertas_falta_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_falta_estoque FORCE ROW LEVEL SECURITY;

-- Tenant isolation: SELECT
CREATE POLICY "alertas_falta_select" ON public.alertas_falta_estoque
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND (
      public.has_permission(auth.uid(), 'compras:alertas_falta:view')
      OR public.has_permission(auth.uid(), 'compras:pedidos:view')
      OR public.has_permission(auth.uid(), 'system:global:manage')
    )
  );

-- Tenant isolation: INSERT (only via edge function / service role, but policy for safety)
CREATE POLICY "alertas_falta_insert" ON public.alertas_falta_estoque
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- Tenant isolation: UPDATE (confirm action)
CREATE POLICY "alertas_falta_update" ON public.alertas_falta_estoque
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND (
      public.has_permission(auth.uid(), 'compras:alertas_falta:approve')
      OR public.has_permission(auth.uid(), 'compras:pedidos:edit')
      OR public.has_permission(auth.uid(), 'system:global:manage')
    )
  )
  WITH CHECK (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- No DELETE (soft approach - alerts stay for audit)
CREATE POLICY "alertas_falta_no_delete" ON public.alertas_falta_estoque
  FOR DELETE TO authenticated
  USING (false);

-- Index for common queries
CREATE INDEX idx_alertas_falta_company_status ON public.alertas_falta_estoque(company_id, status);
CREATE INDEX idx_alertas_falta_requisicao ON public.alertas_falta_estoque(requisicao_id);

-- Trigger to force company_id
CREATE OR REPLACE FUNCTION public.trg_force_company_alertas_falta()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.company_id IS NULL OR NEW.company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'company_id inválido para alertas_falta_estoque';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_alertas_falta_company_guard
  BEFORE INSERT OR UPDATE ON public.alertas_falta_estoque
  FOR EACH ROW EXECUTE FUNCTION public.trg_force_company_alertas_falta();
