
-- Add clarity fields for dual-unit cost system
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS default_cost_purchase_unit NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS default_cost_base_unit NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS needs_cost_review BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing data: custo_padrao was historically per purchase_unit
-- So: default_cost_purchase_unit = custo_padrao
--     default_cost_base_unit = custo_padrao / fator_conversao_padrao
UPDATE public.produtos
SET 
  default_cost_purchase_unit = custo_padrao,
  default_cost_base_unit = CASE 
    WHEN fator_conversao_padrao > 0 THEN ROUND(custo_padrao / fator_conversao_padrao, 4)
    ELSE custo_padrao
  END,
  needs_cost_review = CASE
    WHEN custo_padrao > 0 AND fator_conversao_padrao = 1 AND unidade_compra != unidade_medida THEN true
    ELSE false
  END
WHERE custo_padrao > 0;

-- Also ensure custo_ultima_compra and custo_medio_30d are in base_unit terms
-- (they already should be from the cmv recalculation edge function)
