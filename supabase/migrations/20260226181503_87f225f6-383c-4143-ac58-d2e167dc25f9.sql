
CREATE TABLE public.config_precificacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preco_referencia_salmao_manual numeric DEFAULT NULL,
  preco_referencia_salmao_auto numeric DEFAULT NULL,
  origem_preco_salmao text DEFAULT 'manual',
  ultimo_lote_info text DEFAULT '',
  updated_by uuid DEFAULT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.config_precificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read config_precificacao"
  ON public.config_precificacao FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin or Compras can manage config_precificacao"
  ON public.config_precificacao FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'compras'::app_role));

-- Insert default row
INSERT INTO public.config_precificacao (preco_referencia_salmao_manual, origem_preco_salmao)
VALUES (NULL, 'manual');
