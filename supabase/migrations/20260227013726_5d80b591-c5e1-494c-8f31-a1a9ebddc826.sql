
-- ============================================================
-- FASE 1: FINANCEIRO — Tabelas Core
-- ============================================================

-- 1. Plano de Contas (hierárquico)
CREATE TABLE public.fin_plano_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'despesa', -- receita, despesa, ativo, passivo, patrimonio
  natureza text NOT NULL DEFAULT 'operacional', -- operacional, financeira, nao_operacional
  pai_id uuid REFERENCES public.fin_plano_contas(id) ON DELETE SET NULL,
  nivel integer NOT NULL DEFAULT 1,
  linha_dre text DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.fin_plano_contas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage fin_plano_contas" ON public.fin_plano_contas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Financeiro can manage fin_plano_contas" ON public.fin_plano_contas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'financeiro'))
  WITH CHECK (has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Authenticated can read fin_plano_contas" ON public.fin_plano_contas
  FOR SELECT TO authenticated
  USING (true);

-- 2. Categorias Financeiras
CREATE TABLE public.fin_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'despesa', -- receita, despesa
  grupo text DEFAULT '',
  plano_contas_id uuid REFERENCES public.fin_plano_contas(id) ON DELETE SET NULL,
  linha_dre text DEFAULT '',
  regra_sugestao text DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.fin_categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage fin_categorias" ON public.fin_categorias
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Financeiro can manage fin_categorias" ON public.fin_categorias
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'financeiro'))
  WITH CHECK (has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Authenticated can read fin_categorias" ON public.fin_categorias
  FOR SELECT TO authenticated
  USING (true);

-- 3. Centros de Custo
CREATE TABLE public.fin_centros_custo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.fin_centros_custo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage fin_centros_custo" ON public.fin_centros_custo
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Financeiro can manage fin_centros_custo" ON public.fin_centros_custo
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'financeiro'))
  WITH CHECK (has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Authenticated can read fin_centros_custo" ON public.fin_centros_custo
  FOR SELECT TO authenticated
  USING (true);

-- 4. Contas Bancárias / Caixas
CREATE TABLE public.fin_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'corrente', -- corrente, poupanca, caixa_fisico, maquininha
  banco text DEFAULT '',
  agencia text DEFAULT '',
  numero_conta text DEFAULT '',
  saldo_inicial numeric NOT NULL DEFAULT 0,
  data_saldo_inicial date NOT NULL DEFAULT CURRENT_DATE,
  moeda text NOT NULL DEFAULT 'BRL',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.fin_contas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage fin_contas" ON public.fin_contas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Financeiro can manage fin_contas" ON public.fin_contas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'financeiro'))
  WITH CHECK (has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Authenticated can read fin_contas" ON public.fin_contas
  FOR SELECT TO authenticated
  USING (true);

-- 5. Lançamentos Financeiros (Ledger)
CREATE TABLE public.fin_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'DESPESA', -- RECEITA, DESPESA, TRANSFERENCIA
  valor numeric NOT NULL DEFAULT 0,
  data_competencia date NOT NULL DEFAULT CURRENT_DATE,
  data_pagamento date,
  categoria_id uuid REFERENCES public.fin_categorias(id) ON DELETE SET NULL,
  plano_contas_id uuid REFERENCES public.fin_plano_contas(id) ON DELETE SET NULL,
  centro_custo_id uuid REFERENCES public.fin_centros_custo(id) ON DELETE SET NULL,
  conta_id uuid REFERENCES public.fin_contas(id) ON DELETE SET NULL,
  conta_destino_id uuid REFERENCES public.fin_contas(id) ON DELETE SET NULL, -- para transferências
  forma_pagamento text DEFAULT 'pix', -- pix, boleto, dinheiro, cartao, transferencia
  status text NOT NULL DEFAULT 'PREVISTO', -- PREVISTO, REALIZADO, CANCELADO
  descricao text DEFAULT '',
  observacoes text DEFAULT '',
  justificativa_edicao text DEFAULT '',
  tags text[] DEFAULT '{}',
  recorrente boolean NOT NULL DEFAULT false,
  recorrencia_config jsonb DEFAULT '{}',
  parcela_atual integer DEFAULT NULL,
  parcela_total integer DEFAULT NULL,
  lancamento_pai_id uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,
  referencia_modulo text DEFAULT '', -- compras, rh, etc.
  referencia_id text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.fin_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage fin_lancamentos" ON public.fin_lancamentos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Financeiro can manage fin_lancamentos" ON public.fin_lancamentos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'financeiro'))
  WITH CHECK (has_role(auth.uid(), 'financeiro'));

CREATE POLICY "Compras can insert fin_lancamentos" ON public.fin_lancamentos
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'compras'));

CREATE POLICY "Compras can read own fin_lancamentos" ON public.fin_lancamentos
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'compras') AND created_by = auth.uid());

-- 6. Audit Log Financeiro
CREATE TABLE public.fin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade text NOT NULL, -- lancamento, categoria, plano_contas, conta, etc.
  entidade_id uuid,
  acao text NOT NULL, -- criar, editar, excluir, conciliar, aprovar, exportar
  antes jsonb,
  depois jsonb,
  justificativa text DEFAULT '',
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can insert fin_audit" ON public.fin_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Masters can read fin_audit" ON public.fin_audit_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Financeiro can read fin_audit" ON public.fin_audit_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'financeiro'));

-- Seed default centros de custo para restaurante
INSERT INTO public.fin_centros_custo (nome, descricao) VALUES
  ('Cozinha', 'Centro de custo da cozinha quente'),
  ('Sushi', 'Centro de custo do sushi/cozinha fria'),
  ('Salão', 'Centro de custo do salão e atendimento'),
  ('Limpeza', 'Centro de custo de limpeza'),
  ('Copa', 'Centro de custo da copa'),
  ('Administrativo', 'Centro de custo administrativo'),
  ('Marketing', 'Centro de custo de marketing e divulgação'),
  ('Delivery', 'Centro de custo de delivery');
