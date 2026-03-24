
-- Create purchase_requisitions table
CREATE TABLE public.purchase_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
  tipo TEXT NOT NULL DEFAULT 'manual', -- manual | inteligente
  status TEXT NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO, EM_COTACAO, APROVADA, CONVERTIDA, CANCELADA
  observacao TEXT DEFAULT '',
  total_estimado NUMERIC DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create purchase_requisition_items table
CREATE TABLE public.purchase_requisition_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  produto_nome TEXT NOT NULL DEFAULT '',
  quantidade_sugerida NUMERIC DEFAULT 0,
  quantidade_escolhida NUMERIC DEFAULT 0,
  unidade TEXT DEFAULT 'UN',
  preco_referencia NUMERIC DEFAULT 0,
  subtotal NUMERIC DEFAULT 0,
  prioridade TEXT DEFAULT 'media',
  motivo TEXT DEFAULT '',
  is_ignored BOOLEAN NOT NULL DEFAULT false,
  ignored_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ignored_at TIMESTAMPTZ,
  ignored_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create audit table for requisition changes
CREATE TABLE public.purchase_requisition_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  campo TEXT,
  valor_anterior TEXT,
  valor_novo TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional: ignored rules for smart suggestions
CREATE TABLE public.purchase_ignored_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID REFERENCES public.produtos(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'global', -- global, unidade, fornecedor
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisition_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisition_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_ignored_rules ENABLE ROW LEVEL SECURITY;

-- RLS for purchase_requisitions
CREATE POLICY "Auth can read purchase_requisitions"
ON public.purchase_requisitions FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'compras_assistente'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'estoquista'::app_role)
);

CREATE POLICY "Auth can write purchase_requisitions"
ON public.purchase_requisitions FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'compras_assistente'::app_role)
  OR has_role(auth.uid(), 'estoquista'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'compras_assistente'::app_role)
  OR has_role(auth.uid(), 'estoquista'::app_role)
);

-- RLS for purchase_requisition_items
CREATE POLICY "Auth can read purchase_requisition_items"
ON public.purchase_requisition_items FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'compras_assistente'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'estoquista'::app_role)
);

CREATE POLICY "Auth can write purchase_requisition_items"
ON public.purchase_requisition_items FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'compras_assistente'::app_role)
  OR has_role(auth.uid(), 'estoquista'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
  OR has_role(auth.uid(), 'gerente'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'compras_assistente'::app_role)
  OR has_role(auth.uid(), 'estoquista'::app_role)
);

-- RLS for audit
CREATE POLICY "Auth can read purchase_requisition_audit"
ON public.purchase_requisition_audit FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'diretor'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
);

CREATE POLICY "Auth can insert purchase_requisition_audit"
ON public.purchase_requisition_audit FOR INSERT TO authenticated
WITH CHECK (true);

-- RLS for ignored rules
CREATE POLICY "Auth can manage purchase_ignored_rules"
ON public.purchase_ignored_rules FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'compras'::app_role)
  OR has_role(auth.uid(), 'gerente_geral'::app_role)
);

-- Auto-generate codigo
CREATE OR REPLACE FUNCTION public.generate_requisition_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  v_year := to_char(now(), 'YYYY');
  SELECT COUNT(*) + 1 INTO v_count FROM purchase_requisitions WHERE codigo LIKE 'REQ-' || v_year || '-%';
  NEW.codigo := 'REQ-' || v_year || '-' || lpad(v_count::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_generate_requisition_code
BEFORE INSERT ON public.purchase_requisitions
FOR EACH ROW
WHEN (NEW.codigo = '' OR NEW.codigo IS NULL)
EXECUTE FUNCTION public.generate_requisition_code();

-- Update updated_at trigger
CREATE TRIGGER tr_purchase_requisitions_updated
BEFORE UPDATE ON public.purchase_requisitions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_purchase_requisition_items_updated
BEFORE UPDATE ON public.purchase_requisition_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
