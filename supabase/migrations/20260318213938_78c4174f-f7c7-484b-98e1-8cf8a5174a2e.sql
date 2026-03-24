
-- Fix movements with custo_unitario = 0 that have a known product cost
UPDATE public.movimentacoes_estoque me
SET custo_unitario = p.default_cost_base_unit
FROM public.produtos p
WHERE me.produto_id = p.id
  AND me.status = 'ATIVO'
  AND me.custo_unitario = 0
  AND p.default_cost_base_unit > 0;
