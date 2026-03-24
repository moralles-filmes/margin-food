
-- Add cost tracking fields to produtos for last purchase and avg30 data
ALTER TABLE public.produtos
ADD COLUMN IF NOT EXISTS last_cost_purchase_unit NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_cost_base_unit NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_purchase_date TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_supplier TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS avg30_cost_base_unit NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg30_cost_purchase_unit NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg30_variation_percent NUMERIC NOT NULL DEFAULT 0;

-- Seed last_cost from custo_ultima_compra if it exists
UPDATE public.produtos
SET 
  last_cost_base_unit = CASE WHEN custo_ultima_compra > 0 THEN custo_ultima_compra ELSE 0 END,
  last_cost_purchase_unit = CASE WHEN custo_ultima_compra > 0 AND fator_conversao_padrao > 0 THEN custo_ultima_compra * fator_conversao_padrao ELSE 0 END
WHERE custo_ultima_compra > 0;

-- Seed avg30 from custo_medio_30d if it exists
UPDATE public.produtos
SET 
  avg30_cost_base_unit = CASE WHEN custo_medio_30d > 0 THEN custo_medio_30d ELSE 0 END,
  avg30_cost_purchase_unit = CASE WHEN custo_medio_30d > 0 AND fator_conversao_padrao > 0 THEN custo_medio_30d * fator_conversao_padrao ELSE 0 END
WHERE custo_medio_30d > 0;
