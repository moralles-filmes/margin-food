CREATE OR REPLACE FUNCTION public.assert_requisicao_estoque_movement_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req_item record;
  prod record;
  expected_qty numeric;
BEGIN
  IF NEW.origem IS DISTINCT FROM 'REQUISICAO_ESTOQUE' OR NEW.status IS DISTINCT FROM 'ATIVO' THEN
    RETURN NEW;
  END IF;

  IF NEW.referencia_id IS NULL THEN
    RAISE EXCEPTION 'Movimentação de requisição sem referencia_id';
  END IF;

  IF NEW.produto_id IS NULL THEN
    RAISE EXCEPTION 'Movimentação de requisição sem produto_id';
  END IF;

  SELECT rei.quantidade_solicitada, r.company_id
    INTO req_item
  FROM public.requisicao_estoque_itens rei
  JOIN public.requisicoes_estoque r ON r.id = rei.requisicao_id
  WHERE rei.requisicao_id = NEW.referencia_id
    AND rei.produto_id = NEW.produto_id
    AND r.company_id = NEW.company_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimentação não corresponde a item da requisição';
  END IF;

  SELECT p.fator_conversao_padrao
    INTO prod
  FROM public.produtos p
  WHERE p.id = NEW.produto_id
    AND p.company_id = NEW.company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto da movimentação de requisição não encontrado';
  END IF;

  expected_qty := ROUND((req_item.quantidade_solicitada * COALESCE(NULLIF(prod.fator_conversao_padrao, 0), 1))::numeric, 3);

  IF NEW.direction IS DISTINCT FROM 'OUT' THEN
    RAISE EXCEPTION 'Baixa de requisição deve ter direction OUT';
  END IF;

  IF NEW.tipo IS DISTINCT FROM 'SAIDA' THEN
    RAISE EXCEPTION 'Baixa de requisição deve ter tipo SAIDA';
  END IF;

  IF ROUND(COALESCE(NEW.quantidade, 0)::numeric, 3) <> expected_qty THEN
    RAISE EXCEPTION 'Quantidade inconsistente para baixa de requisição. Esperado: %, recebido: %', expected_qty, NEW.quantidade;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_requisicao_estoque_movement_consistency ON public.movimentacoes_estoque;

CREATE TRIGGER trg_assert_requisicao_estoque_movement_consistency
BEFORE INSERT OR UPDATE ON public.movimentacoes_estoque
FOR EACH ROW
EXECUTE FUNCTION public.assert_requisicao_estoque_movement_consistency();