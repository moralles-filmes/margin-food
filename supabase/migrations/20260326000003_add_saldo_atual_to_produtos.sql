-- =========================================================
-- OTIMIZAÇÃO DE PERFORMANCE: SALDO DE ESTOQUE CACHEADO
-- Data: 2026-03-26
-- Objetivo: Evitar timeout ao calcular saldo via agregação
-- =========================================================

-- 1. FUNÇÃO AUXILIAR PARA RECOMPUTAR SALDO (DEFINIR PRIMEIRO)
CREATE OR REPLACE FUNCTION public.fn_recompute_product_saldo(p_id uuid, p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Ignorar placeholders conhecidos que travam gatilhos de segurança
  IF p_company = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RETURN;
  END IF;

  UPDATE public.produtos
  SET saldo_atual = (
    SELECT ROUND(COALESCE(SUM(
      CASE 
        WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
        WHEN m.direction = 'IN' THEN m.quantidade 
        ELSE -m.quantidade 
      END
    ), 0), 4)
    FROM public.movimentacoes_estoque m
    WHERE m.produto_id = p_id AND m.status = 'ATIVO' AND m.company_id = p_company
  )
  WHERE id = p_id AND company_id = p_company;
END;
$$;

-- 2. ADICIONAR COLUNA DE SALDO NA TABELA DE PRODUTOS
ALTER TABLE public.produtos 
ADD COLUMN IF NOT EXISTS saldo_atual numeric DEFAULT 0;

-- 3. ÍNDICES PARA OTIMIZAÇÃO NA TABELA DE MOVIMENTAÇÕES
CREATE INDEX IF NOT EXISTS idx_movimentacoes_estoque_per_product 
ON public.movimentacoes_estoque (company_id, produto_id, status);

CREATE INDEX IF NOT EXISTS idx_movimentacoes_estoque_created_at 
ON public.movimentacoes_estoque (company_id, created_at DESC);

-- 4. FUNÇÃO PARA ATUALIZAR O SALDO DO PRODUTO (VIA TRIGGER)
CREATE OR REPLACE FUNCTION public.fn_update_product_stock()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_produto_id uuid;
  v_company_id uuid;
BEGIN
  -- Identificar o produto e a empresa afetados
  IF (TG_OP = 'DELETE') THEN
    v_produto_id := OLD.produto_id;
    v_company_id := OLD.company_id;
  ELSE
    v_produto_id := NEW.produto_id;
    v_company_id := NEW.company_id;
  END IF;

  -- Reutilizar a função de recomputação para garantir consistência
  PERFORM public.fn_recompute_product_saldo(v_produto_id, v_company_id);

  RETURN NULL;
END;
$$;

-- 5. TRIGGERS NA TABELA DE MOVIMENTAÇÕES
DROP TRIGGER IF EXISTS trg_update_stock_on_mov ON public.movimentacoes_estoque;
CREATE TRIGGER trg_update_stock_on_mov
AFTER INSERT OR UPDATE OR DELETE ON public.movimentacoes_estoque
FOR EACH ROW EXECUTE FUNCTION public.fn_update_product_stock();

-- 6. SCRIPT DE MIGRAÇÃO: POPULAR SALDOS ATUAIS
DO $$
DECLARE
  prod_record RECORD;
BEGIN
  -- Filtrar apenas produtos com company_id válido para não travar nos gatilhos de hardening
  FOR prod_record IN 
    SELECT id, company_id FROM public.produtos 
    WHERE ativo = true 
    AND company_id != '00000000-0000-0000-0000-000000000001'::uuid 
  LOOP
    PERFORM public.fn_recompute_product_saldo(prod_record.id, prod_record.company_id);
  END LOOP;
END $$;

-- 7. OTIMIZAR RPC EXISTENTE get_saldo_produtos PARA USAR O CACHE
CREATE OR REPLACE FUNCTION public.get_saldo_produtos(p_produto_ids uuid[])
RETURNS TABLE(produto_id uuid, saldo numeric) 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public' 
AS $$
DECLARE v_company uuid;
BEGIN
  v_company := assert_tenant();
  RETURN QUERY
  SELECT p.id, p.saldo_atual
  FROM public.produtos p
  WHERE p.id = ANY(p_produto_ids) AND p.company_id = v_company;
END; $$;

-- 8. RECARREGAR CACHE
NOTIFY pgrst, 'reload schema';
