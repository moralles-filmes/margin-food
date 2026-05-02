-- Backfill default_cost_base_unit for dual-unit products where it was left as 0.
-- These products had custo_padrao stored per purchase unit (e.g. R$89/Galão) but
-- default_cost_base_unit never got populated (imported catalog or pre-dual-unit code paths).
-- Inventory snapshots fell back to custo_padrao and treated it as R$/base-unit, inflating
-- impacto_financeiro by fator_conversao_padrao (e.g. ×20 for Galão=20L).
UPDATE produtos
SET
  default_cost_base_unit = ROUND(custo_padrao / fator_conversao_padrao, 4),
  needs_cost_review = true
WHERE default_cost_base_unit = 0
  AND custo_padrao > 0
  AND fator_conversao_padrao > 0;
