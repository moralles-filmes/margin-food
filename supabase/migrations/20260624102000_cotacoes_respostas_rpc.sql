-- ════════════════════════════════════════════════════════════════════════════
-- Cotação (RFQ) — Fase 3: RPC de respostas (matriz de preços)
-- ════════════════════════════════════════════════════════════════════════════
-- 1 função apenas (evita o bug do splitter do supabase CLI v2.75 com múltiplos
-- CREATE FUNCTION — ver princípio no CLAUDE.md).
--
-- Upsert da matriz de preços (fornecedor × item) + meta por fornecedor
-- (prazo/frete/condição). Marca fornecedores com resposta como RESPONDIDO e
-- avança o status da cotação para RESPONDIDA. Guards EXISTS garantem que
-- fornecedor/item pertencem à cotação e ao tenant (anti cross-cotação).

CREATE OR REPLACE FUNCTION public.save_cotacao_respostas_atomic(
  p_cotacao_id        uuid,
  p_respostas         jsonb DEFAULT '[]'::jsonb,
  p_fornecedores_meta jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_user    uuid;
  v_cot     record;
  v_elem    jsonb;
  v_upserts int := 0;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();

  IF NOT public.has_any_permission(v_user, ARRAY['compras:cotacao:edit','compras:cotacao:manage','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:cotacao:edit';
  END IF;

  SELECT id, status INTO v_cot
  FROM public.cotacoes
  WHERE id = p_cotacao_id AND company_id = v_company AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_cot.status IN ('CONVERTIDA','CANCELADA') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: % (não é possível editar respostas)', v_cot.status;
  END IF;

  -- Upsert das respostas (só linhas cujo fornecedor E item pertencem à cotação/tenant)
  WITH ins AS (
    INSERT INTO public.cotacao_respostas
      (cotacao_fornecedor_id, cotacao_item_id, company_id, preco_unitario, quantidade_disponivel, disponivel, observacao)
    SELECT
      (e->>'cotacao_fornecedor_id')::uuid,
      (e->>'cotacao_item_id')::uuid,
      v_company,
      NULLIF(e->>'preco_unitario','')::numeric,
      NULLIF(e->>'quantidade_disponivel','')::numeric,
      coalesce((e->>'disponivel')::boolean, true),
      NULLIF(e->>'observacao','')
    FROM jsonb_array_elements(coalesce(p_respostas, '[]'::jsonb)) e
    WHERE EXISTS (SELECT 1 FROM public.cotacao_fornecedores f
                  WHERE f.id = (e->>'cotacao_fornecedor_id')::uuid AND f.cotacao_id = p_cotacao_id AND f.company_id = v_company)
      AND EXISTS (SELECT 1 FROM public.cotacao_itens it
                  WHERE it.id = (e->>'cotacao_item_id')::uuid AND it.cotacao_id = p_cotacao_id AND it.company_id = v_company)
    ON CONFLICT (cotacao_fornecedor_id, cotacao_item_id)
    DO UPDATE SET
      preco_unitario        = EXCLUDED.preco_unitario,
      quantidade_disponivel = EXCLUDED.quantidade_disponivel,
      disponivel            = EXCLUDED.disponivel,
      observacao            = EXCLUDED.observacao,
      updated_at            = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_upserts FROM ins;

  -- Meta por fornecedor (prazo/frete/condição)
  FOR v_elem IN SELECT * FROM jsonb_array_elements(coalesce(p_fornecedores_meta, '[]'::jsonb)) LOOP
    UPDATE public.cotacao_fornecedores
       SET prazo_entrega_dias = coalesce(NULLIF(v_elem->>'prazo_entrega_dias','')::int, prazo_entrega_dias),
           frete              = coalesce(NULLIF(v_elem->>'frete','')::numeric, frete),
           condicao_pagamento = coalesce(NULLIF(v_elem->>'condicao_pagamento',''), condicao_pagamento)
     WHERE id = (v_elem->>'cotacao_fornecedor_id')::uuid
       AND cotacao_id = p_cotacao_id AND company_id = v_company;
  END LOOP;

  -- Fornecedores com ao menos 1 resposta válida → RESPONDIDO
  UPDATE public.cotacao_fornecedores f
     SET status = 'RESPONDIDO', respondido_em = coalesce(f.respondido_em, now())
   WHERE f.cotacao_id = p_cotacao_id AND f.company_id = v_company
     AND f.status IN ('AGUARDANDO','ENVIADO')
     AND EXISTS (SELECT 1 FROM public.cotacao_respostas r
                 WHERE r.cotacao_fornecedor_id = f.id
                   AND (r.preco_unitario IS NOT NULL OR r.disponivel = false));

  -- Avança o cabeçalho para RESPONDIDA quando ainda em rascunho/cotação
  UPDATE public.cotacoes
     SET status = 'RESPONDIDA'
   WHERE id = p_cotacao_id AND company_id = v_company
     AND status IN ('RASCUNHO','EM_COTACAO');

  RETURN jsonb_build_object('success', true, 'upserts', v_upserts);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_cotacao_respostas_atomic(uuid, jsonb, jsonb) TO authenticated;
