
-- Table: recebimentos (receiving records for solicitations)
CREATE TABLE public.recebimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.solic_compra_mercado(id),
  status text NOT NULL DEFAULT 'AGUARDANDO_RECEBIMENTO',
  recebido_por uuid,
  recebido_em timestamptz,
  observacoes text DEFAULT '',
  enviar_ao_estoque boolean DEFAULT false,
  estoque_atualizado_em timestamptz,
  estoque_atualizado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table: recebimento_itens (per-item receiving details)
CREATE TABLE public.recebimento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recebimento_id uuid NOT NULL REFERENCES public.recebimentos(id),
  item_id uuid NOT NULL REFERENCES public.solic_compra_mercado_item(id),
  produto_id uuid REFERENCES public.produtos(id),
  qtd_solicitada numeric NOT NULL DEFAULT 0,
  qtd_comprada numeric NOT NULL DEFAULT 0,
  qtd_recebida numeric DEFAULT NULL,
  status_item text NOT NULL DEFAULT 'AGUARDANDO',
  divergencia_tipo text DEFAULT NULL,
  divergencia_nota text DEFAULT '',
  recebido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table: confirmacoes_recebimento (confirmation feed)
CREATE TABLE public.confirmacoes_recebimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recebimento_id uuid NOT NULL REFERENCES public.recebimentos(id),
  solicitacao_id uuid NOT NULL REFERENCES public.solic_compra_mercado(id),
  mensagem text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid NOT NULL,
  visto_por uuid[] DEFAULT '{}'::uuid[],
  responsavel_compra_id uuid
);

-- Enable RLS
ALTER TABLE public.recebimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confirmacoes_recebimento ENABLE ROW LEVEL SECURITY;

-- RLS: recebimentos
CREATE POLICY "Authenticated can read recebimentos" ON public.recebimentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin or Compras can manage recebimentos" ON public.recebimentos FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role));

-- RLS: recebimento_itens
CREATE POLICY "Authenticated can read recebimento_itens" ON public.recebimento_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin or Compras can manage recebimento_itens" ON public.recebimento_itens FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role));

-- RLS: confirmacoes_recebimento
CREATE POLICY "Authenticated can read confirmacoes" ON public.confirmacoes_recebimento FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin or Compras or Assistente can manage confirmacoes" ON public.confirmacoes_recebimento FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role) OR has_role(auth.uid(), 'compras_assistente'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role) OR has_role(auth.uid(), 'compras_assistente'::app_role));
