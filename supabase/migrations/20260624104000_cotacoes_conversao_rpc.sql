-- ════════════════════════════════════════════════════════════════════════════
-- Cotação (RFQ) — Fase 7: conversão da sugestão em pedido(s) de compra
-- ════════════════════════════════════════════════════════════════════════════
-- 1 função + GRANT → aplicar via MCP apply_migration (o db push v2.75 quebra
-- migration com CREATE FUNCTION seguido de outro statement — ver CLAUDE.md).
--
-- Cria 1 purchase_orders (type='FORNECEDOR', status='OPEN') por fornecedor
-- vencedor, com N purchase_order_items a partir das respostas SELECIONADAS
-- (cotacao_respostas.selecionado=true, marcadas pela save_cotacao_sugestao).
-- Apenas INSERT em purchase_orders/_items — NÃO toca recebimento nem estoque.
-- Atômica: qualquer falha faz rollback de todos os pedidos da mesma cotação.
-- Idempotente por status: cotação CONVERTIDA não pode ser convertida de novo.
-- RBAC: "convert" mapeia para a ação fixa `close` (ver actions.ts).

CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_cotacao_atomic(
  p_cotacao_id          uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company     uuid;
  v_user        uuid;
  v_cot         record;
  v_forn        record;
  v_order_id    uuid;
  v_total       numeric;
  v_items       int;
  v_orders      int := 0;
  v_total_items int := 0;
  v_order_ids   uuid[] := '{}';
  v_sel_count   int;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED: não autenticado'; END IF;

  -- "Converter em pedido" = ação fixa `close` (send_whatsapp/use_ai/convert não existem)
  IF NOT public.has_any_permission(v_user, ARRAY['compras:cotacao:close','compras:cotacao:manage','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:cotacao:close';
  END IF;

  -- Trava a cotação do próprio tenant
  SELECT id, codigo, titulo, status, updated_at
    INTO v_cot
  FROM public.cotacoes
  WHERE id = p_cotacao_id AND company_id = v_company AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_cot.status = 'CONVERTIDA' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: % (cotação já convertida em pedido)', v_cot.status;
  END IF;
  IF v_cot.status IN ('CANCELADA','ENCERRADA') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: % (cotação encerrada)', v_cot.status;
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_cot.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  -- Exige ao menos 1 resposta selecionada (sugestão salva)
  SELECT count(*) INTO v_sel_count
  FROM public.cotacao_respostas r
  JOIN public.cotacao_fornecedores f ON f.id = r.cotacao_fornecedor_id
  WHERE f.cotacao_id = p_cotacao_id
    AND r.company_id = v_company
    AND r.selecionado = true
    AND r.disponivel = true
    AND r.preco_unitario IS NOT NULL;
  IF v_sel_count = 0 THEN
    RAISE EXCEPTION 'VALIDATION: nenhuma resposta selecionada — gere e salve a sugestão antes de converter';
  END IF;

  -- 1 pedido por fornecedor com ao menos 1 item selecionado
  FOR v_forn IN
    SELECT f.id, f.supplier_nome_snapshot, f.condicao_pagamento
    FROM public.cotacao_fornecedores f
    WHERE f.cotacao_id = p_cotacao_id
      AND f.company_id = v_company
      AND EXISTS (
        SELECT 1 FROM public.cotacao_respostas r
        WHERE r.cotacao_fornecedor_id = f.id
          AND r.company_id = v_company
          AND r.selecionado = true
          AND r.disponivel = true
          AND r.preco_unitario IS NOT NULL
      )
    ORDER BY f.supplier_nome_snapshot
  LOOP
    SELECT coalesce(sum(r.preco_unitario * i.quantidade), 0) INTO v_total
    FROM public.cotacao_respostas r
    JOIN public.cotacao_itens i ON i.id = r.cotacao_item_id
    WHERE r.cotacao_fornecedor_id = v_forn.id
      AND r.company_id = v_company
      AND r.selecionado = true
      AND r.disponivel = true
      AND r.preco_unitario IS NOT NULL;

    INSERT INTO public.purchase_orders (
      title, type, priority, category, supplier_name, payment_type,
      notes, status, total_estimated, created_by, company_id,
      idempotency_key, origin, origin_ref
    ) VALUES (
      v_cot.codigo || ' — ' || v_forn.supplier_nome_snapshot,
      'FORNECEDOR', 'MEDIA', '',
      v_forn.supplier_nome_snapshot,
      NULLIF(btrim(coalesce(v_forn.condicao_pagamento,'')), ''),
      'Gerado da cotação ' || v_cot.codigo || ' (' || v_cot.titulo || ')',
      'OPEN', coalesce(v_total, 0), v_user, v_company,
      gen_random_uuid(), 'COTACAO', p_cotacao_id::text
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.purchase_order_items (
      order_id, stock_item_id, name_snapshot, unit_snapshot,
      estimated_unit_value, qty_requested,
      purchase_unit_snapshot, purchase_unit_cost_snapshot, conversion_factor_snapshot,
      shopping_status, company_id
    )
    SELECT
      v_order_id,
      i.produto_id,
      i.produto_nome_snapshot,
      coalesce(NULLIF(i.unidade_snapshot,''), 'UN'),
      r.preco_unitario,
      i.quantidade,
      coalesce(NULLIF(i.purchase_unit_snapshot,''), NULLIF(i.unidade_snapshot,''), 'UN'),
      r.preco_unitario,
      coalesce(i.conversion_factor_snapshot, 1),
      'OK',
      v_company
    FROM public.cotacao_respostas r
    JOIN public.cotacao_itens i ON i.id = r.cotacao_item_id
    WHERE r.cotacao_fornecedor_id = v_forn.id
      AND r.company_id = v_company
      AND r.selecionado = true
      AND r.disponivel = true
      AND r.preco_unitario IS NOT NULL;

    GET DIAGNOSTICS v_items = ROW_COUNT;
    v_total_items := v_total_items + v_items;
    v_orders := v_orders + 1;
    v_order_ids := array_append(v_order_ids, v_order_id);

    -- Marca o fornecedor vencedor como FECHADO
    UPDATE public.cotacao_fornecedores
       SET status = 'FECHADO'
     WHERE id = v_forn.id AND company_id = v_company;

    INSERT INTO public.audit_log (tabela, registro_id, acao, user_id)
    VALUES ('purchase_orders', v_order_id, 'CRIACAO', v_user);
  END LOOP;

  -- Encerra a cotação
  UPDATE public.cotacoes
     SET status = 'CONVERTIDA'
   WHERE id = p_cotacao_id AND company_id = v_company;

  -- Anexa os ids dos pedidos gerados à sugestão mais recente (rastreabilidade)
  UPDATE public.cotacao_sugestoes s
     SET dados_json = coalesce(s.dados_json, '{}'::jsonb)
                      || jsonb_build_object('generated_order_ids', to_jsonb(v_order_ids))
   WHERE s.id = (
     SELECT id FROM public.cotacao_sugestoes
     WHERE cotacao_id = p_cotacao_id AND company_id = v_company
     ORDER BY created_at DESC
     LIMIT 1
   );

  RETURN jsonb_build_object(
    'success', true,
    'orders', v_orders,
    'items', v_total_items,
    'order_ids', to_jsonb(v_order_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_purchase_orders_from_cotacao_atomic(uuid, timestamptz) TO authenticated;
