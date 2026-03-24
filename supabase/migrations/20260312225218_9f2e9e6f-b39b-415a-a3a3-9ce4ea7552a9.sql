
-- Reference table for standardized units across the system
CREATE TABLE public.unidades_medida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  simbolo text NOT NULL,
  tipo text NOT NULL, -- 'peso', 'volume', 'unidade'
  base_unit text NOT NULL, -- 'kg', 'litro', 'un'
  fator_para_base numeric NOT NULL DEFAULT 1, -- multiplier to convert to base unit
  is_manual boolean NOT NULL DEFAULT false, -- true for units like caixa, fardo
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(simbolo)
);

-- Seed standard units
INSERT INTO public.unidades_medida (nome, simbolo, tipo, base_unit, fator_para_base, is_manual) VALUES
  ('Quilograma', 'kg', 'peso', 'kg', 1, false),
  ('Grama', 'g', 'peso', 'kg', 0.001, false),
  ('Litro', 'L', 'volume', 'L', 1, false),
  ('Mililitro', 'ml', 'volume', 'L', 0.001, false),
  ('Unidade', 'un', 'unidade', 'un', 1, false),
  ('Caixa', 'cx', 'unidade', 'un', 1, true),
  ('Pacote', 'pct', 'unidade', 'un', 1, true),
  ('Saco', 'saco', 'unidade', 'un', 1, true),
  ('Fardo', 'fardo', 'unidade', 'un', 1, true),
  ('Galão', 'galao', 'volume', 'L', 1, true),
  ('Lata', 'lata', 'unidade', 'un', 1, true),
  ('Garrafa', 'garrafa', 'volume', 'L', 1, true),
  ('Sachê', 'sache', 'unidade', 'un', 1, true),
  ('Balde', 'balde', 'volume', 'L', 1, true),
  ('Bag', 'bag', 'unidade', 'un', 1, true),
  ('Bandeja', 'bandeja', 'unidade', 'un', 1, true);

-- RLS: readable by all authenticated users (reference data)
ALTER TABLE public.unidades_medida ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unidades_medida_select" ON public.unidades_medida FOR SELECT TO authenticated USING (true);
