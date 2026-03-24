CREATE OR REPLACE FUNCTION public.assert_requisicao_estoque_movement_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  req_item record;
  prod record;
  expected_qty numeric;
  v_item_id uuid;
BEGIN
  IF NEW.origem IS DISTINCT FROM 'REQUISICAO_ESTOQUE' OR NEW.status IS DISTINCT FROM 'ATIVO' THEN
    RETURN NEW;
  END IF;

  IF NEW.produto_id IS NULL THEN
    RAISE EXCEPTION 'Movimentação de requisição sem produto_id';
  END IF;

  IF COALESCE(NEW.reference_type, '') = 'REQUISICAO_ITEM' THEN
    IF NEW.reference_id IS NULL THEN
      RAISE EXCEPTION 'Movimentação de requisição por item sem reference_id';
    END IF;

    BEGIN
      v_item_id := NEW.reference_id::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'reference_id da movimentação de requisição é inválido: %', NEW.reference_id;
    END;

    SELECT rei.id,
           rei.requisicao_id,
           rei.quantidade_solicitada,
           rei.quantidade_atendida,
           r.company_id
      INTO req_item
    FROM public.requisicao_estoque_itens rei
    JOIN public.requisicoes_estoque r ON r.id = rei.requisicao_id
    WHERE rei.id = v_item_id
      AND rei.produto_id = NEW.produto_id
      AND r.company_id = NEW.company_id
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Movimentação não corresponde ao item da requisição';
    END IF;

    IF NEW.referencia_id IS NOT NULL AND NEW.referencia_id <> req_item.requisicao_id::text THEN
      RAISE EXCEPTION 'referencia_id divergente para baixa do item da requisição';
    END IF;
  ELSE
    IF NEW.referencia_id IS NULL THEN
      RAISE EXCEPTION 'Movimentação de requisição sem referencia_id';
    END IF;

    SELECT rei.id,
           rei.requisicao_id,
           rei.quantidade_solicitada,
           rei.quantidade_atendida,
           r.company_id
      INTO req_item
    FROM public.requisicao_estoque_itens rei
    JOIN public.requisicoes_estoque r ON r.id = rei.requisicao_id
    WHERE rei.requisicao_id = NEW.referencia_id::uuid
      AND rei.produto_id = NEW.produto_id
      AND r.company_id = NEW.company_id
    ORDER BY rei.created_at DESC, rei.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Movimentação não corresponde a item da requisição';
    END IF;
  END IF;

  SELECT p.fator_conversao_padrao
    INTO prod
  FROM public.produtos p
  WHERE p.id = NEW.produto_id
    AND p.company_id = NEW.company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto da movimentação de requisição não encontrado';
  END IF;

  expected_qty := ROUND((
    COALESCE(NULLIF(req_item.quantidade_atendida, 0), req_item.quantidade_solicitada)
    * COALESCE(NULLIF(prod.fator_conversao_padrao, 0), 1)
  )::numeric, 3);

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
$function$;