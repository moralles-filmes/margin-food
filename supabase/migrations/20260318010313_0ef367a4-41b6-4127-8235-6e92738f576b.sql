
-- ═══════════════════════════════════════════════════════
-- Fixed Lists per Sector for Stock Requisitions
-- ═══════════════════════════════════════════════════════

-- Main table: one active list per sector per tenant
CREATE TABLE public.listas_fixas_setor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  setor text NOT NULL,
  nome text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_by uuid,
  UNIQUE (company_id, setor)
);

-- Items within a fixed list
CREATE TABLE public.listas_fixas_setor_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  lista_fixa_id uuid NOT NULL REFERENCES public.listas_fixas_setor(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  ordem int NOT NULL DEFAULT 0,
  observacao text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lista_fixa_id, produto_id)
);

-- Enable RLS
ALTER TABLE public.listas_fixas_setor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_fixas_setor_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_fixas_setor FORCE ROW LEVEL SECURITY;
ALTER TABLE public.listas_fixas_setor_itens FORCE ROW LEVEL SECURITY;

-- SELECT: anyone with requisicoes:view or manage can read
CREATE POLICY listas_fixas_setor_select ON public.listas_fixas_setor
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'estoque:requisicoes:view',
      'estoque:requisicoes:create',
      'estoque:requisicoes:manage',
      'system:global:manage'
    ])
  );

CREATE POLICY listas_fixas_setor_itens_select ON public.listas_fixas_setor_itens
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'estoque:requisicoes:view',
      'estoque:requisicoes:create',
      'estoque:requisicoes:manage',
      'system:global:manage'
    ])
  );

-- INSERT/UPDATE/DELETE: only manage permission
CREATE POLICY listas_fixas_setor_insert ON public.listas_fixas_setor
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'estoque:requisicoes:manage',
      'system:global:manage'
    ])
  );

CREATE POLICY listas_fixas_setor_update ON public.listas_fixas_setor
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'estoque:requisicoes:manage',
      'system:global:manage'
    ])
  )
  WITH CHECK (company_id = get_current_company_id());

CREATE POLICY listas_fixas_setor_delete ON public.listas_fixas_setor
  FOR DELETE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'estoque:requisicoes:manage',
      'system:global:manage'
    ])
  );

CREATE POLICY listas_fixas_setor_itens_insert ON public.listas_fixas_setor_itens
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'estoque:requisicoes:manage',
      'system:global:manage'
    ])
  );

CREATE POLICY listas_fixas_setor_itens_update ON public.listas_fixas_setor_itens
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'estoque:requisicoes:manage',
      'system:global:manage'
    ])
  )
  WITH CHECK (company_id = get_current_company_id());

CREATE POLICY listas_fixas_setor_itens_delete ON public.listas_fixas_setor_itens
  FOR DELETE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'estoque:requisicoes:manage',
      'system:global:manage'
    ])
  );

-- Indexes
CREATE INDEX idx_listas_fixas_setor_company ON public.listas_fixas_setor(company_id);
CREATE INDEX idx_listas_fixas_setor_itens_lista ON public.listas_fixas_setor_itens(lista_fixa_id);
CREATE INDEX idx_listas_fixas_setor_itens_company ON public.listas_fixas_setor_itens(company_id);
