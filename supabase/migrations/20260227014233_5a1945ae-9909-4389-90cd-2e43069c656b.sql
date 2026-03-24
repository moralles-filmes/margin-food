
-- ============================================================
-- FASE 2: FINANCEIRO — Contas a Pagar / Receber + DRE Config
-- ============================================================

-- 1. Contas a Pagar
CREATE TABLE public.fin_contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao text NOT NULL DEFAULT '',
  valor numeric NOT NULL DEFAULT 0,
  valor_pago numeric DEFAULT 0,
  data_vencimento date NOT NULL DEFAULT CURRENT_DATE,
  data_pagamento date,
  categoria_id uuid REFERENCES public.fin_categorias(id) ON DELETE SET NULL,
  centro_custo_id uuid REFERENCES public.fin_centros_custo(id) ON DELETE SET NULL,
  conta_id uuid REFERENCES public.fin_contas(id) ON DELETE SET NULL,
  plano_contas_id uuid REFERENCES public.fin_plano_contas(id) ON DELETE SET NULL,
  fornecedor text DEFAULT '',
  forma_pagamento text DEFAULT 'boleto',
  status text NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO, AGUARDANDO_APROVACAO, APROVADO, PAGO, VENCIDO, CANCELADO
  recorrente boolean NOT NULL DEFAULT false,
  recorrencia_config jsonb DEFAULT '{}',
  parcela_atual integer,
  parcela_total integer,
  lancamento_pai_id uuid REFERENCES public.fin_contas_pagar(id) ON DELETE SET NULL,
  aprovado_por uuid,
  aprovado_em timestamptz,
  limite_aprovacao numeric DEFAULT 2500,
  observacoes text DEFAULT '',
  justificativa text DEFAULT '',
  lancamento_id uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,
  referencia_modulo text DEFAULT '',
  referencia_id text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.fin_contas_pagar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage fin_contas_pagar" ON public.fin_contas_pagar
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Financeiro can manage fin_contas_pagar" ON public.fin_contas_pagar
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'financeiro'))
  WITH CHECK (has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Compras can insert fin_contas_pagar" ON public.fin_contas_pagar
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'compras'));

CREATE POLICY "Compras can read own fin_contas_pagar" ON public.fin_contas_pagar
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'compras') AND created_by = auth.uid());

-- 2. Contas a Receber
CREATE TABLE public.fin_contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao text NOT NULL DEFAULT '',
  valor numeric NOT NULL DEFAULT 0,
  valor_recebido numeric DEFAULT 0,
  data_vencimento date NOT NULL DEFAULT CURRENT_DATE,
  data_recebimento date,
  categoria_id uuid REFERENCES public.fin_categorias(id) ON DELETE SET NULL,
  centro_custo_id uuid REFERENCES public.fin_centros_custo(id) ON DELETE SET NULL,
  conta_id uuid REFERENCES public.fin_contas(id) ON DELETE SET NULL,
  plano_contas_id uuid REFERENCES public.fin_plano_contas(id) ON DELETE SET NULL,
  cliente text DEFAULT '',
  forma_pagamento text DEFAULT 'pix',
  status text NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO, A_RECEBER, RECEBIDO, VENCIDO, CANCELADO
  recorrente boolean NOT NULL DEFAULT false,
  recorrencia_config jsonb DEFAULT '{}',
  parcela_atual integer,
  parcela_total integer,
  lancamento_pai_id uuid REFERENCES public.fin_contas_receber(id) ON DELETE SET NULL,
  observacoes text DEFAULT '',
  lancamento_id uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.fin_contas_receber ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage fin_contas_receber" ON public.fin_contas_receber
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Financeiro can manage fin_contas_receber" ON public.fin_contas_receber
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'financeiro'))
  WITH CHECK (has_role(auth.uid(), 'financeiro'));

-- 3. DRE Linhas (configuração das linhas do demonstrativo)
CREATE TABLE public.fin_dre_linhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'subtotal', -- receita, deducao, custo, despesa, subtotal, resultado
  ordem integer NOT NULL DEFAULT 0,
  formula text DEFAULT '', -- ex: "receita_bruta - deducoes" ou referência a categorias
  categorias_ids uuid[] DEFAULT '{}',
  sinal integer NOT NULL DEFAULT -1, -- 1 para somar, -1 para subtrair
  nivel integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fin_dre_linhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage fin_dre_linhas" ON public.fin_dre_linhas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Financeiro can manage fin_dre_linhas" ON public.fin_dre_linhas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'financeiro'))
  WITH CHECK (has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Authenticated can read fin_dre_linhas" ON public.fin_dre_linhas
  FOR SELECT TO authenticated
  USING (true);

-- Seed default DRE structure
INSERT INTO public.fin_dre_linhas (codigo, nome, tipo, ordem, sinal, nivel) VALUES
  ('1', 'Receita Bruta', 'receita', 1, 1, 0),
  ('2', '(-) Deduções / Taxas / Impostos', 'deducao', 2, -1, 1),
  ('3', '= Receita Líquida', 'subtotal', 3, 1, 0),
  ('4', '(-) CMV (Custo da Mercadoria Vendida)', 'custo', 4, -1, 1),
  ('5', '= Lucro Bruto', 'subtotal', 5, 1, 0),
  ('6', '(-) Despesas Operacionais', 'despesa', 6, -1, 1),
  ('7', '(-) Folha de Pagamento', 'despesa', 7, -1, 1),
  ('8', '(-) Despesas Administrativas', 'despesa', 8, -1, 1),
  ('9', '(-) Marketing e Publicidade', 'despesa', 9, -1, 1),
  ('10', '= EBITDA', 'subtotal', 10, 1, 0),
  ('11', '(-) Despesas Financeiras', 'despesa', 11, -1, 1),
  ('12', '= Resultado Líquido', 'resultado', 12, 1, 0);
