-- =========================================================
-- FIX: Alinhar cálculo do saldo cacheado com a RPC attend_requisicao_item_atomic
-- Data: 2026-03-31
-- Problema: fn_recompute_product_saldo ignorava estornos (ENTRADA_ESTORNO/SAIDA_ESTORNO),
--   mas a RPC contava todas as movimentações por direction, causando divergência.
-- =========================================================

-- 1. Corrigir a função de recomputação para usar a mesma lógica da RPC
CREATE OR REPLACE FUNCTION public.fn_recompute_product_saldo(p_id uuid, p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_company = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RETURN;
  END IF;

  UPDATE public.produtos
  SET saldo_atual = (
    SELECT ROUND(COALESCE(SUM(
      CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END
    ), 0), 4)
    FROM public.movimentacoes_estoque m
    WHERE m.produto_id = p_id AND m.status = 'ATIVO' AND m.company_id = p_company
  )
  WHERE id = p_id AND company_id = p_company;
END;
$$;

-- 2. Recomputar todos os saldos para corrigir divergências existentes
DO $$
DECLARE
  prod_record RECORD;
BEGIN
  FOR prod_record IN
    SELECT id, company_id FROM public.produtos
    WHERE ativo = true
    AND company_id != '00000000-0000-0000-0000-000000000001'::uuid
  LOOP
    PERFORM public.fn_recompute_product_saldo(prod_record.id, prod_record.company_id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
