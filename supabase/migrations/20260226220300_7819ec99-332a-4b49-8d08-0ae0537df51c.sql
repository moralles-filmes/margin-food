
-- ==============================
-- REQUISIÇÕES DE ESTOQUE (interno)
-- ==============================
CREATE TABLE public.requisicoes_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setor text NOT NULL,
  solicitante_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'SOLICITADA',
  observacao text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  atendido_por uuid,
  atendido_em timestamptz
);

ALTER TABLE public.requisicoes_estoque ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.requisicao_estoque_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisicao_id uuid NOT NULL REFERENCES public.requisicoes_estoque(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  quantidade_solicitada numeric NOT NULL DEFAULT 0,
  quantidade_atendida numeric NOT NULL DEFAULT 0,
  unidade text NOT NULL DEFAULT 'UN',
  saldo_snapshot numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.requisicao_estoque_itens ENABLE ROW LEVEL SECURITY;

-- ==============================
-- SOLICITAÇÕES DE COMPRA (auto-gerada por falta de estoque)
-- ==============================
CREATE TABLE public.solicitacoes_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  quantidade_solicitada numeric NOT NULL DEFAULT 0,
  unidade text NOT NULL DEFAULT 'UN',
  setor_solicitante text NOT NULL,
  solicitante_user_id uuid NOT NULL,
  motivo text DEFAULT 'Solicitação interna sem estoque',
  status text NOT NULL DEFAULT 'PENDENTE_COMPRAS',
  saldo_no_momento numeric NOT NULL DEFAULT 0,
  requisicao_ref text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.solicitacoes_compra ENABLE ROW LEVEL SECURITY;

-- ==============================
-- RLS: REQUISICOES_ESTOQUE
-- ==============================
-- Solicitante pode ver suas próprias requisições
CREATE POLICY "Solicitantes can read own requisicoes"
ON public.requisicoes_estoque FOR SELECT
TO authenticated
USING (solicitante_user_id = auth.uid());

-- Masters, gerente, compras podem ver todas
CREATE POLICY "Authorized can read all requisicoes"
ON public.requisicoes_estoque FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'diretor'::app_role) OR
  has_role(auth.uid(), 'gerente_geral'::app_role) OR
  has_role(auth.uid(), 'gerente'::app_role) OR
  has_role(auth.uid(), 'compras'::app_role)
);

-- Qualquer autenticado pode inserir (edge function valida RBAC)
CREATE POLICY "Authenticated can insert requisicoes"
ON public.requisicoes_estoque FOR INSERT
TO authenticated
WITH CHECK (solicitante_user_id = auth.uid());

-- Gerente/admin podem atualizar (atender/negar)
CREATE POLICY "Authorized can update requisicoes"
ON public.requisicoes_estoque FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'diretor'::app_role) OR
  has_role(auth.uid(), 'gerente_geral'::app_role) OR
  has_role(auth.uid(), 'gerente'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'diretor'::app_role) OR
  has_role(auth.uid(), 'gerente_geral'::app_role) OR
  has_role(auth.uid(), 'gerente'::app_role)
);

-- Solicitante pode cancelar própria (delete se SOLICITADA)
CREATE POLICY "Solicitante can delete own pending requisicao"
ON public.requisicoes_estoque FOR DELETE
TO authenticated
USING (solicitante_user_id = auth.uid() AND status = 'SOLICITADA');

-- ==============================
-- RLS: REQUISICAO_ESTOQUE_ITENS
-- ==============================
CREATE POLICY "Can read requisicao_itens via requisicao"
ON public.requisicao_estoque_itens FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.requisicoes_estoque r
    WHERE r.id = requisicao_id AND (
      r.solicitante_user_id = auth.uid() OR
      has_role(auth.uid(), 'admin'::app_role) OR
      has_role(auth.uid(), 'diretor'::app_role) OR
      has_role(auth.uid(), 'gerente_geral'::app_role) OR
      has_role(auth.uid(), 'gerente'::app_role) OR
      has_role(auth.uid(), 'compras'::app_role)
    )
  )
);

CREATE POLICY "Authenticated can insert requisicao_itens"
ON public.requisicao_estoque_itens FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.requisicoes_estoque r
    WHERE r.id = requisicao_id AND r.solicitante_user_id = auth.uid()
  )
);

CREATE POLICY "Authorized can update requisicao_itens"
ON public.requisicao_estoque_itens FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.requisicoes_estoque r
    WHERE r.id = requisicao_id AND (
      has_role(auth.uid(), 'admin'::app_role) OR
      has_role(auth.uid(), 'gerente'::app_role) OR
      has_role(auth.uid(), 'gerente_geral'::app_role)
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.requisicoes_estoque r
    WHERE r.id = requisicao_id AND (
      has_role(auth.uid(), 'admin'::app_role) OR
      has_role(auth.uid(), 'gerente'::app_role) OR
      has_role(auth.uid(), 'gerente_geral'::app_role)
    )
  )
);

-- ==============================
-- RLS: SOLICITACOES_COMPRA
-- ==============================
-- Solicitante pode ver suas próprias
CREATE POLICY "Solicitante can read own solicitacoes_compra"
ON public.solicitacoes_compra FOR SELECT
TO authenticated
USING (solicitante_user_id = auth.uid());

-- Compras/admin podem ver todas
CREATE POLICY "Compras can read all solicitacoes_compra"
ON public.solicitacoes_compra FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'diretor'::app_role) OR
  has_role(auth.uid(), 'gerente_geral'::app_role) OR
  has_role(auth.uid(), 'compras'::app_role) OR
  has_role(auth.uid(), 'compras_assistente'::app_role)
);

-- Autenticado pode inserir (edge function valida)
CREATE POLICY "Authenticated can insert solicitacoes_compra"
ON public.solicitacoes_compra FOR INSERT
TO authenticated
WITH CHECK (solicitante_user_id = auth.uid());

-- Compras pode atualizar status
CREATE POLICY "Compras can update solicitacoes_compra"
ON public.solicitacoes_compra FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'compras'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'compras'::app_role)
);

-- ==============================
-- FUNCTION: calcular saldo teórico de um produto
-- ==============================
CREATE OR REPLACE FUNCTION public.get_saldo_produto(p_produto_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    SUM(
      CASE
        WHEN tipo IN ('ENTRADA', 'AJUSTE') THEN quantidade
        ELSE -quantidade
      END
    ), 0
  )
  FROM movimentacoes_estoque
  WHERE produto_id = p_produto_id
$$;
