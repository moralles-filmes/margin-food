
-- Fix audit_log insert: registro_id is UUID, not text
CREATE OR REPLACE FUNCTION public.receive_market_order_atomic(
  p_recebimento_id uuid,
  p_items jsonb,
  p_observacoes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_company uuid;
  v_rec recebimentos%ROWTYPE;
  v_item jsonb;
  v_ri recebimento_itens%ROWTYPE;
  v_prod RECORD;
  v_orig_item RECORD;
  v_ref_id text;
  v_custo_unit numeric;
  v_qtd numeric;
  v_mov_id uuid;
  v_items_inserted int := 0;
  v_items_skipped int := 0;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT has_permission(v_caller, 'compras:recebimentos:close') THEN
    RAISE EXCEPTION 'Sem permissão (compras:recebimentos:close)';
  END IF;

  SELECT company_id INTO v_company FROM profiles WHERE id = v_caller;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Tenant não encontrado para o usuário';
  END IF;

  SELECT * INTO v_rec FROM recebimentos WHERE id = p_recebimento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebimento não encontrado: %', p_recebimento_id;
  END IF;

  IF v_rec.status NOT IN ('AGUARDANDO_RECEBIMENTO', 'RECEBIDO_CONFIRMADO') THEN
    RAISE EXCEPTION 'Status inválido para lançamento de estoque: %', v_rec.status;
  END IF;

  IF v_rec.estoque_atualizado_em IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'recebimento_id', p_recebimento_id,
      'message', 'Estoque já foi atualizado para este recebimento'
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_ri FROM recebimento_itens
    WHERE id = (v_item->>'recebimento_item_id')::uuid
      AND recebimento_id = p_recebimento_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % não pertence ao recebimento %',
        v_item->>'recebimento_item_id', p_recebimento_id;
    END IF;

    IF v_ri.produto_id IS NULL OR v_ri.recebido = false THEN
      v_items_skipped := v_items_skipped + 1;
      CONTINUE;
    END IF;

    v_qtd := COALESCE(v_ri.qtd_recebida, v_ri.qtd_comprada);
    IF v_qtd <= 0 THEN
      v_items_skipped := v_items_skipped + 1;
      CONTINUE;
    END IF;

    v_ref_id := 'MARKET_POI:' || v_ri.id::text;

    SELECT custo_padrao INTO v_prod FROM produtos WHERE id = v_ri.produto_id;

    SELECT preco_unitario INTO v_orig_item
    FROM solic_compra_mercado_item WHERE id = v_ri.item_id;

    v_custo_unit := COALESCE(v_orig_item.preco_unitario, v_prod.custo_padrao, 0);

    IF NOT EXISTS (
      SELECT 1 FROM movimentacoes_estoque
      WHERE reference_type = 'MARKET_RECEBIMENTO_ITEM'
        AND reference_id = v_ref_id
        AND status = 'ATIVO'
    ) THEN
      INSERT INTO movimentacoes_estoque (
        produto_id, data, tipo, quantidade, custo_unitario, custo_total,
        origem, observacao, created_by, status,
        reference_type, reference_id, internal_transfer, source_module
      ) VALUES (
        v_ri.produto_id,
        CURRENT_DATE,
        'ENTRADA',
        v_qtd,
        ROUND(v_custo_unit::numeric, 4),
        ROUND((v_qtd * v_custo_unit)::numeric, 2),
        'Recebimento Mercado',
        'Entrada atômica — Recebimento ' || p_recebimento_id::text || ' Item ' || COALESCE(v_ri.item_id::text, '?'),
        v_caller,
        'ATIVO',
        'MARKET_RECEBIMENTO_ITEM',
        v_ref_id,
        false,
        'compras_mercado'
      ) RETURNING id INTO v_mov_id;

      UPDATE produtos SET
        last_cost_purchase_unit = v_custo_unit,
        last_cost_base_unit = ROUND(v_custo_unit::numeric, 4),
        last_purchase_date = CURRENT_DATE::text,
        custo_padrao = CASE
          WHEN custo_padrao IS NULL OR custo_padrao = 0 THEN v_custo_unit
          ELSE custo_padrao
        END
      WHERE id = v_ri.produto_id;

      v_items_inserted := v_items_inserted + 1;
    ELSE
      v_items_skipped := v_items_skipped + 1;
    END IF;
  END LOOP;

  UPDATE recebimentos SET
    status = 'RECEBIDO_CONFIRMADO',
    recebido_por = COALESCE(recebido_por, v_caller),
    recebido_em = COALESCE(recebido_em, now()),
    enviar_ao_estoque = true,
    estoque_atualizado_em = now(),
    estoque_atualizado_por = v_caller,
    observacoes = COALESCE(NULLIF(p_observacoes, ''), observacoes),
    updated_at = now()
  WHERE id = p_recebimento_id;

  UPDATE solic_compra_mercado SET
    status = 'ESTOQUE_ATUALIZADO',
    updated_at = now()
  WHERE id = v_rec.solicitacao_id;

  INSERT INTO confirmacoes_recebimento (
    recebimento_id, solicitacao_id, mensagem, criado_por, responsavel_compra_id
  )
  SELECT
    p_recebimento_id,
    v_rec.solicitacao_id,
    'Estoque atualizado via RPC atômica — ' || v_items_inserted || ' itens inseridos',
    v_caller,
    s.responsavel_user_id
  FROM solic_compra_mercado s
  WHERE s.id = v_rec.solicitacao_id;

  -- Fix: registro_id is UUID, cast properly
  INSERT INTO audit_log (tabela, registro_id, acao, user_id)
  VALUES ('recebimentos', p_recebimento_id, 'ESTOQUE_ATUALIZADO_ATOMIC', v_caller);

  RETURN jsonb_build_object(
    'success', true,
    'recebimento_id', p_recebimento_id,
    'items_inserted', v_items_inserted,
    'items_skipped', v_items_skipped,
    'already_processed', false
  );
END;
$$;
