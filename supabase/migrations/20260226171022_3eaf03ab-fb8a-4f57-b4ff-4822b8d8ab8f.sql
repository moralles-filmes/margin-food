
-- Add origem field to BOM items to distinguish salmon from general stock
ALTER TABLE public.ficha_componente_itens ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'ESTOQUE_GERAL';

-- Add salmon-specific metadata
ALTER TABLE public.ficha_componente_itens ADD COLUMN IF NOT EXISTS unidade_original text DEFAULT '';
ALTER TABLE public.ficha_componente_itens ADD COLUMN IF NOT EXISTS quantidade_original numeric DEFAULT 0;
