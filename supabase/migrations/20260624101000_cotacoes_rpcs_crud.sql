-- ════════════════════════════════════════════════════════════════════════════
-- Cotação (RFQ) — Fase 2: RPCs atômicas de CRUD
-- ════════════════════════════════════════════════════════════════════════════
-- Padrão dos RPCs do projeto: SECURITY DEFINER, search_path=public, assert_tenant()
-- + has_any_permission(), params p_*, vars v_*, retorno jsonb, FOR UPDATE no lock.
-- Erros padronizados: PERMISSION_DENIED / NOT_FOUND / STATUS_INVALIDO /
-- OPTIMISTIC_LOCK_CONFLICT / VALIDATION.

-- Coluna extra p/ facilitar a conversão em pedido (Fase 7) — aditiva.
ALTER TABLE public.cotacao_itens
  ADD COLUMN IF NOT EXISTS conversion_factor_snapshot numeric NOT NULL DEFAULT 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- create_cotacao_atomic — cria cabeçalho + itens + fornecedores (status RASCUNHO)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_cotacao_atomic(
  p_titulo        text,
  p_observacao    text DEFAULT NULL,
  p_data_validade date DEFAULT NULL,
  p_origin_type   text DEFAULT 'MANUAL',
  p_origin_ref    uuid DEFAULT NULL,
  p_itens         jsonb DEFAULT '[]'::jsonb,
  p_fornecedores  jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_user    uuid;
  v_id      uuid;
  v_codigo  text;
  v_base    int;
  v_elem    jsonb;
  i         int;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED: não autenticado'; END IF;

  IF NOT public.has_any_permission(v_user, ARRAY['compras:cotacao:create','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:cotacao:create';
  END IF;

  IF p_titulo IS NULL OR length(btrim(p_titulo)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION: título obrigatório';
  END IF;
  IF p_origin_type IS NOT NULL AND p_origin_type NOT IN ('MANUAL','ALERTA','REQUISICAO') THEN
    RAISE EXCEPTION 'VALIDATION: origin_type inválido';
  END IF;

  -- Código sequencial por empresa, com retry em colisão (unique index parcial)
  v_base := (SELECT count(*) FROM public.cotacoes WHERE company_id = v_company);
  FOR i IN 1..15 LOOP
    v_codigo := 'COT-' || lpad((v_base + i)::text, 5, '0');
    BEGIN
      INSERT INTO public.cotacoes (company_id, codigo, titulo, observacao, data_validade, origin_type, origin_ref, status, created_by)
      VALUES (v_company, v_codigo, btrim(p_titulo), NULLIF(btrim(coalesce(p_observacao,'')),''), p_data_validade,
              coalesce(p_origin_type,'MANUAL'), p_origin_ref, 'RASCUNHO', v_user)
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_id := NULL;  -- tenta o próximo sufixo
    END;
  END LOOP;
  IF v_id IS NULL THEN RAISE EXCEPTION 'VALIDATION: falha ao gerar código da cotação'; END IF;

  -- Itens
  FOR v_elem IN SELECT * FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) LOOP
    INSERT INTO public.cotacao_itens
      (cotacao_id, company_id, produto_id, produto_nome_snapshot, unidade_snapshot,
       purchase_unit_snapshot, conversion_factor_snapshot, quantidade, observacao)
    VALUES (
      v_id, v_company,
      NULLIF(v_elem->>'produto_id','')::uuid,
      coalesce(NULLIF(btrim(v_elem->>'produto_nome_snapshot'),''), 'Item'),
      NULLIF(v_elem->>'unidade_snapshot',''),
      NULLIF(v_elem->>'purchase_unit_snapshot',''),
      coalesce((v_elem->>'conversion_factor_snapshot')::numeric, 1),
      coalesce((v_elem->>'quantidade')::numeric, 0),
      NULLIF(v_elem->>'observacao','')
    );
  END LOOP;

  -- Fornecedores participantes
  FOR v_elem IN SELECT * FROM jsonb_array_elements(coalesce(p_fornecedores, '[]'::jsonb)) LOOP
    INSERT INTO public.cotacao_fornecedores
      (cotacao_id, company_id, supplier_id, supplier_nome_snapshot, whatsapp_snapshot, pedido_minimo_snapshot, status)
    VALUES (
      v_id, v_company,
      NULLIF(v_elem->>'supplier_id','')::uuid,
      coalesce(NULLIF(btrim(v_elem->>'supplier_nome_snapshot'),''), 'Fornecedor'),
      NULLIF(v_elem->>'whatsapp_snapshot',''),
      coalesce((v_elem->>'pedido_minimo_snapshot')::numeric, 0),
      'AGUARDANDO'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'codigo', v_codigo);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- update_cotacao_atomic — edita cabeçalho + substitui itens/fornecedores
-- (permitido só em RASCUNHO/EM_COTACAO). Optimistic lock via updated_at.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_cotacao_atomic(
  p_id                  uuid,
  p_titulo              text,
  p_observacao          text DEFAULT NULL,
  p_data_validade       date DEFAULT NULL,
  p_itens               jsonb DEFAULT '[]'::jsonb,
  p_fornecedores        jsonb DEFAULT '[]'::jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
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
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();

  IF NOT public.has_any_permission(v_user, ARRAY['compras:cotacao:edit','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:cotacao:edit';
  END IF;

  SELECT id, status, updated_at INTO v_cot
  FROM public.cotacoes
  WHERE id = p_id AND company_id = v_company AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_cot.status NOT IN ('RASCUNHO','EM_COTACAO') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: % (edição só em RASCUNHO/EM_COTACAO)', v_cot.status;
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_cot.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;
  IF p_titulo IS NULL OR length(btrim(p_titulo)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION: título obrigatório';
  END IF;

  UPDATE public.cotacoes
     SET titulo = btrim(p_titulo),
         observacao = NULLIF(btrim(coalesce(p_observacao,'')),''),
         data_validade = p_data_validade
   WHERE id = p_id;

  -- Substitui itens e fornecedores (respostas em cascata se houver)
  DELETE FROM public.cotacao_itens WHERE cotacao_id = p_id;
  DELETE FROM public.cotacao_fornecedores WHERE cotacao_id = p_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) LOOP
    INSERT INTO public.cotacao_itens
      (cotacao_id, company_id, produto_id, produto_nome_snapshot, unidade_snapshot,
       purchase_unit_snapshot, conversion_factor_snapshot, quantidade, observacao)
    VALUES (
      p_id, v_company,
      NULLIF(v_elem->>'produto_id','')::uuid,
      coalesce(NULLIF(btrim(v_elem->>'produto_nome_snapshot'),''), 'Item'),
      NULLIF(v_elem->>'unidade_snapshot',''),
      NULLIF(v_elem->>'purchase_unit_snapshot',''),
      coalesce((v_elem->>'conversion_factor_snapshot')::numeric, 1),
      coalesce((v_elem->>'quantidade')::numeric, 0),
      NULLIF(v_elem->>'observacao','')
    );
  END LOOP;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(coalesce(p_fornecedores, '[]'::jsonb)) LOOP
    INSERT INTO public.cotacao_fornecedores
      (cotacao_id, company_id, supplier_id, supplier_nome_snapshot, whatsapp_snapshot, pedido_minimo_snapshot, status)
    VALUES (
      p_id, v_company,
      NULLIF(v_elem->>'supplier_id','')::uuid,
      coalesce(NULLIF(btrim(v_elem->>'supplier_nome_snapshot'),''), 'Fornecedor'),
      NULLIF(v_elem->>'whatsapp_snapshot',''),
      coalesce((v_elem->>'pedido_minimo_snapshot')::numeric, 0),
      'AGUARDANDO'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- soft_delete_cotacao — soft delete com optimistic lock
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.soft_delete_cotacao(
  p_id                  uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
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
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();

  IF NOT public.has_any_permission(v_user, ARRAY['compras:cotacao:delete','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:cotacao:delete';
  END IF;

  SELECT id, updated_at INTO v_cot
  FROM public.cotacoes
  WHERE id = p_id AND company_id = v_company AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF p_expected_updated_at IS NOT NULL AND v_cot.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  UPDATE public.cotacoes
     SET deleted_at = now(), deleted_by = v_user
   WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_cotacao_atomic(text, text, date, text, uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_cotacao_atomic(uuid, text, text, date, jsonb, jsonb, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_cotacao(uuid, timestamptz) TO authenticated;
