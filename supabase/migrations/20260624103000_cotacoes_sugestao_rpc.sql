-- ════════════════════════════════════════════════════════════════════════════
-- Cotação (RFQ) — Fase 4: RPC para persistir a sugestão escolhida
-- ════════════════════════════════════════════════════════════════════════════
-- 1 função → aplicar via MCP apply_migration (db push v2.75 quebra CREATE FUNCTION
-- + GRANT — ver princípio no CLAUDE.md).
--
-- Grava a recomendação em cotacao_sugestoes, marca as respostas escolhidas
-- (selecionado=true) e avança a cotação para EM_ANALISE. dados_json guarda a
-- distribuição por fornecedor (consumida pela conversão em pedido — Fase 7).

CREATE OR REPLACE FUNCTION public.save_cotacao_sugestao(
  p_cotacao_id        uuid,
  p_tipo              text,
  p_total_estimado    numeric DEFAULT 0,
  p_economia_estimada numeric DEFAULT 0,
  p_dados_json        jsonb DEFAULT '{}'::jsonb,
  p_selecoes          jsonb DEFAULT '[]'::jsonb
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
  v_id      uuid;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();

  IF NOT public.has_any_permission(v_user, ARRAY['compras:cotacao:edit','compras:cotacao:approve','compras:cotacao:manage','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:cotacao:edit';
  END IF;

  IF p_tipo NOT IN ('MENOR_PRECO','OTIMIZADA_PEDIDO_MINIMO','MENOS_FORNECEDORES','CUSTO_BENEFICIO','IA','MANUAL') THEN
    RAISE EXCEPTION 'VALIDATION: tipo de sugestão inválido';
  END IF;

  SELECT id, status INTO v_cot
  FROM public.cotacoes
  WHERE id = p_cotacao_id AND company_id = v_company AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_cot.status IN ('CONVERTIDA','CANCELADA') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: % (cotação encerrada)', v_cot.status;
  END IF;

  INSERT INTO public.cotacao_sugestoes (cotacao_id, company_id, tipo, total_estimado, economia_estimada, dados_json, created_by)
  VALUES (p_cotacao_id, v_company, p_tipo, coalesce(p_total_estimado,0), coalesce(p_economia_estimada,0), coalesce(p_dados_json,'{}'::jsonb), v_user)
  RETURNING id INTO v_id;

  -- Reset seleção das respostas desta cotação
  UPDATE public.cotacao_respostas r
     SET selecionado = false
   WHERE r.company_id = v_company
     AND r.cotacao_fornecedor_id IN (
       SELECT f.id FROM public.cotacao_fornecedores f WHERE f.cotacao_id = p_cotacao_id AND f.company_id = v_company);

  -- Marca as escolhidas
  UPDATE public.cotacao_respostas r
     SET selecionado = true
    FROM jsonb_array_elements(coalesce(p_selecoes, '[]'::jsonb)) e
   WHERE r.cotacao_fornecedor_id = (e->>'cotacao_fornecedor_id')::uuid
     AND r.cotacao_item_id = (e->>'cotacao_item_id')::uuid
     AND r.company_id = v_company
     AND EXISTS (SELECT 1 FROM public.cotacao_fornecedores f
                 WHERE f.id = r.cotacao_fornecedor_id AND f.cotacao_id = p_cotacao_id AND f.company_id = v_company);

  -- Avança o status para EM_ANALISE
  UPDATE public.cotacoes
     SET total_estimado = coalesce(p_total_estimado,0),
         economia_estimada = coalesce(p_economia_estimada,0),
         status = CASE WHEN status IN ('RASCUNHO','EM_COTACAO','RESPONDIDA') THEN 'EM_ANALISE' ELSE status END
   WHERE id = p_cotacao_id AND company_id = v_company;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_cotacao_sugestao(uuid, text, numeric, numeric, jsonb, jsonb) TO authenticated;
