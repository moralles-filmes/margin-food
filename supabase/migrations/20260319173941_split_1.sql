CREATE OR REPLACE FUNCTION public.attend_requisicao_item_atomic(
  p_requisicao_id uuid,
  p_item_id uuid,
  p_quantidade_aprovada numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_req record;
  v_item record;
  v_prod record;
  v_existing_movement uuid;
  v_now timestamptz := now();
  v_qtd_solicitada numeric;
  v_qtd_efetiva numeric;
  v_qtd_base numeric;
  v_saldo numeric;
  v_status text;
  v_is_partial boolean;
  v_qtd_faltante numeric;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();

  IF v_user IS NULL THEN
    RAISE EXCEPTION '401: Usuário não autenticado';
  END IF;

  IF NOT public.has_any_permission(v_user, ARRAY[
    'estoque:requisicoes:approve',
    'estoque:requisicoes:close',
    'estoque:movimentacoes:create',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION '403RBAC: Sem permissão para atender itens';
  END IF;

  SELECT r.id, r.status, r.setor
    INTO v_req
  FROM public.requisicoes_estoque r
  WHERE r.id = p_requisicao_id
    AND r.company_id = v_company
    AND r.ativo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Requisição não encontrada';
  END IF;

  IF v_req.status IN ('CANCELADA', 'NEGADA') THEN
    RAISE EXCEPTION '400: Requisição não pode ser alterada';
  END IF;

  SELECT rei.id,
         rei.requisicao_id,
         rei.produto_id,
         rei.status,
         rei.quantidade_solicitada,
         rei.quantidade_atendida,
         rei.unidade
    INTO v_item
  FROM public.requisicao_estoque_itens rei
  WHERE rei.id = p_item_id
    AND rei.requisicao_id = p_requisicao_id
    AND rei.company_id = v_company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Item da requisição não encontrado';
  END IF;

  SELECT m.id
    INTO v_existing_movement
  FROM public.movimentacoes_estoque m
  WHERE m.reference_type = 'REQUISICAO_ITEM'
    AND m.reference_id = p_item_id::text
    AND m.status = 'ATIVO'
    AND m.company_id = v_company
  LIMIT 1;

  IF v_item.status <> 'SOLICITADO' THEN
    IF v_item.status = 'ATENDIDO' AND v_existing_movement IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'movement_id', v_existing_movement,
        'item_id', p_item_id,
        'requisicao_id', p_requisicao_id,
        'quantidade_atendida', COALESCE(v_item.quantidade_atendida, 0),
        'message', 'Item já atendido anteriormente.'
      );
    END IF;

    RAISE EXCEPTION '409: Item já está com status %', v_item.status;
  END IF;

  v_qtd_solicitada := COALESCE(v_item.quantidade_solicitada, 0);
  IF v_qtd_solicitada <= 0 THEN
    RAISE EXCEPTION '400: Quantidade solicitada inválida';
  END IF;

  IF p_quantidade_aprovada IS NULL THEN
    v_qtd_efetiva := v_qtd_solicitada;
  ELSE
    v_qtd_efetiva := p_quantidade_aprovada;
    IF v_qtd_efetiva <= 0 THEN
      RAISE EXCEPTION '400: Quantidade aprovada deve ser maior que zero';
    END IF;
    IF v_qtd_efetiva > v_qtd_solicitada THEN
      RAISE EXCEPTION '400: Quantidade aprovada (%) não pode ser maior que a solicitada (%)', v_qtd_efetiva, v_qtd_solicitada;
    END IF;
  END IF;

  SELECT p.id,
         p.nome_produto,
         p.unidade_compra,
         p.fator_conversao_padrao,
         COALESCE(
           NULLIF(p.avg30_cost_base_unit, 0),
           NULLIF(p.last_cost_base_unit, 0),
           NULLIF(p.default_cost_base_unit, 0),
           CASE
             WHEN COALESCE(NULLIF(p.fator_conversao_padrao, 0), 1) > 0
               THEN COALESCE(p.custo_padrao, 0) / COALESCE(NULLIF(p.fator_conversao_padrao, 0), 1)
             ELSE 0
           END
         ) AS custo_unitario_base
    INTO v_prod
  FROM public.produtos p
  WHERE p.id = v_item.produto_id
    AND p.company_id = v_company
    AND p.ativo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Produto não encontrado no tenant';
  END IF;

  v_qtd_base := ROUND((v_qtd_efetiva * COALESCE(NULLIF(v_prod.fator_conversao_padrao, 0), 1))::numeric, 3);

  SELECT COALESCE(SUM(
    CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END
  ), 0)
    INTO v_saldo
  FROM public.movimentacoes_estoque m
  WHERE m.produto_id = v_item.produto_id
    AND m.status = 'ATIVO'
    AND m.company_id = v_company;

  IF v_saldo < v_qtd_base THEN
    RAISE EXCEPTION '400: Saldo insuficiente. Disponível: %, Necessário: %', v_saldo, v_qtd_base;
  END IF;

  UPDATE public.requisicao_estoque_itens
     SET status = 'ATENDIDO',
         quantidade_atendida = v_qtd_efetiva,
         atendido_por = v_user,
         atendido_em = v_now
   WHERE id = p_item_id
     AND company_id = v_company;

  INSERT INTO public.movimentacoes_estoque (
    produto_id,
    tipo,
    direction,
    quantidade,
    custo_unitario,
    custo_total,
    origem,
    referencia_id,
    reference_type,
    reference_id,
    observacao,
    created_by,
    company_id,
    setor,
    status,
    data
  ) VALUES (
    v_item.produto_id,
    'SAIDA',
    'OUT',
    v_qtd_base,
    ROUND(COALESCE(v_prod.custo_unitario_base, 0)::numeric, 2),
    ROUND((v_qtd_base * COALESCE(v_prod.custo_unitario_base, 0))::numeric, 2),
    'REQUISICAO_ESTOQUE',
    p_requisicao_id::text,
    'REQUISICAO_ITEM',
    p_item_id::text,
    FORMAT('Baixa requisição %s - %s', LEFT(p_requisicao_id::text, 8), COALESCE(v_req.setor, '')),
    v_user,
    v_company,
    v_req.setor,
    'ATIVO',
    CURRENT_DATE
  )
  ON CONFLICT (reference_type, reference_id)
  WHERE status = 'ATIVO' AND reference_type IS NOT NULL AND reference_id IS NOT NULL AND reference_type <> ALL (ARRAY['INVENTARIO_AJUSTE', 'AJUSTE_CORRECAO_POSTERIOR'])
  DO NOTHING
  RETURNING id INTO v_existing_movement;

  IF v_existing_movement IS NULL THEN
    SELECT m.id
      INTO v_existing_movement
    FROM public.movimentacoes_estoque m
    WHERE m.reference_type = 'REQUISICAO_ITEM'
      AND m.reference_id = p_item_id::text
      AND m.status = 'ATIVO'
      AND m.company_id = v_company
    LIMIT 1;
  END IF;

  IF v_existing_movement IS NULL THEN
    RAISE EXCEPTION '500: Movimentação do item não foi criada';
  END IF;

  v_is_partial := v_qtd_efetiva < v_qtd_solicitada;

  IF v_is_partial THEN
    v_qtd_faltante := v_qtd_solicitada - v_qtd_efetiva;

    INSERT INTO public.alertas_falta_estoque (
      company_id,
      produto_id,
      produto_nome,
      quantidade_solicitada,
      unidade,
      saldo_no_momento,
      requisicao_id,
      requisicao_item_id,
      setor_solicitante,
      origem,
      status,
      created_by
    ) VALUES (
      v_company,
      v_item.produto_id,
      COALESCE(v_prod.nome_produto, v_item.produto_id::text),
      v_qtd_faltante,
      COALESCE(v_prod.unidade_compra, v_item.unidade, 'UN'),
      GREATEST(0, v_saldo - v_qtd_base),
      p_requisicao_id,
      p_item_id,
      COALESCE(v_req.setor, ''),
      'ATENDIMENTO_PARCIAL',
      'PENDENTE',
      v_user
    )
    ON CONFLICT (requisicao_id, produto_id)
    DO UPDATE SET
      quantidade_solicitada = EXCLUDED.quantidade_solicitada,
      saldo_no_momento = EXCLUDED.saldo_no_momento,
      origem = EXCLUDED.origem,
      status = EXCLUDED.status,
      requisicao_item_id = EXCLUDED.requisicao_item_id;
  END IF;

  v_status := COALESCE(public.compute_requisicao_status_agregado(p_requisicao_id), 'SOLICITADA');

  UPDATE public.requisicoes_estoque
     SET status = v_status,
         updated_at = v_now,
         atendido_por = CASE WHEN v_status IN ('ATENDIDA', 'PARCIALMENTE_ATENDIDA') THEN v_user ELSE atendido_por END,
         atendido_em = CASE WHEN v_status IN ('ATENDIDA', 'PARCIALMENTE_ATENDIDA') THEN v_now ELSE atendido_em END
   WHERE id = p_requisicao_id
     AND company_id = v_company;

  PERFORM public.log_audit(
    p_source := 'rpc',
    p_module := 'estoque',
    p_entity := 'requisicao_estoque_itens',
    p_entity_id := p_item_id::text,
    p_action := CASE WHEN v_is_partial THEN 'ITEM_ATENDIDO_PARCIAL' ELSE 'ITEM_ATENDIDO' END,
    p_before := jsonb_build_object(
      'status', 'SOLICITADO',
      'produto_id', v_item.produto_id,
      'quantidade_solicitada', v_qtd_solicitada
    ),
    p_after := jsonb_build_object(
      'status', 'ATENDIDO',
      'quantidade_solicitada', v_qtd_solicitada,
      'quantidade_atendida', v_qtd_efetiva,
      'quantidade_movimentada_base', v_qtd_base,
      'movement_id', v_existing_movement,
      'ajuste_parcial', v_is_partial
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_existing_movement,
    'item_id', p_item_id,
    'requisicao_id', p_requisicao_id,
    'quantidade_solicitada', v_qtd_solicitada,
    'quantidade_atendida', v_qtd_efetiva,
    'quantidade_movimentada_base', v_qtd_base,
    'partial', v_is_partial,
    'requisicao_status', v_status,
    'message', CASE
      WHEN v_is_partial THEN FORMAT('Item atendido parcialmente: %s de %s solicitado(s).', v_qtd_efetiva, v_qtd_solicitada)
      ELSE 'Item atendido com sucesso.'
    END
  );
END;
$function$;