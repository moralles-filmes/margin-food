
-- Inventarios table
CREATE TABLE public.inventarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('completo', 'parcial', 'ciclico')),
  status text NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'EM_CONTAGEM', 'EM_REVISAO', 'FINALIZADO')),
  data date NOT NULL DEFAULT CURRENT_DATE,
  hora time NOT NULL DEFAULT CURRENT_TIME,
  categorias text[] DEFAULT '{}',
  responsavel_user_id uuid NOT NULL,
  observacao text DEFAULT '',
  finalizado_em timestamptz,
  finalizado_por uuid,
  acuracia_percent numeric DEFAULT 0,
  drift_total_valor numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventarios ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated
CREATE POLICY "Authenticated can read inventarios"
  ON public.inventarios FOR SELECT TO authenticated
  USING (true);

-- Insert: admin or compras
CREATE POLICY "Admin or Compras can insert inventarios"
  ON public.inventarios FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'compras'::app_role)
  );

-- Update: admin or compras (no update after FINALIZADO enforced in app)
CREATE POLICY "Admin or Compras can update inventarios"
  ON public.inventarios FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'compras'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'compras'::app_role)
  );

-- No delete policy (deny by default)

-- Inventario itens table
CREATE TABLE public.inventario_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id uuid NOT NULL REFERENCES public.inventarios(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id),
  tipo_item text NOT NULL DEFAULT 'geral' CHECK (tipo_item IN ('geral', 'salmao')),
  lote_id text DEFAULT '',
  saldo_teorico numeric NOT NULL DEFAULT 0,
  contagem_fisica numeric,
  diferenca_qtd numeric DEFAULT 0,
  diferenca_percent numeric DEFAULT 0,
  custo_snapshot numeric NOT NULL DEFAULT 0,
  impacto_financeiro numeric DEFAULT 0,
  classificacao text DEFAULT 'NORMAL' CHECK (classificacao IN ('NORMAL', 'ALERTA', 'CRITICO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventario_itens ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated
CREATE POLICY "Authenticated can read inventario_itens"
  ON public.inventario_itens FOR SELECT TO authenticated
  USING (true);

-- Insert: admin, compras, operador (operador can count)
CREATE POLICY "Authorized can insert inventario_itens"
  ON public.inventario_itens FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'compras'::app_role) OR
    has_role(auth.uid(), 'operador'::app_role)
  );

-- Update: admin, compras, operador
CREATE POLICY "Authorized can update inventario_itens"
  ON public.inventario_itens FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'compras'::app_role) OR
    has_role(auth.uid(), 'operador'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'compras'::app_role) OR
    has_role(auth.uid(), 'operador'::app_role)
  );

-- No delete on itens (deny by default)
